#!/usr/bin/env node
'use strict';
/**
 * AdMob: the app id in the build, the unit id in Firestore, and the rule that
 * a paid booking always beats a filled one.
 *
 * Three things have teeth here.
 *
 * THE TWO IDS. An AdMob app id and an ad unit id are copied off the same
 * console page and differ by one character - a '~' against a '/'. The app id
 * in the unit id field is not an error anybody sees: it is a banner slot that
 * silently never fills, reported weeks later as "the ads don't work". So the
 * shape is checked at the only write path, and this file checks that the
 * client and the server agree about what the shape is - they are separate
 * bundles with nothing linking them.
 *
 * THE FILL ORDER. A direct MySheba booking is paid for; an AdMob impression
 * is not. AdMob must never appear beside a booked banner, or in place of one.
 *
 * THE NATIVE MODULE. react-native-google-mobile-ads is not present in Expo
 * Go. A plain import takes the whole bundle down with it, so the require has
 * to be guarded - the app matters more than the ad.
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

// The server's validator, run rather than read: a format check that is
// pattern-matched can look perfect and still accept an app id.
function loadServerPicker() {
  const src = read('functions/adControlsService.js');
  const start = src.indexOf('const AD_UNIT_ID_PATTERN');
  const end = src.indexOf('function pickValidBooleans(');
  assert.ok(start >= 0 && end > start, 'could not find the settings validator in functions/adControlsService.js');
  const box = {
    module: { exports: {} },
    HttpsError: class HttpsError extends Error {
      constructor(code, message) { super(message); this.code = code; }
    },
  };
  vm.createContext(box);
  vm.runInContext(`${src.slice(start, end)}
module.exports = { pickValidSettings, AD_UNIT_ID_PATTERN, SETTINGS_FIELD_TYPES };`, box);
  return box.module.exports;
}
const server = loadServerPicker();

// The client's gate, likewise.
function loadClientGate() {
  const src = read('src/firebase/adControlsService.js')
    .replace(/^import[\s\S]*?from\s+'[^']*';$/gm, '')
    .replace(/^export (const|function|async function) /gm, '$1 ');
  const box = {
    module: { exports: {} },
    doc: () => ({}), onSnapshot: () => () => {}, collection: () => ({}),
    httpsCallable: () => async () => {}, db: {}, functions: {},
    AD_COLLECTIONS: { SETTINGS: 's', FEATURE_CONTROLS: 'f' }, AD_SETTINGS_DOC_ID: 'general',
    AD_TYPES: { BANNER: 'banner', NATIVE: 'native', INTERSTITIAL: 'interstitial' },
    AD_NETWORKS: { DIRECT: 'direct' },
    FEATURE_ID_LIST: [], FEATURE_LABELS: {},
  };
  vm.createContext(box);
  vm.runInContext(`${src}
module.exports = { DEFAULT_AD_SETTINGS, AD_UNIT_ID_PATTERN, isAdMobBannerReady, admobBannerUnitId };`, box);
  return box.module.exports;
}
const client = loadClientGate();

const GOOD = 'ca-app-pub-5028998697615030/1234567890';
const APP_ID = 'ca-app-pub-5028998697615030~7504898532';

console.log('\nThe app id and the unit id are not interchangeable');
test('the real app id is rejected as a unit id, by the server', () => {
  assert.throws(() => server.pickValidSettings({ admobBannerUnitId: APP_ID }), /not an AdMob banner ad unit id/);
});
test('and by the client, before any round trip', () => {
  assert.strictEqual(client.AD_UNIT_ID_PATTERN.test(APP_ID), false);
});
test('a real unit id is accepted', () => {
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(server.pickValidSettings({ admobBannerUnitId: GOOD }))),
    { admobBannerUnitId: GOOD },
  );
  assert.strictEqual(client.AD_UNIT_ID_PATTERN.test(GOOD), true);
});
test('the server trims before it validates and before it stores', () => {
  const out = server.pickValidSettings({ admobBannerUnitId: `  ${GOOD}  ` });
  assert.strictEqual(out.admobBannerUnitId, GOOD);
});
test('empty clears it rather than being refused', () => {
  // This is how AdMob fill is turned off, so it must not be an error.
  assert.strictEqual(server.pickValidSettings({ admobBannerUnitId: '' }).admobBannerUnitId, '');
  assert.strictEqual(server.pickValidSettings({ admobBannerUnitId: '   ' }).admobBannerUnitId, '');
});
test('a nearly-right id is still refused', () => {
  const bad = [
    'ca-app-pub-5028998697615030/123456789',    // 9 digits
    'ca-app-pub-5028998697615030/12345678901',  // 11 digits
    'ca-app-pub-502899869761503/1234567890',    // 15-digit publisher
    'ca-app-pub-5028998697615030-1234567890',   // hyphen, not slash
    'ca-app-pub-5028998697615030/abcdefghij',
    'pub-5028998697615030/1234567890',
    GOOD + ' extra',
    GOOD + '\n' + GOOD,
    'ca-app-pub-5028998697615030/1234567890/0987654321',
  ];
  for (const v of bad) {
    assert.throws(() => server.pickValidSettings({ admobBannerUnitId: v }), /not an AdMob banner ad unit id/, v + ' was accepted');
    assert.strictEqual(client.AD_UNIT_ID_PATTERN.test(v), false, v + ' passed the client check');
  }
});
test('the client and the server use the SAME pattern, character for character', () => {
  // Two bundles, nothing linking them. If the client drifts wider, a
  // superadmin is told their id is fine and then the save fails; if it drifts
  // narrower, a valid id is refused in a box that never calls the server.
  assert.strictEqual(String(client.AD_UNIT_ID_PATTERN), String(server.AD_UNIT_ID_PATTERN),
    'client ' + client.AD_UNIT_ID_PATTERN + ' vs server ' + server.AD_UNIT_ID_PATTERN);
});
test('a non-string is refused rather than coerced', () => {
  for (const v of [true, 7, null, {}, []]) {
    assert.throws(() => server.pickValidSettings({ admobBannerUnitId: v }), /must be text/);
  }
});
test('the booleans still behave exactly as they did', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(server.pickValidSettings({ adsEnabled: false }))), { adsEnabled: false });
  assert.throws(() => server.pickValidSettings({ adsEnabled: 'no' }), /must be true or false/);
  assert.throws(() => server.pickValidSettings({ nonsense: true }), /Unknown field/);
  assert.strictEqual(server.pickValidSettings({}), null);
  assert.strictEqual(server.pickValidSettings(null), null);
});
test('no dead allowlist is left behind to mislead the next field', () => {
  assert.ok(!/VALID_SETTINGS_FIELDS/.test(read('functions/adControlsService.js')),
    'VALID_SETTINGS_FIELDS is unused now, and a field added to it would be rejected');
});

console.log('\nAdMob renders only when every condition is met');
test('all four conditions are required', () => {
  const on = { adsEnabled: true, bannerAdsEnabled: true, admobEnabled: true, admobBannerUnitId: GOOD };
  assert.strictEqual(client.isAdMobBannerReady(on), true);
  // One at a time, because a gate that checks three of four renders an empty
  // band above the nav bar.
  assert.strictEqual(client.isAdMobBannerReady({ ...on, adsEnabled: false }), false, 'Global Ads off');
  assert.strictEqual(client.isAdMobBannerReady({ ...on, bannerAdsEnabled: false }), false, 'banner format off');
  assert.strictEqual(client.isAdMobBannerReady({ ...on, admobEnabled: false }), false, 'AdMob off');
  assert.strictEqual(client.isAdMobBannerReady({ ...on, admobBannerUnitId: '' }), false, 'no unit id');
  assert.strictEqual(client.isAdMobBannerReady({ ...on, admobBannerUnitId: APP_ID }), false, 'app id in the unit field');
});
test('it is off by default, on a project that has configured nothing', () => {
  assert.strictEqual(client.isAdMobBannerReady(client.DEFAULT_AD_SETTINGS), false);
  assert.strictEqual(client.isAdMobBannerReady(null), false);
  assert.strictEqual(client.isAdMobBannerReady({}), false);
  assert.strictEqual(client.DEFAULT_AD_SETTINGS.admobEnabled, false,
    'a switch that says on while nothing can render is worse than one that says what is true');
  assert.strictEqual(client.DEFAULT_AD_SETTINGS.admobBannerUnitId, '');
});
test('no unit id is requested unless it would render', () => {
  assert.strictEqual(client.admobBannerUnitId({ adsEnabled: true, bannerAdsEnabled: true, admobEnabled: true, admobBannerUnitId: GOOD }), GOOD);
  assert.strictEqual(client.admobBannerUnitId({ adsEnabled: false, admobEnabled: true, admobBannerUnitId: GOOD }), '');
});
test('the component asks that one question and nothing of its own', () => {
  const banner = read('src/components/AdMobBanner.js');
  assert.ok(/const unitId = admobBannerUnitId\(adSettings\);/.test(banner),
    'AdMobBanner must take the whole decision from adControlsService');
  assert.ok(!/admobEnabled/.test(banner), 'AdMobBanner re-checks a condition, so the two can disagree');
  assert.ok(/if \(!BannerAd \|\| !unitId \|\| failed\) return null;/.test(banner),
    'the component must render nothing when it cannot fill');
});

console.log('\nA paid booking beats a filled one');
test('AdMob renders only where SmartAd had nothing to show', () => {
  const smartAd = read('src/components/SmartAd.js');
  assert.ok(/if \(!interstitialAllowed \|\| displayAds\.length === 0\) return fallback;/.test(smartAd),
    'the fallback must replace "nothing to show", not sit beside the ad');
  assert.ok(/fallback = null \}\) \{/.test(smartAd), 'and default to nothing, so every other placement is unchanged');
});
test('the slot passes AdMob as that fallback, not as a sibling', () => {
  const slot = read('src/components/BottomAdSlot.js');
  assert.ok(/fallback=\{<AdMobBanner \/>\}/.test(slot), 'the slot must hand AdMob to SmartAd as its fallback');
  // Two renders side by side would show a booked banner and a filled one at
  // once, in a 56dp band.
  assert.ok(!/<AdMobBanner \/>\s*\n\s*<SmartAd|<SmartAd[\s\S]*\/>\s*\n\s*<AdMobBanner/.test(slot),
    'AdMob is rendered beside SmartAd rather than behind it');
});
test('AdMob answers to the same switches a direct banner does', () => {
  // It is another way to fill a banner slot, not a way around the controls.
  const src = read('src/firebase/adControlsService.js');
  const gate = /export function isAdMobBannerReady\(adSettings\) \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(gate, 'could not find isAdMobBannerReady');
  assert.ok(/adsEnabled === false/.test(gate[1]) && /bannerAdsEnabled === false/.test(gate[1]),
    'AdMob must be gated by Global Ads and the banner format');
});

console.log('\nThe native module cannot take the app down with it');
test('the require is guarded', () => {
  const banner = read('src/components/AdMobBanner.js');
  assert.ok(/try \{[\s\S]*require\('react-native-google-mobile-ads'\)[\s\S]*\} catch/.test(banner),
    'a plain import of a native module throws at module load in Expo Go');
  assert.ok(!/^import .*react-native-google-mobile-ads/m.test(banner),
    'a static import defeats the guard - Metro hoists it');
});
test('nothing else imports it, so nothing else can be the one that throws', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(rel); continue; }
      if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
      const src = read(rel);
      if (/react-native-google-mobile-ads/.test(src) && rel !== path.join('src', 'components', 'AdMobBanner.js')) {
        offenders.push(rel);
      }
    }
  };
  walk('src');
  assert.deepStrictEqual(offenders, [], 'imported outside the guarded component: ' + offenders.join(', '));
});
test('a missing native module throws at REQUIRE, which is why the guard works', () => {
  // The guard is only sufficient because of this, and it is a fact about the
  // installed package rather than about our code - so it is checked here.
  //
  // react-native-google-mobile-ads' index eagerly requires a spec whose top
  // level calls TurboModuleRegistry.getEnforcing(), and getEnforcing THROWS
  // when the native module is absent. That is what the try/catch catches, and
  // it happens before any component exists to render.
  //
  // If a future version switched those to the lazy TurboModuleRegistry.get(),
  // which returns null instead of throwing, the require would SUCCEED on a
  // binary without AdMob - BannerAd would be a real component, and rendering
  // it would hit an unregistered native view. In a slot that sits above the
  // bottom nav on every tabbed screen, that breaks the whole app rather than
  // just the ad. This check is the tripwire for that.
  const pkgDir = path.join(ROOT, 'node_modules', 'react-native-google-mobile-ads', 'lib', 'commonjs');
  if (!fs.existsSync(pkgDir)) {
    throw new Error('react-native-google-mobile-ads is not installed, so the require guard cannot be reasoned about');
  }
  const index = fs.readFileSync(path.join(pkgDir, 'index.js'), 'utf8');
  const eager = index.match(/require\("\.\/specs\/modules\/(Native\w+)\.js"\)/g) || [];
  assert.ok(eager.length > 0, 'index.js no longer eagerly requires a native spec');
  const throwsOnLoad = eager.some((line) => {
    const name = /modules\/(Native\w+)\.js/.exec(line)[1];
    const spec = fs.readFileSync(path.join(pkgDir, 'specs', 'modules', `${name}.js`), 'utf8');
    return /TurboModuleRegistry\.getEnforcing\(/.test(spec);
  });
  assert.ok(throwsOnLoad,
    'no eagerly-required spec uses getEnforcing any more - the require would now SUCCEED without the native module, and rendering BannerAd would hit an unregistered view');
});
test('and the component never reaches a native view in that case', () => {
  // Belt and braces: even with AdMob switched on and a valid unit id stored,
  // the BannerAd check comes FIRST, so an OTA to a build without the native
  // module renders nothing rather than a missing component.
  const banner = read('src/components/AdMobBanner.js');
  const guard = /if \(!BannerAd \|\| !unitId \|\| failed\) return null;/.exec(banner);
  assert.ok(guard, 'the null-render guard must test BannerAd before anything else');
  assert.ok(banner.indexOf(guard[0]) < banner.indexOf('<BannerAd'),
    'the guard must come before the only render of BannerAd');
});
test('it is initialised once per run, not once per mount', () => {
  const banner = read('src/components/AdMobBanner.js');
  assert.ok(/let initialised = false;/.test(banner) && /if \(initialised/.test(banner),
    'the slot mounts on every tabbed screen; initialize() is a network round trip');
});
test('a failed load leaves no gap behind', () => {
  const banner = read('src/components/AdMobBanner.js');
  assert.ok(/onAdFailedToLoad=\{\(\) => \{ setFailed\(true\)/.test(banner),
    'AdMob reports no-fill as a load failure, and no-fill is the normal case');
  assert.ok(/useEffect\(\(\) => \{ setFailed\(false\); \}, \[unitId\]\);/.test(banner),
    'one early no-fill would otherwise keep the slot empty until a restart');
});
test('personalised ads are not assumed before a consent flow exists', () => {
  const banner = read('src/components/AdMobBanner.js');
  assert.ok(/requestNonPersonalizedAdsOnly: true/.test(banner),
    'there is no consent prompt in this app yet, so consent cannot be assumed');
});

console.log('\nThe build carries the app id');
test('the config plugin is registered', () => {
  const base = JSON.parse(read('app.base.json'));
  const plugin = base.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'react-native-google-mobile-ads');
  assert.ok(plugin, 'react-native-google-mobile-ads is not in expo.plugins, so no app id reaches the manifest');
  assert.strictEqual(plugin[1].androidAppId, APP_ID);
  // An APP id here and a UNIT id would both "look right" in this field; only
  // one of them works, and the wrong one crashes the app at launch.
  assert.ok(/^ca-app-pub-\d{16}~\d{10}$/.test(plugin[1].androidAppId),
    'androidAppId must be an app id (with a ~), not an ad unit id');
});
test('the package is a dependency at a version that supports this React Native', () => {
  const pkg = JSON.parse(read('package.json'));
  const version = pkg.dependencies['react-native-google-mobile-ads'];
  assert.ok(version, 'the package is not installed');
  // 17.1+ requires React Native >= 0.86 and this app is on 0.79, so an
  // innocent-looking bump breaks the build.
  const major = Number(String(version).replace(/[^\d.]/g, '').split('.')[0]);
  const minor = Number(String(version).replace(/[^\d.]/g, '').split('.')[1]);
  assert.ok(major === 17 && minor === 0,
    `react-native-google-mobile-ads ${version} - 17.1+ needs React Native >= 0.86, this app is on ${pkg.dependencies['react-native']}`);
});
test('the unit id is NOT in the build config, so it needs no second build', () => {
  const base = read('app.base.json');
  assert.ok(!/ca-app-pub-\d{16}\//.test(base),
    'a unit id in app.base.json would mean a new native build every time it changes');
});

console.log(failed ? `\n${failed} check(s) failed.\n` : `\n${passed} checks passed.\n`);
process.exit(failed ? 1 : 0);
