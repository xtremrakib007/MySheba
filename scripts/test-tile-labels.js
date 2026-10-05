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
// A chosen emoji still beats the key's own artwork - but the test for "chosen"
// is the `art: ''` the line above writes, not merely "an emoji is present". A
// WebView page carries its title icon across as an emoji with no art, and
// reading THAT as a choice hid the picture on every WebView tile.
assert(/const emojiWasChosen = !!chosenEmoji && s\?\.art === '';/.test(grid),
  'only an emoji somebody chose may beat the tile artwork');
assert(/const chosenArt = asSafeText\(s\?\.art, ''\);/.test(grid),
  'a chosen art name must be told apart from one the key implies');
assert(/const artKey = chosenArt \|\| \(emojiWasChosen \? '' : asSafeText\(s\?\.key, icon\)\)/.test(grid),
  'the tile must prefer a chosen icon over the one its key implies');
// ...and a chosen DRAWING must stay a drawing. Looking a picture up from a
// chosen name turned an override saved before the icon pack existed into a
// silent veto over everything the pack ships.
assert(/\(chosenArt \? '' : photoIconFor\(artKey\)\)/.test(grid),
  'a picture may only be found from the key when nothing was chosen');
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


console.log('Every icon the app has can be chosen, not only the ones you can spell');

const screen = read('src/screens/TileLabelsScreen.js');
const service = read('src/firebase/tileLabelService.js');

// A picture and a drawing are the same kind of thing to somebody choosing one.
// If the save classified only drawings as art, a chosen picture would be stored
// as text and the tile would print its own art name.
assert(/const isIconArtName = \(value\) => hasPhotoTileIcon\(value\) \|\| hasServiceArt\(value\)/.test(screen),
  'both kinds of artwork must count as artwork');
assert(/saveTileLabel\(editing\.key, \{ name, icon \}, \{ isArtName: isIconArtName \}\)/.test(screen),
  'and the save must use that, not the drawings alone');

// photoVerificationManagement is 27 characters. The cap was 12, which cut every
// picture name down to something matching no artwork.
const cap = Number(/const MAX_ICON = (\d+);/.exec(service)[1]);
const longest = Math.max(...[...read('src/components/PhotoTileIcon.js')
  .matchAll(/^  (photo[A-Za-z0-9]+): require/gm)].map((m) => m[1].length));
assert(longest > 12, 'this check is only meaningful while a name is longer than the old cap');
assert(cap >= longest, `a name of ${longest} characters cannot be stored under a cap of ${cap}`);
// Scoped to the ICON field: the Name field above it is also maxLength 40, so a
// bare search for that number passes with the icon field still capped at 12.
const iconField = /placeholder="Or paste an emoji"[\s\S]*?maxLength=\{(\d+)\}/.exec(screen);
assert(iconField, 'the icon field must be findable');
assert(Number(iconField[1]) >= longest, `the icon field holds ${iconField[1]} characters, too few for a ${longest}-character name`);

// Tapped rather than typed. Nobody guesses "photoVerificationManagement".
assert(/const PICTURE_CHOICES = photoTileIconNames\(\)/.test(screen));
assert(/const DRAWING_CHOICES = serviceArtNames\(\)/.test(screen));
for (const list of ['PICTURE_CHOICES', 'DRAWING_CHOICES']) {
  assert(new RegExp(list + '\\.map\\(\\(art\\) => \\(').test(screen), list + ' must be offered in the picker');
}
// Both pickers, not just the first one found - they are two separate lists and
// a mutation to either leaves that half with no way back to the default.
const clears = screen.match(/onPress=\{\(\) => setIcon\(icon === art \? '' : art\)\}/g) || [];
assert.strictEqual(clears.length, 2,
  `tapping the chosen icon again must clear it in both pickers, saw ${clears.length}`);
// Every drawing, not a hand-kept shortlist that drifts from the real set.
assert(/export function serviceArtNames\(\)/.test(read('src/components/ServiceArt.js')));
assert(/export function photoTileIconNames\(\)/.test(read('src/components/PhotoTileIcon.js')));

// The row and the sheet must show a chosen picture as a picture.
assert(/if \(hasPhotoTileIcon\(name\)\) return <PhotoTileIcon art=\{name\} size=\{size\} \/>;/.test(screen),
  'a chosen picture must preview as itself');
assert(/const photo = hasPhotoTileIcon\(own\) \? own : photoIconFor\(own\)/.test(screen),
  'and a tile not yet overridden must show the picture it ships with');

console.log('\nA tile can be renamed without a release, and renamed is all it can be.');
