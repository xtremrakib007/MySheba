#!/usr/bin/env node
'use strict';
/**
 * An international reload is never sold below its face value at MySheba's
 * own rate. IIMMPACT priced NPR 5,000 at MYR 59.83 when, at the superadmin's
 * rate (37.65 NPR per MYR), it is worth MYR 132.80 - a loss on every order.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const run = (rel) => {
  const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', rel)], bundle: true, format: 'cjs', write: false, logLevel: 'silent' }).outputFiles[0].text;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
};
const server = require('../functions/rateFloor');
const app = run('src/utils/rateFloor.js');
const rates = { rechargeNP: 37.65, rechargeIN: 23.5, rechargePK: 67.79, rechargeTH: 7.5 };

assert.strictEqual(server.rateFloorMyr(5000, 'NP', rates), 132.8);
assert.strictEqual(server.flooredPrice(59.83, 5000, 'NP', rates), 132.8, 'the Nepal case is raised to the rate');
assert.strictEqual(server.flooredPrice(140, 5000, 'NP', rates), 140, "IIMMPACT's higher price is kept");
assert.strictEqual(server.flooredPrice(10, 100, 'XX', rates), 10, 'no rate for the country: unchanged');
assert.strictEqual(server.flooredPrice(10, 100, 'NP', {}), 10, 'no rate set: unchanged');
assert.strictEqual(server.flooredPrice(5, 5, 'MY', rates), 5, 'Malaysia has no rate floor');
assert.strictEqual(server.flooredPrice(20, 300, 'TH', rates), 40, 'Thailand is floored at its THB rate');
assert.strictEqual(server.flooredPrice(20, 300, 'TH', { rechargeNP: 37.65 }), 20, 'Thailand without a THB rate set: unchanged');
for (const args of [[59.83, 5000, 'NP'], [3, 100, 'in'], [1, 0, 'NP'], [20, 1500, 'PK'], [NaN, 100, 'NP']]) {
  assert.strictEqual(app.flooredPrice(...args, rates), server.flooredPrice(...args, rates), 'app and server agree ' + args.join(','));
}
assert.deepStrictEqual(app.RECHARGE_RATE_KEYS, server.RECHARGE_RATE_KEYS);

// Wired where the price is set: the server's recharge pricing and the app's
// amount step (typed amounts and preset amounts).
const wallet = fs.readFileSync(path.join(__dirname, '../functions/walletService.js'), 'utf8');
assert.ok(/flooredPrice\(found\.sellAmount, found\.providerAmount, requestedCountry/.test(wallet), 'server floors the recharge price');
const steps = fs.readFileSync(path.join(__dirname, '../src/steps/RechargeSteps.js'), 'utf8');
assert.ok(/atLeastRate\(iimmpactCustomerPrice\(face, product\), face\)/.test(steps), 'typed amount is floored');
assert.ok(/amount: atLeastRate\(/.test(steps) && /payFor: \(price, option\) => customerPrice\(atLeastRate/.test(steps), 'preset amounts are floored');
// Thailand's rate can be set from both superadmin rate screens and the web.
for (const f of ['src/screens/AdminHomeScreen.js', 'src/screens/AdminFeaturesScreen.js', 'admin-web/src/services/ratesService.ts']) {
  assert.ok(fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes("key: 'rechargeTH'"), f + ' edits the THB rate');
}
console.log('rate floor: ok');
