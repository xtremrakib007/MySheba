'use strict';

// Reading a bill before paying it.
//
// The whole contract is four sentences in `data.message` and four more in
// `data.error_message`, and the question they answer is: may this stop a
// payment? Exactly one of them may. The rest, plus every message nobody has
// seen before and every way the call itself can fail, must let the customer
// carry on - because this is advisory and in Beta, and a read-only extra going
// quiet is not a reason to stand between somebody and their electricity bill.
//
// The failure mode worth testing for is not a crash. It is a bill payment
// screen that quietly stops accepting a valid account number because a biller
// reworded something.

const assert = require('assert');
const { readBillPresentment, normalise, toAmount } = require('../functions/billPresentment');
const apiProviderService = require('../functions/apiProviderService');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

function requireEsm(relativePath, ...names) {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
    .replace(/^export function /gm, 'function ')
    .replace(/^export const /gm, 'const ');
  return new Function(`${source}\nreturn { ${names.join(', ')} };`)();
}

console.log('\nWhat may stop a payment');

test('an invalid account number blocks, and says why in the provider’s words', () => {
  const out = readBillPresentment({ message: 'Invalid account no', error_message: 'Invalid account no' });
  assert.strictEqual(out.status, 'invalid-account');
  assert.strictEqual(out.blocking, true);
  assert.ok(out.message, 'the customer is told something they can act on');
});

test('the blocking message prefers error_message, which is the specific one', () => {
  const out = readBillPresentment({ message: 'Invalid account no', error_message: 'Ref-2 is required' });
  assert.strictEqual(out.blocking, true);
  assert.strictEqual(out.message, 'Ref-2 is required', '"Ref-2 is required" is actionable where the generic message is not');
});

test('only data.message decides it, never error_message on its own', () => {
  // error_message can read "Invalid account no" too, but their table keys the
  // decision on data.message and says every OTHER error still lets the
  // customer pay. Blocking on error_message as well would refuse payments
  // their own documentation permits.
  const out = readBillPresentment({ message: 'Some other error', error_message: 'Invalid account no' });
  assert.strictEqual(out.blocking, false);
  assert.deepStrictEqual(out.fields, []);
});

test('NOTHING else blocks', () => {
  // Each of these is a documented reply that still lets the customer pay.
  for (const message of [
    'Bill presentment is unavailable for this product',
    'Service unavailable. Please try again later',
    'Account no is valid',
    'Some wording nobody has ever seen',
    '',
  ]) {
    assert.strictEqual(readBillPresentment({ message }).blocking, false, `"${message}" must not block`);
  }
  // Including the other error_message values, which are about the request
  // rather than about the account existing.
  for (const error_message of ['The provided biller code is invalid', 'The provided amount is invalid', 'Ref-2 is required']) {
    assert.strictEqual(readBillPresentment({ message: 'Something else', error_message }).blocking, false, error_message);
  }
});

test('a call that never arrived is not a verdict on the account', () => {
  const out = readBillPresentment({}, { reachable: false });
  assert.strictEqual(out.blocking, false);
  assert.deepStrictEqual(out.fields, []);
});

test('an empty or nonsense body blocks nothing and shows nothing', () => {
  for (const body of [{}, null, undefined, [], 'text', { data: 1 }]) {
    const out = readBillPresentment(body);
    assert.strictEqual(out.blocking, false);
    assert.deepStrictEqual(out.fields, []);
  }
});

console.log('\nWhat gets shown');

const VALID_BILL = {
  message: 'Account no is valid',
  customer_name: 'AISHA BINTI RAHMAN',
  bill_number: 'INV-99812',
  due_date: '2026-10-28',
  outstanding_amount: '184.60',
};

test('a valid account shows the bill', () => {
  const out = readBillPresentment(VALID_BILL);
  assert.strictEqual(out.status, 'valid');
  assert.strictEqual(out.blocking, false);
  const byKey = Object.fromEntries(out.fields.map((f) => [f.key, f.value]));
  assert.strictEqual(byKey.customerName, 'AISHA BINTI RAHMAN');
  assert.strictEqual(byKey.billNumber, 'INV-99812');
  assert.strictEqual(byKey.dueDate, '2026-10-28');
  assert.strictEqual(byKey.outstanding, '184.60');
});

