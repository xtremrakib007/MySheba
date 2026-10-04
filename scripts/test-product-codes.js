'use strict';

// What the provider calls the thing a customer is buying.
//
// Our screens say "Hotlink" and "60 UC"; a provider's API wants a code, and the
// code differs per provider, per country and per PRODUCT - iimmpact sells
// Hotlink airtime, a Hotlink voucher and a Hotlink internet plan as three
// products under three codes. What the map is keyed BY differs too: nobody
// buys "PUBG", they buy "60 UC". So nothing here is compiled in.
//
// That is a deliberate refusal rather than an omission. There are 37 non-
// Bangladesh operators across the countries the app sells recharge for,
// iimmpact's documentation names a code for none of them, and a guessed code is
// a real top-up sent to the wrong product with the customer's money. The tests
// below are mostly about what happens when a code is MISSING, because that is
// the state this ships in.

const assert = require('assert');
const productCodes = require('../functions/productCodes');
const apiProviderService = require('../functions/apiProviderService');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

const MAPPED = { name: 'iimmpact', operatorProductCodes: { Hotlink: 'H', 'U Mobile': 'U' } };
const UNMAPPED = { name: 'Legacy provider' };
// Airtime and a voucher PIN for the SAME operator, under different codes.
const WITH_PINS = {
  name: 'iimmpact',
  operatorProductCodes: { Hotlink: 'H', Celcom: 'CEL' },
  pinProductCodes: { Hotlink: 'HPIN', Celcom: { 10: 'C10', 30: 'C30' } },
};
const code = (provider, subject, opts) => productCodes.productCodeFor(provider, subject, opts);

console.log('\nThe lookup');

test('an operator in the map resolves to its code', () => {
  assert.strictEqual(code(MAPPED, 'Hotlink'), 'H');
  assert.strictEqual(code(MAPPED, 'U Mobile'), 'U');
});

test('an operator that is not in it resolves to nothing, not to its name', () => {
  // Returning the display name is the tempting fallback and the dangerous one:
  // "CelcomDigi" would go out as a product code.
  assert.strictEqual(code(MAPPED, 'CelcomDigi'), '');
  assert.strictEqual(code(MAPPED, ''), '');
  assert.strictEqual(code(MAPPED, 'Nonsense'), '');
});

test('a provider with no map at all is unchanged', () => {
  // Every provider that worked before this existed takes operator names
  // directly and must go on doing so.
  assert.strictEqual(productCodes.declaresProductCodes(UNMAPPED), false);
  assert.strictEqual(productCodes.declaresProductCodes({ operatorProductCodes: {} }), false, 'an empty map is no map');
  assert.strictEqual(productCodes.declaresProductCodes({ operatorProductCodes: [] }), false);
  assert.strictEqual(code(UNMAPPED, 'Hotlink'), '');
});

test('declaring a map is what says "this provider needs codes"', () => {
  assert.strictEqual(productCodes.declaresProductCodes(MAPPED), true);
});

console.log('\nA voucher PIN is a different product from airtime');

test('the same operator has a different code for a PIN', () => {
  // iimmpact sells Hotlink airtime and a Hotlink voucher as two products.
  // Reading the airtime map for a PIN sells the wrong thing with real money.
  assert.strictEqual(code(WITH_PINS, 'Hotlink', { service: 'Recharge' }), 'H');
  assert.strictEqual(code(WITH_PINS, 'Hotlink', { service: 'Recharge PIN' }), 'HPIN');
});

test('a PIN does NOT fall back to the airtime code', () => {
  // The fallback is the tempting one and it is the bug: it would charge for a
  // top-up and hand back no PIN, or sell a product nobody asked for.
  const airtimeOnly = { name: 'iimmpact', operatorProductCodes: { Hotlink: 'H' } };
  assert.strictEqual(code(airtimeOnly, 'Hotlink', { service: 'Recharge PIN' }), '');
  // And is still refused rather than sent empty, because the record declares
  // codes elsewhere.
  assert.strictEqual(productCodes.declaresProductCodes(airtimeOnly), true);
});

