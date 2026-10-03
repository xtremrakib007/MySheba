#!/usr/bin/env node
'use strict';
/**
 * Every field an order needs has to survive the allowlist.
 *
 * walletService keeps TRANSACTION_RAW_FIELDS: a per-service set, and only those
 * keys of the client's `raw` are copied through. A field the service needs and
 * the set omits is dropped without a word - the order is placed, the money
 * moves, and the provider refuses it over something that was never sent.
 *
 * That is exactly how every Bangladesh recharge broke. `operator` was missing
 * from the recharge set - from the one service that is entirely about which
 * operator - so Success TopUp received a blank one and answered "Invalid
 * operator [400]". Internet, Offer Packs and Entertainment all listed it.
 * Nothing caught it, because the code is correct on both sides of the gap.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const wallet = read('functions/walletService.js');
const provider = read('functions/apiProviderService.js');

/** The service sets, parsed from the source rather than kept in a second copy. */
function allowlists() {
  const block = wallet.slice(wallet.indexOf('const TRANSACTION_RAW_FIELDS = {'), wallet.indexOf('\n};', wallet.indexOf('const TRANSACTION_RAW_FIELDS = {')));
  const out = {};
  for (const m of block.matchAll(/(\w+):\s*new Set\(\[([\s\S]*?)\]\)/g)) {
    out[m[1]] = m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return out;
}

const sets = allowlists();
assert(Object.keys(sets).length >= 6, 'the allowlists must parse');

console.log('What each service cannot be ordered without');
// Written out rather than inferred: these are the fields the order is
// meaningless without, and naming them is the point. A service that grows a new
// required field gets a line here.
const REQUIRED = {
  // Which number, in which country, for how much - and on which network. The
  // last one was missing.
  recharge: ['phone', 'country', 'amount', 'operator'],
  internet: ['phone', 'country', 'amount', 'operator', 'packageId'],
  offerpacks: ['phone', 'country', 'amount', 'operator', 'packageId'],
  // Game top-ups: which game, which pack, and the ID to credit. No phone and no
  // operator - a PUBG account has neither.
  entertainment: ['country', 'amount', 'gameKey', 'packageId', 'playerId'],
  billpayment: ['phone', 'country', 'amount', 'provider', 'billNumber'],
  mobilebanking: ['phone', 'country', 'amount', 'provider', 'accountNumber'],
};

for (const [service, fields] of Object.entries(REQUIRED)) {
  assert(sets[service], `${service} has no allowlist`);
  for (const field of fields) {
    assert(sets[service].includes(field),
      `${service} orders need "${field}" and the allowlist drops it - the provider will refuse the order`);
  }
}

console.log('And the provider reads nothing a service strips');
// resolveSuccessTopUpOperator(raw.operator) is the line that produced the 400:
// it reads raw.operator for recharge, so recharge must allow it.
assert(/const rechargeOperator = resolveSuccessTopUpOperator\(raw\.operator\)/.test(provider),
  'the recharge operator still comes from raw.operator');
assert(sets.recharge.includes('operator'), 'so recharge must let it through');
assert(/const internetOperator = resolveSuccessTopUpOperator\(raw\.operatorCode \|\| raw\.operator\)/.test(provider),
  'the package operator comes from either key');
for (const service of ['internet', 'offerpacks']) {
  assert(sets[service].includes('operatorCode') && sets[service].includes('operator'),
    `${service} must allow both keys the provider reads`);
}

console.log('A dropped field is not a thing the client can fix');
// The allowlist is the security boundary, so it is right that it exists - the
// failure is only ever an omission, never the filtering itself.
assert(/for \(const key of allowed\)/.test(wallet), 'the filter still copies only allowlisted keys');

console.log('The client cannot overwrite what the server worked out');
// The provider payload is one object literal: computed values, then a spread of
// the client's raw fields. Last wins, so the spread has to come FIRST or every
// computation above it is undone.
//
// It came last. operator was resolved to the provider's code and overwritten by
// the raw name, so Success TopUp answered "Invalid operator [400]" on every
// Bangladesh recharge. amount was set to the catalogue cost and overwritten by
// the sell price - what the comment beside it says must never reach the
// provider. apiKey and secretKey were overwritable by a client field of the
// same name.
const varsLine = provider.split('\n').find((l) => l.includes('const vars = {'));
assert(varsLine, 'the vars object must be findable');
const spreadAt = varsLine.indexOf('...Object.fromEntries(Object.entries(raw)');
assert(spreadAt !== -1, 'the raw spread must still be there');
for (const key of ['operator:', 'amount:', 'apiKey:', 'secretKey:', 'internetOperator', 'packageId']) {
  assert(varsLine.indexOf(key) > spreadAt,
    `"${key}" must be written AFTER the raw spread, or a client field of that name overwrites it`);
}

// phone is the exception and must stay one: it is the number being topped up,
// which comes from raw, NOT the customer's own number. Reversing the order
// without saying so would have sent every recharge to the wrong phone.
assert(/phone:raw\.phone\|\|customer\?\.phone/.test(varsLine),
  'phone must take the raw number first - it is the number being recharged');

console.log('\nEvery order carries what the provider needs to fulfil it.');
