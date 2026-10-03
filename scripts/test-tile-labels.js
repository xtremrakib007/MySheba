#!/usr/bin/env node
'use strict';
/**
 * Renaming and re-iconing a tile without a release.
 *
 * WebView tiles have been editable for a while; nothing else was, so matching
 * the words staff actually use meant a store build. The risk in fixing that is
 * not the renaming - it is what else an editor could reach. A label store that
 * can move `kind`, `screen` or `service` is a way to dress one feature up as
 * another, which is worse than a bad name.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tiles = require('./lib/load-tiles.js');
const { applyTileLabels, editableTiles, visibleTiles } = tiles;

console.log('An override changes the label and the picture, and nothing else');
const base = [{ key: 'recharge', name: 'Mobile Recharge', kind: 'service', cat: 'recharge', home: true, screen: 'x' }];
const renamed = applyTileLabels(base, { recharge: { name: 'Top Up' } });
assert.strictEqual(renamed[0].name, 'Top Up', 'the name is used');
for (const field of ['key', 'kind', 'cat', 'home', 'screen']) {
  assert.strictEqual(renamed[0][field], base[0][field], `an override must not be able to change "${field}"`);
}
// Even if the stored document tries to.
const hostile = applyTileLabels(base, { recharge: { name: 'Free Money', kind: 'webview', screen: 'adminHome', key: 'other' } });
assert.strictEqual(hostile[0].kind, 'service', 'a stored kind is ignored');
assert.strictEqual(hostile[0].screen, 'x', 'a stored screen is ignored');
assert.strictEqual(hostile[0].key, 'recharge', 'a stored key is ignored');

console.log('A drawing and an emoji are told apart, and each wins over the key');
const asArt = applyTileLabels(base, { recharge: { icon: 'support', iconIsArt: true } });
assert.strictEqual(asArt[0].art, 'support', 'a drawing is set as art');
assert.strictEqual(asArt[0].emoji, '', 'and clears any emoji');
const asEmoji = applyTileLabels(base, { recharge: { icon: '\u{1F680}', iconIsArt: false } });
assert.strictEqual(asEmoji[0].emoji, '\u{1F680}', 'text is set as an emoji');
// This is the one that silently did nothing: a tile whose KEY has a drawing
// kept drawing it, so a chosen emoji never appeared.
assert.strictEqual(asEmoji[0].art, '', 'and clears the art, so the key drawing cannot win');
const grid = read('src/components/ServiceGrid.js');
assert(/const artKey = asSafeText\(s\?\.art, ''\) \|\| \(chosenEmoji \? '' : asSafeText\(s\?\.key, icon\)\)/.test(grid),
  'the tile must prefer a chosen icon over the one its key implies');
const feature = read('src/components/FeatureGrid.js');
assert(/hasServiceArt\(it\.art \|\| \(it\.emoji \? '' : it\.key\)\)/.test(feature),
  'and so must the admin landing grid');

console.log('Nothing is left out of the editor');
// Derived from the declared lists: an editor that silently covered most of the
// app would be worse than none.
const listed = new Set(editableTiles().flatMap((g) => g.tiles.map((t) => t.key)));
for (const role of ['customer', 'dealer', 'support', 'admin']) {
  for (const tile of visibleTiles({ role, can: () => true })) {
    assert(listed.has(tile.key), `a ${role} sees "${tile.name}" (${tile.key}) and it cannot be renamed`);
  }
}
// Once each: the same key in several lists is one destination, and offering it
// twice would let two rows disagree about one tile.
const all = editableTiles().flatMap((g) => g.tiles.map((t) => t.key));
assert.strictEqual(new Set(all).size, all.length, 'no tile is offered twice');

console.log('Every grid reads it, so one rename reaches all of them');
for (const fn of ['visibleTiles', 'overflowTiles', 'moreFeaturesSections', 'adminLandingTiles']) {
  const src = read('src/components/serviceTiles.js');
  const body = src.slice(src.indexOf(`export function ${fn}(`));
  assert(/tileLabels/.test(body.slice(0, body.indexOf('\n}\n'))), `${fn} must apply the overrides`);
}

console.log('Only a superadmin can write them');
const rules = read('firestore.rules');
assert(/match \/settings\/tileLabels \{ allow read: if activeProfile\(\); allow create, update: if isSuperadmin\(\)/.test(rules),
  'the rule is the boundary, not the screen');
assert(/hasOnly\(\['tiles','updatedAt'\]\)/.test(rules), 'and nothing but labels goes in the document');
const ctx = read('src/context/AppContext.js');
assert(/tileLabels: \['superadmin'\]/.test(ctx), 'the route is gated too, so the screen cannot be opened by anyone else');

console.log('\nA tile can be renamed without a release, and renamed is all it can be.');