test('a voucher range sold one product per denomination resolves by amount', () => {
  assert.strictEqual(code(WITH_PINS, 'Celcom', { service: 'Recharge PIN', denomination: 10 }), 'C10');
  assert.strictEqual(code(WITH_PINS, 'Celcom', { service: 'Recharge PIN', denomination: 30 }), 'C30');
  // Matched as a number, so 10, "10" and "10.00" are one denomination.
  assert.strictEqual(code(WITH_PINS, 'Celcom', { service: 'Recharge PIN', denomination: '10.00' }), 'C10');
});

test('a denomination the range does not sell resolves to nothing', () => {
  assert.strictEqual(code(WITH_PINS, 'Celcom', { service: 'Recharge PIN', denomination: 25 }), '');
  assert.strictEqual(code(WITH_PINS, 'Celcom', { service: 'Recharge PIN' }), '', 'and no amount is not "any amount"');
  assert.strictEqual(code(WITH_PINS, 'Celcom', { service: 'Recharge PIN', denomination: 'ten' }), '');
});

test('one code covers every denomination when that is how it is sold', () => {
  assert.strictEqual(code(WITH_PINS, 'Hotlink', { service: 'Recharge PIN', denomination: 10 }), 'HPIN');
  assert.strictEqual(code(WITH_PINS, 'Hotlink', { service: 'Recharge PIN', denomination: 999 }), 'HPIN');
});

test('which map a service charges from is explicit', () => {
  assert.strictEqual(productCodes.codeFieldFor('Recharge PIN'), 'pinProductCodes');
  assert.strictEqual(productCodes.codeFieldFor('Recharge'), 'operatorProductCodes');
  assert.strictEqual(productCodes.codeFieldFor('Entertainment'), 'gameProductCodes');
  assert.strictEqual(productCodes.codeFieldFor('Internet'), 'operatorProductCodes');
  assert.strictEqual(productCodes.codeFieldFor(undefined), 'operatorProductCodes');
});

test('any map at all means this provider works in codes', () => {
  // A record with voucher codes but no airtime codes is misconfigured, and
  // sending an empty product is worse than refusing.
  assert.strictEqual(productCodes.declaresProductCodes({ pinProductCodes: { Hotlink: 'HPIN' } }), true);
  assert.strictEqual(productCodes.declaresProductCodes({ billerProductCodes: { TNB: 'TNB' } }), true);
  assert.strictEqual(productCodes.declaresProductCodes({}), false);
});

console.log('\nA game top-up is bought by the PACK');

const GAMES = {
  name: 'iimmpact',
  gameProductCodes: {
    'pubg-60': 'PUBG60',
    'ml-86': { code: 'ML86', amount: 5.8 },
  },
};

test('nobody buys "PUBG", so the map is keyed by the pack', () => {
  assert.strictEqual(productCodes.codeSubjectKeyFor('Entertainment'), 'packageId');
  assert.strictEqual(productCodes.codeSubjectKeyFor('Recharge'), 'operator');
  assert.strictEqual(productCodes.codeSubjectFor('Entertainment', { packageId: 'pubg-60', operator: 'Hotlink' }), 'pubg-60');
  assert.strictEqual(productCodes.codeSubjectFor('Recharge', { packageId: 'pubg-60', operator: 'Hotlink' }), 'Hotlink');
});

test('a pack resolves to its own code', () => {
  assert.strictEqual(code(GAMES, 'pubg-60', { service: 'Entertainment' }), 'PUBG60');
  assert.strictEqual(code(GAMES, 'ml-86', { service: 'Entertainment' }), 'ML86');
  assert.strictEqual(code(GAMES, 'pubg-325', { service: 'Entertainment' }), '', 'a pack with no code is not guessed from its neighbours');
});

test('every pack id on the screen is a key somebody can fill in', () => {
  // The map is useless if its keys are not the ones the Entertainment step
  // actually sends. These are the ids it puts in packageId.
  const data = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/data/gameTopUps.js'), 'utf8');
  const ids = [...data.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 30, `expected the full pack list, got ${ids.length}`);
  assert.strictEqual(new Set(ids).size, ids.length, 'pack ids must be unique for a flat map to key by them');
  assert.ok(ids.includes('pubg-60') && ids.includes('ml-86'));
});

