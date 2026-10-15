#!/usr/bin/env node
'use strict';
/**
 * Commissions must still be there when the Pricing page is opened again.
 * Runs the real savePricingSettings handler against an in-memory Firestore
 * and reads the document back; checks the app notices a server that drops
 * per-role / per-product commissions instead of reporting "Saved".
 */
const assert = require('assert');
const path = require('path');
const esbuild = require('esbuild');

const F = path.join(__dirname, '../functions');
const store = { 'settings/pricing': { markups: { services: { recharge: { percent: 1, fixed: 0 } } } }, 'users/u1': { role: 'superadmin' } };
const docRef = (p) => ({
  path: p,
  get: async () => ({ exists: !!store[p], data: () => JSON.parse(JSON.stringify(store[p] || {})) }),
  set: async (data, opts = {}) => {
    const clean = JSON.parse(JSON.stringify(data, (k, v) => (v && v._ts ? 'TS' : v)));
    if (opts.mergeFields) { const cur = store[p] || {}; for (const f of opts.mergeFields) cur[f] = clean[f]; store[p] = cur; }
    else if (opts.merge) store[p] = { ...(store[p] || {}), ...clean };
    else store[p] = clean;
  },
});
const db = { collection: (c) => ({ doc: (id) => docRef(c + '/' + id) }) };
const admin = { firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => ({ _ts: 1 }) } }), initializeApp() {} };
require.cache[require.resolve('firebase-admin', { paths: [F] })] = { exports: admin };
require.cache[require.resolve(path.join(F, 'rateLimitService.js'))] = { exports: { checkVelocity: async () => {}, getClientIp: () => '1.1.1.1' } };
require.cache[require.resolve(path.join(F, 'logService.js'))] = { exports: { logAudit: async () => {}, logServerError: async () => {} } };
const { savePricingSettings } = require(path.join(F, 'pricingMutationService.js'));

const general = {
  recharge: { type: 'fixed', value: 0 }, internet: { type: 'fixed', value: 0 },
  billTiers: [{ minAmount: 10, maxAmount: 50, fee: 0.1 }], remittanceTiers: [{ minAmount: 1, maxAmount: null, fee: 10 }], touchNGoFeePercent: 0.5,
};
const save = (key, value) => savePricingSettings.run({ auth: { uid: 'u1', token: { auth_time: Math.floor(Date.now() / 1000) } }, data: { key, value }, rawRequest: { headers: {}, ip: '1.1.1.1' } });

(async () => {
  const byRole = { retail: { recharge: { type: 'percent', value: 1.5 } } };
  const products = { UP: { customer: { type: 'percent', value: 3.1 }, retail: { type: 'percent', value: 4.1 } }, S: { retail: { type: 'percent', value: 2 } } };
  await save('commissionRules', { ...general, byRole, products });
  let stored = store['settings/pricing'].commissionRules;
  assert.deepStrictEqual(stored.products, products, 'per-product commissions are stored');
  assert.deepStrictEqual(stored.byRole, byRole, 'per-role commissions are stored');

  // Saving markups, or the general commission rules alone, keeps them.
  await save('markups', { services: { recharge: { percent: 2, fixed: 0 } }, countries: {}, products: {}, prices: {} });
  await save('commissionRules', { ...general, touchNGoFeePercent: 0.7 });
  stored = store['settings/pricing'].commissionRules;
  assert.deepStrictEqual(stored.products, products, 'kept after other saves');
  assert.deepStrictEqual(stored.byRole, byRole);
  assert.strictEqual(stored.touchNGoFeePercent, 0.7);

  // An unknown field is refused, never silently dropped.
  await assert.rejects(save('commissionRules', { ...general, productz: {} }), /Unknown commission setting/);

  // The app's read-back check (src/firebase/apiProviderService.js).
  const code = (await esbuild.build({ stdin: { contents: "export { commissionRulesMissing } from '../src/firebase/apiProviderService.js';", resolveDir: __dirname },
    bundle: true, format: 'cjs', write: false, logLevel: 'silent', external: ['firebase/*', '@react-native-async-storage/*', 'react-native', 'expo-*'],
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\.\/config$/ }, () => ({ path: 'config', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const functions={}, db={}, auth={};' })); } }],
  })).outputFiles[0].text;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, (id) => (/^firebase\//.test(id) ? { httpsCallable: () => () => {}, doc: () => {}, getDoc: () => {} } : {}));
  const { commissionRulesMissing } = m.exports;
  assert.strictEqual(commissionRulesMissing({ byRole, products }, { byRole, products }), '');
  assert.strictEqual(commissionRulesMissing({ byRole, products }, { byRole }), 'commissions by product', 'an old server dropping products is caught');
  assert.strictEqual(commissionRulesMissing({ byRole, products }, {}), 'commissions by role');
  console.log('pricing save: ok');
})().catch((e) => { console.error(e); process.exit(1); });
