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
console.log('role commission: ok');
