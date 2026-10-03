#!/usr/bin/env node
'use strict';
/**
 * Picking the operator from the number.
 *
 * The number used to be collected AFTER the operator, so there was nothing to
 * read it from. The steps are swapped and a detected operator skips its own
 * step - which means a wrong detection sends a top-up to the wrong network,
 * so what is NOT detected matters as much as what is.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const src = read('src/data/operatorPrefix.js')
  .replace(/^export (const|function) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?$/gm, '');
const mod = {};
new Function('module', 'exports', `${src}\nmodule.exports={operatorForNumber,nationalNumber,OPERATOR_PREFIXES};`)(mod, {});
const { operatorForNumber, nationalNumber } = mod.exports;

const BD = ['Grameenphone', 'Robi', 'Banglalink', 'Airtel', 'Teletalk', 'Skitto'];

console.log('Reading the operator off the number');
for (const [number, operator] of [
  ['01812345678', 'Robi'], ['01612345678', 'Airtel'], ['01512345678', 'Teletalk'],
  ['01412345678', 'Banglalink'], ['01912345678', 'Banglalink'], ['01312345678', 'Grameenphone'],
]) {
  assert.strictEqual(operatorForNumber('BD', number, BD), operator, `${number} should be ${operator}`);
}

// However the customer typed it.
assert.strictEqual(operatorForNumber('BD', '8801812345678', BD), 'Robi', 'a dial code must not defeat detection');
assert.strictEqual(operatorForNumber('BD', '+880 18 1234 5678', BD), 'Robi', 'spacing and + must not either');
assert.strictEqual(nationalNumber('8801812345678', 'BD'), '01812345678');

console.log('What must NOT be detected');
// Grameenphone and Skitto share 017. Detection skips the step, so guessing
// here would send a Skitto top-up to Grameenphone with nothing to correct it.
assert.strictEqual(operatorForNumber('BD', '01712345678', BD), '',
  'a prefix two operators share must fall back to the grid');
assert.strictEqual(operatorForNumber('BD', '019', BD), '', 'a half-typed number must not be detected');
assert.strictEqual(operatorForNumber('IN', '9812345678', ['Airtel']), '', 'an unmapped country shows the grid');
assert.strictEqual(operatorForNumber('BD', '01612345678', ['Robi']), '',
  'an operator this country does not offer must not be selected');

console.log('The steps are ordered so there is a number to read');
for (const rel of ['src/steps/RechargeSteps.js', 'src/steps/InternetSteps.js', 'src/steps/OfferPacksSteps.js']) {
  const code = strip(read(rel));
  const numberAt = code.indexOf('if (step === 1)');
  const operatorAt = code.indexOf('if (step === 2)');
  assert(numberAt !== -1 && operatorAt !== -1, `${rel} is missing a step`);
  assert(/if \(step === 1\)[\s\S]{0,400}Enter Mobile Number|if \(step === 1\)[\s\S]{0,400}Mobile Number/.test(code),
    `${rel} does not collect the number first`);
  assert(/if \(step === 2\)[\s\S]{0,400}Select Operator/.test(code),
    `${rel} does not offer the operator second`);
  assert(/if \(step === 1 && !\(serviceData\.phone \|\| ''\)\.trim\(\)\)/.test(code),
    `${rel} still validates the old step order`);
  assert(/operatorForNumber\(serviceData\.country, phone, OPERATOR_LIST\)/.test(code),
    `${rel} does not detect the operator`);
  // Without the guard, stepping back onto the operator skips forward again and
  // the grid can never be opened - so a wrong detection would be uncorrectable.
  assert(/autoSkippedFor\.current === phone/.test(code),
    `${rel} would re-skip the operator step, trapping the customer`);
}

console.log('\nThe operator is read from the number, and the grid is the fallback.');
