#!/usr/bin/env node
/**
 * Every grid tile must have artwork of its own.
 *
 * Tile looks its artwork up by the service's `key`, and falls back to a
 * generic diamond when the key is missing from the emoji map. That fallback
 * is silent, so eleven tiles - both My Account tiles, Profile, KYC, My
 * Documents, Wallet Transfer, My Business, the Support Inbox, Inquiries and
 * all three bus partners - shipped showing the same glyph without anything
 * failing. The `icon:` written beside each of them is decoration; Tile has
 * never read it.
 *
 * This fails the build instead.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { SERVICE_EMOJI } = require(path.join(root, 'src/components/serviceEmoji.js'));

// Files declaring tiles that Tile renders. Bus partners live in the data
// module alongside seat classes, so tiles are taken by `kind`, which only a
// tile carries.
const SOURCES = [
  'src/components/ServiceGrid.js',
  'src/components/serviceTiles.js',
  'src/data/countries.js',
];

// Keys drawn by a component rather than taken from the emoji map: the bus
// partners' brand marks, and the ServiceArt icon set with its aliases.
const drawn = new Set(
  [...fs.readFileSync(path.join(root, 'src/components/BusOperatorLogo.js'), 'utf8')
    .matchAll(/'(bus-[a-z]+)':/g)].map((m) => m[1]),
);
const art = fs.readFileSync(path.join(root, 'src/components/ServiceArt.js'), 'utf8');
const artBody = art.slice(art.indexOf('const ART = {'), art.indexOf('const ALIASES'));
for (const m of artBody.matchAll(/^  ([a-zA-Z]+): \(c\) => \(<>/gm)) drawn.add(m[1]);
for (const m of art.slice(art.indexOf('const ALIASES = {')).matchAll(/^  ([a-zA-Z]+): '([a-zA-Z]+)',/gm)) {
  if (drawn.has(m[2])) drawn.add(m[1]);
}

const keys = new Map();
for (const file of SOURCES) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of src.matchAll(/\{\s*key:\s*'([^']+)'[^}]*?\bkind:\s*'[^']+'/g)) {
    if (!keys.has(m[1])) keys.set(m[1], file);
  }
}

const missing = [...keys].filter(([key]) => !SERVICE_EMOJI[key] && !drawn.has(key));

if (!keys.size) {
  console.error('Tile icon audit: found no tiles at all - the patterns above have gone stale.');
  process.exit(1);
}

if (missing.length) {
  console.error(`\nTile icon audit: ${missing.length} tile(s) would render the fallback diamond:\n`);
  for (const [key, file] of missing) console.error(`  ${key}  (${file})`);
  console.error('\nAdd the key to src/components/serviceEmoji.js, or draw it.\n');
  process.exit(1);
}

// ---- sidebar rows ----
// The sidebar is the one place that draws by the `icon:` written beside each
// row rather than by the row's key, so it needs its own pass. It also used a
// separate 23-name icon set, where 37 rows shared 12 icons - seven of them
// the same clock. It draws from ServiceArt now, and a row naming a drawing
// that does not exist renders nothing at all.
const sidebar = fs.readFileSync(path.join(root, 'src/components/Sidebar.js'), 'utf8');
const rows = [...sidebar.matchAll(/\{\s*key:\s*'[^']+',\s*icon:\s*'([^']+)',\s*label:\s*'([^']+)'/g)]
  .map((m) => ({ icon: m[1], label: m[2] }));
if (!rows.length) {
  console.error('Tile icon audit: found no sidebar rows - the pattern has gone stale.');
  process.exit(1);
}
const blankRows = rows.filter((row) => !drawn.has(row.icon));
if (blankRows.length) {
  console.error(`\nTile icon audit: ${blankRows.length} sidebar row(s) name a drawing that does not exist:\n`);
  for (const row of blankRows) console.error(`  ${row.label}  ->  '${row.icon}'`);
  console.error('\nDraw it in src/components/ServiceArt.js, or point the row at an existing drawing.\n');
  process.exit(1);
}

const stillEmoji = [...keys].filter(([key]) => !drawn.has(key)).map(([key]) => key);
console.log(`Tile icon audit: all ${keys.size} tile(s) have artwork - ${keys.size - stillEmoji.length} drawn, ${stillEmoji.length} still emoji.`);
if (stillEmoji.length) console.log(`  still emoji: ${stillEmoji.join(', ')}`);
const distinct = new Set(rows.map((row) => row.icon)).size;
console.log(`  sidebar: all ${rows.length} row(s) drawn, ${distinct} distinct icon(s).`);
