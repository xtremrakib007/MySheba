#!/usr/bin/env node
/**
 * The security PIN is now kept on the device so a fingerprint can stand in
 * for it, including for wallet transfers - which need the real digits,
 * because functions/walletTransferService.js scrypt-compares them server
 * side. That is a deliberate trade: the PIN exists on the handset, so whoever
 * can defeat the device biometric can move money.
 *
 * These are the rules that keep the trade bounded. Each one is load-bearing:
 *
 *   - stored only AFTER the server accepted it, so a wrong guess can never be
 *     cached and then replayed into the account's attempt limit
 *   - keyed per uid, so a second account on the same phone cannot reach it
 *   - dropped on logout, on opting out of biometric, and whenever the server
 *     rejects a stored PIN (which means it was changed elsewhere)
 *   - offered only when a PIN is actually stored, or the fingerprint passes
 *     and there is nothing to send
 *   - in expo-secure-store (Keystore/Keychain), not AsyncStorage
 *
 * Run: npm run test:vault
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const vault = read('src', 'firebase', 'pinVault.js');
const gate = read('src', 'components', 'SecurityPinGate.js');
const transfer = read('src', 'screens', 'TransferPointsScreen.js');
const ctx = read('src', 'context', 'AppContext.js');

const failures = [];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(name);
}

// --- where it lives --------------------------------------------------------
check('the PIN is held in expo-secure-store, not AsyncStorage',
  /from 'expo-secure-store'/.test(vault) && !/async-storage/.test(vault),
  'AsyncStorage is readable by anything with filesystem access');

check('the entry is device-only and needs an unlocked device',
  /WHEN_UNLOCKED_THIS_DEVICE_ONLY/.test(vault),
  'it must not ride a cloud keychain backup to another handset');

check('the entry is keyed per uid',
  /keyFor = \(uid\)/.test(vault) && /keyFor\(uid\)/.test(vault),
  'a second account on the same phone must not reach the first one\'s PIN');

// --- only ever a verified PIN ---------------------------------------------
check('the gate stores only after verifySecurityPin resolved',
  /await securityPinService\.verifySecurityPin\(pin\);[\s\S]{0,600}?pinVault\.rememberPin/.test(gate),
  'caching an unverified guess would replay a wrong PIN and burn the attempt limit');

check('the transfer stores only after the transfer succeeded',
  /await walletTransfer\(\{[\s\S]{0,400}?pinVault\.rememberPin/.test(transfer),
  'same reason - the server is what says the PIN was right');

check('the transfer does not re-store a PIN it just read back',
  /!pinOverride[\s\S]{0,120}?pinVault\.rememberPin|pinVault\.rememberPin[\s\S]{0,120}?!pinOverride/.test(transfer),
  'writing back what was just read is pointless churn on the keystore');

// --- a stored PIN is still checked by the server --------------------------
check('biometric unlock still calls verifySecurityPin',
  /readPin\([\s\S]{0,400}?securityPinService\.verifySecurityPin\(stored\)/.test(gate),
  'the fingerprint proves who holds the phone; only the server knows the PIN is current');

// --- dropped whenever it should be ----------------------------------------
check('logout forgets the PIN',
  /clearBiometricEnabledPref\(\);[\s\S]{0,400}?pinVault\.forgetPin/.test(ctx),
  'a money credential must not outlive the session');

check('opting out of biometric forgets the PIN',
  /if \(!value\) await pinVault\.forgetPin/.test(ctx),
  'keeping the PIN after declining the fingerprint keeps the risk and loses the benefit');

check('a rejected stored PIN is forgotten, in both places',
  /catch[\s\S]{0,300}?pinVault\.forgetPin/.test(gate)
  && /if \(pinOverride\)[\s\S]{0,200}?pinVault\.forgetPin/.test(transfer),
  'a stale PIN would otherwise be replayed until the account locks out');

// --- never offered when it cannot work ------------------------------------
for (const [label, src] of [['the gate', gate], ['the transfer', transfer]]) {
  check(label + ' offers biometric only when a PIN is actually stored',
    /pinVault\.hasPin\(/.test(src) && /setBioReady\(available && stored\)/.test(src),
    'otherwise the fingerprint passes and there is nothing to send');
  check(label + ' offers biometric only when the person opted in',
    /biometricEnabled !== true/.test(src));
}

// --- the signature change that the press handler had to follow ------------
check('Confirm & Send does not pass the press event as the PIN',
  !/onPress=\{confirmTransfer\}/.test(transfer),
  'confirmTransfer(pinOverride) would receive the event object and reject it');

for (const c of checks) {
  console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.detail && !c.ok ? '\n       ' + c.detail : ''));
}
console.log('');
if (failures.length) { console.error(failures.length + ' failure(s).'); process.exit(1); }
console.log('PIN vault: all ' + checks.length + ' checks pass.');
