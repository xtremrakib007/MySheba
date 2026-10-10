#!/usr/bin/env node
'use strict';
/**
 * Signing up: the SMS code, the reason it failed, and nationality.
 *
 * The screen ran "check this code" and "create the account" inside one
 * try/catch and printed one sentence for both. So "This phone number is
 * already registered to another account" - which the callable says in exactly
 * those words - reached the person as "Could not complete phone verification.
 * Please try again." They then retried the SMS code, and a Firebase
 * confirmation is single use, so the retry could only ever fail. The screen
 * blamed the code again, and the account was never creatable.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { serverMessage, friendlyMessage } = require('../src/utils/signInErrorCopy.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

const screen = read('src/screens/RegisterScreen.js');
const server = read('functions/customerRegistration.js');

console.log('\nThe person is told what actually went wrong');

test("the callable's own words reach the screen", () => {
  assert.strictEqual(
    serverMessage({ code: 'functions/already-exists', message: 'This phone number is already registered to another account.' }, 'generic'),
    'This phone number is already registered to another account.',
  );
  assert.strictEqual(
    serverMessage({ code: 'functions/invalid-argument', message: 'Please choose your nationality.' }, 'generic'),
    'Please choose your nationality.',
  );
});

test('but a raw Firebase code is not shown as if it were a sentence', () => {
  // "Firebase: Error (auth/invalid-verification-code)." helps nobody.
  assert.strictEqual(
    serverMessage({ code: 'auth/invalid-verification-code', message: 'Firebase: Error (auth/invalid-verification-code).' }, 'generic'),
    'generic',
  );
  assert.strictEqual(serverMessage({ code: 'internal', message: 'Could not create the account.' }, 'generic'), 'generic');
  assert.strictEqual(serverMessage(null, 'generic'), 'generic');
});

test('sign-in still says one thing for every failure', () => {
  // The opposite rule, and it must stay: a stranger must not be able to tell
  // "wrong password" from "no such account".
  assert.strictEqual(friendlyMessage({ code: 'auth/wrong-password', message: 'nope' }, 'Incorrect details.'), 'Incorrect details.');
  // Including the codes registration DOES pass through: if sign-in ever
  // started using the same rule, "no account with that number" would be
  // readable by anyone holding the login screen.
  assert.strictEqual(
    friendlyMessage({ code: 'functions/not-found', message: 'No account with that number.' }, 'Incorrect details.'),
    'Incorrect details.',
  );
  assert.strictEqual(
    friendlyMessage({ code: 'functions/permission-denied', message: 'This account is suspended.' }, 'Incorrect details.'),
    'Incorrect details.',
  );
});

console.log('\nA verified phone is not thrown away by a failed registration');

test('checking the code and creating the account are caught separately', () => {
  const verify = /const onVerifyPhone = async \(\) => \{[\s\S]*?\n  \};/.exec(screen);
  assert.ok(verify, 'the handler must be findable');
  const body = verify[0];
  assert.ok(/That SMS code did not work/.test(body), 'a bad code must say so');
  assert.ok(/the account could not be created/.test(body), 'and a refused registration must say THAT');
  // Two catches, not one.
  assert.ok((body.match(/catch \(e\)/g) || []).length >= 2, 'the two failures must not share a catch');
});

test('a verified phone stays verified', () => {
  const body = /const onVerifyPhone = async \(\) => \{[\s\S]*?\n  \};/.exec(screen)[0];
  assert.ok(/phoneVerificationCompletedRef\.current = true;/.test(body));
  assert.ok(!/phoneVerificationCompletedRef\.current = false;/.test(body),
    'a failed registration must not un-verify a phone that was verified');
  assert.ok(/verifiedPhoneToken\.current = idToken;/.test(body), 'the token must be kept');
  assert.ok(/finishRegistration\(\{ phoneToken: verifiedPhoneToken\.current \}\)/.test(body),
    'pressing Verify again must retry the ACCOUNT, not ask for a new code');
});

console.log('\nNationality is asked once, at the start');

test('the screen collects it and sends it', () => {
  assert.ok(/const \[nationality, setNationality\] = useState\(DEFAULT_PHONE_COUNTRY\)/.test(screen));
  assert.ok(/nationality: nationality\?\.code,/.test(screen), 'it must reach the callable');
  assert.ok(/Please choose your nationality\./.test(screen), 'and be required before continuing');
  // The same picker as the dialling country, so the two lists cannot diverge.
  assert.ok((screen.match(/<PhoneCountryPicker/g) || []).length === 2, 'both fields use one country list');
});

test('the nationality is a real country code, decided by the server', () => {
  assert.ok(/const nationalityCode = String\(nationality \|\| ''\)\.trim\(\)\.toUpperCase\(\);/.test(server));
  assert.ok(/\/\^\[A-Z\]\{2\}\$\/\.test\(nationalityCode\)/.test(server), 'it must be two letters');
  assert.ok(/throw new HttpsError\('invalid-argument', 'Please choose your nationality\.'\)/.test(server));
  assert.ok(/nationality: nationalityCode,/.test(server), 'and be stored on the profile');
});

console.log('\nOne Touch ‘n Go tile, both ways of buying');

test('the homepage tile opens Touch n Go directly; PIN Generate stays separate', () => {
  const grid = read('src/components/ServiceGrid.js');
  assert.ok(/if \(s\.kind === 'tngShortcut'\) return startService\('billpayment', s\.seed, s\.startStep\)/.test(grid),
    'Touch n Go must start its seeded reload flow directly');
  assert.ok(!/Buy PIN voucher/.test(grid), 'the separate PIN Generate tile replaces the popup option');

  const tiles = read('src/components/serviceTiles.js');
  // On the home grid for a customer AND on the Control Center, both as one
  // tile that offers the choice.
  assert.strictEqual((tiles.match(/kind: 'tngShortcut'/g) || []).length, 2,
    'both lists must use the chooser, or one of them still hides a path');
  assert.ok(/key: 'tngewallet'[^}]*home: true/.test(tiles), 'and it stays on the home screen');
  assert.ok(/key: 'jompay'[^}]*home: true/.test(tiles), 'as does JomPAY');
});

console.log('\n' + passed + ' checks passed.\n');