test('the provider\u2019s own price is sent, not the customer\u2019s', () => {
  // Ours is the sell price. A fixed product's amount belongs to the provider,
  // and sending a marked-up figure buys the wrong thing or is refused.
  assert.strictEqual(productCodes.productAmountFor(GAMES, 'ml-86', { service: 'Entertainment' }), 5.8);
  assert.strictEqual(productCodes.productAmountFor(GAMES, 'pubg-60', { service: 'Entertainment' }), null,
    'and where the map states none, the order\u2019s own amount still goes');
  // Not a price. Reading one as a price would ask the provider for a free
  // product and have the request refused, or worse honoured.
  for (const amount of [0, -1, '', 'free', null]) {
    const odd = { gameProductCodes: { 'x-1': { code: 'X', amount } } };
    assert.strictEqual(productCodes.productAmountFor(odd, 'x-1', { service: 'Entertainment' }), null, String(amount));
    assert.strictEqual(code(odd, 'x-1', { service: 'Entertainment' }), 'X', 'but the code still stands');
  }
});

test('the charge actually passes the stated amount through', () => {
  // The logic above is worth nothing if the one line that reaches it is
  // missing - which is exactly how a voucher came to be charged as airtime
  // last time.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  assert.ok(/const mappedProductAmount = productCodes\.productAmountFor\(provider, codeSubject, codeOptions\);/.test(source));
  assert.ok(/providerAmountFor\(\{ raw, payload, isSuccessTopUpBd, mappedAmount: mappedProductAmount \}\)/.test(source));
});

test('a stated amount reaches the provider ahead of the sell price', () => {
  const amountFor = apiProviderService._test.providerAmountFor;
  assert.strictEqual(amountFor({ raw: { amount: 6 }, payload: { amount: 6 }, mappedAmount: 5.8 }), 5.8);
  assert.strictEqual(amountFor({ raw: { amount: 6 }, payload: { amount: 6 }, mappedAmount: null }), 6);
  assert.strictEqual(amountFor({ raw: { amount: 6 }, payload: { amount: 6 }, mappedAmount: 0 }), 6, 'zero is not a price');
  // A catalogue that resolved a real cost still wins: that came from the live
  // product list, this is a figure somebody typed.
  assert.strictEqual(amountFor({ raw: { amount: 6, packageCostAmount: 4.2 }, payload: { amount: 6 }, mappedAmount: 5.8 }), 4.2);
});

test('a game pack does not read the airtime or voucher maps', () => {
  const mixed = { operatorProductCodes: { 'pubg-60': 'WRONG' }, pinProductCodes: { 'pubg-60': 'ALSO-WRONG' }, gameProductCodes: { 'pubg-60': 'RIGHT' } };
  assert.strictEqual(code(mixed, 'pubg-60', { service: 'Entertainment' }), 'RIGHT');
});

test('a game record with no game codes is refused, not sent empty', () => {
  const airtimeOnly = { operatorProductCodes: { Hotlink: 'H' } };
  assert.strictEqual(productCodes.declaresProductCodes(airtimeOnly), true);
  assert.strictEqual(code(airtimeOnly, 'pubg-60', { service: 'Entertainment' }), '');
});

console.log('\nThe guard: nothing is sent on a guess');

function guardSource() {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  return source.slice(source.indexOf('const isBangladeshMobileBill = isSuccessTopUpBill'), source.indexOf('body=JSON.stringify(requestBody)'));
}

test('a missing code refuses the charge BEFORE the request leaves', () => {
  // Where it sits decides whether the customer gets their money back cleanly:
  // everything thrown above `requestSent = true` cannot have created a top-up,
  // so the refund is certain rather than uncertain.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  const guardAt = source.indexOf('product code configured for');
  const sentAt = source.indexOf('requestSent = true;');
  assert.ok(guardAt > 0 && sentAt > 0);
  assert.ok(guardAt < sentAt, 'the guard must run before the request is marked sent, or a refused order looks uncertain');
});

test('the refusal names what was bought, the service and where to fix it', () => {
  const guard = guardSource();
  assert.ok(/Add it under \$\{field\}/.test(guard));
  assert.ok(/pinProductCodes: 'PIN product codes'/.test(guard), 'a PIN must point at the PIN map, not the airtime one');
  assert.ok(/gameProductCodes: 'Game product codes'/.test(guard), 'and a game pack at the game map');
  assert.ok(/codeSubject\.slice\(0, 40\)/.test(guard));
  assert.ok(/no \$\{service\} product code/.test(guard));
});

