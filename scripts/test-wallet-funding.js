#!/usr/bin/env node
'use strict';
/**
 * Money moves; it is not created.
 *
 * A top-up used to be minted - the customer's balance went up and nobody's
 * went down - so the total in circulation was however much had been approved.
 * Every hop is a transfer now: finance pays the customer, admin funds finance,
 * superadmin funds admin, and nobody can send what they do not hold.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const { FUNDS_FROM, validAmount } = require('../functions/walletFundingService')._test;

console.log('Who funds whom');
assert.strictEqual(FUNDS_FROM.finance, 'admin', 'finance is funded by admin');
assert.strictEqual(FUNDS_FROM.admin, 'superadmin', 'admin is funded by superadmin');
assert.strictEqual(FUNDS_FROM.superadmin, undefined, 'superadmin has nobody to ask');
// A customer or dealer asking for a staff wallet top-up would be asking to be
// handed money outside the top-up flow entirely.
for (const role of ['customer', 'dealer', 'reseller', 'support']) {
  assert.strictEqual(FUNDS_FROM[role], undefined, `${role} cannot request wallet funding`);
}

console.log('An amount has to be an amount');
assert.strictEqual(validAmount('100'), 100);
assert.strictEqual(validAmount(250.5), 250.5);
for (const bad of ['', '0', '-5', 'abc', '1.234', '1e5', null, undefined, '99999999']) {
  assert.throws(() => validAmount(bad), `${JSON.stringify(bad)} must be refused`);
}

console.log('The transfer is a transfer');
const funding = strip(read('functions/walletFundingService.js'));
// Both sides in one write, or money leaves one wallet without arriving.
assert(/tx\.update\(approverSnap\.ref, \{ walletBalance: money\(approverBalance - amount/.test(funding),
  'the approver must be debited');
assert(/tx\.update\(requesterRef, \{ walletBalance: money\(requesterBalance \+ amount/.test(funding),
  'the requester must be credited');
assert(/if \(approverBalance < amount\)/.test(funding), 'an approver who is short must be refused');
assert(/if \(fundingRequest\.approverRole !== approver\.role\)/.test(funding),
  'only the level the request was addressed to may decide it');
assert(/if \(fundingRequest\.status !== 'pending'\)/.test(funding),
  'a decided request must not be decided twice, or it transfers twice');
assert(/\.where\('fromUid', '==', uid\)\.where\('status', '==', 'pending'\)/.test(funding),
  'two open requests for one wallet would transfer twice for one shortfall');
assert(/inferWalletCurrency\(requester\) !== currency/.test(funding),
  'a cross-currency transfer would invent the difference');

console.log('A top-up is paid for by the approver');
const review = strip(read('functions/secureTopupReview.js'));
assert(/function debitPlan\(/.test(review), 'the approver must have a debit plan');
assert((review.match(/debitPlan\(caller\.__ref, caller, plan\)/g) || []).length === 2,
  'both completion paths must debit the approver, not only one');
assert((review.match(/tx\.update\(debit\.approverRef, \{ walletBalance: debit\.newBalance/g) || []).length === 2,
  'both must write that debit');
assert(/balance < plan\.points/.test(review), 'a short approver must be refused');
// Refused, not failed: the request stays pending so it can be approved once
// the funding arrives, and the customer never resubmits.
assert(/stays pending until you do/.test(read('functions/secureTopupReview.js')),
  'the message must say the request is still waiting, not lost');
assert(/const COMPLETER_ROLES = \['finance', 'admin', 'superadmin'\]/.test(review),
  'finance pays the customer, so finance completes');

console.log('The requests are readable by the two people they concern');
const rules = read('firestore.rules');
assert(/match \/walletFundingRequests\/\{id\}/.test(rules), 'the collection needs a rule');
const block = rules.slice(rules.indexOf('match /walletFundingRequests/{id}'));
assert(/allow create, update, delete: if false;/.test(block.slice(0, 400)),
  'only the callables may write, since they do the transfer');
assert(/resource\.data\.fromUid == request\.auth\.uid/.test(block.slice(0, 400)),
  'the requester must see their own request');
assert(/resource\.data\.approverRole == myRole\(\)/.test(block.slice(0, 400)),
  'the approver must see what they have to decide');

console.log('\nEvery hop is a transfer, and nobody sends what they do not hold.');
