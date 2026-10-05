#!/usr/bin/env node
'use strict';
/**
 * Staff signing in on the web with the credentials they already have.
 *
 * The app turns a phone number into a synthetic Firebase Auth address -
 * 60123456789@mysheba.app - and signs in with that. The web form asked for an
 * email, so a staff account created through the app could only be reached by
 * typing an address nobody is ever told it has. Same account, same password;
 * only the identifier was different.
 *
 * So the web now accepts either, and the mapping has to agree with the app's
 * exactly. A phone that signs in on the phone and not on the web is the bug
 * this file exists to prevent, and there is no shared module to put the mapping
 * in: the app is React Native, the admin site is Vite, and neither builds the
 * other.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// The module under test is TypeScript, so it is compiled here rather than
// mirrored in JavaScript - a mirror is one more copy to drift.
function loadTs(rel) {
  const js = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

const web = loadTs('admin-web/src/utils/signInIdentifier.ts');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

console.log('\nWhat the web will try');

test('an email is used as typed', () => {
  assert.deepStrictEqual(web.signInEmails('admin@satulink.com'), ['admin@satulink.com']);
  assert.deepStrictEqual(web.signInEmails('  admin@satulink.com  '), ['admin@satulink.com']);
});

test('a Malaysian number becomes the address the app registered', () => {
  // 0123456789 in the app is +60123456789, which is 60123456789@mysheba.app.
  assert.strictEqual(web.signInEmails('0123456789')[0], '60123456789@mysheba.app');
  assert.strictEqual(web.signInEmails('+60 12-345 6789')[0], '60123456789@mysheba.app');
  assert.strictEqual(web.signInEmails('012-345 6789')[0], '60123456789@mysheba.app');
});

test('the legacy Malaysian form is still tried', () => {
  // Accounts registered before the E.164 change are under their digits as
  // typed, leading zero and all. The app falls back to this and only for +60;
  // dropping it here would lock those accounts out of the web while they still
  // worked on the phone.
  assert.deepStrictEqual(web.signInEmails('0123456789'),
    ['60123456789@mysheba.app', '0123456789@mysheba.app']);
});

test('a number already in E.164 is not tried twice', () => {
  assert.deepStrictEqual(web.signInEmails('+60123456789'), ['60123456789@mysheba.app']);
});

test('a foreign number gets no Malaysian fallback', () => {
  // The fallback is a Malaysian legacy shape. Applying it elsewhere sends a
  // second doomed attempt at an address that never existed.
  assert.deepStrictEqual(web.signInEmails('+8801712345678'), ['8801712345678@mysheba.app']);
  // In national form with a Bangladeshi dial the two shapes genuinely differ -
  // 01712345678 vs 8801712345678 - which is what makes this case able to tell
  // whether the fallback is still restricted to +60. The E.164 example above
  // cannot: there the fallback produces the same address and is deduped away.
  assert.deepStrictEqual(web.signInEmails('01712345678', '+880'), ['8801712345678@mysheba.app']);
});

test('the web form has no country selector, so a foreign number needs its +', () => {
  // Worth stating rather than discovering: signInEmails defaults to +60, so a
  // Bangladeshi staff member typing 01712345678 with no '+' is treated as
  // Malaysian. They type +8801712345678, or sign in with their email.
  assert.strictEqual(web.DEFAULT_DIAL, '+60');
  assert.strictEqual(web.signInEmails('01712345678')[0], '601712345678@mysheba.app');
});

test('nonsense is refused before Firebase sees it', () => {
  for (const bad of ['', '   ', '12345', 'abc', null, undefined]) {
    assert.deepStrictEqual(web.signInEmails(bad), [], JSON.stringify(bad));
  }
});

console.log('\nIt agrees with the app');

test('the same domain, read from the app rather than restated', () => {
  const app = read('src/firebase/authService.js');
  const domain = /const APP_EMAIL_DOMAIN = '([^']+)'/.exec(app);
  assert.ok(domain, "the app's domain must be findable");
  assert.strictEqual(web.APP_EMAIL_DOMAIN, domain[1], 'the web is building addresses at another domain');
});

test('the same E.164 conversion', () => {
  // Compared against the app's own toE164, compiled from its source, so this
  // fails if either side changes its rules for leading zeros or '+'.
  const phoneSrc = read('src/data/phoneCountries.js');
  const body = /export function toE164\(phone, dial\) \{([\s\S]*?)\n\}/.exec(phoneSrc);
  assert.ok(body, "the app's toE164 must be findable");
  const appToE164 = new Function('phone', 'dial', body[1]);
  for (const [phone, dial] of [['0123456789', '+60'], ['+60123456789', '+60'], ['12345678', '+60'], ['01712345678', '+880']]) {
    assert.strictEqual(web.toE164(phone, dial), appToE164(phone, dial), phone + ' / ' + dial);
  }
});

test('the app still signs in the way this assumes', () => {
  const app = read('src/firebase/authService.js');
  assert.ok(/signInWithEmailAndPassword\(auth, email, pin\)/.test(app),
    'if the app stopped using the synthetic address, this mapping is wrong');
  assert.ok(/legacyPhoneToEmail/.test(app), 'the legacy fallback must still exist in the app');
});

console.log('\nThe web form uses it');

test('every candidate is tried, and the first failure is reported', () => {
  // Reporting the LAST error describes an address the person never typed.
  const ctx = read('admin-web/src/contexts/AuthContext.tsx');
  assert.ok(/const candidates = signInEmails\(identifier\)/.test(ctx), 'signIn must map the identifier');
  assert.ok(/for \(const candidate of candidates\)/.test(ctx), 'every candidate must be tried');
  assert.ok(/if \(firstError === null\) firstError = err;/.test(ctx), 'the first error is the one kept');
  assert.ok(/throw firstError;/.test(ctx), 'and the one thrown');
});

test('the field accepts a phone number at all', () => {
  // type="email" makes the browser refuse to submit a phone number, before any
  // of the above runs.
  const page = read('admin-web/src/pages/LoginPage.tsx');
  assert.ok(!/type="email"/.test(page), 'type="email" rejects a phone number in the browser');
  assert.ok(/Email or mobile number/.test(page), 'and the label must say what is accepted');
});

console.log('\nWho may sign in');

test('all four staff roles are admitted', () => {
  const ctx = read('admin-web/src/contexts/AuthContext.tsx');
  const roles = /const ADMIN_ROLES: AdminRole\[\] = \[([^\]]*)\]/.exec(ctx);
  assert.ok(roles, 'the admitted roles must be findable');
  const list = (roles[1].match(/'[^']*'/g) || []).map((q) => q.slice(1, -1)).sort();
  assert.deepStrictEqual(list, ['admin', 'finance', 'superadmin', 'support']);
});

console.log('\n' + passed + ' checks passed.\n');