test('the guard only fires for an order that NAMES what it is buying', () => {
  // The same provider record can serve bills and remittances, which name no
  // operator and no pack. Guarding on the map alone would refuse every bill
  // the moment somebody filled in recharge codes.
  assert.ok(/&& codeSubject && !providerOperatorCode/.test(guardSource()));
});

test('an iimmpact order needs a code even when no map has been filled in yet', () => {
  // declaresProductCodes asks whether SOME code exists, which is right for a
  // provider that may not use codes at all and wrong for one that cannot work
  // without them. With every map still empty it answers false, so the guard
  // was skipped and the order went out with no product - refused by iimmpact,
  // in their words, for a cause this message already names exactly.
  const guard = guardSource();
  assert.ok(/const requiresProductCode = provider\.authType === 'iimmpactHmac';/.test(guard),
    'an iimmpact order must require a code regardless of the maps');
  assert.ok(/\(productCodes\.declaresProductCodes\(provider\) \|\| requiresProductCode\)/.test(guard),
    'and it must widen the guard, not replace it - a non-iimmpact provider with filled maps is still checked');

  // The empty-map state this fires on is exactly the one the maps start in.
  assert.strictEqual(productCodes.declaresProductCodes({ authType: 'iimmpactHmac' }), false);
  assert.strictEqual(productCodes.productCodeFor({ authType: 'iimmpactHmac' }, 'Maxis', { service: 'Recharge' }), '');
});

console.log('\nWhere the code comes from');

test('the server resolves it, the client does not send it', () => {
  // operatorCode is deliberately absent from the recharge raw allowlist: it
  // decides which product real money buys.
  const wallet = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/walletService.js'), 'utf8');
  const recharge = wallet.match(/recharge: new Set\(\[[^\]]*\]\)/)[0];
  assert.ok(!/operatorCode/.test(recharge), 'a client-supplied product code would choose the product itself');
});

test('the charge resolves the code for its OWN service and denomination', () => {
  // Both arguments matter and neither is obvious from the call. Without
  // `service` a voucher is charged against the airtime product; without the
  // denomination a per-denomination voucher range resolves to nothing and the
  // sale is refused.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  assert.ok(/const codeSubject = productCodes\.codeSubjectFor\(service, raw\);/.test(source),
    'what the map is keyed by depends on the service too');
  assert.ok(/const codeOptions = \{ service, denomination: raw\.amount \};/.test(source));
  assert.ok(/productCodes\.productCodeFor\(provider, codeSubject, codeOptions\)/.test(source));
});

test('a server-resolved code already on the order wins', () => {
  // An internet order carries the product its plan was actually found under,
  // put there by resolvePackagePricing. The map must not override it.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  assert.ok(/const providerOperatorCode = raw\.operatorCode \|\| mappedOperatorCode;/.test(source));
});

test('the template gets the code, not the display name', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  assert.ok(/operatorCode:providerOperatorCode/.test(source), 'vars.operatorCode must be the resolved code');
  const form = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/components/ApiProviderFormModal.js'), 'utf8');
  const bodies = form.slice(form.indexOf('const IIMMPACT_BODIES'), form.indexOf('const IIMMPACT_JOMPAY_BODY'));
  assert.ok(/Recharge: \{ refid: '\{\{requestId\}\}', product: '\{\{operatorCode\}\}'/.test(bodies),
    'the preset must template the code; {{operator}} is a name and a name is not a product');
  assert.ok(!/product: '\{\{operator\}\}'/.test(bodies), 'no body may still send the display name');
});

console.log('\nNetwork status asks about the same product');

test('a PIN purchase asks about its own product', () => {
  const statusFor = apiProviderService._test_statusProductCodeFor;
  assert.strictEqual(statusFor(WITH_PINS, { service: 'Recharge PIN', operatorName: 'Hotlink' }), 'HPIN');
  // Any code from an operator's voucher range will do: they all belong to that
  // operator, so an interruption affecting one affects them all. That is safe
  // in a way picking between Celcom and Digi is not.
  assert.strictEqual(statusFor(WITH_PINS, { service: 'Recharge PIN', operatorName: 'Celcom' }), 'C10');
  assert.strictEqual(statusFor(WITH_PINS, { service: 'Recharge PIN', operatorName: 'U Mobile' }), '');
});