test('a field the biller does not publish is not shown as an empty label', () => {
  // Their guide is explicit about this: billers differ in what they return,
  // and a label with nothing behind it is worse than no label.
  const out = readBillPresentment({ message: 'Account no is valid', customer_name: 'A. RAHMAN' });
  assert.deepStrictEqual(out.fields.map((f) => f.key), ['customerName']);
  const blanks = readBillPresentment({ message: 'Account no is valid', customer_name: 'A', bill_number: '', due_date: null });
  assert.deepStrictEqual(blanks.fields.map((f) => f.key), ['customerName'], 'empty and null are "not published"');
});

test('only known fields are shown, never whatever else the reply held', () => {
  // The reply is a third party's. Passing it through would put anything in it
  // on the screen.
  const out = readBillPresentment({ ...VALID_BILL, internal_token: 'secret', cost: '170.00', supplier_margin: '14.60' });
  const keys = out.fields.map((f) => f.key);
  assert.ok(!keys.some((k) => /token|cost|margin/i.test(k)));
  assert.ok(!JSON.stringify(out).includes('secret'));
  assert.ok(!JSON.stringify(out).includes('14.60'));
});

test('a nested object is not stringified onto the screen', () => {
  const out = readBillPresentment({ message: 'Account no is valid', customer_name: { first: 'A' }, bill_number: 'X' });
  assert.deepStrictEqual(out.fields.map((f) => f.key), ['billNumber']);
});

test('nothing is shown for a reply that is not "valid"', () => {
  // Even when the fields are sitting right there - their table says do not
  // display bill information for any of these.
  for (const message of ['Bill presentment is unavailable for this product', 'Service unavailable. Please try again later', 'Who knows']) {
    assert.deepStrictEqual(readBillPresentment({ ...VALID_BILL, message }).fields, [], message);
  }
});

console.log('\nThe amount offered');

test('the outstanding amount comes back as a number to offer', () => {
  assert.strictEqual(readBillPresentment(VALID_BILL).outstanding, 184.6);
  assert.strictEqual(readBillPresentment({ message: 'Account no is valid', amount_due: 'RM 1,245.00' }).outstanding, 1245);
});

test('an amount that is not one is not offered', () => {
  for (const value of ['', '-', 'n/a', '0', '0.00', '-5']) {
    assert.strictEqual(readBillPresentment({ message: 'Account no is valid', outstanding_amount: value }).outstanding, null, String(value));
  }
  assert.strictEqual(readBillPresentment({ message: 'Invalid account no', outstanding_amount: '50' }).outstanding, null);
  assert.strictEqual(toAmount('12.345'), 12.35, 'rounded to the cent');
});

console.log('\nMatching their wording');

test('their sentences are matched despite case, spacing and a full stop', () => {
  // Matched loosely on purpose: a trailing period or a doubled space is not a
  // different answer, and treating it as one would turn a valid account into
  // "unknown" and hide a bill that was there.
  assert.strictEqual(readBillPresentment({ message: '  Account No Is Valid.  ' }).status, 'valid');
  assert.strictEqual(readBillPresentment({ message: 'INVALID ACCOUNT NO.' }).blocking, true);
  assert.strictEqual(readBillPresentment({ message: 'Service  unavailable.  Please try again later' }).status, 'unavailable');
  assert.strictEqual(normalise('  A  B.  '), 'a b');
});

test('a near-miss is not read as a block', () => {
  // "unknown" is the safe default, and the default has to stay safe.
  for (const message of ['Account number invalid', 'invalid account', 'The account no is invalid']) {
    assert.strictEqual(readBillPresentment({ message }).blocking, false, message);
  }
});

console.log('\nWhich product gets asked');

test('only the billers their own documentation names are built in', () => {
  const codeFor = apiProviderService._test_billerProductCodeFor;
  assert.strictEqual(codeFor({}, 'TNB'), 'TNB');
  assert.strictEqual(codeFor({}, 'JomPAY'), 'JOMPAY');
  // Guessing one would read somebody's bill against the wrong utility.
  assert.strictEqual(codeFor({}, 'Air Selangor'), '');
  assert.strictEqual(codeFor({}, 'Astro'), '');
  assert.strictEqual(codeFor({}, ''), '');
});

test('a provider record supplies the rest', () => {
  const codeFor = apiProviderService._test_billerProductCodeFor;
  const provider = { billerProductCodes: { 'Air Selangor': 'AIRSEL', Astro: 'ASTRO' } };
  assert.strictEqual(codeFor(provider, 'Air Selangor'), 'AIRSEL');
  assert.strictEqual(codeFor(provider, 'TNB'), '', 'an explicit map replaces the built-in one rather than merging');
});

console.log('\nWhen the question is asked at all');

const { presentmentRequest } = requireEsm('src/utils/billPresentmentInputs.js', 'presentmentRequest');

