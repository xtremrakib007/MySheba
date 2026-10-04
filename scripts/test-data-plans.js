'use strict';

// Per-number mobile data plans.
//
// Every other catalogue in this app is a price list: ask once per operator and
// everyone sees the same packages. This one is personalised to a phone number,
// and that difference is where the failures live:
//
//   * a request sent without the number does not fail - it answers with some
//     default list, which would then be priced and charged as if it were this
//     customer's;
//   * an operator can map to more than one of the provider's products, so
//     "which product is this plan on" cannot be answered by the operator name;
//   * the price shown and the price charged have to come from the same place,
//     and outside Bangladesh the price used to come from the client.

const assert = require('assert');

// Credentials live in Secret Manager, which is not reachable from a test and
// is not what any of this is about. Stubbed to hand back whatever the provider
// fixture carries, so readProvider's own behaviour is exercised unchanged.
const providerSecretService = require('../functions/providerSecretService');
providerSecretService.getCredentials = async (provider) => ({
  apiKey: provider.apiKey || '',
  secretKey: provider.secretKey || '',
  password: '',
  username: String(provider.username || ''),
});

const catalog = require('../functions/providerCatalog');
const apiProviderService = require('../functions/apiProviderService');
const wallet = require('../functions/walletService');

// The client is ESM and this script is CommonJS. Rather than add a build step
// for one pure function, its source is read and evaluated - it imports nothing,
// which is the point of having lifted it out of the screen.
function requireEsm(relativePath, ...names) {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
    .replace(/^export function /gm, 'function ');
  const factory = new Function(`${source}\nreturn { ${names.join(', ')} };`);
  return factory();
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}
// Queued rather than started, and run strictly in order. Several of these
// stand a stub in for an outbound call by replacing a module export; started
// eagerly they overlap, and one test's restore() lands in the middle of
// another's run - which looks exactly like the code being broken.
const queue = [];
function atest(name, fn) {
  queue.push(async () => {
    try { await fn(); passed += 1; console.log('  ok  ' + name); }
    catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
  });
}

const IIMMPACT = {
  id: 'p1',
  name: 'iimmpact',
  service: 'Internet',
  country: 'MY',
  baseUrl: 'https://api.iimmpact.com',
  catalogPreset: 'iimmpact-subproducts',
  authType: 'iimmpactHmac',
  apiKey: 'pk',
  secretKey: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
};

// What a subproducts reply looks like, in iimmpact's documented vocabulary.
const planReply = (plans) => ({ data: plans });
const PLAN = {
  code: 'Unlimited data with hotspot and calls 30-days (3Mbps) H',
  description: 'Unlimited 30 days',
  denomination: '40.00',
  cost: '38.10',
  validity: '30 days',
};

console.log('\nOperator to product code');

test('CelcomDigi asks BOTH of the products it could be', () => {
  // Celcom and Digi merged under one brand; the provider still sells CEL and
  // DI separately and our prefix table cannot tell which half a number is on.
  // Picking one would offer a Celcom customer Digi's plans.
  assert.deepStrictEqual(catalog.productCodesFor(IIMMPACT, 'CelcomDigi'), ['CEL', 'DI']);
});

test('an unambiguous operator asks one', () => {
  assert.deepStrictEqual(catalog.productCodesFor(IIMMPACT, 'Hotlink'), ['HI']);
  assert.deepStrictEqual(catalog.productCodesFor(IIMMPACT, 'U Mobile'), ['UMI']);
  assert.deepStrictEqual(catalog.productCodesFor(IIMMPACT, 'Yes'), ['YESI']);
});

test('an operator the provider sells no plans for asks none', () => {
  // Not a failure. Unifi keeps the built-in package list it already had.
  assert.deepStrictEqual(catalog.productCodesFor(IIMMPACT, 'Unifi'), []);
  assert.deepStrictEqual(catalog.productCodesFor(IIMMPACT, ''), []);
  assert.deepStrictEqual(catalog.productCodesFor(IIMMPACT, 'Nonsense'), []);
});

