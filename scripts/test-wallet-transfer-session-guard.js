#!/usr/bin/env node
'use strict';

// Regression test: idempotent replay/recovery must not bypass the live account
// and device-session checks in the walletTransfer wrapper.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'secureWalletTransfer.js'), 'utf8');
const checks = [
  ['shared session predicate is imported', /require\(['"]\.\/sessionSlots['"]\)/.test(source) && /sessionMatches\(profile, \{ sessionId, deviceId \}\)/.test(source)],
  ['request envelope is enforced', /enforceRequestEnvelope\(request, \{ maxBytes: 16 \* 1024 \}\)/.test(source)],
  ['user profile and operation are read in the transaction', /const userSnap = await tx\.get\(userRef\);\s*const snap = await tx\.get\(opRef\);/.test(source)],
  ['inactive and merged accounts are rejected before replay', /profile\.suspended === true[\s\S]*?profile\.mergedInto != null[\s\S]*?requireActiveSession\(request, profile\);[\s\S]*?if \(snap\.exists\)/.test(source)],
  ['session check is inside the wrapper, before existing-operation recovery', source.indexOf('requireActiveSession(request, profile);') > source.indexOf('await db.runTransaction') && source.indexOf('requireActiveSession(request, profile);') < source.indexOf('if (existing)')],
];

let failures = 0;
for (const [name, ok] of checks) {
  if (ok) console.log('  ok  ' + name);
  else { failures += 1; console.error('  FAIL  ' + name); }
}
if (failures) process.exitCode = 1;
else console.log(`\n${checks.length} wallet-transfer session guard checks passed.`);
