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

console.log('\nA wallet reload, sold down the path that already handles money.');
