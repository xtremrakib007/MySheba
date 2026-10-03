#!/usr/bin/env node
'use strict';
/**
 * A button must say something.
 *
 * ui.js's buttons take `label`. Pass `title` instead - the prop name half of
 * React Native's own components use - and you get a button that renders, lays
 * out, lints and bundles perfectly, with no text on it. Nothing else in the
 * toolchain has an opinion: the component is defined, the file parses, the prop
 * is simply ignored.
 *
 * Caught on a new screen before it shipped. This is the same shape as
 * audit-undefined-jsx.js: a mistake that only exists at runtime, on one screen,
 * where somebody has to notice an empty rectangle and know what it was meant to
 * say.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMPONENTS = ['PrimaryButton', 'OutlineButton', 'GoogleButton'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'App.js')];
const problems = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const name of COMPONENTS) {
    // Each opening tag, from `<Name` to the `>` that ends it. Crude, but the
    // only thing inside a tag that can contain `>` is an arrow function, and
    // those appear in onPress - after label, which is what is being checked.
    const re = new RegExp(`<${name}\\b([^>]*)>`, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      const props = m[1];
      // A spread may carry it, and nothing here can tell.
      if (/\blabel\s*=/.test(props) || /\{\s*\.\.\./.test(props)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      problems.push(`${path.relative(ROOT, file)}:${line}  <${name}> has no label (React Native's \`title\` is not this prop)`);
    }
  }
}

if (problems.length) {
  console.error('Buttons that would render with no text on them:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n${problems.length} button(s) would be blank. ui.js's buttons take \`label\`.`);
  process.exit(1);
}

console.log(`Every button says something (${COMPONENTS.join(', ')} across ${files.length} files).`);
