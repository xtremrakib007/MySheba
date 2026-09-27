// React Native throws "Text strings must be rendered within a <Text>
// component" for any string OR number that lands in a native view, and it is
// a hard render crash - the whole screen goes to ErrorBoundary. Two ways in:
//
//   1. A string sitting directly in a <View>. Obvious when it is a literal,
//      much less so when it comes back from a helper that returns a string.
//   2. Whitespace JSX keeps: `/>      <Thing` on one line is a text node.
//   3. `{someString && <Thing />}`. When the guard is '' (or 0) the && hands
//      the empty string straight to the parent view, so the crash only shows
//      up for the one user whose field happens to be blank. `{!!x && ...}`
//      makes it `false`, which React drops.
//
// Both are invisible to eslint's own rules and to `no-undef`, so they get
// their own check. This walks every JSX expression in src/ and App.js.
//
// It deliberately does NOT flag a bare `{variable}` in a view: almost every
// one of those is a wrapper passing `{children}` or a built-up element
// through, so flagging them would bury the real hits. What it catches is
// anything it can prove is text or a number, plus the && guards above.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');
const TEXT_TAGS = new Set(['Text', 'TextInput', 'Animated.Text', 'Trans', 'TSpan', 'Tspan']);
const NATIVE = new Set(['View', 'SafeAreaView', 'ScrollView', 'KeyboardAvoidingView', 'TouchableOpacity',
  'TouchableHighlight', 'TouchableWithoutFeedback', 'TouchableNativeFeedback', 'Pressable', 'Modal',
  'ImageBackground', 'Image', 'LinearGradient', 'Animated.View', 'Animated.ScrollView', 'Svg', 'G',
  'Rect', 'Path', 'Circle', 'Ellipse', 'Line', 'Polygon', 'Polyline', 'Defs', 'ClipPath', 'Mask', 'BlurView']);
const STRING_METHODS = new Set(['toString', 'join', 'toUpperCase', 'toLowerCase', 'trim', 'slice',
  'replace', 'replaceAll', 'padStart', 'padEnd', 'charAt', 'substring', 'substr', 'toFixed', 'concat',
  'toLocaleDateString', 'toLocaleTimeString', 'toLocaleString', 'toISOString', 'toDateString', 'repeat']);
// Boolean-only expressions. Anything else could be '' or 0 at runtime.
const BOOL_CALLS = new Set(['includes', 'some', 'every', 'has', 'startsWith', 'endsWith', 'test', 'isArray']);

function jsFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) jsFiles(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function stringiness(n) {
  if (!n) return null;
  switch (n.type) {
    case 'StringLiteral': return 'the text ' + JSON.stringify(n.value);
    case 'NumericLiteral': return 'the number ' + n.value;
    case 'TemplateLiteral': return 'a template literal';
    case 'ConditionalExpression': return stringiness(n.consequent) || stringiness(n.alternate);
    case 'LogicalExpression': return stringiness(n.right) || (n.operator === '||' ? stringiness(n.left) : null);
    case 'BinaryExpression':
      if (n.operator !== '+') return null;
      return (stringiness(n.left) || stringiness(n.right)) ? 'a concatenation' : null;
    case 'CallExpression': {
      const c = n.callee;
      if (c.type === 'Identifier' && c.name === 'String') return 'String(...)';
      if (c.type === 'MemberExpression' && c.property.type === 'Identifier'
        && STRING_METHODS.has(c.property.name)) return '.' + c.property.name + '(...)';
      return null;
    }
    default: return null;
  }
}

function boolOnly(n) {
  if (!n) return false;
  switch (n.type) {
    case 'UnaryExpression': return n.operator === '!';
    case 'BooleanLiteral': return true;
    case 'BinaryExpression':
      return ['===', '!==', '==', '!=', '<', '>', '<=', '>=', 'instanceof', 'in'].includes(n.operator);
    case 'LogicalExpression': return boolOnly(n.left) && boolOnly(n.right);
    case 'CallExpression': {
      const c = n.callee;
      return c.type === 'MemberExpression' && c.property.type === 'Identifier'
        && BOOL_CALLS.has(c.property.name);
    }
    default: return false;
  }
}

function tagName(node) {
  if (node.type === 'JSXFragment') return '<>';
  const n = node.openingElement.name;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') {
    const p = (x) => (x.type === 'JSXIdentifier' ? x.name : p(x.object) + '.' + x.property.name);
    return p(n.object) + '.' + n.property.name;
  }
  return '?';
}

const problems = [];
for (const file of jsFiles(path.join(ROOT, 'src')).concat([path.join(ROOT, 'App.js')])) {
  const rel = path.relative(ROOT, file);
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    problems.push(rel + ': could not parse - ' + e.message);
    continue;
  }
  const walk = (node, holder) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((c) => walk(c, holder)); return; }

    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      const name = tagName(node);
      // A fragment renders into whatever holds it, so it passes the holder through.
      const self = name === '<>' ? holder : name;
      if (self && NATIVE.has(self)) {
        for (const ch of node.children) {
          if (ch.type === 'JSXText' && ch.value.trim()) {
            problems.push(rel + ':' + ch.loc.start.line + '  <' + self + '> is given the text '
              + JSON.stringify(ch.value.trim()) + ' - wrap it in <Text>');
          } else if (ch.type === 'JSXText' && ch.value.length && !ch.value.includes('\n')) {
            // Whitespace, and JSX keeps it. It drops a whitespace-only run
            // that spans a newline, but a run on ONE line survives as a text
            // node - so `/>      <Thing` (two elements, no line break between
            // them) puts a string in the parent view and RN throws. This is
            // invisible in review and it shipped twice, because the obvious
            // check is `value.trim()` and that is '' for exactly this case.
            problems.push(rel + ':' + ch.loc.start.line + '  <' + self + '> keeps '
              + JSON.stringify(ch.value) + ' between two elements on one line'
              + ' - put a line break between them');
          } else if (ch.type === 'JSXExpressionContainer') {
            const what = stringiness(ch.expression);
            if (what) {
              problems.push(rel + ':' + ch.loc.start.line + '  <' + self + '> is given ' + what
                + ' - wrap it in <Text>');
            }
          }
        }
      }
      node.children.forEach((c) => walk(c, self || holder));
      walk(node.openingElement && node.openingElement.attributes, holder);
      return;
    }

    if (node.type === 'JSXExpressionContainer'
      && node.expression.type === 'LogicalExpression' && node.expression.operator === '&&') {
      const left = node.expression.left;
      const right = node.expression.right;
      if ((right.type === 'JSXElement' || right.type === 'JSXFragment') && !boolOnly(left)) {
        problems.push(rel + ':' + left.loc.start.line + '  `'
          + code.slice(left.start, left.end).replace(/\s+/g, ' ').slice(0, 60)
          + ' && <' + tagName(right) + '>` renders that value when it is \'\' or 0 - use !!');
      }
    }

    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      walk(node[k], holder);
    }
  };
  walk(ast.program.body, null);
}

if (problems.length) {
  console.error('Raw text / unguarded && audit: ' + problems.length + ' problem(s)\n');
  problems.forEach((p) => console.error('  ' + p));
  console.error('\nEach one of these is a "Text strings must be rendered within a <Text>'
    + ' component" crash waiting for the right data.');
  process.exit(1);
}
console.log('Raw text / unguarded && audit: clean.');
