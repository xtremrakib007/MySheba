#!/usr/bin/env node
/**
 * The new-device email challenge must send on the FIRST attempt.
 *
 * Both call sites gated it on `data.resendEmailChallenge`, which nothing
 * sets on a first sign-in - so the app showed "enter the code we emailed
 * you" over an inbox with no email in it, for admins and customers alike.
 */
// Exercises ensureEmailChallenge by loading the real function out of the
// deployed source, with its one dependency stubbed.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'functions', 'deviceSessionService.js'), 'utf8');
const start = src.indexOf('async function ensureEmailChallenge(');
const end = src.indexOf('function verifyStaffEmailOtp(');
const code = src.slice(start, end);

let sent = 0; let throwCode = null;
const box = {
  sendStaffEmailChallenge: async () => {
    sent += 1;
    if (throwCode) { const e = new Error('x'); e.code = throwCode; throw e; }
  },
  module: { exports: {} }, console,
};
vm.createContext(box);
vm.runInContext(code + '\nmodule.exports = ensureEmailChallenge;', box);
const ensure = box.module.exports;

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : `  (got ${got}, want ${want})`}`);
};
const live = (deviceId, ms = 60000) => ({ deviceId, expiresAt: { toMillis: () => Date.now() + ms } });
const expired = (deviceId) => ({ deviceId, expiresAt: { toMillis: () => Date.now() - 1000 } });

(async () => {
  console.log('\n-- the first challenge must actually send --');
  sent = 0; throwCode = null;
  is('no pending challenge -> sends', await ensure({ email: 'a@b.c', deviceId: 'd1', pending: undefined }), true);
  is('   and it really called the mailer', sent, 1);

  sent = 0;
  is('an expired challenge -> sends a new one', await ensure({ email: 'a@b.c', deviceId: 'd1', pending: expired('d1') }), true);
  is('   mailer called', sent, 1);

  sent = 0;
  is('a challenge for a DIFFERENT device -> sends', await ensure({ email: 'a@b.c', deviceId: 'd2', pending: live('d1') }), true);

  console.log('\n-- but it must not spam --');
  sent = 0;
  is('a live challenge for this device -> does not resend', await ensure({ email: 'a@b.c', deviceId: 'd1', pending: live('d1') }), false);
  is('   mailer not called', sent, 0);

  sent = 0;
  is('tapping Resend overrides that', await ensure({ email: 'a@b.c', deviceId: 'd1', pending: live('d1'), force: true }), true);
  is('   mailer called', sent, 1);

  console.log('\n-- failures --');
  sent = 0;
  is('no email address -> nothing to send', await ensure({ email: null, deviceId: 'd1' }), false);
  is('   mailer not called', sent, 0);

  throwCode = 'resource-exhausted';
  is('cooldown is not an error - one just went out', await ensure({ email: 'a@b.c', deviceId: 'd1' }), false);

  throwCode = 'internal';
  let threw = false;
  try { await ensure({ email: 'a@b.c', deviceId: 'd1' }); } catch (e) { threw = true; }
  is('a real mailer failure still throws', threw, true);

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
