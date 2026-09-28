#!/usr/bin/env node
/**
 * The collection PIN is the customer's proof that they were present when an
 * order was handed over. The operator cannot complete an order without it, so
 * the rules around it are load-bearing:
 *
 *   - only the CUSTOMER may mint one, on their own order. An operator who
 *     could mint it could close an order without the customer ever showing up.
 *   - minting is IDEMPOTENT. Asking twice must return the same PIN, or the
 *     second ask silently invalidates the one already shown, printed or
 *     screenshotted, and the operator's entry of it fails.
 *   - it is only mintable while the order is still pending.
 *   - it is deleted on completion, so a used PIN cannot be replayed.
 *
 * The idempotency guard was written /^\\d{4}$/ - an escaped backslash, so it
 * matched the literal string \dddd and never a PIN. Every call therefore
 * minted a new one. The identical test is correct twice in the same file,
 * which is exactly the kind of near-miss a regex is easy to hide.
 *
 * Run: npm run test:pin
 */
const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(
  path.join(__dirname, '..', 'functions', 'transactionService.js'), 'utf8');

/**
 * Blank out // and block comments, keeping line numbers intact.
 *
 * Needed because the comment left where the broken regex used to be quotes it
 * verbatim, and a scanner that reads comments would flag the explanation as
 * the defect - which it did, on the first run.
 */
function stripComments(s) {
  let out = '';
  let mode = 'code';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (mode === 'code') {
      if (two === '//') { mode = 'line'; out += '  '; i++; continue; }
      if (two === '/*') { mode = 'block'; out += '  '; i++; continue; }
      out += s[i];
      continue;
    }
    if (mode === 'line') {
      if (s[i] === '\n') { mode = 'code'; out += '\n'; continue; }
      out += ' ';
      continue;
    }
    if (two === '*/') { mode = 'code'; out += '  '; i++; continue; }
    out += s[i] === '\n' ? '\n' : ' ';
  }
  return out;
}

const src = stripComments(raw);

const failures = [];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(name);
}

// --- every 4-digit regex in this file must actually match 4 digits ---------
// Evaluating them is the point: reading them is how the broken one survived.
const literals = [];
const re = /\/\^[^/\n]*d\{4\}\$\//g;
let m;
while ((m = re.exec(src))) {
  literals.push({ text: m[0], line: src.slice(0, m.index).split('\n').length });
}

check('the file still has PIN-shape regexes to check', literals.length >= 3,
  literals.length + ' found');

for (const lit of literals) {
  let ok = false;
  let why = '';
  try {
    // eslint-disable-next-line no-eval
    const r = eval(lit.text);
    ok = r.test('1234') && r.test('0000') && !r.test('123') && !r.test('12345');
    why = 'source ' + r.source + ' - matches "1234": ' + r.test('1234');
  } catch (e) {
    why = 'did not compile: ' + e.message;
  }
  check('line ' + lit.line + ' matches a real 4-digit PIN', ok, why);
}

// --- who may mint one -----------------------------------------------------
check('only a customer may generate a collection PIN',
  /generateCollectionPin[\s\S]{0,900}?profile\.role !== 'customer'[\s\S]{0,200}?permission-denied/.test(src),
  'an operator who could mint it could close an order with no customer present');

check('the caller must own the order',
  /generateCollectionPin[\s\S]{0,2000}?order\.customerId !== uid[\s\S]{0,120}?permission-denied/.test(src));

check('a PIN is only mintable while the order is pending',
  /generateCollectionPin[\s\S]{0,2000}?order\.status !== 'pending'[\s\S]{0,140}?failed-precondition/.test(src));

// --- idempotency ----------------------------------------------------------
check('an existing PIN is returned rather than replaced',
  /if \(typeof order\.pin === 'string' && \/\^\\d\{4\}\$\/\.test\(order\.pin\)\) \{[\s\S]{0,80}?pin = order\.pin;[\s\S]{0,40}?return;/.test(src),
  'a second Generate must not invalidate the PIN already shown');

// --- the PIN is unguessable and single-use --------------------------------
check('the PIN is cryptographically random, not Math.random',
  /crypto\.randomInt\(0, 10000\)/.test(src) && !/Math\.random\(\)[\s\S]{0,60}?pin/.test(src));

check('completion deletes the live PIN',
  /completeTransaction[\s\S]{0,3000}?pin: admin\.firestore\.FieldValue\.delete\(\)/.test(src),
  'a used collection PIN must not be replayable');

// The receipt has to be able to show the code the order was collected with.
// Deleting pin without recording it left the customer's own receipt printing
// "-" for the one field that proves how the handover was authorised.
check('completion records the spent PIN for the receipt',
  /completeTransaction[\s\S]{0,3000}?collectionPin: pin/.test(src),
  'the receipt cannot show a PIN that was deleted and never recorded');

check('completion requires the PIN to match the stored one',
  /pin !== order\.pin[\s\S]{0,120}?Incorrect collection PIN/.test(src));

for (const c of checks) {
  console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.detail && !c.ok ? '\n       ' + c.detail : ''));
}
console.log('');
if (failures.length) { console.error(failures.length + ' failure(s).'); process.exit(1); }
console.log('Collection PIN: all ' + checks.length + ' checks pass.');