test('a provider record can correct the map without a deploy', () => {
  const corrected = { ...IIMMPACT, catalogOperatorCodes: { CelcomDigi: ['DI'], Unifi: 'UMI' } };
  assert.deepStrictEqual(catalog.productCodesFor(corrected, 'CelcomDigi'), ['DI']);
  assert.deepStrictEqual(catalog.productCodesFor(corrected, 'Unifi'), ['UMI'], 'a bare string is one code');
  assert.deepStrictEqual(catalog.productCodesFor(corrected, 'Hotlink'), [], 'an override replaces the map, it does not merge');
});

test('the number of outbound calls per listing is bounded', () => {
  const silly = { ...IIMMPACT, catalogOperatorCodes: { X: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] } };
  assert.ok(catalog.productCodesFor(silly, 'X').length <= 4);
});

test('this catalogue declares itself per-number, and Success TopUp does not', () => {
  assert.strictEqual(catalog.isPerAccountCatalog(IIMMPACT), true);
  assert.strictEqual(catalog.isPerAccountCatalog({ name: 'Success TopUp', baseUrl: 'https://x' }), false);
});

console.log('\nThe request');

// A transport that records what it was asked to send and replays a canned body.
function recorder(reply = planReply([PLAN])) {
  const calls = [];
  return {
    calls,
    request: async (url, init, config, provider) => { calls.push({ url, init, config, provider }); return reply; },
  };
}


(atest('the number is sent as account_number, with the product code', async () => {
  const r = recorder();
  await catalog.fetchCatalog(IIMMPACT, { operator: 'HI', account: '0178855286' }, { request: r.request });
  assert.strictEqual(r.calls.length, 1);
  const { url } = r.calls[0];
  assert.strictEqual(url.pathname, '/v2/subproducts');
  assert.strictEqual(url.searchParams.get('product_code'), 'HI');
  assert.strictEqual(url.searchParams.get('account_number'), '0178855286');
}));

(atest('a per-number catalogue is REFUSED without a number', async () => {
  // The failure this prevents is silent: asked with an empty account_number the
  // provider answers with a default list, and that list would be priced and
  // charged as though it were this customer's.
  const r = recorder();
  await assert.rejects(
    () => catalog.fetchCatalog(IIMMPACT, { operator: 'HI', account: '' }, { request: r.request }),
    /per phone number/,
  );
  assert.strictEqual(r.calls.length, 0, 'and nothing is sent');
}));

(atest('a GET carries no body at all', async () => {
  // Not tidiness. The signature covers the body, so "{}" and no body hash
  // differently and every signed request would be rejected.
  const r = recorder();
  await catalog.fetchCatalog(IIMMPACT, { operator: 'HI', account: '0178855286' }, { request: r.request });
  const { init } = r.calls[0];
  assert.strictEqual(init.method, 'GET');
  assert.strictEqual(init.body, undefined);
  assert.ok(!('content-type' in init.headers), 'and no content-type for a body that does not exist');
}));

(atest('the provider reaches the transport, so the request can be signed', async () => {
  const r = recorder();
  await catalog.fetchCatalog(IIMMPACT, { operator: 'HI', account: '0178855286' }, { request: r.request });
  assert.strictEqual(r.calls[0].provider, IIMMPACT, 'without it a signed catalogue call is a 401 and no packages ever load');
}));

(atest("Success TopUp's POST body is unchanged", async () => {
  const successTopUp = { name: 'Success TopUp', baseUrl: 'https://api.successtopup.com', apiKey: 'k', secretKey: 's' };
  const r = recorder({ result: true, drives: [{ driveId: '7', title: 'Pack', price: 100 }] });
  const out = await catalog.fetchCatalog(successTopUp, { operator: 'GP', type: 'regular' }, { request: r.request });
  const { init } = r.calls[0];
  assert.strictEqual(init.method, 'POST');
  assert.deepStrictEqual(JSON.parse(init.body), { operator: 'GP', type: 'regular', successtopup_key: 'k', successtopup_secret: 's' });
  assert.strictEqual(out.length, 1);
}));

