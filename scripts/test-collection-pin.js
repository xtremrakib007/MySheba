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
// The PIN regex is now built once, so build it the same way here and EXERCISE
// it. Evaluating rather than reading is the whole point: the original bug was
// /^\\d{4}$/ - an escaped backslash - which matches the string \dddd and no
// PIN at all, and reads perfectly.
const ctorLine = (src.match(/const PIN_RE = new RegExp\((.+)\);/) || [])[1];
check('the PIN regex is built in one place', !!ctorLine, 'PIN_RE construction not found');

if (ctorLine) {
  let built = null;
  let why = '';
  try {
    const PIN_MIN = Number((src.match(/const PIN_MIN = (\d+)/) || [])[1]);
    const PIN_MAX = Number((src.match(/const PIN_MAX = (\d+)/) || [])[1]);
    // eslint-disable-next-line no-eval
    built = eval(`(function(){ const a=${PIN_MIN}, b=${PIN_MAX}; `
      + `const PIN_MIN=a, PIN_MAX=b; return new RegExp(${ctorLine}); })()`);
    why = 'source ' + built.source;
  } catch (e) {
    why = 'did not compile: ' + e.message;
  }
  check('the PIN regex matches real PINs and nothing else',
    !!built
      && built.test('1234') && built.test('0000') && built.test('1234567890')
      && !built.test('123') && !built.test('12a4') && !built.test('')
      && !built.test('\\dddd'),
    why);
}

// And no stray fixed-length literal may creep back in beside it.
const strays = [];
const strayRe = /\/\^\\+d\{\d+\}\$\//g;
let m;
while ((m = strayRe.exec(src))) {
  strays.push(m[0] + ' at line ' + src.slice(0, m.index).split('\n').length);
}
check('no hard-coded fixed-length PIN regex remains', strays.length === 0, strays.join(', '));

// --- length is a range, and both sides agree on it ------------------------
// It was fixed at 4 in five server places and three screens. Remittance needs
// longer, and orders already in flight still carry 4-digit PINs, so the rule
// has to be a range - and the client has to agree with the server, or the
// operator is told one thing and rejected for another.
const clientSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'utils', 'collectionPin.js'), 'utf8');

const srvMin = (src.match(/const PIN_MIN = (\d+)/) || [])[1];
const srvMax = (src.match(/const PIN_MAX = (\d+)/) || [])[1];
const cliMin = (clientSrc.match(/PIN_MIN = (\d+)/) || [])[1];
const cliMax = (clientSrc.match(/PIN_MAX = (\d+)/) || [])[1];

check('the server declares a PIN length range', !!srvMin && !!srvMax,
  'PIN_MIN=' + srvMin + ' PIN_MAX=' + srvMax);
check('the client agrees with the server on that range',
  srvMin === cliMin && srvMax === cliMax,
  'server ' + srvMin + '-' + srvMax + ' vs client ' + cliMin + '-' + cliMax);

check('a 4-digit PIN from an older order is still accepted',
  new RegExp(`^\\d{${srvMin},${srvMax}}$`).test('1234'),
  'orders placed before the change must still complete');

check('remittance mints something longer than 4',
  /PIN_LENGTH_BY_SERVICE = \{[^}]*Remittance:\s*(\d+)/.test(src)
  && Number(src.match(/Remittance:\s*(\d+)/)[1]) > 4,
  '4 digits is 10,000 possibilities in front of a cash handover');

check('the minted length is driven by the service, not hard-coded',
  /pin = mintPin\(pinLengthFor\(order\.service\)\)/.test(src));

check('no 4-digit literal survives in the screens',
  !['DealerHomeScreen', 'ResellerHomeScreen', 'AdminHomeScreen'].some((f) =>
    /length !== 4|maxLength=\{4\}|4-digit/.test(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', f + '.js'), 'utf8'))),
  'a fourth copy of the rule is how the three drift apart');

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
  /if \(typeof order\.pin === 'string' && PIN_RE\.test\(order\.pin\)\) \{[\s\S]{0,80}?pin = order\.pin;[\s\S]{0,40}?return;/.test(src),
  'a second Generate must not invalidate the PIN already shown');

// --- the PIN is unguessable and single-use --------------------------------
check('the PIN is cryptographically random, not Math.random',
  /crypto\.randomInt\(0, 10 \*\* length\)/.test(src) && !/Math\.random\(\)/.test(src),
  'and drawn in a single call, so no modulo bias from stitching digits together');

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
