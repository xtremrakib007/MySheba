'use strict';
// IIMMPACT's recorded wholesale cost: read from a reply or callback, kept per
// order, and summarised for the superadmin's cost check.
const assert = require('assert');
const log = require('../functions/iimmpactCostLog');

function fakeDb() {
  const store = new Map();
  return {
    store,
    collection: (name) => ({
      doc: (id) => ({ set: async (data, opts) => { const key = name + '/' + id; store.set(key, opts && opts.merge ? { ...(store.get(key) || {}), ...data } : data); } }),
      where: (field, op, value) => ({
        limit: () => ({
          get: async () => ({ docs: [...store.entries()].filter(([k, v]) => k.startsWith(name + '/') && v[field] === value).map(([, v]) => ({ data: () => v })) }),
        }),
      }),
    }),
  };
}

(async () => {
  assert.strictEqual(log.costFrom({ data: { cost: '58.1234' } }), 58.1234);
  assert.strictEqual(log.costFrom({ cost: 12 }), 12);
  assert.strictEqual(log.costFrom({ data: { status: 'Succesful' } }), null);
  assert.strictEqual(log.costFrom(null), null);

  const db = fakeDb();
  assert.strictEqual(await log.record(db, { refid: 'r1', productCode: 'NPL', face: 5000, cost: 55 }, new Date(1000)), true);
  assert.strictEqual(await log.record(db, { refid: 'r2', productCode: 'NPL', face: 1000, cost: 11.5 }, new Date(2000)), true);
  assert.strictEqual(await log.record(db, { refid: 'r3', productCode: 'NPL', face: 2000, cost: 22 }, new Date(3000)), true);
  assert.strictEqual(await log.record(db, { refid: 'r4', productCode: 'NPL', face: 0, cost: 22 }), false, 'no face, no record');
  assert.strictEqual(await log.record(db, { refid: '', productCode: 'NPL', face: 10, cost: 1 }), false, 'no refid, no record');

  const { rows, medianRate } = await log.recent(db, 'NPL');
  assert.deepStrictEqual(rows.map((r) => r.face), [2000, 1000, 5000], 'newest first');
  assert.strictEqual(medianRate, 0.011);
  console.log('iimmpactCostLog tests: PASS');
})().catch((e) => { console.error(e); process.exit(1); });

// JomPAY's directory names the biller in display_name, with its own limits.
{
  const { normalizeBillers, findBiller } = require('../functions/jompayBillers');
  const billers = normalizeBillers({ message: 'success', data: [
    { biller_code: '818625', display_name: 'TADIKA DIDIKAN SOLEH PLT.', min: '1.00', max: '30000.00', suggested_category: 'Education', description: null },
    { biller_code: '779264', display_name: 'RIM PRO AUTOMOTIVE.', min: '1.00', max: '30000.00', suggested_category: null },
  ] });
  assert.strictEqual(billers.length, 2);
  assert.deepStrictEqual(findBiller(billers, '818625'), { code: '818625', name: 'TADIKA DIDIKAN SOLEH PLT.', min: 1, max: 30000, category: 'Education' });
  assert.strictEqual(findBiller(billers, '779264').category, undefined);
  console.log('JomPAY biller names: PASS');
}

// Purchases route through the fixed-IP connector only when one is named.
{
  const { egressOptions } = require('../functions/egress');
  const before = process.env.IIMMPACT_VPC_CONNECTOR;
  delete process.env.IIMMPACT_VPC_CONNECTOR;
  assert.deepStrictEqual(egressOptions(), {}, 'unset: functions unchanged');
  process.env.IIMMPACT_VPC_CONNECTOR = 'mysheba-connector';
  assert.deepStrictEqual(egressOptions(), { vpcConnector: 'mysheba-connector', vpcConnectorEgressSettings: 'ALL_TRAFFIC' });
  if (before === undefined) delete process.env.IIMMPACT_VPC_CONNECTOR; else process.env.IIMMPACT_VPC_CONNECTOR = before;
  const fs = require('fs');
  const wallet = fs.readFileSync(require('path').join(__dirname, '..', 'functions/walletService.js'), 'utf8');
  for (const name of ['chargeRecharge', 'chargeIimmpactProduct', 'chargeBillPayment', 'chargeInternetPackage']) {
    assert.ok(new RegExp(`exports\\.${name}=onCall\\(\\{ enforceAppCheck: ENFORCE_APP_CHECK, \\.\\.\\.egressOptions\\(\\) \\}`).test(wallet), name + ' uses the egress options');
  }
  console.log('Fixed-IP egress option: PASS');
}