console.log('\nThe reply');

(atest('a plan is read out of iimmpact’s own field names', async () => {
  const r = recorder();
  const [plan] = await catalog.fetchCatalog(IIMMPACT, { operator: 'HI', account: '0178855286' }, { request: r.request });
  assert.strictEqual(plan.id, PLAN.code, 'the subproduct code is the id, verbatim - it is a sentence, not a short code');
  assert.strictEqual(plan.name, 'Unlimited 30 days');
  assert.strictEqual(plan.valid, '30 days');
}));

(atest('the price is the DENOMINATION, never the cost', async () => {
  // denomination is the face value and is what must be sent as the amount.
  // cost is what we pay, 38.10 against a face value of 40 - sending that as
  // the amount buys a different product or is rejected outright.
  const r = recorder();
  const [plan] = await catalog.fetchCatalog(IIMMPACT, { operator: 'HI', account: '0178855286' }, { request: r.request });
  assert.strictEqual(plan.price, 40);
  assert.notStrictEqual(plan.price, 38.1);
}));

(atest('each plan remembers which product answered for it', async () => {
  const r = recorder();
  const [plan] = await catalog.fetchCatalog(IIMMPACT, { operator: 'DI', account: '0123456789' }, { request: r.request });
  assert.strictEqual(plan.productCode, 'DI', 'with CelcomDigi asking two products, the operator name cannot answer this later');
}));

(atest('a mapping that no longer fits says which fields arrived', async () => {
  const r = recorder(planReply([{ unexpected: 1, other: 2 }]));
  await assert.rejects(
    () => catalog.fetchCatalog(IIMMPACT, { operator: 'HI', account: '0178855286' }, { request: r.request }),
    /unexpected, other/,
    'otherwise the customer is told their number has no plans, which sends them looking at their own line',
  );
}));

console.log('\nResolving the order (what decides the charge)');

// A fake Firestore that honours where(), because which provider a query finds
// is exactly what several of these tests are about - a query pinned to the
// wrong provider name must come back empty, not come back with whatever the
// fixture happened to hold.
const fakeDb = (providers) => ({
  collection: (name) => {
    if (name !== 'api_providers') {
      return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
    }
    const query = (filters) => ({
      where: (field, op, value) => query([...filters, [field, value]]),
      limit: () => query(filters),
      get: async () => {
        const docs = providers.filter((p) => filters.every(([field, value]) => {
          if (field === 'active') return (p.active !== false) === value;
          return p[field] === value;
        }));
        return { empty: !docs.length, docs: docs.map((p) => ({ id: p.id, data: () => p })) };
      },
    });
    return query([]);
  },
});

(atest('a plan found under the second product is priced under THAT product', async () => {
  const asked = [];
  const fetchFn = async (provider, code) => {
    asked.push(code);
    // The number is on Digi, so Celcom answers with nothing.
    return code === 'DI' ? [{ id: 'PLAN-X', name: 'Digi 30d', price: 40, productCode: 'DI' }] : [];
  };
  const out = await catalog.resolveOrderPackage({
    db: fakeDb([IIMMPACT]), service: 'Internet', country: 'MY', strictCountry: true,
    operatorName: 'CelcomDigi', packageId: 'PLAN-X', account: '0123456789', fetchCatalog: fetchFn,
  });
  assert.deepStrictEqual(asked, ['CEL', 'DI'], 'both are asked');
  assert.strictEqual(out.productCode, 'DI');
  assert.strictEqual(out.costAmount, 40);
  assert.strictEqual(out.sellAmount, 40);
}));

(atest('the client does not get to say which product its plan is on', async () => {
  // operatorCode is ignored entirely for a per-number catalogue: naming a
  // product the number is not on finds no plan rather than pricing against it.
  const fetchFn = async (provider, code) => (code === 'DI' ? [{ id: 'PLAN-X', name: 'x', price: 40 }] : []);
  const out = await catalog.resolveOrderPackage({
    db: fakeDb([IIMMPACT]), service: 'Internet', country: 'MY', strictCountry: true,
    operatorName: 'CelcomDigi', operatorCode: 'TOTALLY-MADE-UP',
    packageId: 'PLAN-X', account: '0123456789', fetchCatalog: fetchFn,
  });
  assert.strictEqual(out.productCode, 'DI');
}));

