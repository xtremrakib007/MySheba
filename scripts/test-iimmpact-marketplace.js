#!/usr/bin/env node
'use strict';

/**
 * The live IIMMPACT catalogue as native tiles, and a catalogue voucher bought
 * through PIN Generator reaching the provider as the product it is.
 *
 * Two failures this guards, both invisible until someone pays:
 *
 *   * a catalogue category drawn beside the native tile that already sells it
 *     ("Mobile Prepaid" next to "Mobile Recharge"), or a hand-made voucher tile
 *     left standing beside the live category that replaced it;
 *
 *   * a PIN order sent without the product the customer chose. Recharge PIN
 *     looked its product up by operator, a catalogue voucher has none, and the
 *     order went out empty or against a non-Malaysian number - which IIMMPACT
 *     answered with "Select a supported Malaysian mobile operator. [400]".
 */
const assert = require('assert');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { failed += 1; console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); }
}

function runEsm(relPath) {
  const code = esbuild.transformSync(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), { loader: 'js', format: 'cjs' }).code;
  const box = { module: { exports: {} }, exports: {}, require: (id) => { throw new Error('unexpected require: ' + id); } };
  box.module.exports = box.exports;
  vm.createContext(box);
  vm.runInContext(code, box);
  return box.module.exports;
}

const tiles = runEsm('src/components/iimmpactTiles.js');

// Shaped like the production Malaysia catalogue: the same group and category
// names the Marketplace screen lists.
function product(code, extra = {}) { return { code, name: code, is_active: true, ...extra }; }
const CATALOG = {
  products: Object.fromEntries([
    'PRE1', 'DATA1', 'PIN1', 'IDT1', 'POST1', 'WATER1', 'FNB1', 'FNB2', 'RET1', 'DV1', 'GROC1', 'TRN1',
    'GAME1', 'WELL1', 'APP1', 'EW1', 'IDD1',
  ].map((code) => [code, product(code)]).concat([['DEAD1', product('DEAD1', { is_active: false })]])),
  tree: {
    groups: [
      { name: 'Mobile', categories: [
        { name: 'International Topup', product_codes: ['IDT1'] },
        { name: 'Mobile Data', product_codes: ['DATA1'] },
        { name: 'Mobile Prepaid', product_codes: ['PRE1'] },
        { name: 'Mobile Pin', product_codes: ['PIN1'] },
        { name: 'IDD', product_codes: ['IDD1'] },
      ] },
      { name: 'Bills', categories: [
        { name: 'Mobile Postpaid', product_codes: ['POST1'] },
        { name: 'Water Bills', product_codes: ['WATER1'] },
        { name: 'Loans', product_codes: ['DEAD1'] },
      ] },
      { name: 'Vouchers', categories: [
        { name: 'Food & Beverage', product_codes: ['FNB1'], icon_url: 'https://cdn.example/fnb.png' },
        { name: 'Retail & Shopping', product_codes: ['RET1'] },
        { name: 'Digital Voucher', product_codes: ['DV1'] },
        { name: 'Grocery', product_codes: ['GROC1'] },
        { name: 'Transportation', product_codes: ['TRN1'] },
        { name: 'Wellness & Beauty', product_codes: ['WELL1'] },
      ] },
      { name: 'Games', categories: [
        { name: 'Game Credits', product_codes: ['GAME1'] },
        { name: 'Console & App Stores', product_codes: ['APP1'] },
      ] },
      { name: 'E-Wallet Reloads', categories: [{ name: 'E-Wallets Reload', product_codes: ['EW1'] }] },
      // The same category under a second group is one tile, not two.
      { name: 'Promotions', categories: [{ name: 'Food & Beverage', product_codes: ['FNB2'] }] },
    ],
  },
};

const NATIVE = ['recharge', 'rechargePin', 'internet', 'billpayment', 'tngewallet', 'esim', 'moreFeaturesTile',
  'pinCategoryMobile', 'pinCategoryCoffee', 'pinCategoryWellness', 'pinCategoryTransport', 'pinCategoryApple',
  'pinCategoryShopping', 'pinCategoryGrocery', 'pinCategoryOther', 'salary'];
const overflow = NATIVE.filter((key) => key.startsWith('pinCategory') || key === 'salary').map((key) => ({ key, name: key, kind: 'pinCategory' }));

