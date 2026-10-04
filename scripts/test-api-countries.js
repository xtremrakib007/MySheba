#!/usr/bin/env node
'use strict';
/**
 * Every country you can be charged for is a country you can configure.
 *
 * Three lists have to agree and nothing made them:
 *
 *   walletService's RECHARGE_RATE_KEYS - the countries an order can be priced
 *     and charged for;
 *   apiProviderService's ALLOWED_COUNTRIES - the countries a provider may be
 *     scoped to, and the keys the per-country mode matrix accepts;
 *   the admin screen's SCOPE_COUNTRIES - the rows that matrix actually shows.
 *
 * NP, PK, MM and KH were in the first and neither of the others. An order from
 * Nepal priced and charged perfectly, while no provider could be scoped to it
 * and no per-country mode could be set for it. A provider reaching 'ALL' served
 * those countries anyway, so nothing looked broken - until somebody wanted one
 * country on manual and its neighbour on API and found there was no way to say
 * it.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function listFrom(src, decl) {
  const i = src.indexOf(decl);
  assert(i !== -1, `could not find ${decl}`);
  const open = src.indexOf('[', i);
  const close = src.indexOf(']', open);
  return src.slice(open + 1, close).split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

const rateKeys = read('functions/walletService.js');
const rechargeBlock = rateKeys.slice(rateKeys.indexOf('const RECHARGE_RATE_KEYS='), rateKeys.indexOf('};', rateKeys.indexOf('const RECHARGE_RATE_KEYS=')));
const chargeable = [...rechargeBlock.matchAll(/([A-Z]{2}):/g)].map((m) => m[1]);
assert(chargeable.length >= 8, 'the chargeable countries must parse');

const allowed = listFrom(read('functions/apiProviderService.js'), 'const ALLOWED_COUNTRIES =');
const scope = listFrom(read('src/screens/ApiProviderManagementScreen.js'), 'const SCOPE_COUNTRIES=');

console.log('Every chargeable country can be given a provider and a mode');
for (const code of chargeable) {
  assert(allowed.includes(code),
    `${code} can be charged for but no provider may be scoped to it, and no per-country mode can be set`);
}

console.log('The screen shows every country the backend accepts');
// 'ALL' is how far a provider reaches, not where an order comes from, so it is
// the one entry the screen is right to omit.
assert.deepStrictEqual(
  [...allowed].filter((c) => c !== 'ALL').sort(),
  [...scope].sort(),
  'the admin screen and the backend must offer the same countries',
);
assert(allowed.includes('ALL'), "'ALL' stays, as a provider's reach");
assert(!scope.includes('ALL'), "and stays out of the per-country rows");

console.log('No duplicates, which would draw a country twice');
for (const [name, list] of [['ALLOWED_COUNTRIES', allowed], ['SCOPE_COUNTRIES', scope]]) {
  assert.strictEqual(new Set(list).size, list.length, `${name} lists a country twice`);
}

console.log('\nEverything chargeable is configurable, from both ends.');