(atest('the SAME number is used to re-resolve as was used to quote', async () => {
  let seen = null;
  const fetchFn = async (provider, code, type, account) => { seen = account; return [{ id: 'P', name: 'x', price: 10 }]; };
  await catalog.resolveOrderPackage({
    db: fakeDb([IIMMPACT]), service: 'Internet', country: 'MY', strictCountry: true,
    operatorName: 'Hotlink', packageId: 'P', account: '0178855286', fetchCatalog: fetchFn,
  });
  assert.strictEqual(seen, '0178855286', 'another number is eligible for another list and would price a plan this customer cannot buy');
}));

(atest('a plan that is not on this number is refused, not priced', async () => {
  const fetchFn = async () => [{ id: 'SOMETHING-ELSE', name: 'x', price: 10 }];
  const out = await catalog.resolveOrderPackage({
    db: fakeDb([IIMMPACT]), service: 'Internet', country: 'MY', strictCountry: true,
    operatorName: 'Hotlink', packageId: 'P', account: '0178855286', fetchCatalog: fetchFn,
  });
  assert.strictEqual(out.package, undefined);
  assert.ok(out.error, 'an unresolvable package must never fall through to the client’s own price');
}));

(atest('an operator with no products is a clean no, not a mispriced yes', async () => {
  const out = await catalog.resolveOrderPackage({
    db: fakeDb([IIMMPACT]), service: 'Internet', country: 'MY', strictCountry: true,
    operatorName: 'Unifi', packageId: 'P', account: '0178855286', fetchCatalog: async () => [],
  });
  assert.strictEqual(out.error, 'operator-has-no-products');
}));

(atest('a Malaysian order is never resolved against a Bangladeshi catalogue', async () => {
  // readProvider falls back to every provider when no country matches, which
  // was harmless while Bangladesh was the only catalogue. strictCountry is
  // what stops a MY order being priced off Success TopUp's BD price list.
  const successTopUpBd = { id: 'st', name: 'Success TopUp', service: 'Internet', country: 'BD', baseUrl: 'https://api.successtopup.com', apiKey: 'k', secretKey: 's' };
  const out = await catalog.resolveOrderPackage({
    db: fakeDb([successTopUpBd]), service: 'Internet', country: 'MY', strictCountry: true,
    operatorName: 'Hotlink', packageId: 'P', account: '0178855286', fetchCatalog: async () => [{ id: 'P', name: 'x', price: 10 }],
  });
  assert.strictEqual(out.error, 'provider-unconfigured');

  const loose = await catalog.perAccountCatalogFor(fakeDb([successTopUpBd]), 'Internet', 'MY', 'Hotlink');
  assert.strictEqual(loose, null);

  // And the case the fallback really reaches for: a per-number provider that
  // IS one, scoped to another country. Without a strict lookup this comes back
  // as Malaysia's catalogue because it is the only document there is.
  const iimmpactScopedToBd = { ...IIMMPACT, id: 'wrong', country: 'BD' };
  assert.strictEqual(await catalog.perAccountCatalogFor(fakeDb([iimmpactScopedToBd]), 'Internet', 'MY', 'Hotlink'), null);
  const priced = await catalog.resolveOrderPackage({
    db: fakeDb([iimmpactScopedToBd]), service: 'Internet', country: 'MY', strictCountry: true,
    operatorName: 'Hotlink', packageId: 'P', account: '0178855286', fetchCatalog: async () => [{ id: 'P', name: 'x', price: 10 }],
  });
  assert.strictEqual(priced.error, 'provider-unconfigured');

  // A provider serving ALL countries still serves Malaysia - strict means
  // "this country or every country", not "this country only".
  const everywhere = { ...IIMMPACT, id: 'all', country: 'ALL' };
  const global = await catalog.perAccountCatalogFor(fakeDb([everywhere]), 'Internet', 'MY', 'Hotlink');
  assert.strictEqual(global && global.provider.id, 'all');
}));