(async () => {
  console.log('\nCatalogue tiles');

  await test('every category with an active product is a tile, once', () => {
    const categories = tiles.catalogCategories(CATALOG);
    const names = categories.map((c) => c.name);
    assert.ok(!names.includes('Loans'), 'a category whose only product is inactive must not be drawn');
    assert.strictEqual(names.filter((n) => n === 'Food & Beverage').length, 1, 'a repeated category name is one category');
    const fnb = categories.find((c) => c.name === 'Food & Beverage');
    assert.deepStrictEqual(Array.from(fnb.codes).sort(), ['FNB1', 'FNB2'], 'its products from both groups are combined');
    assert.strictEqual(fnb.imageUrl, 'https://cdn.example/fnb.png');
  });

  await test('a category a native tile already sells is merged into it', () => {
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Prepaid' }, NATIVE), 'recharge');
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Data' }, NATIVE), 'internet');
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Pin' }, NATIVE), 'rechargePin');
    // A bill is not a prepaid reload, however much the names overlap.
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Postpaid' }, NATIVE), '');
    assert.strictEqual(tiles.nativeTileFor({ name: 'International Topup' }, NATIVE), '');
    // No native tile on this grid, nothing to merge into.
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Prepaid' }, ['salary']), '');
  });

  await test('the merged grid has each destination once', () => {
    const merged = tiles.mergeCatalogTiles(overflow, CATALOG, NATIVE);
    const keys = merged.map((t) => t.key);
    assert.strictEqual(new Set(keys).size, keys.length, 'duplicate keys: ' + keys.join(', '));
    for (const gone of ['iimmpact_mobile_prepaid', 'iimmpact_mobile_data', 'iimmpact_mobile_pin']) {
      assert.ok(!keys.includes(gone), gone + ' duplicates a native tile');
    }
    for (const kept of ['iimmpact_international_topup', 'iimmpact_mobile_postpaid', 'iimmpact_water_bills',
      'iimmpact_food_and_beverage', 'iimmpact_game_credits', 'iimmpact_e_wallets_reload', 'iimmpact_idd']) {
      assert.ok(keys.includes(kept), kept + ' missing from ' + keys.join(', '));
    }
    assert.ok(keys.includes('salary'), 'unrelated tiles are untouched');
  });

  await test('hand-made voucher tiles give way to the live category that replaces them', () => {
    const keys = tiles.mergeCatalogTiles(overflow, CATALOG, NATIVE).map((t) => t.key);
    for (const key of Object.keys(tiles.SUPERSEDED_PIN_TILES)) {
      assert.ok(!keys.includes(key), key + ' is still drawn beside its live category');
    }
  });

  await test('a voucher tile with no live counterpart stays', () => {
    const partial = { ...CATALOG, tree: { groups: [{ name: 'Vouchers', categories: [{ name: 'Grocery', product_codes: ['GROC1'] }] }] } };
    const keys = tiles.mergeCatalogTiles(overflow, partial, NATIVE).map((t) => t.key);
    assert.ok(!keys.includes('pinCategoryGrocery'));
    assert.ok(keys.includes('pinCategoryCoffee'), 'Coffee has no live category here, so it must stay reachable');
  });

  await test('with no catalogue the grid is returned exactly as it was', () => {
    assert.deepStrictEqual(tiles.mergeCatalogTiles(overflow, null, NATIVE), overflow);
    assert.deepStrictEqual(tiles.mergeCatalogTiles(overflow, { products: {}, tree: { groups: [] } }, NATIVE), overflow);
  });

  await test('a catalogue tile opens its product form by category name', () => {
    const tile = tiles.mergeCatalogTiles([], CATALOG, NATIVE).find((t) => t.key === 'iimmpact_water_bills');
    assert.strictEqual(tile.kind, 'iimmpactProducts');
    assert.strictEqual(tile.iimmpactCategory, 'Water Bills');
    assert.ok(tile.art, 'a category without a logo still gets a drawing');
    const grid = fs.readFileSync(path.join(ROOT, 'src/components/ServiceGrid.js'), 'utf8');
    assert.ok(/s\.kind === 'iimmpactProducts'\) return setScreen\('iimmpactCategory:'/.test(grid), 'the tile kind must have a destination');
  });

  console.log('\nPIN Generator dispatch');

  const sent = [];
  const resolved = [];
  const realApi = require('../functions/apiProviderService');
  const db = fakeFirestore({
    'users/u1': { role: 'customer', phone: '+60123456789', walletBalance: 100, active: true },
    'api_settings/service_modes': {},
    'settings/pricing': { rechargePointCostPerUnit: 1 },
  });
  const stubs = {
    'firebase-admin': Object.assign({}, { firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => 'ts' }, Timestamp: { fromMillis: (ms) => ms } }) }),
    './walletFreeze': { assertWalletUnfrozen: () => {} },
    './progressionService': { getProgressionSettings: async () => ({}), discountPercentFromSettings: () => 0 },
    './rateLimitService': { checkVelocity: async () => {}, getClientIp: () => '1.1.1.1' },
    './walletCurrencyService': { getWalletCurrencyAndFx: async () => ({ currency: 'MYR', sellRate: 1, rateSource: 'MYR' }), baseToWallet: (n) => n },
    './sessionSlots': { sessionMatches: () => true },
    './apiProviderService': {
      nationalAccountNumber: realApi.nationalAccountNumber,
      providersForService: async () => [],
      resolveExecutionMode: () => 'api',
      resolveIimmpactMarketplaceProduct: async (_db, raw) => {
        resolved.push(raw);
        return { productCode: 'YESPIN', productName: 'Yes Pin', accountNumber: raw.accountNumber, sellAmount: 10, providerAmount: 10, subproductCode: '', optionCode: raw.optionCode, extras: {} };
      },
      executeConfiguredApi: async (service, payload) => { sent.push({ service, payload }); return { providerId: 'p', providerName: 'IIMMPACT', providerPin: '1234-5678-9012', status: 'completed' }; },
    },
  };
  const realLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (parent && /rechargePinService\.js$/.test(parent.filename) && stubs[request]) return stubs[request];
    return realLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve('../functions/rechargePinService')];
  const pinService = require('../functions/rechargePinService');
  Module._load = realLoad;

  const call = (data, uid = 'u1') => pinService.purchaseRechargePin.run({
    auth: { uid },
    data: { sessionId: 's'.repeat(20), deviceId: 'd'.repeat(20), requestId: 'r'.repeat(20) + Math.random().toString(36).slice(2, 10), country: 'MY', ...data },
    rawRequest: { headers: {}, ip: '1.1.1.1' },
  });

  await test('a catalogue voucher is dispatched as the product the customer chose', async () => {
    sent.length = 0;
    const result = await call({ operator: '', amount: 10, productCode: 'YESPIN', subproductCode: 'YES10', productName: 'Yes Pin' });
    assert.strictEqual(sent.length, 1);
    const raw = sent[0].payload.raw;
    assert.strictEqual(raw.operatorCode, 'YESPIN', 'the provider product code must travel with the order');
    assert.strictEqual(raw.iimmpactCatalog, true, 'a catalogue product must be routed to the IIMMPACT account');
    assert.strictEqual(raw.providerAmount, 10);
    assert.strictEqual(raw.subproductCode, 'YES10', 'the chosen denomination must be sent');
    assert.strictEqual(result.pin, '1234-5678-9012', 'the voucher is handed back to show on screen');
  });

  await test('the account is the customer’s number in Malaysian national form', async () => {
    resolved.length = 0; sent.length = 0;
    await call({ amount: 10, productCode: 'YESPIN', subproductCode: 'YES10' });
    assert.strictEqual(resolved[0].accountNumber, '0123456789', '+60 must not reach IIMMPACT');
    assert.strictEqual(sent[0].payload.raw.accountNumber, '0123456789');
  });

  await test('a number typed on screen wins over the profile number', async () => {
    resolved.length = 0;
    await call({ amount: 10, productCode: 'YESPIN', subproductCode: 'YES10', accountNumber: '+60 11-2345 6789' });
    assert.strictEqual(resolved[0].accountNumber, '01123456789');
  });

  await test('a price the catalogue no longer agrees with is refused before charging', async () => {
    sent.length = 0;
    await assert.rejects(() => call({ amount: 12, productCode: 'YESPIN', subproductCode: 'YES10' }), /price has changed/);
    assert.strictEqual(sent.length, 0, 'nothing may reach the provider');
  });

  await test('the dispatcher reads data.pin for an IIMMPACT PIN without a configured path', () => {
    const src = fs.readFileSync(path.join(ROOT, 'functions/apiProviderService.js'), 'utf8');
    assert.ok(/!provider\.responsePinPath && provider\.authType !== 'iimmpactHmac'/.test(src));
    assert.ok(/\[configured, result\.providerPin, result\.deliveryLink\]/.test(src));
  });

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  process.exitCode = failed ? 1 : 0;
})();

