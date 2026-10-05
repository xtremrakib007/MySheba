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
const crypto = require('crypto');
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


console.log('\nNothing falls back to a drawing or an emoji');

test('all 41 tiles resolve to artwork', () => {
  // The whole point of the second batch. A tile with no picture does not
  // break - it draws a vector or prints an emoji - so "missing" looks like a
  // design choice unless something counts.
  const all = [
    ...tiles.CUSTOMER_SERVICES, ...tiles.STAFF_CAPABILITY_TILES,
    ...Object.values(tiles.STAFF_SERVICES).flat(),
    ...tiles.PERSONAL_FEATURES, ...tiles.STAFF_FEATURES, ...tiles.ADMIN_HOME,
  ].filter((t) => t && t.key);

  const seen = new Set();
  const without = [];
  for (const tile of all) {
    if (seen.has(tile.key)) continue;
    seen.add(tile.key);
    const art = tile.art || tile.key;
    if (!artNames.has(art) && !photoIconFor(art)) without.push(`${tile.key} (${tile.name})`);
  }
  assert.strictEqual(without.length, 0, 'these tiles have no artwork: ' + without.join(', '));
  assert.ok(seen.size >= 41, 'expected the whole feature list, saw ' + seen.size);
});

test('every picture is its own picture', () => {
  // Two tiles pointing at one file is the duplicate-icon failure: both look
  // deliberate, and only somebody who knows both features can see it.
  const byFile = {};
  for (const { art, file } of entries) (byFile[file] = byFile[file] || []).push(art);
  const shared = Object.entries(byFile).filter(([, arts]) => arts.length > 1);
  assert.deepStrictEqual(shared, [], 'these files are used by more than one tile: ' + JSON.stringify(shared));

  // And no two files are the same image under different names.
  const digests = {};
  for (const { art, file } of entries) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
    (digests[hash] = digests[hash] || []).push(art);
  }
  const twins = Object.values(digests).filter((arts) => arts.length > 1);
  assert.deepStrictEqual(twins, [], 'these tiles share identical artwork: ' + JSON.stringify(twins));
});

test('the added artwork matches the supplied artwork', () => {
  // Same dimensions, same aspect, same format - an icon a different size or
  // shape reads as a mistake beside the others, whatever is drawn on it.
  for (const { art, file } of entries) {
    const bytes = fs.readFileSync(path.join(ROOT, file));
    assert.strictEqual(bytes.slice(1, 4).toString('ascii'), 'PNG', art + ' is not a PNG');
    // IHDR: width and height are the two 32-bit numbers after the chunk name.
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.strictEqual(width, 175, `${art} is ${width} wide, the set is 175`);
    assert.strictEqual(height, 175, `${art} is ${height} tall, the set is 175`);
  }
});

test('how the added artwork was made is written down', () => {
  // Seventeen of these were drawn rather than supplied. Without the script
  // that drew them, matching one more later means matching it by eye.
  const maker = read('scripts/make-tile-icons.py');
  assert.ok(/SIZE = 175/.test(maker) && /BOX = 163/.test(maker), 'it must hold the measured shape');
  assert.ok(/ICONS = \[/.test(maker));
  const drawn = [...maker.matchAll(/^    \('([A-Za-z]+)',/gm)].map((m) => m[1]);
  // Seventeen tiles had no artwork at all; the rest are ones the supplied pack
  // shipped as byte-identical copies of each other.
  assert.ok(drawn.length >= 17, 'expected at least the seventeen, saw ' + drawn.length);
  for (const name of drawn) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/tiles', name + '.png')),
      name + ' is in the generator and not in the folder');
  }

  // And the other way round, which is the direction that rots: an icon in the
  // folder that nothing can reproduce. Everything here is either artwork that
  // arrived from outside, or something this script draws.
  const SUPPLIED = new Set(['recharge', 'internet', 'rechargePin', 'billpayment', 'jompay',
    'tngewallet', 'mobilebanking', 'remittance', 'offerpacks', 'entertainment', 'flight',
    'bus', 'train', 'mydigital', 'passport', 'visa', 'fomema', 'verificationManagement',
    'userManagement', 'finance', 'adminAnalytics', 'ledger', 'adminSupport', 'walletFunding']);
  const fromScript = new Set(drawn);
  for (const file of fs.readdirSync(path.join(ROOT, 'assets/tiles'))) {
    if (!file.endsWith('.png')) continue;
    const name = file.replace(/\.png$/, '');
    assert.ok(SUPPLIED.has(name) || fromScript.has(name),
      name + '.png was neither supplied nor drawn by the generator - nothing can reproduce it');
  }
});

console.log('\nOne size, on every grid');

test('both grids draw a tile icon at the same size', () => {
  // It was 32 in one grid and 28 in the other, so the same tile was a
  // different size depending on which screen you reached it from.
  const theme = read('src/theme/theme.js');
  const size = /export const tileIcon = \{ size: (\d+), wrap: (\d+), emoji: (\d+) \};/.exec(theme);
  assert.ok(size, 'the size must live in one place');
  const [, px, wrap, emoji] = size.map(Number);

  for (const file of ['src/components/ServiceGrid.js', 'src/components/FeatureGrid.js']) {
    const source = read(file);
    assert.ok(/tileIcon/.test(source), file + ' must use the shared size');
    // No stragglers: one hard-coded size left behind is the drift coming back.
    const hardCoded = source.match(/<(?:PhotoTileIcon|ServiceArt|BrandTileLogo|BusOperatorLogo)[^>]*size=\{\d+/g) || [];
    assert.deepStrictEqual(hardCoded, [], file + ' still sizes an icon by hand');
  }

  // Big enough to read as the tile's picture rather than a stamp on it, and
  // small enough to leave room for the label under it.
  assert.ok(px >= 40 && px <= 72, 'a tile icon of ' + px + ' is outside what the card can carry');
  assert.ok(wrap >= px, 'the wrap must not clip the icon it holds');
  assert.ok(emoji >= px * 0.7, 'an emoji tile must not read as smaller than a drawn one');
});

test('the cards grew with the icon', () => {
  // A taller icon in a card sized for the old one is a clipped icon, and
  // FeatureGrid's cards hide their overflow.
  const service = read('src/components/ServiceGrid.js');
  const feature = read('src/components/FeatureGrid.js');
  const wrap = Number(/export const tileIcon = \{ size: \d+, wrap: (\d+)/.exec(read('src/theme/theme.js'))[1]);

  const serviceMin = Number(/item: \{ width: '31\.3%', minHeight: (\d+)/.exec(service)[1]);
  assert.ok(serviceMin >= wrap + 40, 'the service card has no room for the icon and its label');
  for (const [name, re] of [
    ['item', /item: \{ minHeight: (\d+)/],
    ['gradientFill', /gradientFill: \{ flex: 1, width: '100%', minHeight: (\d+)/],
  ]) {
    const found = Number(re.exec(feature)[1]);
    assert.ok(found >= wrap + 40, 'the feature grid ' + name + ' has no room for the icon and its label');
  }
  assert.ok(/iconWrap: \{ width: tileIcon\.wrap, height: tileIcon\.wrap/.test(feature),
    'the feature grid icon box must follow the size, or it clips');
});

console.log('\n' + passed + ' checks passed.\n');
