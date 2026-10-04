#!/usr/bin/env node
'use strict';
/**
 * Touch 'n Go eWallet reload.
 *
 * It is sold like a bill, not like a recharge, and that is the whole point.
 *
 * Malaysia has operator prefix detection for 010-019 - every mobile number -
 * and the Recharge flow auto-selects the operator and SKIPS the step. A TnG
 * number is an ordinary Malaysian mobile, so as a Recharge operator it would
 * be detected as Hotlink and the customer would buy airtime, never having been
 * offered the choice, with no way back once sent.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const bills = read('src/steps/BillPaymentSteps.js');

console.log('The reload is a bill category, with a biller');
assert(/\{ key: 'ewallet', label: 'E-Wallet Reload'/.test(bills), 'the category exists');
assert(/ewallet: \["Touch 'n Go eWallet"\]/.test(bills), 'and Malaysia bills for it');
// categoriesFor() hides a category with no biller, so Bangladesh must not grow
// an E-Wallet tile that can only say "no biller is configured".
const bd = bills.slice(bills.indexOf('  BD: {'), bills.indexOf('};', bills.indexOf('  BD: {')));
assert(!/ewallet:/.test(bd), 'Bangladesh has no TnG, so it must not offer the category');

console.log('And is NOT a recharge operator, which would skip the choice');
const operators = read('src/data/countries.js');
const my = operators.slice(operators.indexOf('MY: ['), operators.indexOf(']', operators.indexOf('MY: [')));
assert(!/Touch|TnG|T'nG/i.test(my), "TnG must not be an MY recharge operator - prefix detection would auto-select a telco instead");
// The hazard itself, asserted so the reasoning above cannot quietly stop being
// true: Malaysia detects 012 as a telco and Recharge skips on a detection.
const prefixes = read('src/data/operatorPrefix.js');
assert(/'012': 'Hotlink'/.test(prefixes), 'Malaysian prefix detection still covers ordinary mobiles');
assert(/nextStep\(\)/.test(read('src/steps/RechargeSteps.js')), 'and Recharge still advances on a detection');

console.log('The number field asks for a phone, not a bill reference');
// A reload goes to a phone number. Uppercasing it, or calling it an account
// number, invites the wrong digits - and a reload cannot be reversed.
assert(/Mobile number registered to the wallet/.test(bills), 'the label says what to type');
assert(/keyboardType=\{serviceData\.category === 'ewallet' \? 'phone-pad'/.test(bills), 'and the keypad matches');
assert(/autoCapitalize=\{serviceData\.category === 'ewallet' \? 'none'/.test(bills), 'and it is not uppercased');

console.log('It rides the bill payment path, so nothing new charges money');
const wallet = read('functions/walletService.js');
assert(/billpayment: new Set\(\[[^\]]*'category'[^\]]*\]\)/.test(wallet), 'category survives to the provider');
assert(/billpayment: new Set\(\[[^\]]*'accountNumber'[^\]]*\]\)/.test(wallet), 'and so does the account number');

console.log('Each has its own tile, landing on the only question left to ask');
const tiles = require('./lib/load-tiles.js');
const home = tiles.visibleTiles({ role: 'customer', can: () => true, homeOnly: true });
const byKey = Object.fromEntries(home.map((t) => [t.key, t]));

for (const key of ['jompay', 'tngewallet']) {
  assert(byKey[key], `${key} must be on the home grid`);
  assert.strictEqual(byKey[key].kind, 'billShortcut', `${key} opens the bill flow, it is not a service of its own`);
  assert.strictEqual(byKey[key].seed.country, 'MY', `${key} is Malaysian`);
}
// The seed is the whole point: land on the step that still needs answering,
// with the ones already decided filled in. A wrong seed sends money to the
// wrong product with the customer never seeing the field.
assert.strictEqual(byKey.tngewallet.seed.category, 'ewallet', 'TnG lands in the e-wallet category');
assert.strictEqual(byKey.tngewallet.seed.provider, "Touch 'n Go eWallet", 'with the biller chosen');
assert.strictEqual(byKey.tngewallet.startStep, 3, 'so it opens on the number, the only thing left to ask');
// JomPAY is its own category now, not a shortcut into the ordinary biller
// list: the rail asks for a biller CODE off the customer's bill rather than a
// biller from a list, so landing on the category chooser was a dead end.
assert.strictEqual(byKey.jompay.seed.category, 'jompay', 'JomPay opens the JomPAY category');
assert.strictEqual(byKey.jompay.seed.provider, 'JomPAY', 'with the one biller chosen');
assert.strictEqual(byKey.jompay.startStep, 3, 'so it opens on the fields printed on the bill');

// And those fields have to exist, be required, and reach the provider. The IC
// is the one that is not ours to make optional: JomPAY falls under Malaysia's
// AMLA and the provider's stated penalty for a fictitious number is account
// suspension.
const billSteps = read('src/steps/BillPaymentSteps.js');
assert(/jompay: \['JomPAY'\]/.test(billSteps), 'JomPAY is a biller entry so the provider step still resolves');
assert(/key: 'jompay', label: 'JomPAY Bill'/.test(billSteps), 'and a category of its own');
for (const field of ['billerCode', 'icNumber', 'ref2']) {
  assert(new RegExp(`updateServiceData\\(\\{ ${field}:`).test(billSteps), `the JomPAY step must collect ${field}`);
  assert(new RegExp(`'${field}'`).test(wallet), `${field} must be allowed through to the provider`);
}
assert(/Please enter the JomPAY Biller Code/.test(billSteps), 'a missing biller code is refused');
assert(/IC or passport number\. JomPAY requires it by law/.test(billSteps), 'a missing IC is refused');
// Shown masked: the full number goes to the provider because AMLA requires it,
// it does not need to sit on a shop counter screen.
assert(/label: 'IC \/ Passport', value: maskId\(serviceData\.icNumber\)/.test(billSteps), 'the summary masks the IC');

const grid = read('src/components/ServiceGrid.js');
assert(/s\.kind === 'billShortcut'\) return startService\('billpayment', s\.seed, s\.startStep\)/.test(grid),
  'the shortcut must open billpayment, carrying its seed');
const ctx = read('src/context/AppContext.js');
// Switching Bill Payment off has to switch its shortcuts off with it, or a tile
// survives the service it depends on.
assert(/isGridActive\(gridManagement, service, gridViewer\)/.test(ctx),
  'the gate still names the service, not the tile');
assert(/setCurrentStep\(Number\.isInteger\(startStep\) && startStep > 0 \? startStep : 0\)/.test(ctx),
  'a nonsense start step falls back to the beginning rather than skipping questions');

// The second way to buy it: a PIN voucher.
//
// Touch 'n Go sells both pinless and as a PIN, and they are different products
// with different provider codes. The pinless reload credits the wallet behind a
// mobile number and is the Bill Payment above; the PIN returns a code the
// customer redeems themselves and is a Recharge PIN. Only the first existed.
const countries = read('src/data/countries.js');
const pinScreen = read('src/screens/RechargePinScreen.js');
const brands = read('src/data/operatorBrand.js');

assert(/export const rechargePinBrands/.test(countries),
  'the PIN picker needs a list of its own');
assert(/rechargePinBrands = \{[\s\S]*?"Touch 'n Go eWallet"/.test(countries),
  'Touch \u2019n Go must be buyable as a PIN');

// The two lists must stay separate. Putting a wallet into rechargeOperators
// would add it to the airtime and internet operator grids, where there is no
// such thing as a data pack for an e-wallet.
const rechargeBlock = /export const rechargeOperators = \{[\s\S]*?\n\};/.exec(countries);
assert(rechargeBlock, 'rechargeOperators must still be findable');
assert(!/Touch 'n Go/.test(rechargeBlock[0]),
  'a wallet must not leak into the airtime/internet operator list');

assert(/rechargePinBrands\.MY/.test(pinScreen),
  'the PIN screen must read the PIN list, not the recharge one');
// The import, not any mention of the name: the screen's own comment explains
// why it is NOT rechargeOperators, and a bare search matched that comment.
assert(!/import \{[^}]*rechargeOperators[^}]*\} from '\.\.\/data\/countries'/.test(pinScreen),
  'and must no longer import rechargeOperators');

// The brand badge: the two-letter fallback would render "Touch 'n Go eWallet"
// as "TO".
assert(/"Touch 'n Go eWallet": \{[^}]*initials: 'TNG'/.test(brands),
  'the wallet needs a legible badge');
assert(!/^operatorBrand\[/m.test(brands),
  'added to the map itself, not bolted on after it');

console.log('\nA wallet reload, sold down the path that already handles money.');
console.log('Sold the other way too, as a voucher, from a picker of its own.');
