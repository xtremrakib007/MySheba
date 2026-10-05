#!/usr/bin/env node
'use strict';
/**
 * Every colours.X a screen reads must exist in the palette.
 *
 * A missing one does not throw. React Native renders `color: undefined` as the
 * default, so an invented key looks fine in light mode on a white card and
 * disappears into the background in dark mode. Three files shipped reading
 * `colors.textLight`, which has never existed - the key is `textSecondary` -
 * and nothing anywhere said so.
 *
 * Both palettes are checked, not just one: a key in light and not in dark is
 * the same failure, visible only to whoever uses the other theme.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const theme = fs.readFileSync(path.join(ROOT, 'src/theme/theme.js'), 'utf8');

function paletteKeys(name) {
  const body = new RegExp('export const ' + name + '\\s*=\\s*\\{([\\s\\S]*?)\\n\\};').exec(theme);
  if (!body) throw new Error('could not find the ' + name + ' palette in src/theme/theme.js');
  return new Set([...body[1].matchAll(/([A-Za-z][A-Za-z0-9]*)\s*:/g)].map((m) => m[1]));
}

const light = paletteKeys('lightColors');
const dark = paletteKeys('darkColors');
if (light.size < 10) throw new Error('the light palette read as ' + light.size + ' keys, which cannot be right');

// A key in one palette and not the other is a theme-only bug, so say so before
// looking at any screen.
const problems = [];
for (const key of light) if (!dark.has(key)) problems.push(`theme.js: '${key}' is in lightColors but not darkColors`);
for (const key of dark) if (!light.has(key)) problems.push(`theme.js: '${key}' is in darkColors but not lightColors`);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Comments blanked, length preserved so line numbers still line up.
 *
 * BottomNav carries a comment saying the divider uses colors.border and NOT
 * colors.accentLine. Reporting that is the gate being wrong rather than
 * careful, which is how people learn to ignore a gate.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

// Only `colors.X` in a file that takes `colors` from the theme. Plenty of
// other objects in this codebase are called `colors` locally - a gradient
// array, a chart scale - so the check is deliberately narrow.
for (const file of walk(path.join(ROOT, 'src'))) {
  const raw = fs.readFileSync(file, 'utf8');
  if (!/useTheme\(\)|useThemeColors\(\)|from ['"].*theme\/theme['"]/.test(raw)) continue;
  const source = withoutComments(raw);
  const rel = path.relative(ROOT, file);
  for (const match of source.matchAll(/\bcolors\.([A-Za-z][A-Za-z0-9]*)\b/g)) {
    const key = match[1];
    if (light.has(key)) continue;
    // `colors.maybe || colors.real` is a deliberate fallback, not a mistake:
    // it renders the second one. Only a read with nothing behind it is a bug.
    if (/^\s*(\|\||\?\?)/.test(source.slice(match.index + match[0].length))) continue;
    const line = source.slice(0, match.index).split('\n').length;
    problems.push(`${rel}:${line}: colors.${key} is not in the palette, and has no fallback`);
  }
}

if (problems.length) {
  console.error('\nTheme keys that do not exist:\n');
  for (const p of problems) console.error('  ' + p);
  console.error('\nA missing key renders as the default colour instead of throwing, so this');
  console.error('is the only place it shows up.\n');
  process.exit(1);
}

console.log(`theme keys: PASS (${light.size} palette keys, every colours.X in src/ resolves)`);
