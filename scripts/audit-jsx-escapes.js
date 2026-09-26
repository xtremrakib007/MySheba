/**
 * Catches a \u escape sitting inside a JSX attribute string.
 *
 * JSX attribute string literals are not JavaScript string literals. They
 * follow HTML rules, so escape sequences are NOT interpreted:
 *
 *   <Row icon="\u{1F514}" />   ->  icon: "\\u{1F514}"   the literal 9 chars
 *   <Row icon={"\u{1F514}"} /> ->  icon: "\u{1F514}"    the bell
 *
 * The file parses, every check passes, and the app renders the text
 * \u{1F514} where an icon should be. Only looking at the screen reveals it,
 * which for a phone-only project means an OTA round trip per mistake.
 *
 * Written after doing exactly this in two files in one sitting.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const q = path.join(dir, e.name);
    e.isDirectory() ? walk(q, out) : /\.jsx?$/.test(q) && out.push(q);
  }
  return out;
};

// An attribute whose value is a plain quoted string containing \u or \x.
const BAD = /\s[A-Za-z_][\w-]*=("(?:[^"\\]|\\.)*\\[ux][^"]*"|'(?:[^'\\]|\\.)*\\[ux][^']*')/g;

const failures = [];
for (const file of walk(path.join(ROOT, 'src'))) {
  const src = fs.readFileSync(file, 'utf8');
  src.split('\n').forEach((line, i) => {
    // Skip comment lines, which legitimately mention escape sequences.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const m of line.matchAll(BAD)) {
      failures.push(`${path.relative(ROOT, file)}:${i + 1}: ${m[0].trim()} - JSX does not decode this; use {"..."} or the character itself`);
    }
  });
}

if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  failures.forEach((f) => console.log('  ' + f));
  process.exit(1);
}
console.log('JSX escape audit: no undecoded escapes in attribute strings.');
