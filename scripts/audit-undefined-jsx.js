#!/usr/bin/env node
/**
 * A component rendered in JSX must actually exist in its file.
 *
 * `<DateTimePicker />` sat in ui.js referencing an identifier that was
 * never imported, from a package that was never a dependency. Nothing
 * caught it: the file parses, it lints, esbuild bundles it happily. It only
 * failed at runtime, as "Property 'DateTimePicker' doesn't exist", and it
 * took down roughly twenty screens - KYC, payslips, documents, notes,
 * banner ads, salary reports - because a date field appears on all of them.
 *
 * That is the same shape as the `useRef` bug found earlier in LoginScreen.
 * This checks the whole repo for it: every capitalised JSX tag has to be
 * imported, declared, or a parameter in that same file.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DIRS = ['src', '.'];

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'functions') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(p, out);
    else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// Tags that are elements, not components, even though capitalised.
const ALLOWED = new Set(['React', 'Fragment']);

const files = new Set();
collect(path.join(root, 'src'), []).forEach((f) => files.add(f));
for (const f of fs.readdirSync(root)) {
  if (f.endsWith('.js') && fs.statSync(path.join(root, f)).isFile()) files.add(path.join(root, f));
}

const problems = [];
let checked = 0;

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  // Comments would otherwise supply both false tags and false definitions.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');

  const defined = new Set(ALLOWED);
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]/g)) {
    const clause = m[1];
    const def = /^\s*([A-Za-z_$][\w$]*)/.exec(clause.replace(/^\s*type\s+/, ''));
    if (def && !clause.trimStart().startsWith('{')) defined.add(def[1]);
    const braces = /\{([\s\S]*?)\}/.exec(clause);
    if (braces) {
      braces[1].split(',').forEach((part) => {
        const as = /(?:\w+)\s+as\s+([A-Za-z_$][\w$]*)/.exec(part);
        const plain = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(part);
        if (as) defined.add(as[1]);
        else if (plain) defined.add(plain[1]);
      });
    }
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (ns) defined.add(ns[1]);
  }
  for (const m of src.matchAll(/(?:^|\s)(?:function|class)\s+([A-Z][\w$]*)/g)) defined.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g)) defined.add(m[1]);
  // Destructured out of props/objects, and function parameters.
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    m[1].split(',').forEach((part) => {
      const name = /^\s*(?:\w+\s*:\s*)?([A-Za-z_$][\w$]*)/.exec(part);
      if (name) defined.add(name[1]);
    });
  }
  for (const m of src.matchAll(/\(\s*\{([^}]*)\}\s*\)\s*=>/g)) {
    m[1].split(',').forEach((part) => {
      const name = /^\s*(?:\w+\s*:\s*)?([A-Za-z_$][\w$]*)/.exec(part);
      if (name) defined.add(name[1]);
    });
  }
  for (const m of src.matchAll(/function\s*\w*\s*\(([^)]*)\)/g)) {
    m[1].split(',').forEach((part) => {
      const name = /^\s*([A-Za-z_$][\w$]*)/.exec(part.replace(/[{}]/g, ''));
      if (name) defined.add(name[1]);
    });
  }

  const used = new Set();
  for (const m of src.matchAll(/<([A-Z][\w$]*)/g)) used.add(m[1]);

  for (const name of used) {
    checked += 1;
    if (!defined.has(name)) {
      problems.push(`${path.relative(root, file)}  <${name} ...>  is never imported or declared`);
    }
  }
}

if (!checked) {
  console.error('JSX component audit: found no components at all - the patterns have gone stale.');
  process.exit(1);
}

if (problems.length) {
  console.error(`\nJSX component audit: ${problems.length} component(s) do not exist where they are used:\n`);
  problems.forEach((p) => console.error(`  ${p}`));
  console.error('\nThis throws at runtime and takes the screen down.\n');
  process.exit(1);
}

console.log(`JSX component audit: all ${checked} component reference(s) resolve.`);