(atest('one shared answer decides both the picker and the charge', async () => {
  // Asking this question two different ways is how a customer comes to be
  // offered a list the charge path has never heard of.
  const found = await catalog.perAccountCatalogFor(fakeDb([IIMMPACT]), 'Internet', 'MY', 'CelcomDigi');
  assert.deepStrictEqual(found.codes, ['CEL', 'DI']);
  assert.strictEqual(found.provider.id, 'p1');
  assert.strictEqual(await catalog.perAccountCatalogFor(fakeDb([IIMMPACT]), 'Internet', 'MY', 'Unifi'), null);
  assert.strictEqual(await catalog.perAccountCatalogFor(fakeDb([]), 'Internet', 'MY', 'Hotlink'), null);
}));

console.log('\nThe number, and the price');

test('a number reaches the provider in the national form its examples use', () => {
  const n = apiProviderService.nationalAccountNumber;
  assert.strictEqual(n('0178855286', 'MY'), '0178855286');
  assert.strictEqual(n('+60178855286', 'MY'), '0178855286');
  assert.strictEqual(n('60178855286', 'MY'), '0178855286');
  assert.strictEqual(n('017-885 5286', 'MY'), '0178855286');
  assert.strictEqual(n('178855286', 'MY'), '0178855286');
  assert.strictEqual(n('', 'MY'), '');
  // 60xxxxxx is a plausible national number, not a dial code plus four digits.
  assert.strictEqual(n('60123456', 'MY'), '060123456');
});

test('the price quoted and the price charged use the same rate for every country', () => {
  // The quoter had no Malaysia entry and answered NaN, so nothing was quoted
  // and the picker fell back to the raw catalogue price - while the wallet is
  // still debited through the markup, the tier discount and the wallet FX.
  const quoteRate = apiProviderService._test_quoteRateFor;
  const chargeRate = (country, rates) => wallet._test.amountToPoints(100, country, rates).rate;
  const rates = { rechargeBD: 30, rechargeIN: 20, rechargeNP: 25, rechargeID: 3000, rechargePK: 50, rechargeMM: 400, rechargePH: 12, rechargeKH: 800 };
  for (const country of ['MY', 'BD', 'IN', 'NP', 'ID', 'PK', 'MM', 'PH', 'KH']) {
    assert.strictEqual(quoteRate(country, rates), chargeRate(country, rates), `${country} would be shown one price and charged another`);
  }
  assert.strictEqual(quoteRate('MY', rates), 1, 'Malaysia needs no conversion, and says so with 1 rather than nothing');
});

