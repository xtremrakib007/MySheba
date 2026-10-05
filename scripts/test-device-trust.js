#!/usr/bin/env node
'use strict';
/**
 * Remembering a browser, and the four things that must still ask for a code.
 *
 * The rule asked for is "one app and one web signed in together, and the web
 * one not challenged every single time". The first half is sessionSlots.js and
 * is tested there. This is the second half, which is the dangerous one: every
 * check here is a way in, and a mistake does not break a feature, it hands
 * somebody an admin console.
 *
 * So the shape of this file is deliberate - one test that the window works,
 * and the rest of it reasons why it must not.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { webTrustDecision, millisOf, WEB_TRUST_DAYS, WEB_TRUST_MS } = require('../functions/deviceTrust');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

const NOW = 1700000000000;
const web = (verifiedAt, deviceId = 'browser-1') => ({ trustedDevices: { [deviceId]: { verifiedAt } } });
const ask = (profile, over = {}) => webTrustDecision(profile, { deviceId: 'browser-1', platform: 'web', nowMs: NOW, ...over });

console.log('\nA browser that was verified recently is not asked again');

test('inside the window it is remembered', () => {
  const decision = ask(web(NOW - 1000));
  assert.strictEqual(decision.ok, true);
  assert.strictEqual(decision.expiresAtMs, NOW - 1000 + WEB_TRUST_MS);
});

test('the window is long enough to be worth having', () => {
  // The complaint was a code on almost every visit. A window of a day or two
  // would not answer it.
  assert.ok(WEB_TRUST_DAYS >= 14, 'too short to stop the repeat codes');
  assert.ok(WEB_TRUST_DAYS <= 90, 'a browser remembered for a quarter is not remembered, it is unlocked');
  assert.strictEqual(WEB_TRUST_MS, WEB_TRUST_DAYS * 24 * 60 * 60 * 1000);
});

test('on the last day it still counts, and after it does not', () => {
  assert.strictEqual(ask(web(NOW - WEB_TRUST_MS)).ok, true, 'the boundary itself is inside');
  assert.strictEqual(ask(web(NOW - WEB_TRUST_MS - 1)).reason, 'expired');
});

console.log('\nAnd these must always ask');

test('the app is never remembered, whatever it has stored', () => {
  // The whole exception exists because a browser is signed into repeatedly and
  // a phone is not. A phone carrying a verified entry must still be challenged.
  assert.strictEqual(webTrustDecision(web(NOW - 1000), { deviceId: 'browser-1', platform: 'mobile', nowMs: NOW }).reason, 'not_web');
  // Absent platform means mobile everywhere else in this codebase; it must not
  // mean "web" here by accident.
  assert.strictEqual(webTrustDecision(web(NOW - 1000), { deviceId: 'browser-1', nowMs: NOW }).reason, 'not_web');
});

test('a browser nobody has ever verified is not remembered', () => {
  assert.strictEqual(ask({ trustedDevices: {} }).reason, 'unknown_device');
  assert.strictEqual(ask({}).reason, 'unknown_device');
  assert.strictEqual(ask(null).reason, 'unknown_device');
  // A different browser's entry is not this browser's.
  assert.strictEqual(ask(web(NOW - 1000, 'browser-2')).reason, 'unknown_device');
});

test('a browser trusted before this existed is asked once more', () => {
  // Entries written before verifiedAt existed carry no verifiedAt. Reading
  // that as "verified at the epoch" would expire them, which is right; reading
  // it as "verified now" would remember every one of them at a stroke.
  assert.strictEqual(ask({ trustedDevices: { 'browser-1': { trustedAt: NOW, lastSeenAt: NOW } } }).reason, 'never_verified');
});

test('a verifiedAt that cannot be read is not a verification', () => {
  for (const bad of ['yesterday', true, {}, [], NaN, Infinity, null, undefined]) {
    assert.strictEqual(ask(web(bad)).ok, false, String(bad) + ' must not let a browser in');
  }
});

test('a clock running backwards grants nothing', () => {
  // A verifiedAt in the future would otherwise be inside the window for as
  // long as the skew lasts, plus the whole window on top.
  assert.strictEqual(ask(web(NOW + 1)).reason, 'clock_skew');
  assert.strictEqual(ask(web(NOW - 1000), { nowMs: undefined }).reason, 'no_clock');
  assert.strictEqual(ask(web(NOW - 1000), { nowMs: NaN }).reason, 'no_clock');
  assert.strictEqual(ask(web(NOW - 1000), { deviceId: '' }).reason, 'no_device');
});

test('a Firestore timestamp reads the same as a number', () => {
  // The stored value is a Timestamp; the tests above use numbers. If only one
  // of them worked, this would pass everywhere except production.
  const stamp = { toMillis: () => NOW - 1000 };
  assert.strictEqual(millisOf(stamp), NOW - 1000);
  assert.strictEqual(ask(web(stamp)).ok, true);
  assert.strictEqual(millisOf({ toMillis: () => NaN }), null, 'a Timestamp that reads as nonsense is no time at all');
});

console.log('\nThe window is measured from the last verification, not from activity');

const service = read('functions/deviceSessionService.js');

test('verifiedAt moves only when a second factor was actually passed', () => {
  assert.ok(/verifiedAt: verified \? now : \(old\.verifiedAt \|\| null\)/.test(service),
    'an ordinary touch must carry the old verifiedAt through unchanged');
  // The two places something was actually proved.
  assert.ok(/trustedMap\(profile\.trustedDevices, deviceId, ip, label, \{ verified: true \}\)/.test(service),
    'passing a code must set it');
  assert.ok(/trustedMap\(profile\.trustedDevices, deviceId, ip, null, \{ verified: true \}\)/.test(service),
    'and so must confirming a device switch');
});

test('being remembered does not extend being remembered', () => {
  // Otherwise the window never ends for whoever is using the browser, which is
  // the one thing a time-boxed trust is for.
  const branch = /if \(webTrust\.ok\) \{[\s\S]*?\n    \} else \{/.exec(service);
  assert.ok(branch, 'the remembered-browser branch must be findable');
  assert.ok(!/verified: true/.test(branch[0]), 'a remembered sign-in must not re-stamp verifiedAt');
  assert.ok(/logAudit\(\{ action: 'login_remembered_browser'/.test(branch[0]),
    'a sign-in that skipped the code must be visible in the log');
});

test('the skip is wired into the sign-in, not just defined', () => {
  assert.ok(/require\('\.\/deviceTrust'\)/.test(service));
  assert.ok(/const webTrust = webTrustDecision\(profile, \{ deviceId, platform, nowMs: Date\.now\(\) \}\)/.test(service),
    'it must be asked about THIS browser at THIS moment');
  // platform comes from the request, and sessionSlots decides what counts as
  // web. If that ever stopped being the same value, a phone could be read as
  // a browser.
  assert.ok(/const platform = platformOf\(request\.data\?\.platform\)/.test(service));
});

test('the browser says which platform it is', () => {
  // Without this the web client is read as mobile and is challenged for ever.
  assert.ok(/platform: 'web',/.test(read('admin-web/src/services/deviceAuthService.ts')),
    'the admin site must identify itself as web');
});


test('nobody can write their own verifiedAt', () => {
  // The whole window rests on this field, so a client that could set it could
  // remember its own browser for a month without ever passing a second factor.
  const rules = read('firestore.rules');
  const users = /match \/users\/\{uid\} \{[^\n]*/.exec(rules);
  assert.ok(users, 'the users rule must be findable');
  const writable = /affectedKeys\(\)\.hasOnly\(\[([^\]]*)\]\)/.exec(users[0]);
  assert.ok(writable, 'the users update rule must list what a client may change');
  assert.ok(!/trustedDevices/.test(writable[1]),
    'trustedDevices must stay server-only, or the trust window is self-service');
});

console.log('\n' + passed + ' checks passed.\n');
