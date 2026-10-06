#!/usr/bin/env node
'use strict';
/**
 * Adding a feature grid tile, without a release.
 *
 * The risk here is not the adding. It is the DESTINATION. settings/tileLabels
 * already refuses to change where a tile goes, on purpose: a tile whose
 * destination is free-form is a way to dress one feature up as another - a
 * tile called "Mobile Reload" that opens Wallet Transfer. An editor that could
 * do that would be worse than no editor.
 *
 * So a custom tile is a SHORTCUT into a service flow that already exists, and
 * these checks are mostly about that being the only thing it can be.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tiles = require('./lib/load-tiles.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); passed += 1; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.message)); failed += 1; }
}

function load(rel, exportList) {
  const src = read(rel)
    .replace(/^import[\s\S]*?from\s+'[^']*';$/gm, '')
    .replace(/^export (const|function|async function) /gm, '$1 ');
  const box = { module: { exports: {} }, console, Math, JSON, Object, String, Array, Number, Boolean, RegExp, Set, Map, isNaN, parseInt, parseFloat };
  vm.createContext(box);
  vm.runInContext(`${src}\nmodule.exports = { ${exportList.join(', ')} };`, box);
  return box.module.exports;
}
const ct = load('src/utils/customTiles.js', [
  'cleanCustomTile', 'cleanCustomTiles', 'describeCustomTile', 'isCustomTileKey',
  'newCustomTileKey', 'SERVICE_STEP_COUNTS', 'CUSTOM_TILE_SERVICES', 'SEED_FIELDS',
]);
const CATS = tiles.TILE_CATEGORIES.map((c) => c.key);
const KEY = 'ct_abcd1234';
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));

console.log('\nA tile can only open a service that exists');
test('a screen is not a destination', () => {
  // The whole boundary. Every one of these is a real screen name, and none of
  // them may be reachable from a tile somebody typed.
  for (const svc of ['transferPoints', 'superAdminTopup', 'userManagement', 'adminHome', 'walletFunding', 'gridManagement', 'service', 'webview', '', null, 'RECHARGE']) {
    assert.strictEqual(ct.cleanCustomTile(KEY, { name: 'Sneaky', service: svc }, CATS), null,
      JSON.stringify(svc) + ' was accepted as a destination');
  }
});
test('a service flow is', () => {
  for (const svc of ct.CUSTOM_TILE_SERVICES) {
    const tile = ct.cleanCustomTile(KEY, { name: 'Shortcut', service: svc }, CATS);
    assert.ok(tile, svc + ' was refused');
    assert.strictEqual(tile.service, svc);
    assert.strictEqual(tile.kind, 'customShortcut');
  }
});
test('the allowed services are EXACTLY what the step machine knows', () => {
  // A service here the step machine does not have is a tile that opens an
  // empty screen; one the machine has and this list does not is a shortcut
  // that cannot be built. They are separate files with nothing linking them.
  const ctx = read('src/context/AppContext.js');
  const block = /const SERVICE_STEPS = \{([\s\S]*?)\n\};/.exec(ctx);
  assert.ok(block, 'could not find SERVICE_STEPS in AppContext');
  const real = {};
  for (const m of block[1].matchAll(/(\w+):\s*(\d+)/g)) real[m[1]] = Number(m[2]);
  assert.deepStrictEqual(plain(ct.SERVICE_STEP_COUNTS), real,
    'utils/customTiles has drifted from the step machine');
});
test('a tile is dispatched to its own service, not a fixed one', () => {
  const grid = read('src/components/ServiceGrid.js');
  assert.ok(/if \(s\.kind === 'customShortcut'\) return startService\(s\.service, s\.seed, s\.startStep\);/.test(grid),
    'ServiceGrid must open the tile’s own service');
});
test('and startService still re-checks Grid Access for that service', () => {
  // So a shortcut cannot reach a feature the person is denied.
  const ctx = read('src/context/AppContext.js');
  const fn = /const startService = useCallback\(\(service, seed = null, startStep = 0\) => \{([\s\S]*?)\n  \}/.exec(ctx);
  assert.ok(fn, 'could not find startService');
  assert.ok(/isGridActive\(gridManagement, service, gridViewer\)/.test(fn[1]),
    'startService must gate on the service it is about to open');
});

console.log('\nA tile that skips steps has to answer them');
test('skipping a step with no answers is refused', () => {
  // Otherwise it lands on a step whose earlier answers are missing: the step
  // renders and nothing it needs is there.
  for (const step of [1, 2, 3]) {
    assert.strictEqual(ct.cleanCustomTile(KEY, { name: 'Jump', service: 'billpayment', startStep: step, seed: {} }, CATS), null,
      'step ' + step + ' with no seed was accepted');
  }
});
test('step 1 needs nothing', () => {
  assert.ok(ct.cleanCustomTile(KEY, { name: 'Plain', service: 'recharge', startStep: 0, seed: {} }, CATS));
});
test('a start step past the end of the flow is brought back inside it', () => {
  // bus has 3 steps, so the last one is index 2.
  const tile = ct.cleanCustomTile(KEY, { name: 'Deep', service: 'bus', startStep: 99, seed: { country: 'MY' } }, CATS);
  assert.strictEqual(tile.startStep, 2);
  assert.strictEqual(ct.cleanCustomTile(KEY, { name: 'Neg', service: 'bus', startStep: -5 }, CATS).startStep, 0);
  // A value that is not a whole step falls back to the first one.
  for (const bad of [1.5, NaN, null, undefined, {}, 'x']) {
    assert.strictEqual(ct.cleanCustomTile(KEY, { name: 'Odd', service: 'bus', startStep: bad }, CATS).startStep, 0,
      JSON.stringify(bad) + ' did not fall back to the first step');
  }
  // '2' is NOT one of those: Number('2') is a whole step, so it is honoured -
  // and then refused for having no answers, which is the right refusal for
  // the right reason. Asserting it fell back to step 0 was my mistake, and it
  // hid that distinction.
  assert.strictEqual(ct.cleanCustomTile(KEY, { name: 'Str', service: 'bus', startStep: '2' }, CATS), null);
  assert.strictEqual(ct.cleanCustomTile(KEY, { name: 'Str', service: 'bus', startStep: '2', seed: { country: 'MY' } }, CATS).startStep, 2);
});
test('only known seed fields are stored', () => {
  // The seed is spread straight into serviceData, so an unknown key is at
  // best ignored and at worst sets something a step did not expect.
  const tile = ct.cleanCustomTile(KEY, {
    name: 'Seeded', service: 'recharge', startStep: 1,
    seed: { country: 'MY', operator: 'Celcom', isAdmin: true, __proto__: 'x', amount: '30' },
  }, CATS);
  assert.deepStrictEqual(Object.keys(plain(tile.seed)).sort(), ['amount', 'country', 'operator']);
  assert.strictEqual(tile.seed.amount, 30, 'an amount must be stored as a number');
});
test('a zero or negative amount is not an answer', () => {
  const tile = ct.cleanCustomTile(KEY, { name: 'Free', service: 'recharge', startStep: 1, seed: { country: 'MY', amount: 0 } }, CATS);
  assert.ok(!('amount' in tile.seed), 'amount 0 was stored as an answer');
});

console.log('\nThe document can only hold tiles');
test('a key that is not a custom tile key is dropped', () => {
  for (const key of ['recharge', 'wv_abcd1234', 'ct_AB', 'ct_', 'evil', '', null]) {
    assert.strictEqual(ct.cleanCustomTile(key, { name: 'X Y', service: 'recharge' }, CATS), null,
      JSON.stringify(key) + ' was accepted as a tile key');
  }
  assert.ok(ct.isCustomTileKey(ct.newCustomTileKey()), 'generated keys must pass their own rule');
});
test('a name under two characters is refused', () => {
  for (const name of ['', ' ', 'X', null]) {
    assert.strictEqual(ct.cleanCustomTile(KEY, { name, service: 'recharge' }, CATS), null);
  }
});
test('an unknown category falls back rather than being stored', () => {
  assert.strictEqual(ct.cleanCustomTile(KEY, { name: 'Xy', service: 'recharge', cat: 'nope' }, CATS).cat, 'recharge');
  assert.strictEqual(ct.cleanCustomTile(KEY, { name: 'Xy', service: 'recharge', cat: 'travel' }, CATS).cat, 'travel');
});
test('the list is ordered by key and capped', () => {
  // Object.keys order is insertion order and a merge write can change it, so
  // two devices would otherwise draw the same document in different orders.
  // Inserted in a DELIBERATELY scrambled order. Building them ascending made
  // insertion order equal sorted order, so removing the sort changed nothing
  // and the check passed on a function that did not sort at all.
  const many = {};
  const order = [];
  for (let i = 0; i < 80; i += 1) order.push(i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = (i * 37 + 11) % (i + 1); // fixed shuffle: no randomness in a test
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const i of order) many[`ct_t${String(i).padStart(4, '0')}`] = { name: 'T' + i, service: 'recharge' };
  assert.notDeepStrictEqual(Object.keys(many), [...Object.keys(many)].sort(),
    'the fixture must not already be in sorted order, or the sort is untested');
  const list = ct.cleanCustomTiles({ tiles: many }, CATS);
  assert.ok(list.length <= 40, 'the document is not capped: ' + list.length);
  // plain(): the list comes from a vm realm, so deepStrictEqual rejects it on
  // prototype identity alone.
  assert.deepStrictEqual(plain(list.map((t) => t.key)), [...list.map((t) => t.key)].sort());
});
test('a missing or malformed document is no tiles, not a crash', () => {
  for (const bad of [null, {}, { tiles: null }, { tiles: [] }, { tiles: 'x' }, 'x', []]) {
    assert.deepStrictEqual(plain(ct.cleanCustomTiles(bad, CATS)), []);
  }
});
test('the stored document keeps no derived fields', () => {
  // key, kind and custom are produced on read. Storing them would be a second
  // copy to disagree with.
  const svc = read('src/firebase/customTileService.js');
  const written = /tiles: \{\s*\[id\]: \{([\s\S]*?)\},\s*\},/.exec(svc);
  assert.ok(written, 'could not find what saveCustomTile stores');
  for (const field of ['kind:', 'custom:', 'key:']) {
    assert.ok(!written[1].includes(field), field + ' must not be stored');
  }
});
test('the save path validates with the SAME function the grids read through', () => {
  const svc = read('src/firebase/customTileService.js');
  assert.ok(/const clean = cleanCustomTile\(id, tile, categoryKeys\);/.test(svc),
    'a tile the screen accepted must not be one the grids refuse to draw');
  assert.ok(/if \(!clean\) \{/.test(svc), 'and an invalid tile must be refused with a reason');
});

console.log('\nAn added tile behaves like any other tile');
const CUSTOM = [ct.cleanCustomTile(KEY, { name: 'Celcom Reload', service: 'recharge', startStep: 1, seed: { country: 'MY', operator: 'Celcom' }, cat: 'recharge' }, CATS)];
test('it reaches a role\'s grid', () => {
  const list = tiles.visibleTiles({ role: 'customer', can: () => true, customTiles: CUSTOM });
  assert.ok(list.some((t) => t.key === KEY), 'the added tile is not in the grid');
});
test('it is appended, not merged in somewhere clever', () => {
  // Adding one must not reshuffle a grid people already know.
  const before = tiles.visibleTiles({ role: 'customer', can: () => true }).map((t) => t.key);
  const after = tiles.visibleTiles({ role: 'customer', can: () => true, customTiles: CUSTOM }).map((t) => t.key);
  assert.deepStrictEqual(after.slice(0, before.length), before);
  assert.deepStrictEqual(after.slice(before.length), [KEY]);
});
test('no custom tiles changes nothing at all', () => {
  const before = tiles.visibleTiles({ role: 'customer', can: () => true }).map((t) => t.key);
  for (const arg of [undefined, null, [], 'x']) {
    assert.deepStrictEqual(tiles.visibleTiles({ role: 'customer', can: () => true, customTiles: arg }).map((t) => t.key), before);
  }
});
test('it cannot collide with a built-in tile', () => {
  const collide = [{ ...CUSTOM[0], key: 'recharge' }];
  const list = tiles.withCustomTiles(tiles.servicesForRole('customer', () => true), collide);
  assert.strictEqual(list.filter((t) => t.key === 'recharge').length, 1, 'a custom tile overwrote a built-in one');
});
test('Grid Access can turn it off - the bug the WebView pages had', () => {
  const list = tiles.visibleTiles({ role: 'customer', can: () => true, customTiles: CUSTOM, isActive: (k) => k !== KEY });
  assert.ok(!list.some((t) => t.key === KEY), 'an added tile cannot be switched off');
  // ...and the override survives being read back, which is where the WebView
  // pages failed: sanitizeScope dropped every key it did not recognise.
  const gridSrc = read('src/firebase/gridManagementService.js');
  assert.ok(/if \(isCustomTileKey\(id\)\) return true;/.test(gridSrc),
    'a ct_ key is not scopable, so every override on an added tile is dropped on read');
});
test('Home Screen Tiles can move it', () => {
  const home = tiles.visibleTiles({ role: 'customer', can: () => true, customTiles: CUSTOM, homeOnly: true });
  assert.ok(home.some((t) => t.key === KEY), 'an added tile declaring home is not on the home screen');
  const off = tiles.visibleTiles({ role: 'customer', can: () => true, customTiles: CUSTOM, homeOnly: true, placement: { [KEY]: false } });
  assert.ok(!off.some((t) => t.key === KEY), 'it cannot be moved off the home screen');
  const over = tiles.overflowTiles({ role: 'customer', can: () => true, customTiles: CUSTOM, placement: { [KEY]: false } });
  assert.ok(over.some((t) => t.key === KEY), 'moved off home, it went nowhere');
});
test('a tile declared off-home starts in More Features', () => {
  const offHome = [ct.cleanCustomTile(KEY, { name: 'Quiet', service: 'recharge', home: false }, CATS)];
  assert.strictEqual(offHome[0].home, false);
  assert.ok(!tiles.visibleTiles({ role: 'customer', can: () => true, customTiles: offHome, homeOnly: true }).some((t) => t.key === KEY));
  assert.ok(tiles.overflowTiles({ role: 'customer', can: () => true, customTiles: offHome }).some((t) => t.key === KEY));
});
test('the editing screen can place it, so adding one is not a dead end', () => {
  const { tiles: placeable } = tiles.placeableTiles({ role: 'customer', customTiles: CUSTOM });
  assert.ok(placeable.some((t) => t.key === KEY), 'Home Screen Tiles cannot see the added tile');
  const placeScreen = read('src/screens/TilePlacementScreen.js');
  const destructures = [...placeScreen.matchAll(/\{([^}]*)\} = useApp\(\)/g)].map((m) => m[1]);
  assert.ok(destructures.some((d) => /\bcustomTiles\b/.test(d)),
    'TilePlacementScreen does not take the added tiles from the context');
  assert.ok(/placeableTiles\(\{[^}]*customTiles[^}]*\}\)/.test(placeScreen),
    'TilePlacementScreen takes them and then does not pass them on');
});
test('every grid that draws tiles is handed them', () => {
  for (const f of ['src/components/ServiceGrid.js', 'src/screens/MoreFeaturesScreen.js']) {
    assert.ok(/^\s*customTiles,$/m.test(read(f)), f + ' does not pass the added tiles on');
  }
});

console.log('\nOnly a superadmin can add one');
test('the route guard and the screen both say so', () => {
  assert.ok(/customTileManagement: \['superadmin'\]/.test(read('src/context/AppContext.js')), 'the route guard must restrict it');
  assert.ok(/profile\?\.role === 'superadmin'/.test(read('src/screens/CustomTilesScreen.js')), 'and the screen too');
});
test('and so do the rules', () => {
  const line = read('firestore.rules').split('\n').find((l) => l.includes('match /settings/customTiles'));
  assert.ok(line, 'settings/customTiles has no rule at all');
  assert.ok(/isSuperadmin\(\)/.test(line), 'anyone can add a tile');
  assert.ok(/hasOnly\(\['tiles','updatedAt'\]\)/.test(line), 'the document has no key allowlist');
  assert.ok(/allow read: if activeProfile\(\)/.test(line), 'the grids cannot read it');
  assert.ok(/allow delete: if false/.test(line), 'the document can be deleted');
});

console.log(failed ? `\n${failed} check(s) failed.\n` : `\n${passed} checks passed.\n`);
process.exit(failed ? 1 : 0);
