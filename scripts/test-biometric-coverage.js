#!/usr/bin/env node
'use strict';

/**
 * Every place that asks for the security PIN also takes a fingerprint.
 *
 * Customers had this on Wallet Transfer from the start. Staff did not: a
 * dealer, reseller, admin or superadmin gets LegacyTransferPointsScreen
 * (TransferPointsScreen:139 hands non-customers straight to it), and that
 * screen only ever had the PIN field. The gate in front of it - the one
 * requireSecurityPin puts up - did offer the fingerprint, so the inconsistency
 * was invisible until you were past it and looking at the transfer form.
 *
 * The rule this fixes in place: a surface that sends securityPin to the server
 * must offer the fingerprint as a way of producing it. Not as a substitute for
 * the check - walletTransfer and transferPoints both scrypt-compare the digits
 * server-side, and that never moves - but as a way to avoid typing them.
 *
 * Three pieces are needed and all three are load-bearing:
 *   isBiometricAvailable   the OS can do it at all
 *   pinVault.hasPin        this account stored a PIN on THIS device, or the
 *                          fingerprint passes and there are no digits to send
 *   authenticateWithBiometric  the prompt itself
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Surfaces that take a PIN but must NOT accept a fingerprint instead, each
// with the reason. A new file landing here needs a reason too.
const EXEMPT = {
  'src/components/ResetSecurityPinModal.js':
    'changes the PIN, and authenticates with the login password - there is no password in the vault, and a credential change should need the credential',
};

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const files = [...walk('src/screens'), ...walk('src/components')];
// Matched on what a file DOES with the PIN, not on the word appearing in it:
// securityPinSet is a profile flag, settings.securityPinSub is a translation
// key, and SettingsScreen has both without ever handling a digit. A surface
// either verifies the PIN or sends it in a payload.
const HANDLES_PIN = /verifySecurityPin\(|securityPin:\s/;
const asksForPin = files.filter((f) => HANDLES_PIN.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));

console.log('\nEvery PIN surface is accounted for');
check('the sweep found some', asksForPin.length > 0);

const covered = [];
let exempted = 0;
for (const file of asksForPin) {
  if (EXEMPT[file]) { exempted += 1; console.log(`  --   ${file} exempt: ${EXEMPT[file]}`); continue; }
  covered.push(file);
}

console.log('\nEach one offers the fingerprint');
for (const file of covered) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const name = file.replace('src/', '');
  check(`${name} prompts for it`, /authenticateWithBiometric\(/.test(text));
  check(`${name} checks the device can`, /isBiometricAvailable\(/.test(text));
}

console.log('\nThe ones that replay the digits do it honestly');
// Two tiers, and the difference matters. AppLockScreen's fingerprint IS the
// unlock - that decision is local, so there is nothing to replay and no PIN
// needs to be stored. Everywhere else the digits go to a server that
// scrypt-compares them, so the fingerprint only produces what the person would
// have typed: that needs a PIN stored on THIS device, or the fingerprint
// passes and there is nothing to send.
const replays = covered.filter((f) => /pinVault\.readPin\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
check('at least one surface replays a stored PIN', replays.length > 0);
for (const file of replays) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const name = file.replace('src/', '');
  check(`${name} checks a PIN is stored here first`, /pinVault\.hasPin\(/.test(text));
  check(`${name} stores only a PIN the server accepted`, /pinVault\.rememberPin\(/.test(text));
  // A stored PIN the server refuses is stale - changed on another device.
  // Replaying it burns the account's attempt limit on digits nobody typed.
  check(`${name} drops a stored PIN the server rejected`, /pinVault\.forgetPin\(/.test(text));
}

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`Fingerprint works on every PIN surface (${covered.length} checked, ${exempted} exempt).`);
