'use strict';

// Does a provider's callback describe the transaction it claims to?
//
// This decides whether money settles, and it had no test at all. The refid
// already identifies the order, so this is a second opinion on top of that:
// product, account and amount are compared against what we actually sent.
//
// The failure mode worth guarding is not a wrong callback getting through. It
// is a RIGHT one being refused: an order then sits at `processing` for ever
// with the customer's wallet already debited and the top-up already done, the
// only trace is a counter nobody watches, and nothing re-queries an iimmpact
// order because the poller is hardcoded to Success TopUp. Every "absent" case
// below exists for that reason.

const assert = require('assert');
const { matchesCallbackRequest } = require('../functions/callbackMatch');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

const SENT = { product: 'HI', account: '0178855286', amount: 40 };
// No default parameter: passing `undefined` deliberately is one of the cases
// under test, and a default would silently swap SENT in for it.
const ok = (data, ...rest) => matchesCallbackRequest(data, rest.length ? rest[0] : SENT).ok;
const field = (data, ...rest) => matchesCallbackRequest(data, rest.length ? rest[0] : SENT).field;

console.log('\nA callback that matches settles');

test('the same product, account and amount', () => {
  assert.strictEqual(ok({ product: 'HI', account: '0178855286', amount: 40 }), true);
});

test('the amount as the provider chose to write it', () => {
  // A provider sending "40.00" where we recorded 40 is the same amount, and
  // refusing it would strand the order.
  for (const amount of [40, '40', '40.00', 40.0, '40.000']) {
    assert.strictEqual(ok({ ...SENT, amount }), true, String(amount));
  }
});

console.log('\nA callback that contradicts is refused');

test('a different account', () => {
  // The one this is really for: our refid, somebody else’s number.
  assert.strictEqual(ok({ ...SENT, account: '0111111111' }), false);
  assert.strictEqual(field({ ...SENT, account: '0111111111' }), 'account');
});

test('a different product', () => {
  assert.strictEqual(ok({ ...SENT, product: 'UMI' }), false);
  assert.strictEqual(field({ ...SENT, product: 'UMI' }), 'product');
});

test('a different amount, down to the cent', () => {
  assert.strictEqual(ok({ ...SENT, amount: 400 }), false);
  assert.strictEqual(field({ ...SENT, amount: 400 }), 'amount');
  assert.strictEqual(ok({ ...SENT, amount: 40.01 }), false, 'a cent is a difference');
  assert.strictEqual(ok({ ...SENT, amount: '39.99' }), false);
});

console.log('\nAn ABSENT value is not evidence, and never refuses');

test('a callback that omits the amount still settles', () => {
  // This was the bug. Compared unconditionally, a provider that does not send
  // an amount - or sends it under another name, or one level deeper than we
  // look - failed EVERY callback it ever made, and every order stuck.
  assert.strictEqual(ok({ product: 'HI', account: '0178855286' }), true);
  for (const amount of [undefined, null, '', 0, 'n/a']) {
    assert.strictEqual(ok({ ...SENT, amount }), true, String(amount));
  }
});

test('a callback that omits product or account still settles', () => {
  assert.strictEqual(ok({ amount: 40 }), true);
  assert.strictEqual(ok({ product: 'HI' }), true);
  assert.strictEqual(ok({}), true, 'a callback shaped differently from what we guessed is not a wrong one');
});

test('and the same the other way: nothing recorded, nothing to disagree with', () => {
  // An order dispatched before requestCheck existed, or one where the amount
  // did not resolve to a number.
  assert.strictEqual(ok({ product: 'UMI', account: 'x', amount: 9 }, undefined), true);
  assert.strictEqual(ok({ product: 'UMI', account: 'x', amount: 9 }, null), true);
  assert.strictEqual(ok({ product: 'UMI', account: 'x', amount: 9 }, {}), true);
  assert.strictEqual(ok({ amount: 9 }, { product: 'HI', account: '0178855286', amount: '' }), true,
    'an unrecorded amount must not refuse every callback');
  assert.strictEqual(ok({ amount: 9 }, { amount: 0 }), true, 'nor a zero one');
});

test('a non-object on either side is nothing to compare, not a mismatch', () => {
  for (const odd of [null, undefined, 'text', 42, []]) {
    assert.strictEqual(ok(odd), true, `callback ${JSON.stringify(odd)}`);
    assert.strictEqual(ok(SENT, odd), true, `recorded ${JSON.stringify(odd)}`);
  }
});

console.log('\nStill strict where it can be');

test('a present-and-different value refuses even when the others are absent', () => {
  // "Absent is not evidence" must not become "anything goes".
  assert.strictEqual(ok({ account: '0111111111' }), false);
  assert.strictEqual(ok({ product: 'UMI' }), false);
  assert.strictEqual(ok({ amount: 999 }), false);
});

test('the field that disagreed is named', () => {
  // A refused callback leaves the order at `processing` with nothing else to
  // go on, and nothing re-queries an iimmpact order.
  assert.strictEqual(field({ ...SENT, account: 'x' }), 'account');
  assert.strictEqual(field({ ...SENT, amount: 1 }), 'amount');
  assert.strictEqual(field(SENT), '');
});

console.log('\nThe webhook uses it, and says which field');

test('the handler calls the matcher rather than comparing inline', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiWebhookService.js'), 'utf8');
  assert.ok(/matchesCallbackRequest\(pathGet\(body, 'data'\), requestCheck\)/.test(source));
  assert.ok(!/const amountMatches = Number\.isFinite/.test(source), 'the inline comparison must be gone');
});

test('a refused callback is logged and recorded with its field', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiWebhookService.js'), 'utf8');
  assert.ok(/console\.warn\('apiWebhook callback did not match the dispatched request'/.test(source));
  assert.ok(/lastMismatchedField: mismatchedField \|\| null/.test(source));
});

console.log(`\n${passed} checks passed.\n`);
