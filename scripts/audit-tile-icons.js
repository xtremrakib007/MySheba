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
  'src/screens/MoreFeaturesScreen.js',
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
for (const m of artBody.matchAll(/^  ([a-zA-Z]+): \(\) => \(<>/gm)) drawn.add(m[1]);
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

const stillEmoji = [...keys].filter(([key]) => !drawn.has(key)).map(([key]) => key);
console.log(`Tile icon audit: all ${keys.size} tile(s) have artwork - ${keys.size - stillEmoji.length} drawn, ${stillEmoji.length} still emoji.`);
if (stillEmoji.length) console.log(`  still emoji: ${stillEmoji.join(', ')}`);
