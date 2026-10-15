#!/usr/bin/env node
'use strict';
/**
 * Commission by role (commissionRules.byRole): a customer earns nothing on
 * Recharge, Internet or Bill Payment unless the superadmin sets a value; other
 * roles use their own value or the general rule. The app
 * (src/utils/commission.js) and the server (functions/commissionService.js)
 * must agree, and the save must reject anything malformed.
 */
const assert = require('assert');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const runEsm = (rel) => {
  const code = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: 'cjs', write: false, logLevel: 'silent' }).outputFiles[0].text;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
};
const server = require('../functions/commissionService');
const client = runEsm('src/utils/commission.js');
const { cleanCommissionRules } = require('../functions/pricingMutationService')._test;

const general = { commissionRules: {
  recharge: { type: 'percent', value: 2 },
  internet: { type: 'percent', value: 1 },
} };
const withRoles = { commissionRules: { ...general.commissionRules, byRole: {
  retail: { recharge: { type: 'percent', value: 1.5 } },
  customer: { internet: { type: 'percent', value: 0.5 } },
} } };

const cases = [
  [general, 'customer', 'recharge', 100, 0],
  [general, 'customer', 'internet', 100, 0],
  [general, 'customer', 'billpayment', 30, 0],
  [general, 'retail', 'recharge', 100, 2],
  [general, 'dealer', 'internet', 100, 1],
  [withRoles, 'retail', 'recharge', 100, 1.5],
  [withRoles, 'retail', 'internet', 100, 1],
  [withRoles, 'customer', 'internet', 100, 0.5],
  [withRoles, 'customer', 'recharge', 100, 0],
];
for (const [settings, role, service, amount, want] of cases) {
  const s = server.resolveCommission(settings, { service, amount, role });
  const c = client.resolveCommission(settings, { service, amount, role });
  assert.strictEqual(s, want, `server ${role} ${service}: ${s} != ${want}`);
  assert.strictEqual(c, s, `app and server disagree for ${role} ${service}`);
}

// The save keeps valid per-role rules and refuses bad ones. The card sends
// the full rule set (general rules plus byRole), as here.
const full = { ...server.DEFAULT_RULES, ...general.commissionRules };
const cleaned = cleanCommissionRules({ ...full, byRole: withRoles.commissionRules.byRole });
assert.deepStrictEqual(cleaned.byRole.retail.recharge, { type: 'percent', value: 1.5 });
for (const bad of [
  { superadmin: { recharge: { type: 'percent', value: 1 } } },
  { retail: { remittance: { type: 'fixed', value: 1 } } },
  { retail: { recharge: { type: 'percent', value: -1 } } },
  { retail: { recharge: { type: 'percent', value: 150 } } },
]) {
  assert.throws(() => cleanCommissionRules({ ...full, byRole: bad }), `accepted ${JSON.stringify(bad)}`);
}

// Per product (commissionRules.products.<code>.<role>): beats the role table,
// covers every service but payouts, and is the only commission on vouchers.
const withProducts = { commissionRules: { ...withRoles.commissionRules, products: {
  DI: { retail: { type: 'percent', value: 3 }, customer: { type: 'percent', value: 0.2 } },
  TNB: { dealer: { type: 'fixed', value: 0.5 } },
  GOOGLEPLAY: { retail: { type: 'fixed', value: 0.4 } },
} } };
const pay = (code) => ({ raw: { productCode: code } });
const productCases = [
  ['retail', 'recharge', 100, pay('DI'), 3],
  ['customer', 'recharge', 100, pay('DI'), 0.2],
  ['dealer', 'recharge', 100, pay('DI'), 2],          // no DI rule for dealer: general
  ['retail', 'recharge', 100, pay('CEL'), 1.5],       // another operator: role table
  ['dealer', 'billpayment', 80, pay('TNB'), 0.5],
  ['retail', 'rechargePin', 50, pay('GOOGLEPLAY'), 0.4],
  ['customer', 'rechargePin', 50, pay('GOOGLEPLAY'), 0],
  ['retail', 'rechargePin', 50, pay('OTHER'), 0],     // vouchers: product rules only
];
for (const [role, service, amount, payload, want] of productCases) {
  const s = server.resolveCommission(withProducts, { service, amount, role, payload });
  const c = client.resolveCommission(withProducts, { service, amount, role, payload });
  assert.strictEqual(s, want, `server ${role} ${service} ${payload.raw.productCode}: ${s} != ${want}`);
  assert.strictEqual(c, s, `app and server disagree for ${role} ${service} ${payload.raw.productCode}`);
}
// A product rule never touches a payout (remittance keeps its own tiers).
assert.strictEqual(server.resolveCommission(withProducts, { service: 'remittance', amount: 500, role: 'retail', payload: pay('DI') }),
  server.resolveCommission(withRoles, { service: 'remittance', amount: 500, role: 'retail', payload: pay('DI') }));
// operatorCode works when productCode is absent (Internet sends both).
assert.strictEqual(server.resolveCommission(withProducts, { service: 'internet', amount: 100, role: 'retail', payload: { raw: { operatorCode: 'DI' } } }), 3);

const cleanedProducts = cleanCommissionRules({ ...full, products: withProducts.commissionRules.products });
assert.deepStrictEqual(cleanedProducts.products.TNB, { dealer: { type: 'fixed', value: 0.5 } });
for (const bad of [
  { 'bad code!': { retail: { type: 'percent', value: 1 } } },
  { DI: { superadmin: { type: 'percent', value: 1 } } },
  { DI: { retail: { type: 'percent', value: 101 } } },
  { DI: { retail: { type: 'bonus', value: 1 } } },
  { DI: [] },
]) {
  assert.throws(() => cleanCommissionRules({ ...full, products: bad }), `accepted ${JSON.stringify(bad)}`);
}
console.log('role commission: ok');
