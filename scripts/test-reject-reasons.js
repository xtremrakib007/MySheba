#!/usr/bin/env node
'use strict';
/**
 * Why an order was turned down.
 *
 * The reason reaches the customer - it is printed on the rejected order under
 * "Reason" - and a free-text box got one-word answers that told them nothing
 * and left nobody able to count why orders fail. Presets fill the box rather
 * than replacing it, so the reason stays ordinary text and anything unlisted
 * is still typed.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const src = read('src/data/rejectionReasons.js')
  .replace(/^export (const|function) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?$/gm, '');
const mod = {};
new Function('module', 'exports',
  `${src}\nmodule.exports={TRANSACTION_REJECT_REASONS,TOPUP_REJECT_REASONS,FUNDING_REJECT_REASONS};`)(mod, {});
const lists = mod.exports;

console.log('The lists are usable');
for (const [name, list] of Object.entries(lists)) {
  assert(Array.isArray(list) && list.length >= 4, `${name} needs enough reasons to be worth tapping`);
  assert.strictEqual(new Set(list).size, list.length, `${name} repeats a reason`);
  for (const reason of list) {
    assert(typeof reason === 'string' && reason.trim() === reason && reason.length > 3,
      `${name} has a reason that is not readable text: ${JSON.stringify(reason)}`);
    // The customer reads these, so they must say something. "Wrong" does not.
    assert(reason.split(/\s+/).length >= 2, `${name}: "${reason}" says too little to be useful to a customer`);
  }
}
// A top-up is turned down for different things than a recharge; sharing one
// list would offer "Wrong mobile number" against a bank receipt.
assert.strictEqual(
  lists.TRANSACTION_REJECT_REASONS.filter((r) => lists.TOPUP_REJECT_REASONS.includes(r)).length, 0,
  'the order and top-up lists must not overlap - they are rejected for different things',
);

console.log('Every reject prompt offers them');
const admin = strip(read('src/screens/AdminHomeScreen.js'));
assert(/visible=\{!!rejectTopupId\}[\s\S]{0,200}suggestions=\{TOPUP_REJECT_REASONS\}/.test(admin),
  'the top-up rejection must offer top-up reasons');
assert(/visible=\{!!rejectTxId\}[\s\S]{0,200}suggestions=\{TRANSACTION_REJECT_REASONS\}/.test(admin),
  'the order rejection must offer order reasons');
for (const rel of ['src/screens/DealerHomeScreen.js', 'src/screens/ResellerHomeScreen.js']) {
  assert(/suggestions=\{TRANSACTION_REJECT_REASONS\}/.test(strip(read(rel))),
    `${rel} rejects orders too, and must offer the same reasons`);
}

console.log('And typing one of your own still works');
const prompt = strip(read('src/components/PromptModal.js'));
// Filling the field, not committing a value: a preset can be edited before OK.
assert(/onPress=\{\(\) => setValue\(s\)\}/.test(prompt), 'a suggestion must fill the input');
assert(/value=\{value\}/.test(prompt) && /onChangeText=\{setValue\}/.test(prompt),
  'the input must stay editable, or the presets become the only answers');
assert(/Array\.isArray\(suggestions\) && suggestions\.length > 0/.test(prompt),
  'a prompt with no suggestions must look exactly as it did');
// The keyboard covering the chips would make them unreachable on a phone.
assert(/autoFocus=\{!Array\.isArray\(suggestions\) \|\| suggestions\.length === 0\}/.test(prompt),
  'the keyboard must not open over the suggestions');

console.log('\nCommon reasons are a tap, and anything else is still typed.');
