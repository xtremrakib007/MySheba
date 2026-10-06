#!/usr/bin/env node
'use strict';
/**
 * Moving a tile between a role's home screen and More Features.
 *
 * The home screen was whatever components/serviceTiles.js declared, so
 * swapping one tile on it for another meant a release. For admin and
 * superadmin the declaration was also just wrong: nothing in ADMIN_HOME is
 * flagged for home, so the Control Center carried the whole catalogue and
 * More Features had nothing left to hold - the same destinations twice, with
 * no way to move any of them.
 *
 * The risk in fixing that is not the rearranging. It is a tile ending up on
 * NEITHER screen: a finished feature nobody can reach, which is worse than
 * one in an awkward place. So the checks that matter here are the ones that
 * prove home and overflow are exact complements, for every role, including
 * when a superadmin has moved things.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tiles = require('./lib/load-tiles.js');
const { tileOnHome, visibleTiles, overflowTiles, placeableTiles, adminLandingTiles, adminOverflowTiles, moreFeaturesSections, applyTileOrder } = tiles;

// The placement service runs in a vm realm below, so the objects it returns
// have that realm's Object prototype and deepStrictEqual rejects them on
// identity alone - nothing to do with their contents. Compare the contents.
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); passed += 1; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.message)); failed += 1; }
}

// The placement service, minus Firebase. Same approach scripts/lib/load-tiles
// uses: running it beats pattern-matching it, because a rule can read right
// and still do the wrong thing.
function loadPlacementService() {
  const src = read('src/firebase/tilePlacementService.js')
    .replace(/^import[\s\S]*?from\s+'[^']*';$/gm, '')
    .replace(/^export (const|function|async function) /gm, '$1 ');
  const box = { module: { exports: {} }, doc: () => ({}), setDoc: async () => {}, onSnapshot: () => () => {}, serverTimestamp: () => 0, deleteField: () => '__delete__', db: {} };
  vm.createContext(box);
  vm.runInContext(`${src}
module.exports = { cleanPlacement, cleanOrder, placementFor, orderFor, PLACEMENT_ROLES, setTileOnHome, clearTilePlacement, resetRolePlacement, setTileOrder, resetRoleOrder };`, box);
  return box.module.exports;
}
const svc = loadPlacementService();

console.log('\nThe stored document can only say what it is for');
test('a role map of booleans survives', () => {
  const out = svc.cleanPlacement({ roles: { superadmin: { ledger: false, recharge: true } } });
  assert.deepStrictEqual(plain(out), { superadmin: { ledger: false, recharge: true } });
});
test('a role nobody has is dropped', () => {
  const out = svc.cleanPlacement({ roles: { superadmin: { ledger: false }, hacker: { ledger: true } } });
  assert.deepStrictEqual(Object.keys(out), ['superadmin']);
});
test('a non-boolean value is dropped, not coerced', () => {
  // This is the one that matters: `undefined` reaching tileOnHome reads as
  // "no override", but a stored "false" string would read as TRUE and put a
  // tile back on a home screen somebody deliberately cleared.
  const out = svc.cleanPlacement({ roles: { customer: { recharge: 'false', bus: 1, flight: null, train: true } } });
  assert.deepStrictEqual(plain(out), { customer: { train: true } });
});
test('a document that is not there is an empty map', () => {
  assert.deepStrictEqual(plain(svc.cleanPlacement(null)), {});
  assert.deepStrictEqual(plain(svc.cleanPlacement({})), {});
  assert.deepStrictEqual(plain(svc.cleanPlacement({ roles: [] })), {});
  assert.deepStrictEqual(plain(svc.cleanPlacement({ roles: 'all' })), {});
});
test('one role is more than 200 tiles only up to 200', () => {
  const big = {};
  for (let i = 0; i < 400; i += 1) big['t' + i] = false;
  const out = svc.cleanPlacement({ roles: { customer: big } });
  assert.strictEqual(Object.keys(out.customer).length, 200);
});
// These are async, so they reject rather than throw - asserting with
// assert.throws passed on every one of them without running anything.
const asyncTests = [];
function testAsync(name, fn) { asyncTests.push([name, fn]); }
testAsync('an unknown role cannot be written', async () => {
  await assert.rejects(() => svc.setTileOnHome('hacker', 'ledger', false), /Unknown role/);
  await assert.rejects(() => svc.clearTilePlacement('hacker', 'ledger'), /Unknown role/);
  await assert.rejects(() => svc.resetRolePlacement('hacker'), /Unknown role/);
});
testAsync('a write with no tile key is refused', async () => {
  await assert.rejects(() => svc.setTileOnHome('customer', '  ', false), /tile key/);
  await assert.rejects(() => svc.clearTilePlacement('customer', ''), /tile key/);
});
testAsync('an order can only be written for a known role, as a list', async () => {
  await assert.rejects(() => svc.setTileOrder('hacker', ['a']), /Unknown role/);
  await assert.rejects(() => svc.resetRoleOrder('hacker'), /Unknown role/);
  await assert.rejects(() => svc.setTileOrder('customer', 'a'), /list of tile keys/);
  // Cleaned on the way IN as well as out, so what is sent back is what will
  // be read next.
  assert.deepStrictEqual(plain(await svc.setTileOrder('customer', ['a', 'a', '', 'b'])), ['a', 'b']);
  assert.strictEqual(await svc.resetRoleOrder('customer'), null);
});
testAsync('a known role and a real key is accepted', async () => {
  // Or the two checks above would pass on a function that refuses everything.
  assert.strictEqual(await svc.setTileOnHome('superadmin', 'ledger', false), false);
  assert.strictEqual(await svc.clearTilePlacement('superadmin', 'ledger'), null);
  assert.strictEqual(await svc.resetRolePlacement('superadmin'), null);
});
test('placementFor never hands back something that is not a map', () => {
  for (const bad of [null, undefined, 'x', 7, []]) assert.deepStrictEqual(plain(svc.placementFor(bad, 'customer')), {});
  assert.deepStrictEqual(plain(svc.placementFor({ customer: [] }, 'customer')), {});
});

console.log('\nOne rule decides where a tile sits');
test('an override wins over the declared flag, both ways', () => {
  assert.strictEqual(tileOnHome({ key: 'a', home: true }, { a: false }), false);
  assert.strictEqual(tileOnHome({ key: 'a', home: false }, { a: true }), true);
});
test('with no override the declaration stands', () => {
  assert.strictEqual(tileOnHome({ key: 'a', home: true }, {}), true);
  assert.strictEqual(tileOnHome({ key: 'a', home: false }, { b: true }), false);
});
test('a list that flags nothing uses the default it passes', () => {
  // ADMIN_HOME is that list, and this is why it keeps behaving as it did.
  assert.strictEqual(tileOnHome({ key: 'a' }, null, true), true);
  assert.strictEqual(tileOnHome({ key: 'a' }, null, false), false);
  assert.strictEqual(tileOnHome({ key: 'a' }, null), false);
});
test('a declared flag still beats the default', () => {
  assert.strictEqual(tileOnHome({ key: 'a', home: false }, null, true), false);
});
test('the rule is not copied into the Firebase service', () => {
  // Two copies drift, and a drifted copy means a tile on both screens or on
  // neither. The service's job ends at handing over the overrides.
  const src = read('src/firebase/tilePlacementService.js');
  assert.ok(!/typeof\s+declared/.test(src) && !/function isOnHome/.test(src),
    'tilePlacementService must not re-implement tileOnHome');
  assert.ok(/tileOnHome/.test(src), 'and must say where the rule actually lives');
});

console.log('\nHome and More Features are exact complements, for every role');
const ROLES = ['customer', 'dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin'];
const can = () => true;
for (const role of ROLES) {
  test(`${role}: nothing on both screens, nothing on neither`, () => {
    const { tiles: all, declaredDefault } = placeableTiles({ role });
    // Move a third of them off, deliberately including ones that are on by
    // default - a test that only moves already-off tiles proves nothing.
    const placement = {};
    all.forEach((t, i) => { if (i % 3 === 0) placement[t.key] = false; });
    const moved = Object.keys(placement);
    assert.ok(moved.length > 0, 'the fixture must actually move something');

    const onHome = all.filter((t) => tileOnHome(t, placement, declaredDefault)).map((t) => t.key);
    const off = all.filter((t) => !tileOnHome(t, placement, declaredDefault)).map((t) => t.key);
    const both = onHome.filter((k) => off.includes(k));
    assert.deepStrictEqual(both, [], 'on both: ' + both.join(','));
    const neither = all.map((t) => t.key).filter((k) => !onHome.includes(k) && !off.includes(k));
    assert.deepStrictEqual(neither, [], 'on neither: ' + neither.join(','));
    // And every tile we moved really did leave the home screen.
    const stuck = moved.filter((k) => onHome.includes(k));
    assert.deepStrictEqual(stuck, [], 'moved off but still on home: ' + stuck.join(','));
  });
}

console.log('\nA tile taken off a service home screen turns up in More Features');
test('a customer tile moved off home lands in the overflow', () => {
  const onHomeByDefault = visibleTiles({ role: 'customer', can, homeOnly: true });
  const victim = onHomeByDefault.find((t) => t.kind !== 'moreFeaturesLink' && t.cat !== 'personal');
  assert.ok(victim, 'need a tile that is on the customer home by default');
  const placement = { [victim.key]: false };
  const home = visibleTiles({ role: 'customer', can, homeOnly: true, placement }).map((t) => t.key);
  assert.ok(!home.includes(victim.key), victim.key + ' is still on the home screen');
  const over = overflowTiles({ role: 'customer', can, placement }).map((t) => t.key);
  assert.ok(over.includes(victim.key), victim.key + ' left the home screen and went nowhere');
});
test('a tile added to home leaves the overflow', () => {
  const over = overflowTiles({ role: 'customer', can });
  assert.ok(over.length > 0, 'need a tile that is off the customer home by default');
  const victim = over[0];
  const placement = { [victim.key]: true };
  assert.ok(visibleTiles({ role: 'customer', can, homeOnly: true, placement }).some((t) => t.key === victim.key));
  assert.ok(!overflowTiles({ role: 'customer', can, placement }).some((t) => t.key === victim.key),
    victim.key + ' is on the home screen AND in the overflow');
});
test('More Features shows it, not just overflowTiles', () => {
  // moreFeaturesSections is what the screen actually renders, and it filters
  // again on its own account/category rules - so the tile has to survive THAT.
  const victim = visibleTiles({ role: 'customer', can, homeOnly: true })
    .find((t) => t.kind !== 'moreFeaturesLink' && t.cat !== 'personal');
  const { sections } = moreFeaturesSections({ role: 'customer', can, placement: { [victim.key]: false } });
  const shown = sections.flatMap((s) => s.tiles.map((t) => t.key));
  assert.ok(shown.includes(victim.key), victim.key + ' is not on the More Features screen');
});
test('switching a tile OFF entirely still beats placement', () => {
  // Grid Access wins: a tile that is off is off wherever it was placed.
  const victim = overflowTiles({ role: 'customer', can })[0];
  const isActive = (key) => key !== victim.key;
  const placement = { [victim.key]: true };
  assert.ok(!visibleTiles({ role: 'customer', can, homeOnly: true, placement, isActive }).some((t) => t.key === victim.key));
  assert.ok(!overflowTiles({ role: 'customer', can, placement, isActive }).some((t) => t.key === victim.key));
});
test('clearing a whole role puts every tile back', () => {
  const before = visibleTiles({ role: 'dealer', can, homeOnly: true }).map((t) => t.key);
  const after = visibleTiles({ role: 'dealer', can, homeOnly: true, placement: {} }).map((t) => t.key);
  assert.deepStrictEqual(after, before);
});
test('taking every tile off a home screen is honoured, not treated as a mistake', () => {
  // The old fallback said "nothing flagged means show everything", which would
  // have quietly undone a superadmin clearing a home screen on purpose.
  const all = visibleTiles({ role: 'customer', can });
  const placement = {};
  all.forEach((t) => { placement[t.key] = false; });
  const home = visibleTiles({ role: 'customer', can, homeOnly: true, placement });
  assert.ok(home.length <= 1, 'a cleared home screen still rendered ' + home.length + ' tiles');
});

console.log('\nThe Control Center splits the same way');
test('by default every admin tile is on the grid and none overflow', () => {
  const grid = adminLandingTiles(null, () => false, null).filter((i) => tileOnHome(i, {}, true));
  assert.strictEqual(grid.length, tiles.ADMIN_HOME.length, 'the admin grid changed shape with no override set');
  assert.strictEqual(adminOverflowTiles({}).length, 0, 'tiles overflowed with no override set');
});
test('a tile taken off the admin grid lands in its More Features', () => {
  const victim = tiles.ADMIN_HOME.find((i) => i.key !== 'moreFeaturesTile');
  const placement = { [victim.key]: false };
  const grid = adminLandingTiles(null, () => false, null).filter((i) => tileOnHome(i, placement, true)).map((i) => i.key);
  assert.ok(!grid.includes(victim.key), victim.key + ' is still on the Control Center grid');
  assert.ok(adminOverflowTiles({ placement }).map((i) => i.key).includes(victim.key),
    victim.key + ' left the grid and went nowhere');
});
test('the Control Center filter is applied to both halves', () => {
  // A tile this role cannot reach must be in neither list, or taking it off
  // the grid would reveal a feature capability already denied.
  const victim = tiles.ADMIN_HOME.find((i) => i.key !== 'moreFeaturesTile');
  const placement = { [victim.key]: false };
  const off = adminOverflowTiles({ placement, isOnGrid: (i) => i.key !== victim.key });
  assert.ok(!off.map((i) => i.key).includes(victim.key), 'a denied tile reappeared in the overflow');
});
test('the screen drives both halves off the same rule and the same map', () => {
  const screen = read('src/screens/AdminFeaturesScreen.js');
  assert.ok(/const homeItems = allowed\.filter\(\(item\) => tileOnHome\(item, tilePlacementForMe, true\)\)/.test(screen),
    'the grid must filter on tileOnHome');
  assert.ok(/const movedOff = allowed\.filter\(\(item\) => !tileOnHome\(item, tilePlacementForMe, true\)\)/.test(screen),
    'and the More Features section must be its exact negation');
  assert.ok(/items=\{movedOff\}/.test(screen), 'and must actually render it');
});

console.log('\nA superadmin can set the order tiles are drawn in');
test('a named key leads, and the rest keep the order they are declared in', () => {
  const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];
  assert.deepStrictEqual(applyTileOrder(list, ['c', 'a']).map((t) => t.key), ['c', 'a', 'b', 'd']);
});
test('a partial order is enough, which is the whole point', () => {
  // The declared lists grow every release. An order that had to name every
  // tile would mean rewriting every role's order when a feature ships, or a
  // new tile falling off the end of a grid nobody thought to re-sort.
  const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  assert.deepStrictEqual(applyTileOrder(list, ['c']).map((t) => t.key), ['c', 'a', 'b']);
});
test('no order, an empty order, or a key nobody has changes nothing', () => {
  const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  const declared = ['a', 'b', 'c'];
  for (const order of [undefined, null, [], ['nope'], 'a', 7]) {
    assert.deepStrictEqual(applyTileOrder(list, order).map((t) => t.key), declared, 'order ' + JSON.stringify(order));
  }
});
test('it never adds, drops or duplicates a tile', () => {
  // The one thing a sort must not do. A tile lost here is a feature nobody
  // can reach, from a screen whose whole job is moving tiles around.
  const { tiles: all } = placeableTiles({ role: 'customer' });
  const order = all.map((t) => t.key).reverse();
  const sorted = applyTileOrder(all, order);
  assert.strictEqual(sorted.length, all.length);
  assert.deepStrictEqual([...sorted.map((t) => t.key)].sort(), [...all.map((t) => t.key)].sort());
});
test('it does not mutate the declared list, and never hands it back', () => {
  // The declared lists are module-level constants shared by every caller, so
  // an in-place sort would reorder them for the whole app - and handing the
  // caller the same array lets them do it later, which is the same bug with a
  // longer fuse. Checking only "the input is unchanged" missed that, because
  // the test did not mutate what came back.
  const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  const before = list.map((t) => t.key);
  for (const order of [['c'], [], undefined]) {
    const out = applyTileOrder(list, order);
    assert.notStrictEqual(out, list, 'order ' + JSON.stringify(order) + ' returned the input array itself');
    assert.deepStrictEqual(list.map((t) => t.key), before);
  }
});
test('the comparator can never work out to NaN', () => {
  // A SOURCE check, deliberately, because the behavioural one cannot settle
  // this: V8 leaves a NaN-comparator sort alone even at 40 elements, so the
  // Infinity version passes every test above on Node. The app runs on Hermes,
  // where that is not a promise anybody made - a comparator returning NaN has
  // no defined behaviour, and the failure would be a home screen in a random
  // order on a device I cannot reproduce from here.
  //
  // So the invariant is checked where it lives: the rank of an unnamed tile is
  // finite, and no arithmetic on it can produce NaN.
  const src = read('src/components/serviceTiles.js');
  const fn = /export function applyTileOrder\(tiles, order\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(fn, 'could not find applyTileOrder');
  // CODE ONLY. The body explains why Infinity is wrong, and a check that read
  // the comments matched that explanation and failed on the correct version -
  // the same way round as a check that passes because it matched a comment
  // instead of the code.
  const code = fn[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/Infinity/.test(code),
    'an Infinity rank makes the comparator return NaN for two unnamed tiles');
  assert.ok(/const after = order\.length;/.test(code) && /after \+ i/.test(code),
    'an unnamed tile must rank by a finite value derived from its position');
});
test('two unnamed tiles never swap, at a length past the sort\'s fast path', () => {
  // The comparator used to work out to NaN for a pair of unnamed tiles
  // (Infinity - Infinity), which has no defined behaviour. Short arrays hid
  // it: V8 insertion-sorts those and leaves such pairs alone. 40 is well past
  // that, so a NaN comparator shows up as a scrambled list.
  const list = Array.from({ length: 40 }, (_, i) => ({ key: 'k' + i }));
  const declared = list.map((t) => t.key);
  assert.deepStrictEqual(applyTileOrder(list, ['k39']).map((t) => t.key),
    ['k39', ...declared.filter((k) => k !== 'k39')]);
  // And with one named tile in the middle, everything else holds its place.
  assert.deepStrictEqual(applyTileOrder(list, ['k20']).map((t) => t.key),
    ['k20', ...declared.filter((k) => k !== 'k20')]);
});
test('the order reaches the home grid and More Features alike', () => {
  const can = () => true;
  const home = visibleTiles({ role: 'customer', can, homeOnly: true });
  const last = home[home.length - 1].key;
  const moved = visibleTiles({ role: 'customer', can, homeOnly: true, order: [last] });
  assert.strictEqual(moved[0].key, last, 'the home grid ignores the order');
  const over = overflowTiles({ role: 'customer', can });
  if (over.length > 1) {
    const overLast = over[over.length - 1].key;
    assert.strictEqual(overflowTiles({ role: 'customer', can, order: [overLast] })[0].key, overLast,
      'More Features ignores the order');
  }
});
test('the Control Center is ordered before it is split, not after', () => {
  // Ordered after the split, a tile moved to the top of the grid would jump
  // to the top of whichever of the two lists it landed in instead.
  const screen = read('src/screens/AdminFeaturesScreen.js');
  assert.ok(/const allowed = applyTileOrder\(adminHomeList, tileOrderForMe\)\.filter\(onGrid\);/.test(screen),
    'AdminFeaturesScreen must order the whole list before filtering it');
});
test('a stored order keeps only distinct, sanely-sized keys for known roles', () => {
  const out = svc.cleanOrder({ order: { superadmin: ['a', 'b', 'a', '', '  c  ', 7, null, 'x'.repeat(100)], nobody: ['a'] } });
  assert.deepStrictEqual(plain(out), { superadmin: ['a', 'b', 'c'] });
});
test('a duplicate is dropped rather than kept', () => {
  // A key appearing twice would sort one tile into two positions, and the
  // second would silently win.
  const out = svc.cleanOrder({ order: { customer: ['a', 'a', 'b'] } });
  assert.deepStrictEqual(plain(out).customer, ['a', 'b']);
});
test('a missing or malformed order reads as no order', () => {
  for (const bad of [null, {}, { order: null }, { order: [] }, { order: 'all' }, { order: { customer: 'a' } }]) {
    assert.deepStrictEqual(plain(svc.cleanOrder(bad)), {});
  }
});
test('the order is capped, like the placement map', () => {
  const big = Array.from({ length: 400 }, (_, i) => 't' + i);
  assert.strictEqual(svc.cleanOrder({ order: { customer: big } }).customer.length, 200);
});
test('orderFor hands back a list, never undefined', () => {
  assert.deepStrictEqual(plain(svc.orderFor({ order: { customer: ['a'] } }, 'customer')), ['a']);
  for (const bad of [null, undefined, {}, 'x', { order: { customer: 'a' } }]) {
    assert.deepStrictEqual(plain(svc.orderFor(bad, 'customer')), []);
  }
});
test('placement and order come from ONE snapshot', () => {
  // Two listeners would let a grid draw this launch's placement against last
  // launch's order.
  const src = read('src/firebase/tilePlacementService.js');
  assert.ok(/callback\(\{ tiles: cleanPlacement\(data\), order: cleanOrder\(data\) \}\)/.test(src),
    'the subscription must deliver both halves together');
  const ctx = read('src/context/AppContext.js');
  assert.ok(/orderFor\(tilePlacement, profile\?\.role\)/.test(ctx),
    'AppContext must resolve the order for the same role as the placement');
});
test('placementFor still reads a bare role map', () => {
  // The snapshot shape changed; a caller holding the old one must not read
  // undefined as "no overrides" and silently lose them.
  assert.deepStrictEqual(plain(svc.placementFor({ customer: { a: false } }, 'customer')), { a: false });
  assert.deepStrictEqual(plain(svc.placementFor({ tiles: { customer: { a: false } } }, 'customer')), { a: false });
});
test('the screen shows tiles in the order it will save them in', () => {
  const screen = read('src/screens/TilePlacementScreen.js');
  assert.ok(/applyTileOrder\(declared, storedOrder\)/.test(screen),
    'the list must be sorted by the same function the grids use');
  assert.ok(/const keys = tiles\.map\(\(t\) => t\.key\);/.test(screen),
    'a swap must be built from the displayed list, not from the partial stored order');
});

console.log('\nThe editing screen can only reach what it is for');
test('every role with a home screen is offered', () => {
  for (const role of ROLES) assert.ok(svc.PLACEMENT_ROLES.includes(role), role + ' cannot be configured');
});
test('each role is offered the tiles its OWN home screen draws from', () => {
  // Admin and superadmin land on the Control Center; everybody else on
  // ServiceGrid. A screen that offered one list for both would show toggles
  // that control nothing.
  const admin = placeableTiles({ role: 'superadmin' });
  assert.strictEqual(admin.declaredDefault, true);
  assert.deepStrictEqual(admin.tiles.map((t) => t.key), tiles.ADMIN_HOME.map((t) => t.key));
  const customer = placeableTiles({ role: 'customer' });
  assert.strictEqual(customer.declaredDefault, false);
  assert.ok(customer.tiles.length > 0 && customer.tiles.length !== admin.tiles.length);
});
test('the list is the role being edited, not the person editing', () => {
  const src = read('src/components/serviceTiles.js');
  assert.ok(/servicesForRole\(role \|\| 'customer', \(\) => true\)/.test(src),
    'placeableTiles must not filter by the editor’s own capabilities');
});
test('the screen is superadmin only, in the route guard and on the screen', () => {
  assert.ok(/tilePlacement: \['superadmin'\]/.test(read('src/context/AppContext.js')),
    'the route guard must restrict it');
  const screen = read('src/screens/TilePlacementScreen.js');
  assert.ok(/profile\?\.role === 'superadmin'/.test(screen), 'and the screen must say so too');
});
test('only a superadmin may write the document', () => {
  const rules = read('firestore.rules');
  const line = rules.split('\n').find((l) => l.includes('match /settings/tilePlacement'));
  assert.ok(line, 'settings/tilePlacement has no rule at all');
  assert.ok(/isSuperadmin\(\)/.test(line), 'anyone can write the placement document');
  assert.ok(/hasOnly\(\[(?=[^\]]*'roles')(?=[^\]]*'order')(?=[^\]]*'updatedAt')[^\]]*\]\)/.test(line),
    'the allowlist must name roles, order and updatedAt, and nothing else');
  assert.ok(/allow read: if activeProfile\(\)/.test(line), 'the grids cannot read it');
  assert.ok(/allow delete: if false/.test(line), 'the document can be deleted');
});
test('setting a value equal to the default clears it instead of storing it', () => {
  // A stored override that agrees with the code is a row left behind, which
  // starts saying the opposite as soon as the feature’s own flag changes.
  const screen = read('src/screens/TilePlacementScreen.js');
  assert.ok(/if \(next === tileOnHome\(tile, null, declaredDefault\)\) \{\s*await tilePlacementService\.clearTilePlacement/.test(screen),
    'the toggle must clear rather than store a default');
});
test('the screen and the grids resolve the overrides for the same role', () => {
  // Two consumers resolving for different roles is how a tile ends up on the
  // home screen and in More Features at once.
  const ctx = read('src/context/AppContext.js');
  assert.ok(/tilePlacementService\.placementFor\(tilePlacement, profile\?\.role\)/.test(ctx),
    'AppContext must resolve the viewer’s own role once');
  // Each consumer must PASS it, not merely mention it. Checking only that the
  // name appears in the file passed on a MoreFeaturesScreen that still
  // destructured it from the context and then ignored it - which is the exact
  // bug this check exists to catch: the home grid filtering on the overrides
  // while More Features does not is a tile on both screens at once.
  for (const f of ['src/components/ServiceGrid.js', 'src/screens/MoreFeaturesScreen.js']) {
    assert.ok(/placement: tilePlacementForMe,/.test(read(f)), f + ' does not pass the overrides on');
  }
  assert.ok(/tileOnHome\(item, tilePlacementForMe, true\)/.test(read('src/screens/AdminFeaturesScreen.js')),
    'AdminFeaturesScreen does not apply the overrides');
  // And each one must take it from the context rather than build its own.
  // Taken from the context, not rebuilt: matching "tilePlacementForMe }" was
  // too literal - it broke the moment a second context field was destructured
  // beside it, which says nothing about the thing being checked.
  for (const f of ['src/components/ServiceGrid.js', 'src/screens/MoreFeaturesScreen.js', 'src/screens/AdminFeaturesScreen.js']) {
    const src = read(f);
    // EVERY destructure, not the first one: ServiceGrid calls useApp() twice,
    // and exec() found the call that does not take it.
    const destructures = [...src.matchAll(/\{([^}]*)\} = useApp\(\)/g)].map((m) => m[1]);
    assert.ok(destructures.length > 0, f + ' does not use the app context at all');
    assert.ok(destructures.some((d) => /\btilePlacementForMe\b/.test(d)),
      f + ' does not take the placement from the context');
    assert.ok(!/placementFor\(/.test(src), f + ' resolves placement its own way');
  }
});

(async () => {
  console.log('\nThe writes themselves');
  for (const [name, fn] of asyncTests) {
    try { await fn(); console.log('  ok   ' + name); passed += 1; }
    catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.message)); failed += 1; }
  }
  console.log(failed ? `\n${failed} check(s) failed.\n` : `\n${passed} checks passed.\n`);
  process.exit(failed ? 1 : 0);
})();
