#!/usr/bin/env node
'use strict';
/**
 * Set prices: the exact price a role pays for one product and face amount
 * (markups.prices, e.g. Digi RM5 -> Retail RM4.90, Customer RM4.92).
 * The app (src/utils/markup.js) and the server (functions/markupService.js)
 * must agree, the set price must win over percentage rules, and the save
 * must reject anything malformed.
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
const server = require('../functions/markupService');
const client = runEsm('src/utils/markup.js');

const pricing = { markups: {
  services: { recharge: { percent: 2, fixed: 0 } },
  products: { DI: { percent: 1, fixed: 0 } },
  prices: { 'DI|5.00': { customer: 4.92, retail: 4.9 } },
} };
const sale = (role, amount = 5, service = 'recharge') => ({ service, country: 'MY', productCode: 'DI', amount, role });

console.log('A set price is the price for that role');
assert.deepStrictEqual(server.applyMarkup(pricing, sale('retail')), { amount: 4.9, markup: -0.1, fixedPrice: true });
assert.deepStrictEqual(server.applyMarkup(pricing, sale('customer')), { amount: 4.92, markup: -0.08, fixedPrice: true });
assert.strictEqual(server.applyMarkup(pricing, sale('user')).amount, 4.92, "a legacy 'user' is a customer");

console.log('Everything else keeps the markup');
assert.deepStrictEqual(server.applyMarkup(pricing, sale('dealer')), { amount: 5.05, markup: 0.05 }, 'a role with no set price');
assert.deepStrictEqual(server.applyMarkup(pricing, sale('retail', 10)), { amount: 10.1, markup: 0.1 }, 'another amount');
assert.strictEqual(server.applyMarkup(pricing, sale('retail', 5, 'remittance')).amount, 5, 'payouts are never priced here');

console.log('The app shows exactly what the server charges');
for (const role of ['customer', 'retail', 'reseller', 'dealer', 'admin', 'user', undefined]) {
  for (const amount of [5, 10, 4.99]) {
    assert.deepStrictEqual(client.applyMarkup(pricing, sale(role, amount)), server.applyMarkup(pricing, sale(role, amount)), `${role} ${amount}`);
  }
}
assert.strictEqual(client.priceKey('DI', 5), 'DI|5.00');

console.log('The save accepts set prices and refuses bad ones');
const Module = require('module');
const load = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === 'firebase-admin') return { firestore: Object.assign(() => ({}), { FieldValue: {} }) };
  return load.call(this, request, parent, ...rest);
};
const svc = require('../functions/pricingMutationService');
Module._load = load;
const clean = svc._test && svc._test.cleanMarkups;
if (clean) {
  const out = clean({ prices: { 'DI|5.00': { customer: '4.92', retail: 4.9, dealer: '' } } });
  assert.deepStrictEqual(out.prices, { 'DI|5.00': { customer: 4.92, retail: 4.9 } });
  for (const bad of [{ 'DI|5': { customer: 4 } }, { 'DI|5.00': { boss: 4 } }, { 'DI|5.00': { customer: -1 } }, { 'bad code|5.00': { customer: 4 } }]) {
    assert.throws(() => clean({ prices: bad }), JSON.stringify(bad));
  }
} else {
  console.log('  (cleanMarkups is not exported for tests; skipped)');
}

console.log('\nset price tests: PASS');
