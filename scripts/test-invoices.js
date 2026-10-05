#!/usr/bin/env node
'use strict';
/**
 * Invoices, and the two names on each one.
 *
 * An invoice is kept so that a payment to a provider, or money put into the
 * business, can be answered for months later. The answer anybody wants is not
 * the amount - that is on the bank statement - it is who decided. So the record
 * carries who raised it and who approved it, each with the moment they did.
 *
 * Which makes one rule load-bearing: the same person cannot do both. Without
 * it the two names are the same name and the record proves nothing it claims
 * to. Most of what follows is that rule, approached from different directions.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rules = require('../functions/invoiceRules');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

console.log('\nWhat counts as an invoice');

test('the two kinds are the two that were asked for', () => {
  assert.deepStrictEqual(rules.INVOICE_KINDS, ['investment', 'providerPayment']);
  for (const kind of rules.INVOICE_KINDS) {
    assert.strictEqual(rules.readInvoice({ kind, party: 'iimmpact', amount: 10 }).ok, true, kind);
  }
  assert.strictEqual(rules.readInvoice({ kind: 'expense', party: 'a', amount: 10 }).ok, false);
  assert.strictEqual(rules.readInvoice({ kind: '', party: 'a', amount: 10 }).ok, false);
});

test('it has to name who it is for', () => {
  // A provider payment with a blank payee cannot be reconciled against
  // anything, which defeats keeping it.
  assert.strictEqual(rules.readInvoice({ kind: 'investment', party: '  ', amount: 10 }).ok, false);
  assert.strictEqual(rules.readInvoice({ kind: 'investment', amount: 10 }).ok, false);
});

test('the amount is a whole number of cents, above zero', () => {
  const ok = (amount) => rules.readInvoice({ kind: 'investment', party: 'a', amount }).ok;
  assert.strictEqual(ok(0.01), true);
  assert.strictEqual(ok(1500.5), true);
  assert.strictEqual(ok('250.25'), true, 'a form sends strings');
  for (const bad of [0, -1, 10.005, NaN, Infinity, null, undefined, '', 'abc', {}, rules.MAX_AMOUNT + 1]) {
    assert.strictEqual(ok(bad), false, 'accepted ' + JSON.stringify(bad));
  }
});

test('money() keeps the value it accepted', () => {
  assert.strictEqual(rules.money(1500.5), 1500.5);
  assert.strictEqual(rules.money('0.07'), 0.07);
  assert.strictEqual(rules.money(10.005), null);
});

test('currency defaults to MYR and must be a code', () => {
  assert.strictEqual(rules.readInvoice({ kind: 'investment', party: 'a', amount: 1 }).invoice.currency, 'MYR');
  assert.strictEqual(rules.readInvoice({ kind: 'investment', party: 'a', amount: 1, currency: 'usd' }).invoice.currency, 'USD');
  assert.strictEqual(rules.readInvoice({ kind: 'investment', party: 'a', amount: 1, currency: 'ringgit' }).ok, false);
});

console.log('\nThe rule the record depends on');

test('nobody approves their own invoice', () => {
  // The whole point. If this passes, both names on the record can be one
  // person and the second one is decoration.
  const invoice = { status: 'pending', createdBy: 'finance-1' };
  const self = rules.approvalDecision({ invoice, actorUid: 'finance-1' });
  assert.strictEqual(self.ok, false);
  assert.ok(/somebody other than the person who raised it/.test(self.reason), self.reason);
});

test('somebody else can', () => {
  assert.strictEqual(rules.approvalDecision({ status: 'x' }).ok, false, 'a non-invoice is not approvable');
  assert.strictEqual(
    rules.approvalDecision({ invoice: { status: 'pending', createdBy: 'finance-1' }, actorUid: 'finance-2' }).ok,
    true);
});

test('a decision cannot be made twice', () => {
  for (const status of ['approved', 'rejected']) {
    const out = rules.approvalDecision({ invoice: { status, createdBy: 'a' }, actorUid: 'b' });
    assert.strictEqual(out.ok, false, status);
    // Named, or the second approver goes hunting for a permission problem.
    assert.ok(out.reason.includes(status), out.reason);
  }
});

test('an unsigned caller decides nothing', () => {
  assert.strictEqual(rules.approvalDecision({ invoice: { status: 'pending', createdBy: 'a' }, actorUid: '' }).ok, false);
  assert.strictEqual(rules.approvalDecision({ invoice: { status: 'pending', createdBy: 'a' } }).ok, false);
});

test('a missing invoice is refused, not treated as approvable', () => {
  assert.strictEqual(rules.approvalDecision({ invoice: null, actorUid: 'b' }).ok, false);
});

console.log('\nInvoice numbers');

test('they are unique-shaped and sorted by year', () => {
  assert.strictEqual(rules.invoiceNumber(2026, 1), 'MSI-2026-00001');
  assert.strictEqual(rules.invoiceNumber(2026, 42), 'MSI-2026-00042');
  assert.ok(rules.invoiceNumber(2026, 2) > rules.invoiceNumber(2026, 1), 'they must sort');
});

test('nonsense gets no number at all', () => {
  for (const [y, n] of [[1999, 1], [2026, 0], [2026, -1], [2026, 1.5], ['x', 1], [2026, 1000000]]) {
    assert.strictEqual(rules.invoiceNumber(y, n), '', y + '/' + n);
  }
});

console.log('\nWhat the service writes, and refuses to');

const service = read('functions/invoiceService.js');

test('both names and both times are server-written', () => {
  // A date the client could choose is not evidence of anything.
  for (const field of ['createdBy', 'createdByName', 'createdByRole', 'approvedBy', 'approvedByName', 'approvedByRole']) {
    assert.ok(new RegExp(field + ':').test(service), field + ' is not recorded');
  }
  assert.ok(/createdAt: admin\.firestore\.FieldValue\.serverTimestamp\(\)/.test(service));
  assert.ok(/approvedAt: admin\.firestore\.FieldValue\.serverTimestamp\(\)/.test(service));
});

test('the self-approval rule is checked inside the transaction', () => {
  // Outside it, two approvers pressing at once both read 'pending' and both
  // win, and the last write silently replaces the first approver's name.
  const decide = /function decide\(action\)[\s\S]*?\n\}/.exec(service);
  assert.ok(decide, 'decide() must be findable');
  const body = decide[0];
  const txAt = body.indexOf('runTransaction');
  const checkAt = body.indexOf('approvalDecision(');
  assert.ok(txAt >= 0 && checkAt > txAt, 'approvalDecision must run inside runTransaction');
  assert.ok(body.indexOf('tx.get(ref)') < checkAt, 'and against a document read inside it');
});

test('approve and reject share one implementation', () => {
  // Two copies is how one of them ends up without the self-approval check.
  assert.ok(/exports\.approveInvoice = decide\('approved'\)/.test(service));
  assert.ok(/exports\.rejectInvoice = decide\('rejected'\)/.test(service));
});

test('raising one needs finance, and reading allows reports', () => {
  // Scoped to each callable's own body: searching the whole file matched
  // decide()'s capability check, so dropping createInvoice's changed nothing.
  const create = /exports\.createInvoice = onCall\([\s\S]*?\n\}\);/.exec(service);
  assert.ok(create, 'createInvoice must be findable');
  assert.ok(/actorOf\(db, request, 'finance'\)/.test(create[0]), 'raising must need finance');

  const decide = /function decide\(action\)[\s\S]*?\n\}/.exec(service);
  assert.ok(/actorOf\(db, request, 'finance'\)/.test(decide[0]), 'deciding must need finance');

  const list = /exports\.listInvoices = onCall\([\s\S]*?\n\}\);/.exec(service);
  assert.ok(list, 'listInvoices must be findable');
  assert.ok(/actorOf\(db, request, 'reports'\)/.test(list[0]), 'reading must also allow reports');
  // And reading must not be the only thing finance can do with it.
  assert.ok(/actorOf\(db, request, 'finance'\)/.test(list[0]), 'finance reads it too');
});

test('a rejection has to say why', () => {
  assert.ok(/action === 'rejected' && !note/.test(service),
    'a rejection with no reason tells the person who raised it nothing');
});

test('the number comes from a counter, not a count', () => {
  // Counting the collection hands the same number to two people raising an
  // invoice in the same second.
  assert.ok(/async function nextNumber\(tx, db, year\)/.test(service));
  assert.ok(/tx\.get\(ref\)/.test(service));
  assert.ok(!/\.count\(\)/.test(service), 'a count would not be unique');
});

console.log('\nNobody writes an invoice from a client');

test('the rules close every write', () => {
  const text = read('firestore.rules');
  const line = text.split('\n').find((l) => l.includes('match /invoices/{id}'));
  assert.ok(line, 'the invoices rule must exist');
  assert.ok(/allow create, update, delete: if false;/.test(line),
    'a client that could write here could approve its own invoice');
  assert.ok(/allow read: if activeProfile\(\) && \(can\('finance'\) \|\| can\('reports'\)\)/.test(line));
  // The counter decides invoice numbers; a client that could edit it could
  // reissue one.
  const counter = text.split('\n').find((l) => l.includes('match /counters/{id}'));
  assert.ok(counter && /allow read, write: if false;/.test(counter), 'the counter must be server-only');
});

test('the callables are actually registered', () => {
  const index = read('functions/index.js');
  for (const fn of ['createInvoice', 'approveInvoice', 'rejectInvoice', 'listInvoices']) {
    assert.ok(new RegExp('exports\\.' + fn + ' = require').test(index), fn + ' is not deployed');
  }
});

console.log('\n' + passed + ' checks passed.\n');