test('an ordinary biller is read from the account number alone', () => {
  const out = presentmentRequest({ country: 'MY', category: 'electricity', provider: 'TNB', accountNumber: '220108271001' });
  assert.deepStrictEqual(out, { country: 'MY', provider: 'TNB', accountNumber: '220108271001' });
  assert.ok(!('amount' in out), 'the amount is what we are hoping to be TOLD; sending a half-typed one invites a validation error instead of a bill');
});

test('JomPAY is not asked until it has everything it validates', () => {
  // Asking early returns "The provided amount is invalid", which would put an
  // error on screen for a field the customer has not reached yet.
  const base = { country: 'MY', category: 'jompay', provider: 'JomPAY', accountNumber: '1234567890' };
  assert.strictEqual(presentmentRequest(base), null, 'no biller code, no amount');
  assert.strictEqual(presentmentRequest({ ...base, billerCode: '818625' }), null, 'still no amount');
  assert.strictEqual(presentmentRequest({ ...base, amount: 150 }), null, 'still no biller code');
  assert.deepStrictEqual(presentmentRequest({ ...base, billerCode: '818625', amount: 150 }), {
    country: 'MY', provider: 'JomPAY', accountNumber: '1234567890', billerCode: '818625', amount: 150,
  });
});

test('Ref-2 rides along only when the bill shows one', () => {
  const base = { country: 'MY', category: 'jompay', provider: 'JomPAY', accountNumber: '1', billerCode: '818625', amount: 150 };
  assert.ok(!('ref2' in presentmentRequest(base)));
  assert.ok(!('ref2' in presentmentRequest({ ...base, ref2: '   ' })), 'an empty Ref-2 is no Ref-2, not a blank one');
  assert.strictEqual(presentmentRequest({ ...base, ref2: 'ABC' }).ref2, 'ABC');
});

test('an incomplete form asks nothing', () => {
  assert.strictEqual(presentmentRequest(null), null);
  assert.strictEqual(presentmentRequest({}), null);
  assert.strictEqual(presentmentRequest({ country: 'MY', provider: 'TNB' }), null, 'no account number');
  assert.strictEqual(presentmentRequest({ country: 'MY', accountNumber: '1' }), null, 'no biller');
});

console.log('\nThe screen');

test('only a blocking answer is allowed to stop the step', () => {
  const screen = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/steps/BillPaymentSteps.js'), 'utf8');
  assert.ok(/billPresentmentBlock: result\.message/.test(screen), 'the block is recorded only inside the blocking branch');
  assert.ok(/if \(result\.blocking\) \{/.test(screen));
  assert.ok(/step === 3 \|\| step === 4\) && String\(serviceData\.billPresentmentBlock/.test(screen), 'and validateStep refuses on it');
  // The field rules come first, so an empty form complains about the empty
  // field rather than about a bill nobody has asked for yet.
  assert.ok(screen.indexOf('const fieldError = validateAccountStep') < screen.indexOf('serviceData.billPresentmentBlock || \'\').trim()'));
});

test('a stale verdict cannot outlive the account number it was about', () => {
  const screen = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/steps/BillPaymentSteps.js'), 'utf8');
  assert.ok(/if \(!onBillSteps \|\| !requestKey\) \{[\s\S]*?updateServiceData\(\{ billPresentmentBlock: '' \}\)/.test(screen),
    'clearing the account must clear the refusal, or the customer is locked out by a verdict on a number they have replaced');
});

test('the prefilled amount never overwrites the customer or the voucher', () => {
  const screen = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/steps/BillPaymentSteps.js'), 'utf8');
  assert.ok(/result\.outstanding && fixedAmount == null && !\(Number\.isFinite\(typedAmount\) && typedAmount > 0\)/.test(screen));
});

test('presentment looks up its own provider, not Success TopUp\u2019s', () => {
  // `catalog` in apiProviderService is the Success TopUp wrapper: it pins the
  // provider name and takes no country. Reading a Malaysian bill through it
  // would search for a provider called "Success TopUp" and quietly find
  // nothing, so every account number would come back "no bill details".
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  const callable = source.slice(source.indexOf('exports.getBillPresentment'), source.indexOf('exports.listSuccessTopUpCatalogForAdmin'));
  assert.ok(/providerCatalog\.readProvider\(db, 'Bill Payment', \{ country, strictCountry: true \}\)/.test(callable),
    'and strictly, so a Malaysian bill is never read against another country\u2019s provider');
  assert.ok(!/\bcatalog\.readProvider/.test(callable));
});

console.log(`\n${passed} checks passed.\n`);
