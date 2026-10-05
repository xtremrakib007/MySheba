#!/usr/bin/env node
'use strict';
/**
 * The ad strip above the bottom nav, and a tapped ad staying in the app.
 *
 * Two things, and the second is the one with teeth.
 *
 * The SLOT is layout: a band above the bottom nav that collapses to nothing
 * when no ad is booked, so it costs no screen space until there is something
 * to put in it.
 *
 * The CLICK is security. An ad's destination is typed into the advertiser
 * console and stored in Firestore, so by the time the app has it, it is a
 * string chosen by whoever can write an ad document - and it was being handed
 * straight to a WebView's loader. javascript:, data: and file: all do
 * something there, and none of them is "open a web page". So the scheme is
 * checked once, in one place, and these checks are mostly about that place
 * being impossible to go around.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); passed += 1; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.message)); failed += 1; }
}

// utils/externalLink.js as a plain module - it is ESM with nothing in it but
// the rule, so stripping the export keywords is enough to RUN it. Which is
// the point: a scheme check that is pattern-matched instead of executed can
// read perfectly and still let javascript: through.
function loadLink() {
  const src = read('src/utils/externalLink.js').replace(/^export (const|function) /gm, '$1 ');
  const box = { module: { exports: {} } };
  vm.createContext(box);
  vm.runInContext(`${src}
module.exports = { safeExternalUrl, opensInApp, linkTitle, AD_HOC_WEBVIEW_KEY };`, box);
  return box.module.exports;
}
const link = loadLink();

// data/countries.js has no imports, so it runs as-is once the export keywords
// are stripped. The charged-webview lists are derived from each other, so the
// only honest way to ask "is the ad key in any of them" is to build them.
function loadWebviewLists() {
  const src = read('src/data/countries.js').replace(/^export (const|function) /gm, '$1 ');
  const box = { module: { exports: {} } };
  vm.createContext(box);
  vm.runInContext(`${src}
module.exports = { SUBMIT_CHARGED_WEBVIEWS, ACCESS_CLICK_WEBVIEWS, PAYMENT_CHARGED_WEBVIEWS, BUS_TICKET_WEBVIEW_KEYS, webViewPages };`, box);
  return box.module.exports;
}

console.log('\nA scheme that is not the web never reaches a WebView');
const BLOCKED = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'jAvAsCrIpT:alert(1)',
  'data:text/html,<script>fetch("/steal")</script>',
  'file:///etc/passwd',
  'file://localhost/data/data/com.mysheba/databases',
  'content://com.android.providers/media',
  'intent://scan/#Intent;scheme=zxing;end',
  'market://details?id=com.other.app',
  'tel:+60123456789',
  'sms:+60123456789',
  'mailto:a@b.com',
  'about:blank',
  'blob:https://example.com/x',
  'ws://example.com',
  'ftp://example.com/x',
];
for (const bad of BLOCKED) {
  test(`refuses ${bad.slice(0, 34)}`, () => {
    assert.strictEqual(link.safeExternalUrl(bad), '', bad + ' was allowed through');
    assert.strictEqual(link.opensInApp(bad), false);
  });
}
test('refuses a protocol-relative or path-only reference', () => {
  for (const bad of ['//evil.example.com', '/admin', './x', '../x']) {
    assert.strictEqual(link.safeExternalUrl(bad), '', bad + ' was allowed through');
  }
});
test('refuses whitespace and control characters smuggled into a URL', () => {
  // "java\nscript:" and friends: a loader that strips whitespace sees a
  // scheme this check never did.
  for (const bad of ['java\nscript:alert(1)', 'java\tscript:alert(1)', 'https://e\u0000.com', 'https:// example.com']) {
    assert.strictEqual(link.safeExternalUrl(bad), '', JSON.stringify(bad) + ' was allowed through');
  }
});
test('refuses nothing at all', () => {
  for (const bad of ['', '   ', null, undefined, 'https://', 'http://', 'notaurl']) {
    assert.strictEqual(link.safeExternalUrl(bad), '');
  }
});

console.log('\n...and a real web address still opens');
test('http and https pass through unchanged', () => {
  assert.strictEqual(link.safeExternalUrl('https://example.com/a?b=1#c'), 'https://example.com/a?b=1#c');
  assert.strictEqual(link.safeExternalUrl('http://example.com'), 'http://example.com');
});
test('a bare domain is read as https', () => {
  // How somebody types a domain into a form. Refusing it would mean ads that
  // silently do nothing, which is reported as "the banner is broken".
  assert.strictEqual(link.safeExternalUrl('example.com'), 'https://example.com');
  assert.strictEqual(link.safeExternalUrl('www.example.com/x'), 'https://www.example.com/x');
});
test('the scheme is matched without regard to case', () => {
  // Both directions, because only one of them is obvious. Rejecting
  // JAVASCRIPT: is what the fold is for; accepting HTTPS:// is what breaks if
  // the fold is removed, and an advertiser who typed their URL in caps would
  // have had an ad that silently did nothing.
  assert.strictEqual(link.safeExternalUrl('HTTPS://example.com/a'), 'HTTPS://example.com/a');
  assert.strictEqual(link.safeExternalUrl('HtTp://example.com'), 'HtTp://example.com');
  assert.strictEqual(link.safeExternalUrl('JAVASCRIPT:alert(1)'), '');
});
test('surrounding whitespace is trimmed, not rejected', () => {
  assert.strictEqual(link.safeExternalUrl('  https://example.com  '), 'https://example.com');
});
test('the header names the site, not the app', () => {
  assert.strictEqual(link.linkTitle('https://www.shop.example.com/x'), 'shop.example.com');
  assert.strictEqual(link.linkTitle('javascript:x'), 'Sponsored');
});

console.log('\nA tapped ad opens in the app, not in the browser');
const smartAd = read('src/components/SmartAd.js');
test('the URL action goes through the in-app opener first', () => {
  assert.ok(/if \(openExternalUrl && openExternalUrl\(clickAction\.value\)\) return;/.test(smartAd),
    'SmartAd must try the in-app WebView before anything else');
});
test('the opener is actually wired from the context to the handler', () => {
  // Every link in the chain, because any one of them missing leaves the
  // handler with an undefined opener and falls back to the browser silently.
  assert.ok(/openExternalUrl \} = useApp\(\)/.test(smartAd), 'SmartAd must take it from the context');
  assert.ok(/openExternalUrl=\{openExternalUrl\}/.test(smartAd), 'and pass it to the rotator');
  assert.ok(/function AdRotator\(\{[^}]*openExternalUrl[^}]*\}\)/.test(smartAd), 'which must accept it');
  assert.ok(/performClickAction\(ad\.clickAction, openExternalUrl\)/.test(smartAd), 'and hand it to the action');
  assert.ok(/function performClickAction\(clickAction, openExternalUrl\)/.test(smartAd), 'which must accept it');
});
test('the browser fallback is still scheme-checked', () => {
  // The fallback is reached when the in-app opener declines - which is
  // exactly the case where the URL was rejected, so handing the same string
  // to Linking.openURL would undo the whole check.
  assert.ok(/if \(!opensInApp\(clickAction\.value\)\) return;\s*\n\s*Linking\.openURL/.test(smartAd),
    'Linking.openURL must not be reachable with a URL the check refused');
});
test('the context checks the URL before it reaches a WebView', () => {
  const ctx = read('src/context/AppContext.js');
  assert.ok(/const openExternalUrl = useCallback\(\(url, title\) => \{\s*\n\s*const safe = safeExternalUrl\(url\);\s*\n\s*if \(!safe\) return false;/.test(ctx),
    'openExternalUrl must reject before setting any state');
  assert.ok(/setWebViewAdHoc\(\{ url: safe/.test(ctx), 'and must store the CHECKED url, not the raw one');
});
test('an ad runs under a key that no charged flow knows', () => {
  // Every charge and trigger on the WebView screen is keyed off webViewKey.
  // A key in none of those lists turns all of it off by construction.
  const key = link.AD_HOC_WEBVIEW_KEY;
  // RUN countries.js rather than pattern-match it: PAYMENT_CHARGED_WEBVIEWS
  // is built from another list and BUS_TICKET_WEBVIEW_KEYS is derived from the
  // partner records, so neither is a literal a regex could read.
  const lists = loadWebviewLists();
  for (const name of ['SUBMIT_CHARGED_WEBVIEWS', 'ACCESS_CLICK_WEBVIEWS', 'PAYMENT_CHARGED_WEBVIEWS', 'BUS_TICKET_WEBVIEW_KEYS']) {
    assert.ok(Array.isArray(lists[name]) && lists[name].length > 0, 'could not read ' + name);
    assert.ok(!lists[name].includes(key), `${key} is in ${name}, so an ad would be charged for`);
  }
  // And it is not a configured page either, or it would open one.
  assert.ok(!Object.keys(lists.webViewPages).includes(key), key + ' is a configured page key');
  assert.ok(!new RegExp(`pointCosts[^\\n]*${key}`).test(read('src/context/AppContext.js')),
    key + ' has a point cost');
});
test('the WebView screen prefers the ad page over the configured ones', () => {
  // Without this the lookup ends in `|| webViewPages.fomema`, so a tapped ad
  // opened the FOMEMA status page.
  const screen = read('src/screens/WebViewScreen.js');
  assert.ok(/const page = webViewAdHoc\s*\n\s*\|\| \(webviewPages/.test(screen),
    'the ad-hoc page must win the lookup');
});
test('an ad page is held to plain web navigation', () => {
  const screen = read('src/screens/WebViewScreen.js');
  assert.ok(/if \(isAdHocPage\) return url\.startsWith\('http:\/\/'\) \|\| url\.startsWith\('https:\/\/'\);/.test(screen),
    'a third-party ad site could navigate to a non-web scheme');
  // ...and the check has to run BEFORE the bus-partner early return, or it
  // never runs for an ad at all.
  const guard = /const handleShouldStartLoad = \(request\) => \{([\s\S]*?)\n  \};/.exec(screen);
  assert.ok(guard, 'could not find handleShouldStartLoad');
  assert.ok(guard[1].indexOf('isAdHocPage') < guard[1].indexOf('if (!isBusPartner) return true;'),
    'the ad check sits after an early return, so it never runs');
});
test('a keyed page cannot inherit the last ad page', () => {
  const ctx = read('src/context/AppContext.js');
  assert.ok(/async \(key\) => \{\s*\n\s*setWebViewAdHoc\(null\);/.test(ctx),
    'openWebView must clear the ad-hoc page');
});

console.log('\nThe slot above the bottom nav');
const app = read('App.js');
const slot = read('src/components/BottomAdSlot.js');
test('it is rendered above the bottom nav, not below or beside it', () => {
  assert.ok(/<><BottomAdSlot \/><BottomNav \/><\/>/.test(app),
    'the ad slot must come immediately before the nav bar');
});
test('it appears on the tabbed screens and nowhere else', () => {
  assert.ok(/NAV_SCREENS\.includes\(renderedScreen\) && <><BottomAdSlot \/>/.test(app),
    'the slot must share the nav bar’s own condition');
});
test('it collapses to nothing when no ad is booked', () => {
  // SmartAd renders null unless an ad is eligible right now, so the wrapper
  // must not reserve height of its own - or there is a permanent empty band
  // above the nav bar.
  assert.ok(!/height:\s*\d/.test(slot.split('const styles')[1] || ''), 'the slot style fixes a height');
  assert.ok(!/minHeight/.test(slot), 'the slot style sets a minHeight');
  assert.ok(!/paddingVertical|paddingTop|paddingBottom/.test(slot.split('const styles')[1] || ''),
    'the slot pads itself, so it is visible when empty');
  assert.ok(!/borderTopWidth/.test(slot), 'a border is drawn even when the slot is empty');
});
test('it has a placement of its own, separate from the home page', () => {
  const placements = read('src/constants/adPlacements.ts');
  assert.ok(/APP_BOTTOM_BAR: 'APP_BOTTOM_BAR'/.test(placements), 'the placement is not declared');
  assert.ok(/\[PLACEMENT_IDS\.APP_BOTTOM_BAR\]: '[^']+'/.test(placements), 'it has no label, so it cannot be chosen');
  assert.ok(/PLACEMENTS_BY_FEATURE[\s\S]*PLACEMENT_IDS\.APP_BOTTOM_BAR/.test(placements),
    'it belongs to no feature, so the booking form will not offer it');
  assert.ok(/placement="APP_BOTTOM_BAR"/.test(slot), 'the slot asks for some other placement');
  assert.ok(!/placement="HOME_BOTTOM"/.test(slot),
    'the slot shares the home page’s placement, so one switch runs both');
});
test('it says what AdMob still needs rather than implying it is wired', () => {
  // There is no AdMob package and no ad unit id in this repo, and inventing
  // either is worse than saying so.
  assert.ok(/ADMOB:/.test(slot), 'the slot must say where AdMob fits');
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasAdmob = Object.keys(deps).some((d) => /mobile-ads|admob/i.test(d));
  assert.strictEqual(hasAdmob, false,
    'an AdMob package is installed now, so the slot’s comment is out of date');
});

console.log(failed ? `\n${failed} check(s) failed.\n` : `\n${passed} checks passed.\n`);
process.exit(failed ? 1 : 0);
