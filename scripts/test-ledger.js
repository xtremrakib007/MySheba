#!/usr/bin/env node
'use strict';
/**
 * One ledger out of six collections.
 *
 * None of them agree on anything: a top-up names its user `userId`, an order
 * calls the same person `customerId`, transfers use `fromUid`/`toUid`, and a
 * funding request keeps what was actually sent in `transferredAmount` because
 * `amount` is what was asked for. A report per collection is four partial
 * pictures and no total, and "50.00 moved" without saying between whom cannot
 * be checked against a person.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'ledger.js'), 'utf8')
  .replace(/^export (const|function) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?$/gm, '');
const mod = {};
new Function('module', 'exports',
  `${src}\nmodule.exports={buildLedger,filterLedger,totalsByCurrency,ledgerToCsv,LEDGER_KINDS};`)(mod, {});
const { buildLedger, filterLedger, totalsByCurrency, ledgerToCsv } = mod.exports;

const names = {
  u1: { name: 'Allen Mithu', phone: '0123456789', role: 'customer' },
  f1: { name: 'Fatima Finance', phone: '0111111111', role: 'finance' },
  a1: { name: 'Admin One', phone: '0122222222', role: 'admin' },
};

const sources = {
  topups: [{ id: 't1', userId: 'u1', amount: 50, currency: 'MYR', status: 'approved', createdAt: 1000, completedBy: 'f1' }],
  transactions: [{ id: 'x1', customerId: 'u1', service: 'Recharge', cost: 10, currency: 'MYR', status: 'completed', createdAt: 3000 }],
  pointTransfers: [{ id: 'p1', fromUid: 'a1', toUid: 'f1', amount: 500, createdAt: 2000 }],
  walletTransfers: [{ id: 'w1', fromUid: 'u1', toUid: 'f1', amount: 5, currency: 'MYR', createdAt: 4000 }],
  fundingRequests: [
    { id: 'r1', fromUid: 'f1', decidedBy: 'a1', status: 'approved', transferredAmount: 300, currency: 'MYR', decidedAt: 5000 },
    { id: 'r2', fromUid: 'f1', status: 'pending', amount: 999, createdAt: 6000 },
  ],
  selfTopups: [{ id: 's1', userId: 'a1', amount: 20, createdAt: 500 }],
};

console.log('Every source lands in one list');
const rows = buildLedger(sources, names);
assert.strictEqual(rows.length, 6, 'six movements, and the pending funding request is not one');
assert.deepStrictEqual(rows.map((r) => r.at), [5000, 4000, 3000, 2000, 1000, 500], 'newest first');
// A request that was never approved moved nothing; counting it would overstate
// what was paid.
assert(!rows.some((r) => r.id === 'fund:r2'), 'a pending funding request is not a movement');

console.log('Both sides are named, not numbered');
for (const r of rows) {
  assert(r.from && r.to, `${r.id} is missing a side`);
  assert(!/^u1$|^f1$|^a1$/.test(r.from.name), `${r.id} shows a raw id instead of a name`);
}
const topup = rows.find((r) => r.id === 'topup:t1');
// The approver pays out of their own wallet, so they are the other side.
assert.strictEqual(topup.from.name, 'Fatima Finance', 'a top-up is paid by whoever approved it');
assert.strictEqual(topup.to.name, 'Allen Mithu');
assert.strictEqual(topup.to.phone, '0123456789', 'the phone is how a person is identified in a dispute');
const funding = rows.find((r) => r.id === 'fund:r1');
assert.strictEqual(funding.amount, 300, 'funding reports what was sent, not what was asked for');
assert.strictEqual(funding.from.name, 'Admin One');

// An unknown id must still say something, or a row becomes unreadable.
const orphan = buildLedger({ pointTransfers: [{ id: 'p9', fromUid: 'ghost', toUid: 'u1', amount: 1 }] }, names);
assert(/Unknown/.test(orphan[0].from.name), 'an id with no profile still has to read as something');

console.log('Filtering and totals');
assert.strictEqual(filterLedger(rows, { kind: 'transfer' }).length, 2);
assert.strictEqual(filterLedger(rows, { uid: 'u1' }).length, 3, 'both sides count when filtering by person');
assert.strictEqual(filterLedger(rows, { search: 'fatima' }).length, 4, 'search covers both sides by name');
assert.strictEqual(filterLedger(rows, { from: 3000 }).length, 3, 'a date floor is inclusive');
// Adding MYR to BDT would be a made-up number.
const mixed = buildLedger({ pointTransfers: [
  { id: 'a', fromUid: 'u1', toUid: 'f1', amount: 10, currency: 'MYR' },
  { id: 'b', fromUid: 'u1', toUid: 'f1', amount: 20, currency: 'BDT' },
] }, names);
assert.deepStrictEqual(totalsByCurrency(mixed), { MYR: 10, BDT: 20 }, 'currencies are totalled apart');

console.log('The export survives real names');
const csv = ledgerToCsv(buildLedger({ pointTransfers: [{
  id: 'c1', fromUid: 'u1', toUid: 'f1', amount: 7, currency: 'MYR', note: 'Refund, as agreed\nsecond line "quoted"',
}] }, names), () => '2026-10-03');
const header = csv.split('\n')[0];
assert(header.startsWith('Date,Type,Detail,From'), 'the header names the columns');
assert.strictEqual(header.split(',').length, 12, 'twelve columns');
// A comma in a note would otherwise shift every later column by one. This is
// asserted against the whole file: a newline inside a quoted field is legal
// CSV, so splitting on newlines would cut the field in half - which is the
// mistake a naive reader of this export would make too.
const quoted = '"Refund, as agreed\nsecond line ""quoted"""';
assert(csv.includes(quoted),
  'commas, newlines and quotes in a note must be escaped, not left to corrupt the file');
// And a field needing none of that is left bare rather than needlessly quoted.
assert(csv.includes(',Allen Mithu,'), 'an ordinary name is not quoted');

console.log('\nOne ledger, both sides named, exportable.');
