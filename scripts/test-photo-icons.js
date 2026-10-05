#!/usr/bin/env node
'use strict';
/**
 * The supplied icon pack, and the three ways it can quietly stop working.
 *
 * It is artwork keyed by name, which is the easy kind of thing to half-wire: a
 * file that no tile reaches, a map entry whose file was never copied, a tile
 * that shows a drawing because its key is spelled differently from its
 * artwork. None of those throws. They all just look like the icon pack was
 * never added.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tiles = require('./lib/load-tiles.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

const component = read('src/components/PhotoTileIcon.js');
// Read as source rather than imported: it is JSX with react-native in it.
const entries = [...component.matchAll(/^  (photo[A-Za-z0-9]+): require\('\.\.\/\.\.\/(assets\/tiles\/[A-Za-z0-9]+\.png)'\),$/gm)]
  .map(([, art, file]) => ({ art, file }));
const artNames = new Set(entries.map((e) => e.art));

const photoIconFor = (key) => {
  if (typeof key !== 'string' || !key) return '';
  const name = 'photo' + key.charAt(0).toUpperCase() + key.slice(1);
  return artNames.has(name) ? name : '';
};

console.log('\nEvery picture in the pack is on a tile');

test('the map and the folder hold the same icons', () => {
  assert.ok(entries.length >= 20, 'expected the pack, saw ' + entries.length + ' entries');
  for (const { art, file } of entries) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), art + ' points at ' + file + ', which is not there');
  }
  // And nothing copied in that nothing refers to - an icon in the folder with
  // no entry is invisible, which looks exactly like forgetting to add it.
  const onDisk = fs.readdirSync(path.join(ROOT, 'assets/tiles')).filter((f) => f.endsWith('.png'));
  const referenced = new Set(entries.map((e) => path.basename(e.file)));
  for (const file of onDisk) {
    assert.ok(referenced.has(file), 'assets/tiles/' + file + ' is in the folder and in no map entry');
  }
});

test('every entry reaches a real tile', () => {
  // The whole point of naming each file after its tile. An entry no tile can
  // reach is artwork nobody will ever see.
  const all = [
    ...tiles.CUSTOMER_SERVICES, ...tiles.STAFF_CAPABILITY_TILES,
    ...Object.values(tiles.STAFF_SERVICES).flat(),
    ...tiles.PERSONAL_FEATURES, ...tiles.STAFF_FEATURES, ...tiles.ADMIN_HOME,
  ].filter((t) => t && t.key);

  const reached = new Set();
  for (const tile of all) {
    const art = tile.art || tile.key;
    const found = artNames.has(art) ? art : photoIconFor(art);
    if (found) reached.add(found);
  }
  for (const { art } of entries) {
    assert.ok(reached.has(art), art + ' is in the pack and no tile reaches it');
  }
});

test('a tile that names its artwork outright still gets it', () => {
  // These two name a drawing that is not their key, so the key lookup alone
  // would walk straight past the picture supplied for them.
  const source = read('src/components/serviceTiles.js');
  assert.ok(/key: 'tngewallet',[^}]*art: 'photoTngewallet'/.test(source));
  assert.ok(/key: 'jompay',[^}]*art: 'photoJompay'/.test(source));
});

console.log('\nAnd the grids actually draw them');

test('both grids check for a picture before a drawing', () => {
  const service = read('src/components/ServiceGrid.js');
  assert.ok(/const photoKey = hasPhotoTileIcon\(artKey\) \? artKey : photoIconFor\(artKey\)/.test(service));
  const branch = service.indexOf('<PhotoTileIcon art={photoKey}');
  assert.ok(branch > 0, 'the service grid must actually render it');
  // First in the chain, or a tile whose key also has a vector shows the vector.
  assert.ok(branch < service.indexOf('hasBrandTileLogo(artKey)'),
    'the picture must be checked before the drawings');

  const feature = read('src/components/FeatureGrid.js');
  const adminBranch = feature.indexOf('<PhotoTileIcon art={photoArtFor(it)}');
  assert.ok(adminBranch > 0, 'the admin grid must actually render it');
  assert.ok(adminBranch < feature.indexOf('hasServiceArt(it.art'),
    'the admin grid must check it first too');
});

test('a superadmin choosing an icon still wins', () => {
  // Tile Labels works by setting `art` or `emoji`. If the key lookup ignored
  // those, that screen would silently do nothing on every tile in this pack.
  const feature = read('src/components/FeatureGrid.js');
  const helper = /function photoArtFor\(it\) \{[\s\S]*?\n\}/.exec(feature)[0];
  assert.ok(/if \(hasPhotoTileIcon\(it\.art\)\) return it\.art;/.test(helper), 'a chosen picture must be used');
  assert.ok(/if \(it\.art \|\| it\.emoji\) return '';/.test(helper),
    'a chosen drawing or emoji must beat the key lookup');
});

test('an unknown name draws nothing rather than crashing', () => {
  // It is rendered from data a superadmin can type into Tile Labels.
  assert.ok(/const source = PHOTO_ICONS\[art\];\s*\n\s*if \(!source\) return null;/.test(component));
  assert.ok(/if \(typeof tileKey !== 'string' \|\| !tileKey\) return '';/.test(component),
    'a missing key must not be turned into a lookup');
});

test('the pack does not bloat the bundle', () => {
  // Shipped inside the app, so this is download size for every user.
  let bytes = 0;
  for (const file of fs.readdirSync(path.join(ROOT, 'assets/tiles'))) {
    bytes += fs.statSync(path.join(ROOT, 'assets/tiles', file)).size;
  }
  assert.ok(bytes < 3 * 1024 * 1024, 'the pack is ' + Math.round(bytes / 1024) + 'KB, which is too much to ship');
});

console.log('\n' + passed + ' checks passed.\n');
