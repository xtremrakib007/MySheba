#!/usr/bin/env node
'use strict';
/**
 * The home screen, in categories, trimmed to what people use.
 *
 * Eighteen tiles in one unbroken block made everything equally prominent, so
 * nothing was, and finding Passport meant reading all eighteen labels. Splitting
 * them by category and keeping only the weekly ones on the first screen is the
 * fix - and the way that fix goes wrong is silent: a tile leaves the home screen
 * and lands in no overflow, so a finished feature simply cannot be opened.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tiles = require('./lib/load-tiles.js');

const { TILE_CATEGORIES, groupTilesByCategory, servicesForRole, visibleTiles, overflowTiles, moreFeaturesSections, PERSONAL_FEATURES, STAFF_FEATURES, STAFF_ROLES } = tiles;
const ROLES = ['customer', ...STAFF_ROLES.filter((r) => r !== 'superadmin')];
const allCaps = () => true;

console.log('Every tile declares a category');
// A tile with no category lands in "Other", which is a heading nobody chose and
// a strong hint the tile was added without deciding where it belongs.
for (const role of ROLES) {
  for (const tile of servicesForRole(role, allCaps)) {
    if (tile.kind === 'moreFeaturesLink') continue;
    assert(tile.cat, `${role}'s "${tile.name}" (${tile.key}) has no category`);
    assert(TILE_CATEGORIES.some((c) => c.key === tile.cat),
      `${role}'s "${tile.name}" has category "${tile.cat}", which is not declared`);
  }
}

console.log('Categories come out in order, empties do not come out at all');
const grouped = groupTilesByCategory([
  { key: 'a', cat: 'personal' }, { key: 'b', cat: 'recharge' },
  { key: 'c', cat: 'manage' }, { key: 'd', cat: 'recharge' },
]);
assert.deepStrictEqual(grouped.map((g) => g.key), ['manage', 'recharge', 'personal'],
  'declared order, not the order tiles happen to appear in');
assert.strictEqual(grouped[1].tiles.length, 2, 'tiles of one category stay together');
assert(!grouped.some((g) => g.tiles.length === 0), 'a category nobody sells gets no heading');
// Dropping it would hide a finished feature; "Other" is ugly but reachable.
const stray = groupTilesByCategory([{ key: 'x', cat: 'nonsense' }, { key: 'y', cat: 'manage' }]);
assert.deepStrictEqual(stray.map((g) => g.key), ['manage', 'other'], 'an unknown category sorts last, not away');
assert.strictEqual(stray[1].tiles[0].key, 'x', 'and keeps its tile');

console.log('Home is shorter than the catalogue, and loses nothing');
for (const role of ROLES) {
  const full = visibleTiles({ role, can: allCaps, homeOnly: false }).map((t) => t.key);
  const home = new Set(visibleTiles({ role, can: allCaps, homeOnly: true }).map((t) => t.key));
  const over = new Set(overflowTiles({ role, can: allCaps }).map((t) => t.key));
  assert(home.size < full.length, `a ${role} home must be trimmed, not the whole catalogue`);
  const lost = full.filter((k) => !home.has(k) && !over.has(k));
  assert.strictEqual(lost.length, 0, `a ${role} cannot reach: ${lost.join(', ')}`);
}

console.log('The home screen is twelve tiles, four rows of three');
// Named and ordered, because the point of a fixed twelve is that there is no
// short row and no gap - and a tile added without thought breaks exactly that.
const EXPECTED_HOME = [
  'recharge', 'internet', 'rechargePin',
  'billpayment', 'mobilebanking', 'remittance',
  'flight', 'bus', 'train',
  'mydigital', 'passport', 'moreFeaturesTile',
];
const customerHome = visibleTiles({ role: 'customer', can: allCaps, homeOnly: true }).map((t) => t.key);
assert.deepStrictEqual(customerHome, EXPECTED_HOME,
  'the customer home must be these twelve, in this order');
assert.strictEqual(customerHome.length % 3, 0, 'and divide into whole rows of three');

// More Features is the twelfth tile. It is also what visibleTiles appends when
// nothing else flagged it, so it was being drawn twice - once in place, once on
// a row of its own underneath.
assert.strictEqual(customerHome.filter((k) => k === 'moreFeaturesTile').length, 1,
  'More Features appears once, not twice');

// Everything off the home screen is still reachable.
for (const key of ['offerpacks', 'entertainment', 'visa', 'fomema']) {
  assert(!customerHome.includes(key), `${key} belongs under More Features`);
}

// Staff carry management tiles on top; what is left must still be the twelve,
// so their service block is four whole rows as well.
for (const role of ['dealer', 'support', 'finance']) {
  const home = visibleTiles({ role, can: allCaps, homeOnly: true });
  const services = home.filter((t) => t.cat !== 'manage').map((t) => t.key);
  assert.deepStrictEqual(services, EXPECTED_HOME, `a ${role}'s service block is the same twelve`);
}

console.log('The screens render it');
const grid = read('src/components/ServiceGrid.js');
const more = read('src/screens/MoreFeaturesScreen.js');
// The home screen is one block of services, not a heading per category: that
// was what produced a TRAVEL section of one tile beside three empty columns.
// Management is split off because a dealer's tools are a different kind of
// thing from the services they also sell - and splitting it leaves exactly the
// twelve behind.
assert(/const manage = services\.filter\(\(t\) => t\.cat === 'manage'\)/.test(grid), 'management is its own block');
assert(/const rest = services\.filter\(\(t\) => t\.cat !== 'manage'\)/.test(grid), 'and the services are the other');
assert(/blocks\.length > 1 &&/.test(grid), 'a customer has one block, so it needs no heading');
// Three across, so a row of three is a full row.
assert(/item: \{ width: '31\.3%'/.test(grid), 'tiles are three across');
assert(!/moreRow:/.test(grid), 'More Features is a tile in the grid, not a row below it');


// The staff branch used to REPLACE the overflow with a fixed list, so a tile
// that left a dealer's home screen had nowhere at all to appear. This is the
// screen-level half of the reachability check above.
assert(/const role = profile\?\.role \|\| 'customer';/.test(more) && /moreFeaturesSections\(\{\s*\n\s*role,/.test(more),
  'overflow must be built for the role viewing it');
assert(/\{sections\.map\(\(section\) =>/.test(more), 'and rendered in categories');
assert(!/isCustomer \? \([\s\S]{0,200}overflow/.test(more),
  'the overflow must not be behind a customer-only branch');

console.log('Nothing is drawn twice, and nothing is dropped');
// What the screenshot showed: Profile under "My Account" AND under "Account &
// Operations", two headings apart on one screen. The overflow is derived from
// the role's catalogue and the account rows are a curated list; the set keeping
// them apart was built from the CUSTOMER list, so on staff - whose rows use
// kind `profile` rather than `kyc` - it matched nothing.
//
// Run through the screen's own function, not a copy of its logic. An earlier
// version of this check filtered the tiles itself and so asserted only that the
// test could de-duplicate, which nobody doubted.
for (const role of ROLES) {
  const { sections, account } = moreFeaturesSections({ role, can: allCaps });
  const expected = (role === 'customer') ? PERSONAL_FEATURES : STAFF_FEATURES;
  assert.deepStrictEqual(account.map((f) => f.key), expected.map((f) => f.key),
    `a ${role} must get the right account list`);

  const accountKinds = new Set(account.map((f) => f.kind));
  const accountKeys = new Set(account.map((f) => f.key));
  const shown = sections.flatMap((g) => g.tiles);

  // Exclusion is by kind AND by key AND by category, and the three overlap: for
  // today's lists, removing any one still leaves no duplicate, so no single
  // mutation of them fails this. That is defence in depth rather than an untested
  // guard - removing two does fail - and the invariant worth holding is this one:
  // nothing reaches the screen twice, however it is spelled.
  const clash = shown.filter((t) => accountKinds.has(t.kind) || accountKeys.has(t.key));
  assert.strictEqual(clash.length, 0, `${role} sees twice: ${clash.map((t) => t.name).join(', ')}`);

  const keys = shown.map((t) => t.key);
  assert.strictEqual(new Set(keys).size, keys.length, `${role} has a repeated overflow tile`);

  // Holding the personal category back must not strand anything: whatever it
  // held has to be covered by the account rows, by kind or by key.
  const home = new Set(visibleTiles({ role, can: allCaps, homeOnly: true }).map((t) => t.key));
  const reachable = new Set([...home, ...keys, ...accountKeys]);
  const stranded = visibleTiles({ role, can: allCaps, homeOnly: false })
    .filter((t) => !reachable.has(t.key) && !accountKinds.has(t.kind));
  assert.strictEqual(stranded.length, 0, `${role} cannot reach: ${stranded.map((t) => t.name).join(', ')}`);
}

// A staff member and a customer must not be handed the same rows: that swap is
// precisely what produced the duplicate.
assert.notDeepStrictEqual(moreFeaturesSections({ role: 'dealer', can: allCaps }).account.map((f) => f.key),
  moreFeaturesSections({ role: 'customer', can: allCaps }).account.map((f) => f.key),
  'staff and customer account rows are different lists');

// The screen must call it rather than keeping its own copy.
assert(/moreFeaturesSections\(\{/.test(more), 'MoreFeaturesScreen must use the shared builder');
assert(!/overflowTiles\(/.test(more), 'and must not filter the overflow itself');
assert(!/const (PERSONAL|STAFF)_FEATURES = \[/.test(more), 'nor keep its own account lists');

console.log('A stored WebView page cannot force a tile onto the home screen');
// What the screenshot showed: TRAVEL with only Train, and a full VISA &
// IMMIGRATION section, on a home screen both categories are declared off. Every
// leaked tile was a WebView; Bus and Flight, which are not, correctly stayed
// off. webviewConfigService normalises every page it writes to
// `home: page?.home !== false`, so the stored value is ALWAYS true and never
// undefined - and reading it as authoritative let it override the list.
//
// A superadmin may take a built-in OFF the home screen. They may not put one on.
const storedPages = {};
for (const key of ['train', 'visa', 'fomema', 'mydigital', 'passport']) {
  storedPages[key] = { key, name: key, url: 'https://example.test', active: true, home: true };
}
const withPages = visibleTiles({ role: 'customer', can: allCaps, webviewPages: storedPages, homeOnly: true }).map((t) => t.key);
// Declared off the home screen. A stored page saying home:true must not put
// them back - that is what filled TRAVEL and VISA & IMMIGRATION with tiles the
// list had already moved to More Features.
for (const key of ['visa', 'fomema']) {
  assert(!withPages.includes(key), `${key} is declared off the home screen; a stored page must not put it back`);
}
// Declared on, and a stored page must not knock them off either.
for (const key of ['train', 'mydigital', 'passport']) {
  assert(withPages.includes(key), `${key} is one of the twelve and must stay`);
}
// The control that does exist still works: taking a built-in off home removes it.
const movedOff = { train: { key: 'train', name: 'Train Ticket', url: 'x', active: true, home: false } };
assert(!visibleTiles({ role: 'customer', can: allCaps, webviewPages: movedOff, homeOnly: true }).some((t) => t.key === 'train'),
  'a superadmin can still move a built-in off the home screen');
// A custom page carries no declared flag, so its own setting is all there is.
const custom = { wv_x: { key: 'wv_x', custom: true, name: 'Custom', url: 'x', active: true, home: true } };
assert(visibleTiles({ role: 'customer', can: allCaps, webviewPages: custom, homeOnly: true }).some((t) => t.key === 'wv_x'),
  'a superadmin\u2019s own added page may be on the home screen');

console.log('Partial rows pack left instead of spreading');
// `space-between` put a two-tile category's tiles against opposite margins with
// a canyon between them, which read as a layout failure rather than a short row.
for (const [rel, src] of [['src/components/ServiceGrid.js', grid], ['src/screens/MoreFeaturesScreen.js', more]]) {
  assert(!/grid: \{[^}]*space-between/.test(src), `${rel} must not spread a partial row`);
  assert(/grid: \{[^}]*justifyContent: 'flex-start', columnGap: \d+/.test(src), `${rel} packs left with a fixed gap`);
}

console.log('\nCategories on the home screen, everything else one tap away.');
