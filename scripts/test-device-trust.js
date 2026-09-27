#!/usr/bin/env node
/**
 * A staff device that has passed the email/SMS challenge stays passed.
 *
 * activeDeviceId is a single slot, so a rule written against it alone means
 * "one device at a time", not "a device you have verified". Staff with a
 * phone and a laptop were challenged on every switch: the branch at the top
 * of checkDeviceSession sees the device IS trusted and skips the challenge,
 * leaving verifiedNewStaffDevice false, and the transaction then challenged
 * it anyway. The code arrived, was entered, and the next switch asked again.
 *
 * These lock in that trustedDevices is read, WITHOUT weakening the control:
 * a staff device nobody has verified is still challenged.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'deviceSessionService.js'), 'utf8');
const start = src.indexOf('const isStaffRole =');
const end = src.indexOf('const staffNeedsDeviceChallenge =');
const decl = src.indexOf('(profile, deviceId) => (', end);
const close = src.indexOf('\n);', decl);
if (start < 0 || end < 0 || close < 0) {
  console.error('Device trust test: could not find the predicate - has it been renamed?');
  process.exit(1);
}
const box = { module: { exports: {} }, console };
vm.createContext(box);
vm.runInContext(`${src.slice(start, end)}\n${src.slice(end, close + 3)}\nmodule.exports = staffNeedsDeviceChallenge;`, box);
const needsChallenge = box.module.exports;

let failed = 0;
const is = (label, got, want) => {
  if (got === want) { console.log(`  ok    ${label}`); return; }
  failed += 1;
  console.error(`  FAIL  ${label}\n          got ${got}, want ${want}`);
};

const DEV = 'device-a';
const OTHER = 'device-b';

console.log('Staff still challenged when nobody has verified the device:');
for (const role of ['admin', 'superadmin', 'dealer', 'reseller']) {
  is(`${role} on an unknown device, another device active`,
    needsChallenge({ role, activeDeviceId: OTHER, trustedDevices: { [OTHER]: {} } }, DEV), true);
  is(`${role} on an unknown device, no active device yet`,
    needsChallenge({ role, activeDeviceId: null }, DEV), true);
  is(`${role} with no trustedDevices map at all`,
    needsChallenge({ role, activeDeviceId: OTHER }, DEV), true);
}

console.log('\nA verified staff device is not challenged again:');
for (const role of ['admin', 'superadmin', 'dealer', 'reseller']) {
  is(`${role} switching back to a trusted device`,
    needsChallenge({ role, activeDeviceId: OTHER, trustedDevices: { [DEV]: { ip: '1.2.3.4' } } }, DEV), false);
  is(`${role} on the device that is already active`,
    needsChallenge({ role, activeDeviceId: DEV }, DEV), false);
}

console.log('\nCustomers never take this path:');
for (const role of ['customer', undefined, null]) {
  is(`role ${String(role)}`, needsChallenge({ role, activeDeviceId: OTHER }, DEV), false);
}

console.log(failed ? `\n${failed} failure(s).` : '\nDevice trust: all checks pass.');
process.exit(failed ? 1 : 0);
