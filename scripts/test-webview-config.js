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

async function rejects(name, promise) {
  try { await promise; check(name, 'resolved', 'rejected'); } catch (e) { check(name, true, true); }
}
async function resolves(name, promise) {
  try { await promise; check(name, true, true); } catch (e) { check(name, String(e.message), 'no error'); }
}

console.log('\nEverything that shows a WebView reads the same source');
const grid = read('src/components/ServiceGrid.js');
const screen = read('src/screens/WebViewScreen.js');
const ctx = read('src/context/AppContext.js');
yes('the context subscribes once', /subscribeWebviewConfig\(/.test(ctx) && /^ {4}webviewPages,$/m.test(ctx));
yes('the grid overlays name and icon', /withWebviewConfig/.test(grid));
yes('and appends the added ones', /\.filter\(\(p\) => p\.custom && p\.active !== false\)/.test(grid));
yes('a page switched off leaves the grid', /pages\[item\.key\]\.active !== false/.test(grid));
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
