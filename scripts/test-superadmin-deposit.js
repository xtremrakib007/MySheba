#!/usr/bin/env node
'use strict';
/**
 * Money enters MySheba in one place: the superadmin records a real bank
 * deposit (functions/superadminDepositService.js). Runs the callable against
 * an in-memory Firestore, with rate limiting, audit logging and the receipt
 * check stubbed.
 */
const assert = require('assert');
const Module = require('module');
const path = require('path');

// ---- an in-memory Firestore, enough for this callable ----
const store = new Map();
const docRef = (col, id) => ({
  id, path: `${col}/${id}`,
  get: async () => snap(`${col}/${id}`, id),
});
const snap = (key, id) => ({ id, exists: store.has(key), data: () => (store.has(key) ? { ...store.get(key) } : undefined), ref: docRef(key.split('/')[0], id) });
let autoId = 0;
const db = {
  collection: (col) => ({ doc: (id = `auto${++autoId}`) => docRef(col, id) }),
  runTransaction: async (fn) => {
    const writes = [];
    const tx = {
      get: async (ref) => snap(ref.path, ref.id),
      update: (ref, data) => writes.push(() => store.set(ref.path, { ...store.get(ref.path), ...data })),
      create: (ref, data) => writes.push(() => { if (store.has(ref.path)) throw new Error('exists'); store.set(ref.path, data); }),
      set: (ref, data) => writes.push(() => store.set(ref.path, data)),
    };
    const out = await fn(tx);
    writes.forEach((w) => w());
    return out;
  },
};
const audits = [];
const fakeAdmin = { firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'now' } }) };
const stubs = {
  'firebase-admin': fakeAdmin,
  './rateLimitService': { checkVelocity: async () => {}, getClientIp: () => '' },
  './logService': { logAudit: async (e) => audits.push(e), logServerError: async () => {} },
  './topupSubmissionService': { validateReceiptUrl: async (url, uid) => { if (!url.includes(uid)) throw new Error('not yours'); } },
};
const load = Module._load;
Module._load = function (request, parent, ...rest) {
  if (parent && parent.filename && parent.filename.includes(`${path.sep}functions${path.sep}`) && stubs[request]) return stubs[request];
  return load.call(this, request, parent, ...rest);
};

const service = require('../functions/superadminDepositService');
const run = (data, { uid = 'boss', authAgo = 60 } = {}) => service.recordSuperadminDeposit.run({
  auth: { uid, token: { auth_time: Math.floor(Date.now() / 1000) - authAgo } },
  data: { sessionId: 'S'.repeat(20), deviceId: 'D'.repeat(20), ...data },
  rawRequest: { headers: {}, ip: '' },
});
const user = (id, role, balance = 0) => store.set(`users/${id}`, {
  role, walletBalance: balance, walletCurrency: 'MYR', name: id,
  activeSessions: { mobile: { sessionId: 'S'.repeat(20), deviceId: 'D'.repeat(20) } },
  activeSessionId: 'S'.repeat(20), activeDeviceId: 'D'.repeat(20),
});
const deposit = (extra = {}) => ({ amount: '1000', bankName: 'Maybank', refNo: 'MBB12345', receiptUrl: 'https://x/topup-receipts/boss/1.jpg', requestId: 'deposit_aaaaaaaa1', ...extra });
const refusal = async (promise, re, label) => {
  await assert.rejects(promise, (e) => re.test(String(e.message)), label);
};

(async () => {
  user('boss', 'superadmin', 50);
  user('adm', 'admin', 0);
  const { sessionMatches } = require('../functions/sessionSlots');
  if (!sessionMatches(store.get('users/boss'), { sessionId: 'S'.repeat(20), deviceId: 'D'.repeat(20) })) {
    throw new Error('test fixture: session fields do not match sessionSlots');
  }

  console.log('A deposit credits the superadmin and leaves a trail');
  const out = await run(deposit());
  assert.strictEqual(out.amount, 1000);
  assert.strictEqual(store.get('users/boss').walletBalance, 1050, 'balance 50 + 1000');
  const record = store.get(`selfTopups/${out.id}`);
  assert.strictEqual(record.kind, 'deposit');
  assert.strictEqual(record.refNo, 'MBB12345');
  assert.strictEqual(record.userId, 'boss', 'History shows it to the superadmin');
  const ledger = [...store.entries()].filter(([k]) => k.startsWith('walletLedger/')).map(([, v]) => v);
  assert.strictEqual(ledger.length, 1);
  assert.deepStrictEqual([ledger[0].type, ledger[0].direction, ledger[0].amount, ledger[0].balanceBefore, ledger[0].balanceAfter], ['superadmin_deposit', 'credit', 1000, 50, 1050]);
  assert.strictEqual(audits.length, 1);

  console.log('A retried tap is one deposit');
  const again = await run(deposit());
  assert.strictEqual(again.duplicate, true);
  assert.strictEqual(store.get('users/boss').walletBalance, 1050, 'not credited twice');

  console.log('A bank reference is recorded once, however it is typed');
  await refusal(run(deposit({ requestId: 'deposit_bbbbbbbb2', refNo: 'mbb 12345', bankName: 'MAYBANK' })), /already recorded/, 'same reference, new request');
  assert.strictEqual(store.get('users/boss').walletBalance, 1050);

  console.log('Nobody else can do it');
  await refusal(run(deposit({ requestId: 'deposit_cccccccc3', refNo: 'X999' }), { uid: 'adm' }), /Only the superadmin/, 'an admin');
  assert.strictEqual(store.get('users/adm').walletBalance, 0);

  console.log('It needs a fresh sign-in');
  await refusal(run(deposit({ requestId: 'deposit_dddddddd4', refNo: 'X998' }), { authAgo: 16 * 60 }), /Recent authentication/, 'stale sign-in');

  console.log('It needs the evidence');
  for (const [extra, re] of [
    [{ refNo: '' }, /reference/], [{ bankName: '' }, /bank/], [{ receiptUrl: '' }, /receipt/],
    [{ amount: '0' }, /valid amount/], [{ amount: '-5' }, /valid amount/], [{ amount: '1.234' }, /valid amount/],
    [{ amount: '50000.01' }, /at most/], [{ requestId: 'x' }, /requestId/],
  ]) {
    await refusal(run(deposit({ requestId: 'deposit_eeeeeeee5', refNo: 'X997', ...extra })), re, JSON.stringify(extra));
  }
  await refusal(run(deposit({ requestId: 'deposit_ffffffff6', refNo: 'X996', receiptUrl: 'https://x/topup-receipts/adm/1.jpg' })), /not yours/, "someone else's receipt");
  assert.strictEqual(store.get('users/boss').walletBalance, 1050, 'no refused deposit moved money');

  console.log('A frozen wallet takes nothing');
  store.set('users/boss', { ...store.get('users/boss'), walletFrozen: true });
  await refusal(run(deposit({ requestId: 'deposit_gggggggg7', refNo: 'X995' })), /frozen/, 'frozen wallet');
  assert.strictEqual(store.get('users/boss').walletBalance, 1050);

  console.log('\nsuperadmin deposit tests: PASS');
})().catch((e) => { console.error(e); process.exit(1); });