test('the customer-facing listing resolves the SAME provider as the charge', () => {
  // These were two different lookups, and the one the listing used was the
  // Success TopUp wrapper: it pins the provider name, accepts no country, and
  // silently dropped both - so a Malaysian per-number listing searched for a
  // provider called "Success TopUp" and could never find iimmpact. The feature
  // was dead on arrival and nothing failed.
  const fs = require('fs');
  const path = require('path');
  const service = fs.readFileSync(path.join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  const listing = service.slice(service.indexOf('exports.listProviderDataPlans'), service.indexOf('exports.getBillPresentment'));
  assert.ok(/providerCatalog\.perAccountCatalogFor\(db, service, country, operatorName\)/.test(listing),
    'the listing must ask the one shared question');
  assert.ok(!/\bcatalog\.readProvider/.test(listing), 'and never the Success TopUp wrapper');
});

test('the wrapper refuses options it cannot honour, rather than dropping them', () => {
  // A silent drop is what made the bug above invisible. It throws now, so the
  // same mistake is a stack trace rather than a feature that never fires.
  const successTopUpCatalog = require('../functions/successTopUpCatalog');
  assert.throws(() => successTopUpCatalog.readProvider({}, 'Internet', { country: 'MY' }), /takes no options/);
});

console.log('\nWhat the customer is offered');

// The screen's own rule, lifted out of the JSX so the failure case can be
// stated rather than read.
const { resolvePackageSource } = requireEsm('src/utils/packageSource.js', 'resolvePackageSource');

const BUILT_IN = [{ id: 'base:0', name: 'Built-in 30GB', price: 35 }];
const BD_LIST = [{ id: 'd1', name: 'BD pack', price: 199 }];
const PER_NUMBER = [{ id: 'PLAN-X', name: 'Unlimited 30d', price: 40 }];

test('plans for this number replace the built-in list', () => {
  const out = resolvePackageSource({ country: 'MY', perNumber: PER_NUMBER, successTopUp: [], builtIn: BUILT_IN });
  assert.deepStrictEqual(out.packages, PER_NUMBER);
  assert.strictEqual(out.perNumber, true);
  assert.strictEqual(out.blocked, false);
});

test('a FAILED per-number lookup shows nothing, never the built-in list', () => {
  // The built-in list is not what this number was quoted from, and the server
  // refuses an order against it once a per-number catalogue is configured - so
  // falling back would price plans the customer cannot buy.
  const out = resolvePackageSource({ country: 'MY', perNumber: null, perNumberError: 'upstream down', successTopUp: [], builtIn: BUILT_IN });
  assert.strictEqual(out.blocked, true);
  assert.deepStrictEqual(out.packages, []);
});

test('an error wins even when plans had already arrived', () => {
  const out = resolvePackageSource({ country: 'MY', perNumber: PER_NUMBER, perNumberError: 'upstream down', successTopUp: [], builtIn: BUILT_IN });
  assert.strictEqual(out.blocked, true);
  assert.deepStrictEqual(out.packages, []);
});

test('"this number has no plans" is not the same as "not offered here"', () => {
  // An empty array is the provider answering about this number; null is there
  // being no per-number provider for this operator at all.
  const empty = resolvePackageSource({ country: 'MY', perNumber: [], successTopUp: [], builtIn: BUILT_IN });
  assert.strictEqual(empty.emptyForNumber, true);
  assert.deepStrictEqual(empty.packages, []);

  const notOffered = resolvePackageSource({ country: 'MY', perNumber: null, successTopUp: [], builtIn: BUILT_IN });
  assert.strictEqual(notOffered.emptyForNumber, false);
  assert.deepStrictEqual(notOffered.packages, BUILT_IN, 'every operator that works the old way keeps working');
});

test('Bangladesh and the built-in list are untouched', () => {
  assert.deepStrictEqual(resolvePackageSource({ country: 'BD', perNumber: null, successTopUp: BD_LIST, builtIn: BUILT_IN }).packages, BD_LIST);
  assert.deepStrictEqual(resolvePackageSource({ country: 'MY', perNumber: null, successTopUp: BD_LIST, builtIn: BUILT_IN }).packages, BUILT_IN);
});

test('the screen actually uses that rule', () => {
  // The rule is only worth having if the picker reads it. Lifting it out and
  // then leaving the old ternary in the JSX would pass every test above while
  // the screen went on falling back on failure.
  const fs = require('fs');
  const path = require('path');
  const screen = fs.readFileSync(path.join(__dirname, '..', 'src/steps/InternetSteps.js'), 'utf8');
  assert.ok(/const source = resolvePackageSource\(\{/.test(screen), 'the screen must ask the rule');
  assert.ok(/const packages = source\.packages;/.test(screen), 'and take its list from the answer');
  assert.ok(/!source\.blocked/.test(screen), 'and refuse to render a picker when the rule blocks one');
  assert.ok(!/perNumberPlans \|\| getMergedPackages/.test(screen), 'the old silent fallback must be gone');
});

console.log('\nOffer packs, which were Bangladesh-only');

const offerSource = () => require('fs').readFileSync(require('path').join(__dirname, '..', 'src/steps/OfferPacksSteps.js'), 'utf8');

test('offer packs ask the same per-number question internet does', () => {
  // There is no separate "offer pack code" to configure: the pack a customer
  // picks already carries the provider's own product code as its id, so the
  // catalogue IS the product list.
  const source = offerSource();
  assert.ok(/listProviderDataPlans\(\{ service: 'Offer Packs'/.test(source));
  assert.ok(/resolvePackageSource\(\{/.test(source), 'and share the rule about what to show');
  assert.ok(/const shown = source\.packages;/.test(source), 'and actually render what that rule returns');
  assert.ok(/!source\.blocked/.test(source), 'refusing to show a list when the rule blocks one');
  assert.ok(/operatorCode: p\.productCode \|\| ''/.test(source), 'carrying the product the pack came from');
});

test('"Bangladesh only" is no longer baked into the screen', () => {
  const source = offerSource();
  assert.ok(!/available for Bangladesh only/.test(source),
    'that was a statement about what is configured, not a rule');
  assert.ok(/not available for this country yet/.test(source), 'but it is still said when nothing is offered');
});

test('the drive window stops refusing orders it has nothing to do with', () => {
  // The drive window is Success TopUp's selling hours in Dhaka. Unscoped, it
  // refused a Malaysian offer pack at nine in the evening - which it did the
  // moment packs stopped being Bangladesh-only.
  const source = offerSource();
  const validate = source.slice(source.indexOf('export function validateStep'));
  assert.ok(/step === 3 && serviceData\.country === 'BD' && !isDriveWindowOpen\(\)/.test(validate));
});

test('a closed-window message does not follow the customer to another country', () => {
  const source = offerSource();
  // Sliced to the early-return block itself, because a lazy match would
  // happily find the setWindowClosed below it and pass either way.
  const start = source.indexOf("if (serviceData.country !== 'BD' || step !== 3) {");
  const end = source.indexOf('if (!isDriveWindowOpen())', start);
  assert.ok(start > 0 && end > start);
  assert.ok(/setWindowClosed\(false\);/.test(source.slice(start, end)),
    'leaving the country must clear the verdict about it');
});

console.log('\nWhat gets sent to the provider');

test('the provider is told the catalogue figure, never the customer\u2019s price', () => {
  // Two numbers on a package order: the sell price leaves the wallet, the
  // catalogue denomination is what the provider's own request must carry.
  // Sending the sell price buys a different product or is refused, and the
  // difference between them is the margin.
  const amountFor = apiProviderService._test.providerAmountFor;
  assert.strictEqual(amountFor({ raw: { amount: 45, packageCostAmount: 40 }, payload: { amount: 45 } }), 40);
  assert.strictEqual(amountFor({ raw: { amount: 45, packageCostAmount: 40 }, payload: { amount: 45 }, isSuccessTopUpBd: true }), 40);
});

test('an order with no resolved catalogue figure is unchanged', () => {
  const amountFor = apiProviderService._test.providerAmountFor;
  // A plain recharge: the payload's amount, as before.
  assert.strictEqual(amountFor({ raw: { amount: 9 }, payload: { amount: 50 } }), 50);
  // A Success TopUp Bangladesh order reads raw first, as before.
  assert.strictEqual(amountFor({ raw: { amount: 9 }, payload: { amount: 50 }, isSuccessTopUpBd: true }), 9);
  // A zero or nonsense cost is not a cost.
  assert.strictEqual(amountFor({ raw: { amount: 9, packageCostAmount: 0 }, payload: { amount: 50 } }), 50);
  assert.strictEqual(amountFor({ raw: { amount: 9, packageCostAmount: 'free' }, payload: { amount: 50 } }), 50);
});

const resolvePricing = wallet._test.resolvePackagePricing;
const myOrder = (over = {}) => ({
  requestId: 'r1',
  amount: 40,
  raw: { country: 'MY', operator: 'Hotlink', phone: '0178855286', packageId: 'PLAN-X', amount: 40, ...over },
});
// The catalogue the server would really read, standing in for the provider.
function withCatalogue(plans) {
  const db = fakeDb([IIMMPACT]);
  const original = apiProviderService.fetchProviderCatalog;
  apiProviderService.fetchProviderCatalog = async () => plans;
  return { db, restore: () => { apiProviderService.fetchProviderCatalog = original; } };
}

(atest('a Malaysian package is priced by the SERVER, not by the client', async () => {
  // Outside Bangladesh recompute() took raw.amount at face value, so the price
  // of a package order was whatever the client said it was. It was only ever
  // safe because the provider rejects a nonsense denomination.
  const { db, restore } = withCatalogue([{ id: 'PLAN-X', name: 'Unlimited 30d', price: 40, productCode: 'HI' }]);
  try {
    const out = await resolvePricing(db, 'internet', myOrder({ amount: 0.01 }));
    assert.fail(`a client price of 0.01 was accepted: ${JSON.stringify(out && out.raw)}`);
  } catch (error) {
    assert.match(String(error.message), /price has changed/);
  } finally { restore(); }
}));

(atest('the honest price survives, with the denomination kept for the provider', async () => {
  const { db, restore } = withCatalogue([{ id: 'PLAN-X', name: 'Unlimited 30d', price: 40, productCode: 'HI' }]);
  try {
    const out = await resolvePricing(db, 'internet', myOrder());
    assert.strictEqual(out.raw.amount, 40, 'what the customer is charged');
    assert.strictEqual(out.raw.packageCostAmount, 40, 'what the provider is told to top up');
    assert.strictEqual(out.raw.operatorCode, 'HI', 'the product the plan was found under');
    assert.strictEqual(out.raw.package, 'Unlimited 30d');
  } finally { restore(); }
}));

(atest('a client cannot supply the amount the provider is told to top up', async () => {
  // packageCostAmount is what reaches the provider as `amount`. It is in the
  // raw allowlist because it has to survive onto the transaction, which also
  // means a client can put one there.
  const { db, restore } = withCatalogue([{ id: 'PLAN-X', name: 'Unlimited 30d', price: 40, productCode: 'HI' }]);
  try {
    const out = await resolvePricing(db, 'internet', myOrder({ packageCostAmount: 0.01 }));
    assert.strictEqual(out.raw.packageCostAmount, 40, 'the client\u2019s figure must not survive');
  } finally { restore(); }
}));

(atest('a package that is not on this number is refused outright', async () => {
  const { db, restore } = withCatalogue([{ id: 'OTHER', name: 'x', price: 10 }]);
  try {
    await assert.rejects(() => resolvePricing(db, 'internet', myOrder()), /no longer available on this number/);
  } finally { restore(); }
}));

(atest('an unreachable catalogue refuses the order rather than trusting the client', async () => {
  // Falling back here would mean anyone who can make the catalogue fail can
  // choose their own price.
  const db = fakeDb([IIMMPACT]);
  const original = apiProviderService.fetchProviderCatalog;
  apiProviderService.fetchProviderCatalog = async () => { throw new Error('upstream down'); };
  try {
    await assert.rejects(() => resolvePricing(db, 'internet', myOrder()), /could not be confirmed/);
  } finally { apiProviderService.fetchProviderCatalog = original; }
}));

(atest('an operator with no per-number catalogue keeps working exactly as before', async () => {
  // Unifi, and every country and operator that has no such provider. The
  // payload comes back untouched apart from the stripped server-only field.
  const { db, restore } = withCatalogue([]);
  try {
    const payload = myOrder({ operator: 'Unifi', packageCostAmount: 99 });
    const out = await resolvePricing(db, 'internet', payload);
    assert.strictEqual(out.amount, 40, 'the order is not re-priced');
    assert.strictEqual(out.raw.amount, 40);
    assert.strictEqual(out.raw.packageCostAmount, undefined, 'but a client-supplied cost is still dropped');
  } finally { restore(); }
}));

(atest('a service that sells no packages is left alone entirely', async () => {
  const out = await resolvePricing(fakeDb([IIMMPACT]), 'recharge', myOrder());
  assert.strictEqual(out.raw.amount, 40);
}));

(async () => {
  for (const step of queue) await step();
  console.log(`\n${passed} checks passed.\n`);
})();
