#!/usr/bin/env node
'use strict';
/**
 * One session on a phone and one in a browser, and no more than one of either.
 *
 * The profile carried a single activeSessionId/activeDeviceId pair, so signing
 * in anywhere ended the session everywhere else: opening the web console signed
 * you out of the app, and going back to the app signed you out of the console.
 *
 * Two phones evicting each other is the part that was always wanted. A phone
 * and a laptop evicting each other was the part that was not.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const slots = require('../functions/sessionSlots');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

const APP = { sessionId: 's-app', deviceId: 'd-app' };
const APP2 = { sessionId: 's-app2', deviceId: 'd-app2' };
const WEB = { sessionId: 's-web', deviceId: 'd-web' };
const WEB2 = { sessionId: 's-web2', deviceId: 'd-web2' };
const signIn = (profile, platform, session) => ({ ...profile, ...slots.signInUpdate(profile, platform, session) });

console.log('\nA phone and a browser, together');

test('signing in on the web leaves the app signed in', () => {
  let p = signIn({}, 'mobile', APP);
  p = signIn(p, 'web', WEB);
  assert.strictEqual(slots.sessionMatches(p, APP), true, 'the app was signed out');
  assert.strictEqual(slots.sessionMatches(p, WEB), true);
});

test('and signing in on the app leaves the web signed in', () => {
  let p = signIn({}, 'web', WEB);
  p = signIn(p, 'mobile', APP);
  assert.strictEqual(slots.sessionMatches(p, WEB), true, 'the browser was signed out');
  assert.strictEqual(slots.sessionMatches(p, APP), true);
});

console.log('\nBut only one of each');

test('a second phone ends the first', () => {
  let p = signIn(signIn({}, 'mobile', APP), 'web', WEB);
  p = signIn(p, 'mobile', APP2);
  assert.strictEqual(slots.sessionMatches(p, APP), false, 'two phones were signed in at once');
  assert.strictEqual(slots.sessionMatches(p, APP2), true);
  assert.strictEqual(slots.sessionMatches(p, WEB), true, 'and it must not have touched the browser');
});

test('a second browser ends the first', () => {
  let p = signIn(signIn({}, 'mobile', APP), 'web', WEB);
  p = signIn(p, 'web', WEB2);
  assert.strictEqual(slots.sessionMatches(p, WEB), false, 'two browsers were signed in at once');
  assert.strictEqual(slots.sessionMatches(p, WEB2), true);
  assert.strictEqual(slots.sessionMatches(p, APP), true, 'and it must not have touched the phone');
});

console.log('\nWhat counts as which platform');

test('anything that is not web is mobile', () => {
  // Every app build shipped before this sends no platform at all. Giving an
  // unknown value its own slot would let any number of phones sign in at once.
  for (const value of ['', null, undefined, 'android', 'ios', 'desktop', 'WEB ', 42]) {
    const expected = String(value || '').trim().toLowerCase() === 'web' ? 'web' : 'mobile';
    assert.strictEqual(slots.platformOf(value), expected, JSON.stringify(value));
  }
  assert.strictEqual(slots.platformOf('web'), 'web');
  assert.strictEqual(slots.platformOf('Web'), 'web');
});

test('an app build that sends no platform shares the mobile slot', () => {
  let p = signIn({}, undefined, APP);
  p = signIn(p, undefined, APP2);
  assert.strictEqual(slots.sessionMatches(p, APP), false, 'two silent clients both stayed signed in');
});

console.log('\nNobody is signed out by the deploy');

test('a session from before slots existed still matches', () => {
  // Those profiles have only the old pair. Rejecting it would sign out
  // everybody currently signed in, the moment this ships.
  const legacy = { activeSessionId: 'old-s', activeDeviceId: 'old-d' };
  assert.strictEqual(slots.sessionMatches(legacy, { sessionId: 'old-s', deviceId: 'old-d' }), true);
  assert.strictEqual(slots.sessionMatches(legacy, { sessionId: 'old-s', deviceId: 'other' }), false);
});

test('the old pair is still written, for everything that still reads it', () => {
  const p = signIn({}, 'web', WEB);
  assert.strictEqual(p.activeSessionId, WEB.sessionId);
  assert.strictEqual(p.activeDeviceId, WEB.deviceId);
});

console.log('\nHalf a session is not a session');

test('both halves must come from the same slot', () => {
  // A session id from one slot with a device id from the other is two
  // half-valid sessions being accepted as one whole.
  const p = signIn(signIn({}, 'mobile', APP), 'web', WEB);
  assert.strictEqual(slots.sessionMatches(p, { sessionId: APP.sessionId, deviceId: WEB.deviceId }), false);
  assert.strictEqual(slots.sessionMatches(p, { sessionId: WEB.sessionId, deviceId: APP.deviceId }), false);
});

test('an empty or partial candidate matches nothing', () => {
  const p = signIn({}, 'mobile', APP);
  for (const bad of [null, undefined, {}, { sessionId: 's-app' }, { deviceId: 'd-app' }, { sessionId: '', deviceId: '' }]) {
    assert.strictEqual(slots.sessionMatches(p, bad), false, JSON.stringify(bad));
  }
});

test('a profile with nothing stored matches nothing', () => {
  for (const p of [null, undefined, {}, { activeSessions: null }, { activeSessions: 'x' }]) {
    assert.strictEqual(slots.sessionMatches(p, APP), false, JSON.stringify(p));
  }
});

test('a sign-in without both halves is refused outright', () => {
  assert.throws(() => slots.signInUpdate({}, 'web', { sessionId: 's' }), /session id and a device id/);
  assert.throws(() => slots.signInUpdate({}, 'web', {}), /session id and a device id/);
});

console.log('\nEvery guarded callable uses the shared rule');

test('no file compares the two fields by hand any more', () => {
  // Fourteen copies of the comparison is fourteen chances for one of them to
  // disagree about who may move money.
  const dir = path.join(ROOT, 'functions');
  const offenders = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    if (/activeSessionId\s*!==\s*sessionId/.test(src)) offenders.push(file);
  }
  assert.deepStrictEqual(offenders, [], 'these still compare by hand: ' + offenders.join(', '));
});

test('the guarded callables call the predicate instead', () => {
  const guarded = ['walletService.js', 'secureWalletCharge.js', 'secureTransfer.js', 'transactionService.js',
    'rechargePinService.js', 'walletTransferService.js', 'adminTopUpService.js', 'topupSubmissionService.js',
    'walletFundingService.js', 'secureTopupReview.js', 'rejectionService.js', 'secureWalletMutations.js',
    'validateActiveSessionService.js'];
  for (const file of guarded) {
    const src = read('functions/' + file);
    assert.ok(/sessionMatches\(/.test(src), file + ' does not check the session');
    assert.ok(/require\('\.\/sessionSlots'\)/.test(src), file + ' does not import the rule');
  }
});

test('sign-ins are written per platform', () => {
  const src = read('functions/deviceSessionService.js');
  assert.ok(/signInUpdate\(/.test(src), 'the slot writer must be used');
  assert.ok(!/activeSessionId: id, activeDeviceId: deviceId/.test(src),
    'a raw single-slot write would wipe the other platform');
  // Every one of them, not just one: the file reads a platform at each entry
  // point, so asserting the pattern exists somewhere passed while one of them
  // was replaced by a constant.
  const assignments = src.match(/const platform = [^;]+;/g) || [];
  assert.ok(assignments.length >= 1, 'the platform must be read');
  for (const line of assignments) {
    assert.ok(/platformOf\(request\.data\?\.platform\)/.test(line),
      'a hardcoded platform defeats the slots: ' + line);
  }
});

test('the browser says it is a browser', () => {
  const web = read('admin-web/src/services/deviceAuthService.ts');
  // In the call, not anywhere in the file: the comment above it explains the
  // flag by name, so a bare search matched the comment after the flag itself
  // had been deleted.
  assert.ok(/fn\(\{ platform: 'web',/.test(web),
    "the admin site must send platform: 'web' in the call, or it lands in the mobile slot");
});

console.log('\nA trusted browser stays trusted');

test('the trusted-device cap leaves room for a phone and browsers', () => {
  // At five, somebody who lives in the web console evicts their own phone, and
  // the next app sign-in asks for a code - which is the repeat this was
  // reported as.
  const src = read('functions/deviceSessionService.js');
  const cap = /const MAX_TRUSTED_DEVICES = (\d+);/.exec(src);
  assert.ok(cap, 'the cap must be findable');
  assert.ok(Number(cap[1]) >= 10, 'the cap is still ' + cap[1]);
});


console.log('\nSigning in writes a slot, wherever the sign-in happened');

test('every path that signs somebody in goes through signInUpdate', () => {
  // confirmDeviceEmailOtp wrote activeSessionId and activeDeviceId straight
  // onto the profile and left activeSessions alone. An account that signed in
  // through it had NO mobile slot, so the phone matched only on the legacy
  // pair - and the next web sign-in overwrote that pair and signed the phone
  // out. The exact thing the slots were added to stop.
  for (const file of ['functions/deviceSessionService.js', 'functions/deviceVerificationService.js']) {
    const source = read(file);
    const writes = source.match(/(?<!\.\.\.)\bactiveSessionId: (?!null)/g) || [];
    assert.strictEqual(writes.length, 0,
      file + ' writes activeSessionId directly instead of through signInUpdate');
    assert.ok(/signInUpdate\(/.test(source), file + ' must use signInUpdate');
  }
});

test('the verification path knows which platform it is', () => {
  const source = read('functions/deviceVerificationService.js');
  assert.ok(/const platform = platformOf\(request\.data\?\.platform\)/.test(source),
    'it must read the platform rather than assuming one');
  // Both exits - the one inside the transaction and the one after it.
  const uses = source.match(/signInUpdate\(data, platform, \{/g) || [];
  assert.strictEqual(uses.length, 2, 'both ways out of this callable must write a slot, saw ' + uses.length);
});

console.log('\nAnd signing somebody out ends every session, not one');

test('clearing the legacy pair alone does not sign anybody out', () => {
  // This is the half that was missed. With a slot still standing,
  // sessionMatches keeps returning true and a force-logout does nothing.
  const cleared = { activeSessions: { mobile: { sessionId: 's1', deviceId: 'd1' } }, activeSessionId: null, activeDeviceId: null };
  assert.strictEqual(slots.sessionMatches(cleared, { sessionId: 's1', deviceId: 'd1' }), true,
    'this is the bug being guarded against: the phone still matches');
});

test('signOutEverywhere ends both', () => {
  const before = { activeSessions: { mobile: { sessionId: 's1', deviceId: 'd1' }, web: { sessionId: 's2', deviceId: 'd2' } }, activeSessionId: 's2', activeDeviceId: 'd2' };
  const after = { ...before, ...slots.signOutEverywhere() };
  assert.strictEqual(slots.sessionMatches(after, { sessionId: 's1', deviceId: 'd1' }), false, 'the phone must be out');
  assert.strictEqual(slots.sessionMatches(after, { sessionId: 's2', deviceId: 'd2' }), false, 'and the browser too');
  assert.deepStrictEqual(after.activeSessions, {}, 'the slots must be emptied, not left stale');
  assert.strictEqual(after.activeSessionId, null);
  assert.strictEqual(after.activeDeviceId, null);
});

test('every place that ends a session uses it', () => {
  // A force-logout, a password reset and a suspension all mean "out of
  // everything". All three nulled the pair and left the slots.
  for (const file of ['functions/deviceSessionService.js', 'functions/passwordReset.js', 'functions/userManagement.js']) {
    const source = read(file);
    assert.ok(/signOutEverywhere\(\)/.test(source), file + ' must use signOutEverywhere');
    assert.ok(!/activeSessionId: null/.test(source),
      file + ' still nulls the legacy pair by hand, which leaves the slots standing');
  }
});

console.log('\n' + passed + ' checks passed.\n');
