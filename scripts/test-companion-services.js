#!/usr/bin/env node
'use strict';

/**
 * The four Success TopUp services nobody can configure directly.
 *
 * Internet, Offer Packs, Entertainment and Bill Payment are not set up by a
 * superadmin. They are written as companion documents when the Success TopUp
 * RECHARGE provider is saved, and listApiProviders filters them straight back
 * out so nobody edits them by hand.
 *
 * Which made one error message a dead end:
 *
 *   Success TopUp Offer Packs API is not configured. [400]
 *
 * It sent a superadmin to look for an Offer Packs row in API Management that
 * is deliberately not there. The remedy - re-save a DIFFERENT service's
 * provider - appeared nowhere on screen. The message now names it.
 *
 * Also here: only Bill Payment pays a bill. The other three are one package
 * purchase through /api/recharge, and the label chain in ServiceScreen named
 * `internet` alone, so Offer Packs and Entertainment finished on "Pay Bill".
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

const api = read('functions/apiProviderService.js');
const svc = read('src/screens/ServiceScreen.js');

console.log('\nThe companion services stay hidden, and say so when missing');

const companions = (api.match(/const SUCCESS_TOPUP_COMPANION_SERVICES = \[([^\]]*)\]/) || [])[1] || '';
const names = [...companions.matchAll(/'([^']+)'/g)].map((m) => m[1]);
check('the companion list is still there', names.length === 4, names.join(', '));
check('and still hidden from the admin list', /SUCCESS_TOPUP_COMPANION_SERVICES\.includes\(d\.data\(\)\?\.service\)/.test(api));
// Hidden plus "not configured" is the dead end. One without the other is fine.
check('so the error points at the Recharge provider instead',
  /is set up from the Recharge provider/.test(api));
check('and only for those four', /if \(SUCCESS_TOPUP_COMPANION_SERVICES\.includes\(service\)\)/.test(api));
check('a non-companion service keeps the plain message',
  /return new HttpsError\('failed-precondition', `Success TopUp \$\{service\} API is not configured\.`\)/.test(api));
check('both call sites use it', (api.match(/throw unconfiguredError\(service\)/g) || []).length === 2);

console.log('\nCompanions are provisioned from Recharge, so that is the only remedy');

check('they are written when Recharge is saved',
  /if \(data\.name === 'Success TopUp' && data\.service === 'Recharge'\)/.test(api));
for (const id of ['success-topup-internet', 'success-topup-offer-packs', 'success-topup-entertainment', 'success-topup-bill-payment']) {
  check(`${id} is one of them`, api.includes(`'${id}'`));
}

console.log('\nOnly Bill Payment says Pay Bill');

const label = svc.slice(svc.indexOf('const finalButtonLabel'), svc.indexOf("    : 'Submit';") + 20);
check('Recharge recharges', /'recharge'\s*\?\s*\n?\s*'Recharge Now'/.test(label) || /'Recharge Now'/.test(label));
check('Bill Payment is what selects Pay Bill', /currentService === 'billpayment'[\s\S]{0,40}'Pay Bill'/.test(label));
check('and everything else buys a package', /:\s*'Buy Package'\)/.test(label));
// The bug was the fallthrough, so assert the old shape is gone.
check('internet no longer decides it alone', !/currentService === 'internet'[\s\S]{0,40}'Buy Package'[\s\S]{0,40}'Pay Bill'/.test(label));

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Companion services name their remedy, and packages are bought not paid.');
