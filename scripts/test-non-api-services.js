'use strict';

// Mobile Banking and Remittance are never dispatched to a provider.
//
// Both move MONEY rather than buy a product: the customer pays MYR here and
// somebody abroad receives their own currency - bKash, Nagad or Rocket in
// Bangladesh, a bank or a cash counter in seven other countries. No top-up API
// does that. It is a licensed activity, and the providers wired into this app
// sell airtime, data, vouchers and bills.
//
// It was reachable. Mobile Banking carries no country at all, so
// resolveExecutionMode's reach test - "does any provider serve this country?" -
// matched a provider scoped to ALL, and one toggle in the service matrix would
// have sent a Bangladeshi payout to whichever provider happened to exist.
//
// So it is refused at every layer that could route one, and each layer is
// tested separately: a layer that quietly stopped working would otherwise be
// invisible behind the one above it.

const assert = require('assert');
const api = require('../functions/apiProviderService');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}
function atest(name, fn) {
  return fn().then(
    () => { passed += 1; console.log('  ok  ' + name); },
    (error) => { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; },
  );
}

const PAYOUTS = ['Mobile Banking', 'Remittance'];
const PRODUCTS = ['Recharge', 'Internet', 'Offer Packs', 'Bill Payment', 'Entertainment', 'Recharge PIN'];

console.log('\nWhich services these are');

test('both payouts are named, and nothing else is', () => {
  assert.deepStrictEqual([...api.NON_API_SERVICES].sort(), [...PAYOUTS].sort());
  for (const service of PAYOUTS) assert.strictEqual(api.isNonApiService(service), true, service);
  for (const service of PRODUCTS) assert.strictEqual(api.isNonApiService(service), false, service);
  assert.strictEqual(api.isNonApiService(''), false);
  assert.strictEqual(api.isNonApiService(undefined), false);
});

console.log('\nLayer 1: the mode, which decides where an order goes');

const apiEverywhere = {
  settings: { modes: Object.fromEntries([...PAYOUTS, ...PRODUCTS].map((s) => [s, 'api'])) },
  providers: [{ country: 'ALL', active: true }],
};

test('a payout stays manual even with the matrix set to API everywhere', () => {
  for (const service of PAYOUTS) {
    assert.strictEqual(api.resolveExecutionMode({ country: 'BD', service, ...apiEverywhere }), 'legacy', service);
  }
});

test('and with no country at all, which is how Mobile Banking arrives', () => {
  // The exact hole: no country means the reach test matches a provider scoped
  // to ALL, so this was the one service a single toggle could have routed.
  assert.strictEqual(api.resolveExecutionMode({ country: '', service: 'Mobile Banking', ...apiEverywhere }), 'legacy');
  assert.strictEqual(api.resolveExecutionMode({ service: 'Mobile Banking', ...apiEverywhere }), 'legacy');
});

test('a per-country override cannot reopen it either', () => {
  const settings = { modes: {}, countryModes: { BD: { 'Mobile Banking': 'api' }, '': { Remittance: 'api' } } };
  assert.strictEqual(api.resolveExecutionMode({ country: 'BD', service: 'Mobile Banking', settings, providers: [{ country: 'ALL', active: true }] }), 'legacy');
  assert.strictEqual(api.resolveExecutionMode({ country: '', service: 'Remittance', settings, providers: [{ country: 'ALL', active: true }] }), 'legacy');
});

test('every other service is untouched', () => {
  // The guard must not be a blanket "everything is manual now".
  for (const service of PRODUCTS) {
    assert.strictEqual(api.resolveExecutionMode({ country: 'BD', service, ...apiEverywhere }), 'api', service);
  }
  assert.strictEqual(api.resolveExecutionMode({ country: 'BD', service: 'Recharge', settings: { modes: {} }, providers: [{ country: 'ALL', active: true }] }), 'legacy',
    'and legacy is still the default when nothing turns it on');
});

console.log('\nLayer 2: a provider cannot be configured for one');

test('saving a provider for a payout is refused', () => {
  const validate = api._test.validate;
  const base = {
    name: 'anyone', country: 'ALL', baseUrl: 'https://api.example.com',
    endpointPath: '/v2/topup', method: 'POST', authType: 'none',
  };
  for (const service of PAYOUTS) {
    assert.throws(() => validate({ ...base, service }), /payout, not a product purchase/, service);
  }
  // Including as a secondary feature on a record that is otherwise fine - the
  // multi-feature list is the way round the primary check.
  assert.throws(() => validate({ ...base, service: 'Recharge', services: ['Recharge', 'Remittance'] }), /payout/);
  assert.doesNotThrow(() => validate({ ...base, service: 'Recharge', services: ['Recharge', 'Internet'] }));
});

console.log('\nLayer 3: the dispatch itself');

const dispatch = [];

dispatch.push(atest('executing one is refused outright', async () => {
  // The last line of defence and the one that would do the damage. It refuses
  // before reading providers, so it holds even if everything above it is
  // misconfigured.
  for (const service of PAYOUTS) {
    await assert.rejects(
      () => api.executeConfiguredApi(service, { raw: { country: 'BD' } }, { uid: 'u' }, 'req-1'),
      /never dispatched to an API provider/,
      service,
    );
  }
}));

console.log('\nLayer 4: the stored settings cannot say otherwise');

test('a stored "api" mode for a payout is not reported back', () => {
  // A settings document written before this existed could still say api. The
  // charge path ignores it either way; showing it would be a lie.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  const getter = source.slice(source.indexOf('exports.getServiceApiSettings'), source.indexOf('exports.saveServiceApiSettings'));
  assert.ok(/for \(const service of NON_API_SERVICES\) modes\[service\] = 'legacy';/.test(getter));
  assert.ok(/nonApiServices: NON_API_SERVICES/.test(getter), 'and the screen is told which they are');
});

test('saving cannot write one', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  const saver = source.slice(source.indexOf('exports.saveServiceApiSettings'));
  assert.ok(/if \(isNonApiService\(service\)\) continue;/.test(saver), 'a posted mode for a payout must be dropped');
  const countryReader = source.slice(source.indexOf('function readCountryModes'), source.indexOf('exports.getServiceApiSettings'));
  assert.ok(/if \(isNonApiService\(service\)\) continue;/.test(countryReader), 'and so must a per-country one');
});

console.log('\nThe screen');

test('the matrix offers no API toggle for a payout, and says why', () => {
  const screen = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/screens/ApiProviderManagementScreen.js'), 'utf8');
  assert.ok(/const fixedManual=nonApiServices\.includes\(service\);/.test(screen));
  assert.ok(/\{fixedManual\s*\?\s*<Text[^>]*>Manual only<\/Text>/.test(screen), 'the API button must not render for one');
  assert.ok(/A payout, not a product purchase/.test(screen), 'and the reason is worth saying once');
  // From the server, not a second copy of the list here - two lists drift and
  // the screen ends up offering a toggle the backend refuses.
  assert.ok(/setNonApiServices\(settings\.nonApiServices\|\|\[\]\)/.test(screen));
  assert.ok(!/'Mobile Banking'\s*,\s*'Remittance'/.test(screen), 'the screen must not hardcode the list');
});

test('the row is still shown rather than hidden', () => {
  // A feature that vanishes from the matrix reads as something broken.
  const screen = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/screens/ApiProviderManagementScreen.js'), 'utf8');
  assert.ok(!/filter\([^)]*nonApiServices/.test(screen));
});

Promise.all(dispatch).then(() => {
  console.log(`\n${passed} checks passed.\n`);
});
