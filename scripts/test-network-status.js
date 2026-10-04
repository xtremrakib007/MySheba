'use strict';

// Is the biller or operator up?
//
// This is the one integration that is allowed to do nothing at all. iimmpact's
// guide says plainly that an interruption must NOT block the payment flow, so
// there is no blocking answer here and no field that could carry one.
//
// Which inverts the risk. Bill presentment's danger is a payment wrongly
// refused; this one's is a warning wrongly SHOWN - "it might not go through"
// on a healthy product talks somebody out of paying for no reason. So the
// tests below are mostly about silence: an unrecognised reply, an unreachable
// provider, an ambiguous operator, all say nothing.

const assert = require('assert');
const { readNetworkStatus, interruptionNotice } = require('../functions/networkStatus');
const apiProviderService = require('../functions/apiProviderService');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

console.log('\nNothing here can stop a payment');

test('no answer carries anything that could block', () => {
  // Structural, and the point: a caller cannot turn this into a gate because
  // there is nothing to gate on. Bill presentment has `blocking`; this has no
  // equivalent, deliberately.
  for (const status of ['Interruption', 'Normal', '', undefined]) {
    const out = readNetworkStatus({ status });
    assert.ok(!('blocking' in out), 'a blocking field would invite exactly the misuse the provider forbids');
    assert.deepStrictEqual(Object.keys(out).sort(), ['raw', 'status']);
  }
});

