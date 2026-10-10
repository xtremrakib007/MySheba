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
  'recharge', 'rechargePin', 'internet',
  'billpayment', 'tngewallet', 'jompay',
  'flight', 'bus', 'train',
  'entertainment', 'esim', 'moreFeaturesTile',
];
const customerHome = visibleTiles({ role: 'customer', can: allCaps, homeOnly: true }).map((t) => t.key);
assert.deepStrictEqual(customerHome, EXPECTED_HOME,
  'the customer home must be these twelve, in this order');
assert.strictEqual(customerHome.length, 12, 'the homepage is exactly twelve tiles');
assert.strictEqual(customerHome.length % 3, 0, 'and divide into whole rows of three');

// More Features is the twelfth tile. It is also what visibleTiles appends when
// nothing else flagged it, so it was being drawn twice - once in place, once on
// a row of its own underneath.
assert.strictEqual(customerHome.filter((k) => k === 'moreFeaturesTile').length, 1,
  'More Features appears once, not twice');

// Everything off the home screen is still reachable.
for (const key of ['mobilebanking', 'remittance', 'offerpacks', 'iimmpactCatalog', 'visa', 'fomema', 'mydigital', 'passport']) {
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
assert(/const manage = (?:mergedServices|services)\.filter\(\(t\) => t\.cat === 'manage'\)/.test(grid), 'management is its own block');
assert(/const rest = (?:mergedServices|services)\.filter\(\(t\) => t\.cat !== 'manage'\)/.test(grid), 'and the services are the other');
assert(/blocks\.length > 1 &&/.test(grid), 'a customer has one block, so it needs no heading');
// Three across, so a row of three is a full row. The width lives in theme.js
// now, with the column count and the gap, because the feature grid has to lay
// out to the same shape - see tileGrid.
assert(/item: \{ width: tileGrid\.width, aspectRatio: 1,/.test(grid), 'tiles are square and take the shared width');
assert(/export const tileGrid = \{ columns: 3, gap: \d+, width: '31\.3%' \};/.test(read('src/theme/theme.js')),
  'three across, so a row of three is a full row');
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
  // The declared list, minus whatever this role already has on its home grid.
  // Staff declare Transactions and Support in both places, and showing a
  // feature twice on one screen is worse than showing it once in the wrong
  // half - so the home grid keeps it and the row goes.
  const onHome = new Set(visibleTiles({ role, can: allCaps, homeOnly: true }).map((t) => t.key));
  const expected = ((role === 'customer') ? PERSONAL_FEATURES : STAFF_FEATURES)
    .filter((f) => !onHome.has(f.key));
  assert.deepStrictEqual(account.map((f) => f.key), expected.map((f) => f.key),
    `a ${role} must get the right account list`);
  assert(expected.length, `a ${role} must still have account rows`);

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
  assert(/grid: \{[^}]*justifyContent: 'flex-start', columnGap: (?:\d+|tileGrid\.gap)/.test(src), `${rel} packs left with a fixed gap`);
}


// ---------------------------------------------------------------------------
// One feature, one tile. Staff saw Transactions and Support twice: once on the
// home grid and again as a row at the bottom of All Services, with nothing to
// tell the two apart.
// ---------------------------------------------------------------------------
const EVERY_ROLE = ['customer', 'dealer', 'reseller', 'admin', 'superadmin', 'support', 'finance'];

for (const role of EVERY_ROLE) {
  const home = visibleTiles({ role, can: () => true, homeOnly: true });
  const { sections, account } = moreFeaturesSections({ role, can: () => true });
  // `.tiles`, not `.items`. groupTilesByCategory returns groups keyed `tiles`,
  // so reading `items` here silently checked nothing but home and the account
  // rows - a de-duplication test that skipped the half of the screen where the
  // duplicates actually show up.
  const everywhere = [...home, ...sections.flatMap((s) => s.tiles || []), ...account];
  assert(sections.every((s) => Array.isArray(s.tiles)), 'a section must carry its tiles');
  const counts = {};
  for (const tile of everywhere) counts[tile.key] = (counts[tile.key] || 0) + 1;
  const twice = Object.entries(counts).filter(([, n]) => n > 1).map(([key]) => key);
  assert.deepStrictEqual(twice, [], `a ${role} is shown these tiles twice: ${twice.join(', ')}`);
  assert(home.length, `a ${role} must have a home screen`);
}

// The home grid is the one that keeps it: that is where somebody looks first.
for (const role of ['admin', 'superadmin', 'dealer']) {
  const home = visibleTiles({ role, can: () => true, homeOnly: true }).map((t) => t.key);
  const { account } = moreFeaturesSections({ role, can: () => true });
  assert(home.includes('history'), `${role} must keep Transactions on the home grid`);
  assert(!account.some((r) => r.key === 'history'), `${role} must not also carry it as an account row`);
}

// ...and a tile switched OFF for the home screen keeps its row, or removing a
// duplicate would take the feature away entirely. This is the rule the whole
// screen exists for: on the home screen or here, never nowhere.
{
  const off = new Set(['history', 'support']);
  const isActive = (key) => !off.has(key);
  const home = visibleTiles({ role: 'admin', can: () => true, isActive, homeOnly: true }).map((t) => t.key);
  const { account } = moreFeaturesSections({ role: 'admin', can: () => true, isActive });
  for (const key of off) {
    assert(!home.includes(key), `${key} was switched off and must not be on the home grid`);
    assert(account.some((r) => r.key === key), `${key} is off the home grid and must still be reachable here`);
  }
}

// Customers never had the clash, and must not acquire one.
{
  const { account } = moreFeaturesSections({ role: 'customer', can: () => true });
  for (const key of ['history', 'support', 'myAccount', 'kyc']) {
    assert(account.some((r) => r.key === key), `a customer must still reach ${key} from All Services`);
  }
}

// The overflow is filtered on what was DECLARED, not on what survived the
// de-duplication: dropping a row for being on the home screen must not let its
// twin reappear in the sections above it.
{
  const src = read('src/components/serviceTiles.js');
  const body = src.slice(src.indexOf('export function moreFeaturesSections('));
  assert(/const kinds = new Set\(declared\.map/.test(body), 'the excluded kinds must come from the declared list');
  assert(/const keys = new Set\(declared\.map/.test(body), 'and so must the excluded keys');
}

// The customer header is the logo's colour, not a near-miss of it.
{
  const theme = read('src/theme/theme.js');
  const light = /customer: \{ label: 'Customer',\s*\n\s*light: \{ primary: '(#[0-9A-F]{6})', primaryDark: '(#[0-9A-F]{6})', secondary: '(#[0-9A-F]{6})'/.exec(theme);
  assert(light, 'the customer light palette must be findable');
  const [, primary, primaryDark, secondary] = light;

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const onWhite = (h) => {
    const [r, g, b] = rgb(h).map(lin);
    return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
  };
  const hue = (h) => {
    const [r, g, b] = rgb(h).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    const t = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (t * 60 + 360) % 360;
  };

  // The logo is not one teal: it runs from a green-teal to a blue-teal, and the
  // header is the gradient [secondary, primary, primaryDark]. A gradient of one
  // hue is what read as a different colour beside the mark.
  const sweep = [secondary, primary, primaryDark].map(hue);
  assert(sweep[0] >= 160 && sweep[0] <= 174, `the gradient must start green-teal like the logo, saw ${sweep[0].toFixed(0)}`);
  assert(sweep[2] >= 183 && sweep[2] <= 196, `and end blue-teal like the logo, saw ${sweep[2].toFixed(0)}`);
  assert(sweep[2] - sweep[0] >= 12, 'the gradient must travel, not sit on one hue');

  // The logo's own swatches are 2.0-3.3:1 against white, so they cannot be the
  // header. Every stop still has to carry white text.
  for (const [name, value] of [['secondary', secondary], ['primary', primary], ['primaryDark', primaryDark]]) {
    assert(onWhite(value) >= 4.5, `${name} ${value} is ${onWhite(value).toFixed(2)}:1 against white text`);
  }
}

// Two tiles with different keys going to the SAME place is the duplicate
// nobody can see by comparing keys: "Visa" and "Visa Status Inquiry" are two
// cards and one page. For a WebView that means the same address under two
// keys, so the addresses are what gets compared.
{
  const countries = read('src/data/countries.js');
  const block = /export const webViewPages = \{([\s\S]*?)\n\};/.exec(countries)
    || /const webViewPages = \{([\s\S]*?)\n\};/.exec(countries);
  assert(block, 'the built-in WebView pages must be findable');
  const byUrl = {};
  for (const [, key, url] of block[1].matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*): \{ url: '([^']+)'/gm)) {
    const address = url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    (byUrl[address] = byUrl[address] || []).push(key);
  }
  assert(Object.keys(byUrl).length >= 5, 'expected the built-in pages, saw ' + Object.keys(byUrl).length);
  const shared = Object.entries(byUrl).filter(([, keys]) => keys.length > 1)
    .map(([address, keys]) => `${keys.join(' and ')} both open ${address}`);
  assert.deepStrictEqual(shared, [], 'two built-in pages open one address: ' + shared.join('; '));
}

// A kind that is not a service IS the destination: `documents` and
// `myDocuments` are different keys for one screen, and comparing keys could
// never see it. Checked across everything a superadmin reaches, because the
// landing grid is a third list and the first version of this check only knew
// about two.
{
  // Every role, not just the one that has the most lists: a tile renamed in
  // the customer catalogue is the same confusion for a customer.
  const landing = tiles.adminLandingTiles({}, () => false, {})
    .map((t) => ({ ...t, kind: (t.service && t.service.kind) || t.kind }));
  // The Control Center's own sections, read from the screen that declares
  // them. Every mismatched name this check found was between these and the
  // lists below, so leaving them out would have been checking the easy half.
  const hub = [...read('src/screens/AdminFeaturesScreen.js')
    .matchAll(/\{ key: '([A-Za-z]+)',(?: icon: '[^']*',)?(?: art: '[A-Za-z]+',)? bg: '[^']*', name: '([^']+)' \}/g)]
    .map(([, key, name]) => ({ key, name, kind: 'hub' }));
  assert(hub.length >= 20, 'the Control Center tiles must be findable, saw ' + hub.length);
  const everything = [...landing, ...hub, ...tiles.CUSTOMER_SERVICES];
  for (const role of EVERY_ROLE) {
    const { sections, account } = moreFeaturesSections({ role, can: () => true });
    everything.push(
      ...visibleTiles({ role, can: () => true, homeOnly: true }),
      ...sections.flatMap((s) => s.tiles || []),
      ...account,
    );
  }

  const SCREEN_KINDS = ['documents', 'salary', 'history', 'myaccount', 'kyc', 'profile', 'support'];
  const byScreen = {};
  const namesFor = {};
  for (const tile of everything) {
    // Names are collected for EVERY tile. Collecting them inside the
    // screen-kind filter below meant the check only ever saw seven kinds, and
    // every renamed service - Flight Ticket, Mobile Recharge, Bill Pay - sailed
    // past it.
    if (tile.name) (namesFor[tile.key] = namesFor[tile.key] || new Set()).add(tile.name);
    if (!SCREEN_KINDS.includes(tile.kind)) continue;
    (byScreen[tile.kind] = byScreen[tile.kind] || new Set()).add(tile.key);
  }
  assert(Object.keys(namesFor).length > 25, 'the name check must be seeing the whole catalogue, saw ' + Object.keys(namesFor).length);
  const twice = Object.entries(byScreen).filter(([, keys]) => keys.size > 1)
    .map(([kind, keys]) => `${kind} <- ${[...keys].join(' and ')}`);
  assert.deepStrictEqual(twice, [], 'one screen reached by two tiles: ' + twice.join('; '));

  // One key under two names is the same confusion a step earlier: somebody
  // reads "Flight Ticket" on one grid and "Flight" on another and reasonably
  // expects two different things.
  //
  // Two keys are allowed to differ, and both are deliberate: `topup` is a
  // customer asking for one and a staff member reviewing the queue of them,
  // and `adminFeatures` is named for the role whose hub it opens. Neither is
  // one destination under two labels.
  const NAMED_BY_CONTEXT = new Set(['topup', 'adminFeatures']);
  const renamed = Object.entries(namesFor)
    .filter(([key, names]) => names.size > 1 && !NAMED_BY_CONTEXT.has(key))
    .map(([key, names]) => `${key} is called ${[...names].join(' and ')}`);
  assert.deepStrictEqual(renamed, [], 'one tile under two names: ' + renamed.join('; '));
}

// A custom WebView page at a built-in's address is that built-in again - on
// BOTH lists that build webview tiles. Fixing only the customer one left the
// duplicate standing on the superadmin landing, which is where it was seen.
{
  const url = 'https://eservices.imi.gov.my/myimms/VPAStsInq';
  const pages = {
    visa: { key: 'visa', name: 'Visa Status Inquiry', url, icon: '\uD83D\uDEC2', active: true, home: true, custom: false },
    // Trailing slash and scheme differ, which is how the same page gets added
    // twice without anybody noticing.
    visaAgain: { key: 'visaAgain', name: 'Visa', url: url.replace('https://', 'http://') + '/', icon: '\uD83D\uDEC2', active: true, home: true, custom: true },
    helpdesk: { key: 'helpdesk', name: 'Helpdesk', url: 'https://help.example.test', icon: '\uD83C\uDD98', active: true, home: true, custom: true },
  };
  const customerKeys = tiles.withWebviewConfig(tiles.CUSTOMER_SERVICES, pages)
    .filter((t) => t.kind === 'webview').map((t) => t.key);
  const landingKeys = tiles.adminLandingTiles(pages, () => false, {})
    .filter((t) => t.service && t.service.kind === 'webview').map((t) => t.key);

  for (const [where, keys] of [['the service grid', customerKeys], ['the superadmin landing', landingKeys]]) {
    assert(keys.includes('visa'), `the built-in keeps its place on ${where}`);
    assert(!keys.includes('visaAgain'), `a custom page at the same address must not be a second tile on ${where}`);
    assert(keys.includes('helpdesk'), `a custom page of its own must survive on ${where}`);
  }
}

// A custom WebView page at a built-in's address is that built-in again.
{
  const url = 'https://eservices.imi.gov.my/myimms/VPAStsInq';
  const pages = {
    visa: { key: 'visa', name: 'Visa Status Inquiry', url, icon: '🛂', active: true, home: true, custom: false },
    // Trailing slash and scheme differ, which is how the same page gets added
    // twice without anybody noticing.
    visaAgain: { key: 'visaAgain', name: 'Visa Check', url: url.replace('https://', 'http://') + '/', icon: '🛂', active: true, home: true, custom: true },
    helpdesk: { key: 'helpdesk', name: 'Helpdesk', url: 'https://help.example.test', icon: '🆘', active: true, home: true, custom: true },
  };
  const webviews = tiles.withWebviewConfig(tiles.CUSTOMER_SERVICES, pages).filter((t) => t.kind === 'webview');
  const keys = webviews.map((t) => t.key);
  assert(keys.includes('visa'), 'the built-in keeps its place');
  assert(!keys.includes('visaAgain'), 'a custom page at the same address must not become a second tile');
  assert(keys.includes('helpdesk'), 'a custom page of its own must survive');
}

console.log('\nCategories on the home screen, everything else one tap away.');
