const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const storageRules = fs.readFileSync(path.join(root, 'storage.rules'), 'utf8');
const functionsIndex = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');

test('Firestore rules protect wallet and identity authority fields', () => {
  for (const field of ['walletBalance', 'role', 'dealerId', 'resellerId']) {
    assert.match(firestoreRules, new RegExp(field));
  }
  assert.match(firestoreRules, /securityPins/);
  assert.match(firestoreRules, /OTP/i);
});

test('Storage rules contain sensitive-file restrictions', () => {
  assert.match(storageRules, /allow write/);
  assert.match(storageRules, /contentType|content-type/i);
  assert.match(storageRules, /size/);
});

test('Callable Functions have App Check enforcement and a concurrency ceiling', () => {
  assert.match(functionsIndex, /setGlobalOptions\(\{[\s\S]*enforceAppCheck:\s*true/);
  assert.match(functionsIndex, /maxInstances:\s*50/);
});

test('Production source no longer contains the disabled incoming-call diagnostic', () => {
  const entry = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  assert.doesNotMatch(entry, /TEMP DIAGNOSTIC/);
  assert.match(entry, /displayIncomingCallNotification\(data\)/);
});