test('the step rules never read the status', () => {
  const fs = require('fs');
  const path = require('path');
  for (const file of ['src/steps/BillPaymentSteps.js', 'src/steps/InternetSteps.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const validate = source.slice(source.indexOf('export function validateStep'));
    assert.ok(!/interruption/i.test(validate), `${file}: validateStep must not know about interruptions`);
  }
});

test('the notice says out loud that the customer may continue', () => {
  // A warning that reads like a refusal is a refusal, as far as the person
  // holding the phone is concerned.
  const notice = interruptionNotice({ status: 'interruption' });
  assert.ok(/still continue/i.test(notice), notice);
});

console.log('\nWhen a warning is shown');

test('an interruption warns', () => {
  assert.strictEqual(readNetworkStatus({ status: 'Interruption' }).status, 'interruption');
  assert.ok(interruptionNotice(readNetworkStatus({ status: 'Interruption' })));
});

test('a healthy product does not', () => {
  for (const status of ['Normal', 'Operational', 'Available', 'OK', 'Up']) {
    assert.strictEqual(readNetworkStatus({ status }).status, 'ok', status);
    assert.strictEqual(interruptionNotice(readNetworkStatus({ status })), '');
  }
});

test('"no interruption" is not an interruption', () => {
  // A plain substring match reads this as a warning and says the opposite of
  // what the provider said.
  for (const status of ['No interruption', 'no interruptions reported', 'No Interruption.']) {
    assert.strictEqual(readNetworkStatus({ status }).status, 'ok', status);
  }
});

test('a word that merely contains it does not warn', () => {
  assert.strictEqual(readNetworkStatus({ status: 'uninterrupted' }).status, 'ok');
  assert.strictEqual(readNetworkStatus({ status: 'interruptible' }).status, 'ok');
});

test('their wording in a sentence still warns', () => {
  assert.strictEqual(readNetworkStatus({ status: 'Interruption on this product' }).status, 'interruption');
  assert.strictEqual(readNetworkStatus({ status: '  INTERRUPTION  ' }).status, 'interruption');
  assert.strictEqual(readNetworkStatus({ status: 'Service interruptions' }).status, 'interruption');
});

console.log('\nWhen nothing is shown');

test('an unreachable provider is silence, not a warning', () => {
  const out = readNetworkStatus({}, { reachable: false });
  assert.strictEqual(out.status, 'unknown');
  assert.strictEqual(interruptionNotice(out), '');
});

test('an empty or unreadable reply is silence', () => {
  for (const body of [{}, null, undefined, [], 'text', { status: '' }, { status: null }, { status: {} }]) {
    assert.strictEqual(interruptionNotice(readNetworkStatus(body)), '', JSON.stringify(body));
  }
});

test('a status that is not a scalar is skipped, not stringified', () => {
  // Without that, "[object Object]" becomes the status and whatever key held
  // the real one is never reached.
  assert.strictEqual(readNetworkStatus({ status: {} }).raw, '');
  assert.strictEqual(readNetworkStatus({ status: { nested: 1 }, network_status: 'Interruption' }).status, 'interruption');
});

console.log('\nWhich product gets asked about');

const productFor = apiProviderService._test_statusProductCodeFor;
const IIMMPACT = { name: 'iimmpact', baseUrl: 'https://api.iimmpact.com', catalogPreset: 'iimmpact-subproducts', catalogPath: '/v2/subproducts' };

test('a biller asks about its own product', () => {
  assert.strictEqual(productFor({}, { service: 'Bill Payment', billerName: 'TNB' }), 'TNB');
  assert.strictEqual(productFor({}, { service: 'Bill Payment', billerName: 'JomPAY' }), 'JOMPAY');
  assert.strictEqual(productFor({}, { service: 'Bill Payment', billerName: 'Air Selangor' }), '', 'a biller with no code is not asked about');
});

test('an unambiguous operator is asked about before a plan is chosen', () => {
  assert.strictEqual(productFor(IIMMPACT, { service: 'Internet', operatorName: 'Hotlink' }), 'HI');
  assert.strictEqual(productFor(IIMMPACT, { service: 'Internet', operatorName: 'Yes' }), 'YESI');
});

test('an AMBIGUOUS operator is not asked about until the plan says which', () => {
  // CelcomDigi is Celcom and Digi; the customer's number is on one of them.
  // Warning because the other is down is a false alarm, and talking somebody
  // out of a payment that would have worked is the only harm this can do.
  assert.strictEqual(productFor(IIMMPACT, { service: 'Internet', operatorName: 'CelcomDigi' }), '');
  assert.strictEqual(productFor(IIMMPACT, { service: 'Internet', operatorName: 'CelcomDigi', productCode: 'DI' }), 'DI');
});

test('a product code the operator could not be is refused', () => {
  // So the screen cannot be used to ask about arbitrary products.
  assert.strictEqual(productFor(IIMMPACT, { service: 'Internet', operatorName: 'Hotlink', productCode: 'JOMPAY' }), '');
  assert.strictEqual(productFor(IIMMPACT, { service: 'Internet', operatorName: 'CelcomDigi', productCode: 'HI' }), '');
  assert.strictEqual(productFor(IIMMPACT, { service: 'Internet', operatorName: 'Unifi', productCode: 'HI' }), '');
});

console.log('\nAsking the provider no more than necessary');

test('a definite answer is remembered, briefly', () => {
  const { cachedNetworkStatus, rememberNetworkStatus, cache, TTL } = apiProviderService._test_networkStatusCache;
  cache.clear();
  const now = 1000000;
  rememberNetworkStatus('p|HI', { status: 'ok', notice: '' }, now);
  assert.deepStrictEqual(cachedNetworkStatus('p|HI', now + 1000), { status: 'ok', notice: '' });
  assert.strictEqual(cachedNetworkStatus('p|HI', now + TTL + 1), null, 'and forgotten once it is stale');
  assert.strictEqual(cachedNetworkStatus('p|DI', now), null, 'one product’s status is not another’s');
  cache.clear();
});

test('the cache cannot grow without bound', () => {
  // A Map in a long-lived instance keyed by provider product codes has no
  // natural ceiling to rely on.
  const { rememberNetworkStatus, cache, MAX } = apiProviderService._test_networkStatusCache;
  cache.clear();
  for (let i = 0; i < MAX + 50; i += 1) rememberNetworkStatus(`p|${i}`, { status: 'ok', notice: '' }, 1000 + i);
  assert.ok(cache.size <= MAX, `cache grew to ${cache.size}`);
  cache.clear();
});

test('an unknown status is NOT remembered', () => {
  // Caching a blip would keep the provider looking down for a minute after it
  // came back.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  assert.ok(/if \(result\.status !== 'unknown'\) rememberNetworkStatus/.test(source));
});

console.log('\nThe screens');

test('both steps show the notice and neither gates on it', () => {
  const fs = require('fs');
  const path = require('path');
  for (const file of ['src/steps/BillPaymentSteps.js', 'src/steps/InternetSteps.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.ok(/<ServiceInterruptionNotice notice=\{interruption\} \/>/.test(source), `${file} must render it`);
    assert.ok(/useNetworkStatus\(\{/.test(source), `${file} must use the shared hook`);
  }
});

test('the internet step asks about the plan’s own product', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/steps/InternetSteps.js'), 'utf8');
  assert.ok(/productCode: serviceData\.operatorCode/.test(source),
    'otherwise CelcomDigi warns about whichever half we guessed');
});

test('the hook hands back a sentence and nothing else', () => {
  // Structural again: a caller that only ever receives a string cannot
  // accidentally branch a step on the status.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/components/useNetworkStatus.js'), 'utf8');
  assert.ok(/return notice;/.test(source));
  assert.ok(!/return \{/.test(source), 'returning an object would invite a caller to read a status off it');
});

console.log(`\n${passed} checks passed.\n`);
