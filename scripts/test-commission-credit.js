#!/usr/bin/env node
'use strict';
/**
 * Orders the provider completes later (callback, Success TopUp poll, finance
 * reconcile) must pay the commission they recorded at purchase. They used to
 * mark the order completed and never pay it.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readCommissionPayee, payPendingCommission, pendingCommission } = require('../functions/commissionCredit');

// A minimal in-memory Firestore transaction.
function fakeDb(users) {
  const writes = [];
  const ref = (col, id) => ({ col, id, path: `${col}/${id}` });
  const db = { collection: (col) => ({ doc: (id = 'auto' + writes.length) => ref(col, id) }) };
  const tx = {
    get: async (r) => ({ exists: r.col === 'users' && !!users[r.id], data: () => users[r.id] }),
    update: (r, data) => writes.push(['update', r.path, data]),
    set: (r, data) => writes.push(['set', r.path, data]),
    create: (r, data) => writes.push(['create', r.path, data]),
  };
  return { db, tx, writes };
}

(async () => {
  const order = { customerId: 'u1', customerRole: 'retail', commissionAmount: 0.15, commissionStatus: 'pending', currency: 'MYR', service: 'Recharge' };
  const { db, tx, writes } = fakeDb({ u1: { walletBalance: 10 } });
  const payee = await readCommissionPayee(tx, db, order);
  const fields = payPendingCommission(tx, db, { id: 'T1' }, order, payee);
  assert.strictEqual(fields.commissionStatus, 'earned');
  assert.deepStrictEqual(writes.find((w) => w[1] === 'users/u1')[2], { walletBalance: 10.15 }, 'wallet credited');
  assert.ok(writes.some((w) => w[1].startsWith('commissionLedger/')), 'commission ledger entry');
  assert.ok(writes.filter((w) => w[1] !== 'users/u1').length >= 2, 'wallet ledger entry too');

  // Nothing due: no reads, no writes.
  for (const o of [{ ...order, commissionStatus: 'earned' }, { ...order, commissionStatus: 'none' }, { ...order, commissionAmount: 0 }, { ...order, customerId: '' }]) {
    assert.strictEqual(pendingCommission(o), null);
    const f = fakeDb({ u1: { walletBalance: 10 } });
    assert.deepStrictEqual(payPendingCommission(f.tx, f.db, { id: 'T' }, o, await readCommissionPayee(f.tx, f.db, o)), {});
    assert.strictEqual(f.writes.length, 0);
  }

  // Every path that completes an order later pays it.
  const read = (f) => fs.readFileSync(path.join(__dirname, '../functions', f), 'utf8');
  const webhook = read('apiWebhookService.js');
  assert.strictEqual((webhook.match(/payPendingCommission\(/g) || []).length, 2, 'webhook: voucher and every other service');
  assert.ok(/outcome === 'completed'[\s\S]{0,300}payPendingCommission\(/.test(read('transactionService.js')), 'reconcile pays it');
  assert.ok(/payPendingCommission\(/.test(read('successTopupPoller.js')), 'Success TopUp poller pays it');
  console.log('commission credit: ok');
})().catch((e) => { console.error(e); process.exit(1); });
