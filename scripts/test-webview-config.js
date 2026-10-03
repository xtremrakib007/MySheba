#!/usr/bin/env node
'use strict';

/**
 * Superadmin control over the WebView tiles.
 *
 * The URL, title and icon of every WebView service were literals in
 * src/data/countries.js. A government portal moving its status-check page, or
 * a partner site worth a tile, meant a code change, a store build and a review
 * for the sake of a string.
 *
 * settings/webviews now holds overrides for the built-ins and whatever a
 * superadmin adds, and the built-ins stay in code as the defaults - so the
 * grid is correct before the first snapshot and on a project with no document
 * at all. A built-in can be edited and switched off; it cannot be deleted,
 * because its tile, its pricing and in some cases its charge-on-click
 * behaviour are wired in code and the override is only its settings.
 *
 * A WebView renders a site inside the app with the app's own context, so the
 * address is not merely data. Only https, and the host has to look real.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function run(relPath, requireShim) {
  const code = esbuild.transformSync(read(relPath), { loader: 'js', format: 'cjs' }).code;
  const box = { module: { exports: {} }, exports: {}, require: requireShim, URL, console };
  box.module.exports = box.exports;
  vm.createContext(box);
  vm.runInContext(code, box);
  return box.module.exports;
}

const countries = run('src/data/countries.js', (id) => { throw new Error(id); });
const svc = run('src/firebase/webviewConfigService.js', (id) => {
  if (id === 'firebase/firestore') {
    return { doc: () => ({}), getDoc: async () => ({}), setDoc: async () => {}, onSnapshot: () => () => {}, serverTimestamp: () => ({}), deleteField: () => ({}) };
  }
  if (id === './config') return { db: {} };
  if (id === '../data/countries') return countries;
  throw new Error(`unexpected require: ${id}`);
});

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
const yes = (name, condition) => check(name, Boolean(condition), true);
const throws = (name, fn) => { try { fn(); check(name, 'no error', 'an error'); } catch (e) { check(name, true, true); } };

console.log('\nThe app works with no document at all');
const base = svc.mergePages(null);
yes('every built-in page is there', svc.BUILT_IN_KEYS.every((k) => base[k] && base[k].url));
check('and none of them is marked custom', Object.values(base).some((p) => p.custom), false);
check('fomema still points where the code says',
  base.fomema.url, countries.webViewPages.fomema.url);

console.log('\nAn override replaces only what it sets');
const doc = { pages: { fomema: { name: 'FOMEMA Check', url: 'https://example.gov.my/f', icon: '🏥', active: true } } };
check('the url follows the override', svc.mergePages(doc).fomema.url, 'https://example.gov.my/f');
check('and the page stays built in', svc.mergePages(doc).fomema.custom, false);
check('untouched pages keep their defaults',
  svc.mergePages(doc).passport.url, countries.webViewPages.passport.url);

console.log('\nA superadmin can add pages, within bounds');
yes('a generated key is a custom key', svc.isCustomKey(svc.newCustomKey()));
yes('a built-in key is not', !svc.isCustomKey('fomema'));
const added = svc.mergePages({ pages: { wv_abcd1234: { name: 'EPF', url: 'https://epf.gov.my/x', icon: '🏦' } } });
yes('it appears alongside the built-ins', added.wv_abcd1234 && added.wv_abcd1234.custom === true);
// A key that is neither built-in nor wv_ could shadow a future built-in.
check('a key of neither shape is ignored',
  svc.mergePages({ pages: { recharge: { name: 'x', url: 'https://a.b/c' } } }).recharge, undefined);

console.log('\nThe address is checked, because it opens inside the app');
yes('https is accepted', svc.validatePage({ name: 'Ab', url: 'https://a.example.com/x' }).url);
throws('http is not', () => svc.validatePage({ name: 'Ab', url: 'http://a.example.com' }));
throws('javascript: is not', () => svc.validatePage({ name: 'Ab', url: 'javascript:alert(1)' }));
throws('data: is not', () => svc.validatePage({ name: 'Ab', url: 'data:text/html,<b>x' }));
throws('file: is not', () => svc.validatePage({ name: 'Ab', url: 'file:///etc/passwd' }));
throws('a hostname with no dot is not', () => svc.validatePage({ name: 'Ab', url: 'https://localhost/x' }));
throws('and neither is a nameless tile', () => svc.validatePage({ name: '', url: 'https://a.example.com' }));
check('the header title falls back to the name',
  svc.validatePage({ name: 'EPF', url: 'https://a.example.com' }).title, 'EPF');

console.log('\nStored rubbish does not reach a home screen');
check('a page that no longer validates is dropped',
  svc._test.sanitizePages({ wv_abcd1234: { name: 'x', url: 'http://nope' } }), {});
check('and a non-object is harmless', svc._test.sanitizePages('nonsense'), {});

console.log('\nEvery role actually gets the WebViews - computed, not read');
// serviceTiles.js is plain data and a filter, so this runs the real selection
// rather than grepping the render. Twice now a role has been reported as
// covered on the strength of reading one line; this computes the answer.
const tiles = run('src/components/serviceTiles.js', (id) => { throw new Error(id); });
const CUSTOM = { wv_abcd1234: { key: 'wv_abcd1234', name: 'EPF', url: 'https://epf.gov.my/x', icon: '🏦', active: true, home: true, custom: true } };
const allCaps = () => true;

for (const role of ['customer', 'dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin']) {
  const list = tiles.withWebviewConfig(tiles.servicesForRole(role, allCaps), CUSTOM);
  const webviews = list.filter((t) => t.kind === 'webview').map((t) => t.key);
  yes(`${role} gets the built-in WebViews`, svc.BUILT_IN_KEYS.filter((k) => webviews.includes(k)).length >= 4);
  yes(`${role} gets an added one`, webviews.includes('wv_abcd1234'));
}

// A capability-gated role must not lose them: support and finance see only the
// management tiles their capabilities own, and the shared services regardless.
const noCaps = () => false;
yes('support keeps them with no capabilities at all',
  tiles.withWebviewConfig(tiles.servicesForRole('support', noCaps), CUSTOM)
    .some((t) => t.key === 'wv_abcd1234'));

// And switching one off has to reach every role, not just the customer grid.
const OFF = { fomema: { key: 'fomema', name: 'FOMEMA', url: 'https://a.example.com/f', icon: '🏥', active: false, home: true, custom: false } };
for (const role of ['customer', 'reseller', 'support', 'superadmin']) {
  yes(`${role} loses a page that was switched off`,
    !tiles.withWebviewConfig(tiles.servicesForRole(role, allCaps), OFF).some((t) => t.key === 'fomema'));
}

console.log('\nEvery role gets every customer service, once');
// Two ways a role lost a service, both invisible on the screen: the staff
// lists ended with the shared catalogue AND servicesForRole appended it, so
// everything was drawn twice with duplicate keys; and admin/superadmin do not
// render ServiceGrid at all - App.js gives them AdminFeaturesScreen - so a
// service missing from ADMIN_HOME was simply unreachable for them.
const customerKeys = tiles.CUSTOMER_SERVICES.map((t) => t.key);
for (const role of ['customer', 'dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin']) {
  const list = tiles.servicesForRole(role, allCaps);
  const keys = list.map((t) => t.key);
  const missing = customerKeys.filter((k) => !keys.includes(k));
  const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  yes(`${role} gets every customer service`, missing.length === 0);
  yes(`${role} gets each of them once`, dupes.length === 0);
}

// The landing grid admin and superadmin actually open.
const adminKeys = tiles.ADMIN_HOME.map((t) => t.key);
yes('the admin landing grid carries every customer service',
  customerKeys.every((k) => adminKeys.includes(k)));
yes('and each of its tiles goes somewhere',
  tiles.ADMIN_HOME.every((t) => t.section || t.screen || t.service));

console.log('\nA refused write is never silent');
// The switch is driven by the stored page, so a refused write left it where it
// was and the screen read as a dead button. Firestore's own wording for a
// rules refusal - "Missing or insufficient permissions" - does not say what to
// do about it either, and until deploy:rules exists nothing in this repo did.
const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
yes('a rules refusal names the remedy', /deploy:rules/.test(svc._test.describeWriteError(denied)));
yes('and so does one recognised by message alone',
  /deploy:rules/.test(svc._test.describeWriteError(new Error('Missing or insufficient permissions.'))));
yes('any other failure keeps its own message',
  svc._test.describeWriteError(new Error('Network request failed')) === 'Network request failed');
yes('and a failure with no message still says something',
  svc._test.describeWriteError(undefined).length > 0);

const screenSrc = read('src/screens/WebviewManagementScreen.js');
yes('the row shows which toggle is in flight', /savingKey === page\.key/.test(screenSrc));
yes('and releases it whatever happens', /finally \{\s*setSavingKey\(''\);/.test(screenSrc));
yes('a failed toggle always reports', /showAlert\('WebView Pages'/.test(screenSrc));

console.log('\nAnd they survive to the end of the chain, on every home screen');
// The Grid Management gate and the home-screen split were the last steps no
// test could run, and they are the ones that decide whether an added tile is
// on the screen. StaffHomeScreen renders <ServiceGrid /> with no props, the
// customer home passes homeOnly, and dealer/reseller pass neither - so all
// three shapes are run here.
const allActive = () => true;
const render = (role, homeOnly) => tiles.visibleTiles({ role, can: allCaps, webviewPages: CUSTOM, isActive: allActive, homeOnly })
  .map((t) => t.key);

yes('support sees it on the staff home grid', render('support', false).includes('wv_abcd1234'));
yes('finance too', render('finance', false).includes('wv_abcd1234'));
yes('dealer and reseller too',
  render('dealer', false).includes('wv_abcd1234') && render('reseller', false).includes('wv_abcd1234'));
yes('and the customer home screen, which filters to home tiles',
  render('customer', true).includes('wv_abcd1234'));

// A staff grid shows everything. The old guard for that was "fall back when
// nothing is flagged", which an added WebView broke: it carries a home flag,
// so one flagged tile in a staff list collapsed the grid to just that tile.
yes('a staff grid is never cut down to the home set', render('support', true).length > 5);
yes('even with an added page flagged for home',
  render('support', true).includes('wv_abcd1234') && render('support', true).length === render('support', false).length);

// Grid Management can switch a built-in off; a wv_ key is not one of its tiles,
// so the only switch for an added page is the one in WebView Pages.
const off = (key) => (k) => k !== key;
yes('Grid Management still hides a built-in',
  !tiles.visibleTiles({ role: 'customer', can: allCaps, webviewPages: CUSTOM, isActive: off('fomema') })
    .some((t) => t.key === 'fomema'));
yes('and an added page is governed by its own switch',
  tiles.visibleTiles({ role: 'customer', can: allCaps, webviewPages: CUSTOM, isActive: off('fomema') })
    .some((t) => t.key === 'wv_abcd1234'));

console.log('\nAdmin and superadmin land on a different grid, and it is covered');
// App.js renders AdminFeaturesScreen - not ServiceGrid - for admin and
// superadmin when they are not inside a section, so servicesForRole() proves
// nothing about the screen they actually open the app on. This runs that
// list's real builder.
const hasArt = (name) => ['visa', 'passport', 'fomema', 'train', 'bus'].includes(name);
const landing = tiles.adminLandingTiles(CUSTOM, hasArt);
const landingWebviews = landing.filter((t) => t.service && t.service.kind === 'webview').map((t) => t.key);
yes('the built-in WebView tiles are still there', landingWebviews.filter((k) => svc.BUILT_IN_KEYS.includes(k)).length >= 3);
yes('an added page appears on it', landingWebviews.includes('wv_abcd1234'));
yes('and it routes to the WebView, not nowhere',
  landing.find((t) => t.key === 'wv_abcd1234').service.key === 'wv_abcd1234');

// Same switch-off behaviour as every other grid.
yes('a page switched off leaves this grid too',
  !tiles.adminLandingTiles(OFF, hasArt).some((t) => t.key === 'fomema'));

// FeatureGrid draws by key; a wv_ key names no drawing, so a chosen art icon
// has to arrive as `art` or the tile prints the word "visa".
const artTile = tiles.adminLandingTiles(
  { wv_art1234: { key: 'wv_art1234', name: 'Visa Check', url: 'https://a.example.com/v', icon: 'visa', active: true, home: true, custom: true } },
  hasArt,
).find((t) => t.key === 'wv_art1234');
check('an art icon travels as art, not as the label', artTile.art, 'visa');
check('and an emoji icon stays an emoji',
  landing.find((t) => t.key === 'wv_abcd1234').icon, '\uD83C\uDFE6');

console.log('\nStaff see the same WebViews as customers');
const admin = read('src/screens/AdminFeaturesScreen.js');
const gridSrc = read('src/components/ServiceGrid.js');
const featureGrid = read('src/components/FeatureGrid.js');
yes('the admin landing uses the shared builder', /adminLandingTiles\(webviewPages, hasServiceArt\)/.test(admin));
// Looking the tapped key up in the static list made an added tile inert.
yes('a tapped tile is looked up in the live list', /adminHomeList\.find\(\(x\) => x\.key === key\)/.test(admin));
yes('FeatureGrid can draw a tile whose key names no art', /hasServiceArt\(it\.art \|\| it\.key\)/.test(featureGrid));
// Dealers and resellers take SHARED_SERVICES through ServiceGrid, which
// already runs the overlay - this is the line that keeps that true.
yes('one line carries them to every staff role',
  /return \[\.\.\.roleSpecific, \.\.\.SHARED_SERVICES\];/.test(read('src/components/serviceTiles.js')));

async function rejects(name, promise) {
  try { await promise; check(name, 'resolved', 'rejected'); } catch (e) { check(name, true, true); }
}
async function resolves(name, promise) {
  try { await promise; check(name, true, true); } catch (e) { check(name, String(e.message), 'no error'); }
}

console.log('\nAn added page lands on the home grid, not two taps away');
// A tile nobody flagged for home only renders in the non-homeOnly grid, and
// the customer home screen passes homeOnly - so defaulting this off would have
// made every added WebView look like it had failed to appear.
check('a new page is on the home screen by default',
  svc.validatePage({ name: 'EPF', url: 'https://epf.gov.my/x' }).home, true);
check('and can be moved off it deliberately',
  svc.validatePage({ name: 'EPF', url: 'https://epf.gov.my/x', home: false }).home, false);
check('built-ins are on the home screen as before', base.fomema.home, true);

console.log('\nEverything that shows a WebView reads the same source');
const grid = read('src/components/ServiceGrid.js');
const screen = read('src/screens/WebViewScreen.js');
const ctx = read('src/context/AppContext.js');
yes('the context subscribes once', /subscribeWebviewConfig\(/.test(ctx) && /^ {4}webviewPages,$/m.test(ctx));
// The behaviour itself is computed above; this is the wiring, which a
// computed test cannot see: the grid must use the shared helpers rather than
// keep a second copy that drifts.
yes('the grid builds its list from the shared helper', /visibleTiles\(\{/.test(grid));
yes('and keeps no copy of its own', !/const withWebviewConfig = \(list\)/.test(grid));
// MoreFeaturesScreen's own rule: on the home screen or here, never nowhere.
// Computed, because the list is now derived rather than hand-assembled - and
// that derivation is what makes a built-in moved off home still reachable,
// which the hand-assembled version did not do.
const more = read('src/screens/MoreFeaturesScreen.js');
yes('it derives its overflow from the same pipeline', /overflowTiles\(\{/.test(more));
const OFF_HOME = { fomema: { key: 'fomema', name: 'FOMEMA', url: 'https://a.example.com/f', icon: '🏥', active: true, home: false, custom: false } };
yes('a built-in moved off home lands in More Services',
  tiles.overflowTiles({ webviewPages: OFF_HOME }).some((t) => t.key === 'fomema'));
yes('and leaves the customer home grid',
  !tiles.visibleTiles({ role: 'customer', can: allCaps, webviewPages: OFF_HOME, homeOnly: true }).some((t) => t.key === 'fomema'));
yes('an added page kept off home is there too',
  tiles.overflowTiles({ webviewPages: { wv_off12345: { key: 'wv_off12345', name: 'EPF', url: 'https://a.example.com/e', icon: '🏦', active: true, home: false, custom: true } } })
    .some((t) => t.key === 'wv_off12345'));
yes('a page switched off is in neither',
  !tiles.overflowTiles({ webviewPages: OFF }).some((t) => t.key === 'fomema'));
yes('the WebView screen prefers the live page', /webviewPages && webviewPages\[webViewKey\]/.test(screen));
yes('but still falls back to the built-in', /webViewPages\[webViewKey\] \|\| webViewPages\.fomema/.test(screen));
yes('and only a superadmin may write the document',
  /match \/settings\/webviews \{[^}]*isSuperadmin\(\)/.test(read('firestore.rules')));

(async () => {
  console.log('\nA built-in cannot be deleted, only switched off');
  await resolves('a custom page can be deleted', svc.deleteWebviewPage('wv_abcd1234'));
  await rejects('deleting a built-in is refused', svc.deleteWebviewPage('fomema'));
  await rejects('and saving an unknown key is too', svc.saveWebviewPage('nope', { name: 'Ab', url: 'https://a.example.com' }));

  console.log('');
  if (failed) { console.error(`${failed} check(s) failed.`); process.exit(1); }
  console.log('WebView tiles are editable, addable, and still safe to open.');
})();