test('a recharge asks about the product it would actually charge', () => {
  const statusFor = apiProviderService._test_statusProductCodeFor;
  assert.strictEqual(statusFor(MAPPED, { service: 'Recharge', operatorName: 'Hotlink' }), 'H');
  assert.strictEqual(statusFor(WITH_PINS, { service: 'Recharge', operatorName: 'Hotlink' }), 'H', 'not the voucher code');
  assert.strictEqual(statusFor(MAPPED, { service: 'Recharge', operatorName: 'CelcomDigi' }), '', 'an unmapped operator is not asked about');
  // No client-named code for a recharge: there is one product and the server
  // knows it, so there is nothing to name and nothing to probe with.
  assert.strictEqual(statusFor(MAPPED, { service: 'Recharge', operatorName: 'Hotlink', productCode: 'JOMPAY' }), 'H');
});

test('internet still uses its own, different codes', () => {
  // Hotlink airtime is H and Hotlink internet is HI. Reading one map for the
  // other would warn about the wrong product.
  const statusFor = apiProviderService._test_statusProductCodeFor;
  const internet = { name: 'iimmpact', baseUrl: 'https://api.iimmpact.com', catalogPreset: 'iimmpact-subproducts', catalogPath: '/v2/subproducts', operatorProductCodes: { Hotlink: 'H' } };
  assert.strictEqual(statusFor(internet, { service: 'Internet', operatorName: 'Hotlink' }), 'HI');
});

console.log('\nReading the real codes from the provider');

test('a product list is read out of whatever shape it arrives in', () => {
  const read = apiProviderService._test_readProductList;
  assert.deepStrictEqual(read({ data: [{ code: 'H', name: 'Hotlink', category: 'Prepaid' }] }),
    [{ code: 'H', name: 'Hotlink', category: 'Prepaid' }]);
  // Their own vocabulary varies across endpoints, so the likely key names are
  // all tried rather than one being assumed.
  assert.strictEqual(read({ data: [{ product_code: 'U', product_name: 'U Mobile' }] })[0].code, 'U');
  assert.strictEqual(read([{ code: 'D' }])[0].code, 'D', 'a bare array is a product list too');
  assert.strictEqual(read({ data: { products: [{ code: 'T' }] } })[0].code, 'T');
});

test('a row with no code is not offered as one', () => {
  const read = apiProviderService._test_readProductList;
  assert.deepStrictEqual(read({ data: [{ name: 'No code here' }, null, 'text', []] }), []);
});

test('the list is sorted by the name somebody is scanning for', () => {
  const read = apiProviderService._test_readProductList;
  const out = read({ data: [{ code: 'Z', name: 'Yes' }, { code: 'A', name: 'Celcom' }, { code: 'M', name: 'Hotlink' }] });
  assert.deepStrictEqual(out.map((p) => p.name), ['Celcom', 'Hotlink', 'Yes']);
});

test('an unreadable list is an error, not an empty form', () => {
  // "No product codes could be read" sends somebody to check the response
  // shape; a blank list reads as the provider selling nothing.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  const callable = source.slice(source.indexOf('exports.listProviderProductCodes'));
  // The condition, not just the message: a message sitting in a branch nothing
  // can reach reads exactly like a working guard.
  assert.ok(/if \(!products\.length\) \{/.test(callable), 'an empty list must be refused, not returned');
  assert.ok(/no product codes could be read/i.test(callable));
  // A 401 must say which half to check, and it cannot do that from the status
  // alone - "API key not found" and a signature mismatch are different jobs.
  assert.ok(/iimmpactAuthHint\(reason, provider\.baseUrl\)/.test(callable),
    'a 401 must name the actual cause, not blame the signature by default');
});

test('reading the list is superadmin-only and charges nothing', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  const callable = source.slice(source.indexOf('exports.listProviderProductCodes'), source.indexOf('exports.listSuccessTopUpCatalogForAdmin'));
  assert.ok(/assertSuperadmin/.test(callable));
  assert.ok(/method: 'GET'/.test(callable), 'a product list is a read');
});

console.log(`\n${passed} checks passed.\n`);
