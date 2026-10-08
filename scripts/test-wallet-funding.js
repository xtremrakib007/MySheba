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


console.log('A frozen wallet holds still');
const freeze = strip(read('functions/walletFreeze.js'));
// Support can freeze: a customer whose wallet is draining reaches support,
// and waiting for a superadmin to come online is how it keeps draining.
assert(/FREEZER_ROLES = \['support', 'superadmin'\]/.test(freeze), 'support and superadmin may freeze');
assert(/A reason is required to freeze a wallet/.test(freeze),
  'a freeze without a reason tells the customer nothing and leaves no record');
assert(/You cannot freeze your own wallet/.test(freeze), 'freezing yourself is not a moderation action');
// Support holding the wallet that funds every top-up would stop the system.
assert(/Only a superadmin can freeze an admin or superadmin wallet/.test(freeze),
  'support must not freeze the wallets the funding chain runs on');

// The guard must be in the money paths, not merely defined.
for (const [file, who] of [
  ['walletService.js', 'the customer charge'],
  ['walletTransferService.js', 'a customer-to-customer transfer'],
  ['walletFundingService.js', 'a staff funding transfer'],
  ['secureTopupReview.js', 'a top-up'],
  ['secureTransfer.js', 'a staff transfer'],
  ['secureWalletCharge.js', 'a feature charge'],
  ['rechargePinService.js', 'a PIN purchase'],
  ['adminTopUpService.js', 'a direct top-up'],
  ['secureWalletMutations.js', 'a self top-up'],
]) {
  assert(/assertWalletUnfrozen\(/.test(strip(read(`functions/${file}`))),
    `${who} must refuse a frozen wallet (${file})`);
}

// And must NOT be in the reversal paths: a frozen customer who is owed a
// refund is already out of pocket, and blocking it makes that permanent.
for (const file of ['apiWebhookService.js', 'successTopupPoller.js', 'rejectionService.js']) {
  assert(!/assertWalletUnfrozen\(/.test(strip(read(`functions/${file}`))),
    `${file} refunds money already taken and must not be blocked by a freeze`);
}

console.log('  frozen wallets cannot spend, and are still refunded');

// --- the screen that renders all this ----------------------------------------
// The three callables were written, tested and reachable from nothing: finance
// could be short of funds with no way to say so, and the queue just stopped
// moving. These check the screen is wired to them and phrases the chain the way
// the server enforces it.
const screen = read('src/screens/WalletFundingScreen.js');
for (const fn of ['requestWalletFunding', 'listWalletFundingRequests', 'decideWalletFunding']) {
  assert(new RegExp(`fundingService\\.${fn}\\(`).test(screen), `the screen must call ${fn}`);
}

// The screen tells each role who to ask. That duplicates FUNDS_FROM, so it is
// asserted equal rather than trusted: wrong here and finance is told to ask
// superadmin while the server routes the request to admin, where nobody who
// was told to look for it ever sees it.
const approverFor = {};
for (const m of screen.matchAll(/(\w+): '(\w+)'/g)) {
  if (['finance', 'admin'].includes(m[1]) && ['admin', 'superadmin'].includes(m[2])) approverFor[m[1]] = m[2];
}
assert.deepStrictEqual(approverFor, FUNDS_FROM,
  'the screen and the server must agree on who funds whom');

// A rejection without a reason is the thing the reason presets exist to stop.
assert(/FUNDING_REJECT_REASONS/.test(screen), 'rejecting offers the common reasons');
assert(/A reason is required/.test(screen), 'and refuses an empty one');

// Approving spends the approver's own money. Doing that on one tap, with no
// statement of whose wallet it leaves, is how an approver funds the wrong
// person and finds out from the ledger.
assert(/out of YOUR wallet/.test(screen), 'approval must say whose balance it spends');

console.log('  the funding screen is wired to the chain it describes');

console.log('Public funding is fail-closed until partner approval');
const compliance = strip(read('functions/walletComplianceService.js'));
assert(/publicFundingDefaultEnabled: false/.test(compliance), 'public funding must default to disabled');
assert(/assertPublicFundingEnabled/.test(strip(read('functions/topupSubmissionService.js'))), 'customer deposits must pass the funding-policy gate');
assert(/assertPublicFundingEnabled/.test(strip(read('functions/secureTopupReview.js'))), 'top-up credit must pass the funding-policy gate');
assert(/Direct self-credit is disabled/.test(read('functions/secureWalletMutations.js')), 'self-credit must fail closed');
assert(/Direct administrative wallet credit is disabled/.test(read('functions/adminTopUpService.js')), 'admin balance minting must fail closed');
assert(/match \/settings\/walletCompliance/.test(read('firestore.rules')), 'wallet compliance configuration needs a rules boundary');

console.log('  public funding remains closed until an approved partner is configured');

console.log('\nEvery hop is a transfer, and nobody sends what they do not hold.');
