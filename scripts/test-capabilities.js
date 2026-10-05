#!/usr/bin/env node
'use strict';
/**
 * Staff capabilities, declared in four places that cannot import each other.
 *
 * functions/accessControl.js enforces them, firestore.rules enforces them
 * again for direct reads, and the two accessControlService files decide what
 * the app and the admin web app bother to show. Every one of those files says
 * in its own comment to keep the others in step; nothing checked that they
 * were.
 *
 * The invariant that matters most is the last one: 'review' is a READ
 * capability. It exists so a support agent can investigate a customer's order
 * without being handed 'orders', which approves, rejects and completes, or
 * 'finance', which runs top-ups and wallet funding. The moment it appears in a
 * write rule it has quietly become those things.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

const names = (block) => (block.match(/'[^']*'/g) || []).map((q) => q.slice(1, -1));

const backend = read('functions/accessControl.js');
const appSvc = read('src/firebase/accessControlService.js');
const webSvc = read('admin-web/src/services/accessControlService.ts');
const rules = read('firestore.rules');

// Each file's list, pulled from the file itself rather than restated here -
// restating them is exactly the drift this is meant to catch.
const listOf = (src, re, label) => {
  const m = re.exec(src);
  assert.ok(m, label + ' must be findable');
  return names(m[1]);
};
const capsBackend = require('../functions/accessControl.js').CAPABILITIES;
const capsApp = listOf(appSvc, /export const CAPABILITIES = \[([^\]]*)\]/, 'app CAPABILITIES');
const capsWeb = listOf(webSvc, /export const CAPABILITIES = \[([^\]]*)\]/, 'admin-web CAPABILITIES');

console.log('\nOne list of capabilities, in four files');

test('the app and the admin web app declare what the backend enforces', () => {
  assert.deepStrictEqual(capsApp, capsBackend, 'src/firebase/accessControlService.js has drifted');
  assert.deepStrictEqual(capsWeb, capsBackend, 'admin-web/src/services/accessControlService.ts has drifted');
});

test('every capability the admin web app offers has a label to offer it by', () => {
  // An unlabelled capability renders as a blank row in Access Control, which
  // is worse than not offering it.
  const info = /CAPABILITY_INFO[^{]*\{([\s\S]*?)\n\};/.exec(webSvc);
  assert.ok(info, 'CAPABILITY_INFO must be findable');
  for (const cap of capsBackend) {
    assert.ok(new RegExp('\\b' + cap + ': \\{ label:').test(info[1]), cap + ' has no label');
  }
});

console.log('\nThe same defaults, in four files');

const defaultsBlock = (src, re, label) => {
  const m = re.exec(src);
  assert.ok(m, label + ' defaults must be findable');
  const out = {};
  for (const [, role, list] of m[1].matchAll(/(\w+): \[([^\]]*)\]/g)) out[role] = names(list);
  return out;
};
const defBackend = defaultsBlock(backend, /const BUILT_IN_DEFAULTS = \{([\s\S]*?)\n\};/, 'backend');
const defApp = defaultsBlock(appSvc, /export const BUILT_IN_DEFAULTS = \{([\s\S]*?)\n\};/, 'app');
const defWeb = defaultsBlock(webSvc, /export const BUILT_IN_DEFAULTS[^{]*\{([\s\S]*?)\n\};/, 'admin-web');

test('all three JavaScript copies agree', () => {
  assert.deepStrictEqual(defApp, defBackend, 'the app has drifted');
  assert.deepStrictEqual(defWeb, defBackend, 'the admin web app has drifted');
});

test('firestore.rules agrees too', () => {
  // The rules are the only copy that decides a direct Firestore read, so a
  // disagreement here means the UI offers what the database refuses.
  const built = /function builtInCaps\(r\) \{ return ([^}]*)\}/.exec(rules);
  assert.ok(built, 'builtInCaps must be findable');
  for (const role of ['admin', 'support', 'finance']) {
    const m = new RegExp("r == '" + role + "' \\? \\[([^\\]]*)\\]").exec(built[1]);
    assert.ok(m, 'no rules entry for ' + role);
    assert.deepStrictEqual(names(m[1]), defBackend[role], 'firestore.rules disagrees for ' + role);
  }
});

console.log('\nWhat each role can actually do');

test('finance can reach the customer order queue', () => {
  // The reported bug: the queue is gated on 'orders' (firestore.rules), and
  // finance did not have it - so finance could read a transaction's history
  // and never see the orders waiting to be worked.
  assert.ok(defBackend.finance.includes('orders'), 'finance cannot see the order queue');
  assert.ok(rules.includes("match /transactionQueue/{id} { allow read: if activeProfile() && (can('orders')"),
    'the queue must still be gated on orders');
});

test('support can investigate an order but cannot act on one', () => {
  assert.ok(defBackend.support.includes('review'), 'support cannot open an order');
  assert.ok(defBackend.support.includes('reports'), 'support cannot read the numbers');
  assert.ok(!defBackend.support.includes('orders'), 'support must not approve or reject');
  assert.ok(!defBackend.support.includes('finance'), 'support must not run top-ups or funding');
  assert.ok(!defBackend.support.includes('users'), 'support must not administer accounts');
});

console.log('\n‘review’ reads, and only reads');

test('it opens a transaction', () => {
  const tx = /match \/transactions\/\{id\} \{([^}]*)\}/.exec(rules);
  assert.ok(tx, 'the transactions rule must be findable');
  assert.ok(/allow create, update, delete: if false;/.test(tx[1]), 'writes stay closed');
  assert.ok(/allow read:[^;]*can\('review'\)/.test(tx[1]), 'review must open the read');
});

test('it appears in no rule that writes', () => {
  // The whole point of the capability. Checked against the rules file rather
  // than trusted, because one `allow update` is all it would take.
  for (const line of rules.split('\n')) {
    if (!line.includes("can('review')")) continue;
    const writable = /allow[^:]*\b(create|update|delete|write)\b[^:]*:\s*if\s+(?!false)/.test(line);
    assert.ok(!writable, 'review reaches a write rule: ' + line.trim().slice(0, 160));
  }
});

test('the backend never gates a write on it either', () => {
  // hasCapability(..., 'review') guarding anything that mutates would be the
  // same mistake one layer up.
  const fnDir = path.join(ROOT, 'functions');
  for (const file of fs.readdirSync(fnDir).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(fnDir, file), 'utf8');
    for (const line of src.split('\n')) {
      if (!/hasCapability\([^)]*'review'\)/.test(line)) continue;
      assert.ok(!/approve|reject|complete|refund|credit|debit|topUp|funding/i.test(line),
        file + ' gates a money action on review: ' + line.trim().slice(0, 140));
    }
  }
});

console.log('\n' + passed + ' checks passed.\n');