// Enough of Firestore for one purchase: documents by path, and a transaction
// that reads and writes them in place.
function fakeFirestore(seed) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, { ...v }]));
  const ref = (pathName) => ({
    id: pathName.split('/').pop(),
    path: pathName,
    get: async () => snap(pathName),
    set: async (data, opts) => { store.set(pathName, opts && opts.merge ? { ...(store.get(pathName) || {}), ...data } : { ...data }); },
    update: async (data) => { store.set(pathName, { ...(store.get(pathName) || {}), ...data }); },
    collection: (name) => collection(pathName + '/' + name),
  });
  const snap = (pathName) => ({ exists: store.has(pathName), id: pathName.split('/').pop(), data: () => store.get(pathName) });
  const collection = (name) => ({
    doc: (id) => ref(name + '/' + id),
    add: async (data) => { store.set(name + '/' + Math.random(), data); },
  });
  return {
    collection,
    runTransaction: async (fn) => fn({
      get: async (r) => snap(r.path),
      update: (r, data) => { store.set(r.path, { ...(store.get(r.path) || {}), ...data }); },
      create: (r, data) => { if (store.has(r.path)) throw new Error('exists'); store.set(r.path, { ...data }); },
      set: (r, data) => { store.set(r.path, { ...data }); },
    }),
  };
}
