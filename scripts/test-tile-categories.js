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

const { TILE_CATEGORIES, groupTilesByCategory, servicesForRole, visibleTiles, overflowTiles, STAFF_ROLES } = tiles;
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

console.log('The weekly errands are the ones that stayed');
const customerHome = visibleTiles({ role: 'customer', can: allCaps, homeOnly: true }).map((t) => t.key);
for (const key of ['recharge', 'internet', 'billpayment', 'remittance', 'mobilebanking']) {
  assert(customerHome.includes(key), `${key} is a weekly errand and belongs on the home screen`);
}
// Researched, occasional decisions. Nobody opens the app at a bus stop to renew
// a passport, and these four were crowding out the ones people came for.
for (const key of ['passport', 'visa', 'fomema', 'train']) {
  assert(!customerHome.includes(key), `${key} is occasional and belongs under More Services`);
}
assert(customerHome.includes('moreFeaturesTile'), 'and the way to them must be on the home screen');

console.log('The screens render it');
const grid = read('src/components/ServiceGrid.js');
assert(/groupTilesByCategory\(services\.filter/.test(grid), 'the grid groups its tiles');
// More Services is not a category and must come after every section, or it
// sits in the middle of the page as the last tile of whichever group it fell in.
assert(/kind !== 'moreFeaturesLink'/.test(grid), 'More Services is held out of the grouping');
assert(grid.indexOf('moreTile &&') > grid.indexOf('sections.map'), 'and rendered after the sections');
assert(/sections\.length > 1 &&/.test(grid), 'one category needs no heading');

const more = read('src/screens/MoreFeaturesScreen.js');
// The staff branch used to REPLACE the overflow with a fixed list, so a tile
// that left a dealer's home screen had nowhere at all to appear. This is the
// screen-level half of the reachability check above.
assert(/role: profile\?\.role \|\| 'customer'/.test(more), 'overflow must be built for the role viewing it');
assert(/overflowSections\.map/.test(more), 'and rendered in categories');
assert(!/isCustomer \? \([\s\S]{0,200}overflow/.test(more),
  'the overflow must not be behind a customer-only branch');

console.log('\nCategories on the home screen, everything else one tap away.');
