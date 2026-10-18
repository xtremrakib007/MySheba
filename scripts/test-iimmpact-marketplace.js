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

// Bundled, so a module's own imports (pinCategories) come along with it.
function runEsm(relPath) {
  const code = esbuild.buildSync({ entryPoints: [path.join(ROOT, relPath)], bundle: true, format: 'cjs', write: false, logLevel: 'silent' }).outputFiles[0].text;
  const box = { module: { exports: {} }, exports: {}, require: (id) => { throw new Error('unexpected require: ' + id); } };
  box.module.exports = box.exports;
  vm.createContext(box);
  vm.runInContext(code, box);
  return box.module.exports;
}

const tiles = runEsm('src/components/iimmpactTiles.js');
const pins = runEsm('src/data/pinCategories.js');
const recharge = runEsm('src/data/iimmpactRecharge.js');
const grids = runEsm('src/components/providerGrids.js');
const denoms = runEsm('src/utils/denominations.js');
const featureGroups = runEsm('src/utils/featureGroups.js');

// Shaped like the production Malaysia catalogue: the same group and category
// names the Marketplace screen lists, with vouchers sold as PINs.
const PIN = { processing_time: 'pin' };
const SPEC = {
  PRE1: ['Celcom'], PRE2: ['Digi'], PRE3: ['Hotlink'], DATA1: ['Digi Internet'], PIN1: ['Yes Pin', PIN],
  IDT1: ['Indonesia'], IDT2: ['Nepal'], POST1: ['Maxis Postpaid'], WATER1: ['Air Selangor'],
  FNB1: ['Starbucks', PIN], FNB2: ['Tealive', PIN], FOOD1: ['Foodpanda Voucher', PIN], RET1: ['Shopee Voucher', PIN],
  DV1: ['Razer Gold', PIN], GROC1: ['Lotus Grocery Voucher', PIN], TRN1: ['Touch n Go Card', PIN],
  WELL1: ['Watsons Voucher', PIN], APP1: ['Apple Gift Card', PIN], GAMEPIN1: ['Steam Wallet Code', PIN],
  GAME1: ['PUBG Mobile UC'], EW1: ['DuitNow QR'], IDD1: ['IDD Call Credit'],
  // Filed by IIMMPACT under Mobile Pin, but named like a voucher and not
  // marked "pin": the old name-guessing put it under Shopping.
  RED1: ['redONE Prepaid Voucher'],
  FUEL1: ['Petron e-Voucher'], DATA2: ['Unifi Mobile Data'],
  // In no category at all.
  ORPH1: ['Mystery Product'],
};
function product(code, name, extra = {}) { return { code, name, is_active: true, ...extra }; }
const CATALOG = {
  products: Object.fromEntries(Object.entries(SPEC).map(([code, [name, extra]]) => [code, product(code, name, extra)])
    .concat([['DEAD1', product('DEAD1', 'Old loan', { is_active: false })]])),
  tree: {
    groups: [
      { name: 'Mobile', categories: [
        { name: 'International Topup', product_codes: ['IDT1', 'IDT2'] },
        { name: 'Mobile Data', product_codes: ['DATA1', 'DATA2'] },
        { name: 'Mobile Prepaid', product_codes: ['PRE1', 'PRE2', 'PRE3'] },
        { name: 'Mobile Pin', product_codes: ['PIN1', 'RED1'] },
        { name: 'IDD', product_codes: ['IDD1'] },
      ] },
      { name: 'Bills', categories: [
        { name: 'Mobile Postpaid', product_codes: ['POST1'] },
        { name: 'Water Bills', product_codes: ['WATER1'] },
        { name: 'Loans', product_codes: ['DEAD1'] },
      ] },
      { name: 'Vouchers', categories: [
        { name: 'Food & Beverage', product_codes: ['FNB1', 'FOOD1'], icon_url: 'https://cdn.example/fnb.png' },
        { name: 'Retail & Shopping', product_codes: ['RET1'] },
        { name: 'Digital Voucher', product_codes: ['DV1'] },
        { name: 'Grocery', product_codes: ['GROC1'] },
        { name: 'Transportation', product_codes: ['TRN1'] },
        { name: 'Wellness & Beauty', product_codes: ['WELL1'] },
        { name: 'Fuel', product_codes: ['FUEL1'] },
      ] },
      { name: 'Games', categories: [
        { name: 'Game Credits', product_codes: ['GAME1'] },
        { name: 'Console & App Stores', product_codes: ['APP1', 'GAMEPIN1'] },
      ] },
      { name: 'E-Wallet Reloads', categories: [{ name: 'E-Wallets Reload', product_codes: ['EW1'] }] },
      // The same category under a second group is one tile, not two.
      { name: 'Promotions', categories: [{ name: 'Food & Beverage', product_codes: ['FNB2'] }] },
    ],
  },
};

const PIN_TILES = Array.from(pins.PIN_CATEGORIES).map((c) => c.tileKey);
const NATIVE = ['recharge', 'rechargePin', 'internet', 'billpayment', 'tngewallet', 'esim', 'moreFeaturesTile', 'salary', ...PIN_TILES];
const overflow = NATIVE.filter((key) => key.startsWith('pinCategory') || key === 'salary')
  .map((key) => ({ key, name: key, kind: key.startsWith('pinCategory') ? 'pinCategory' : 'salary' }));

(async () => {
  console.log('\nCatalogue tiles');

  await test('every category with an active product is a tile, once', () => {
    const categories = tiles.catalogCategories(CATALOG);
    const names = categories.map((c) => c.name);
    assert.ok(!names.includes('Loans'), 'a category whose only product is inactive must not be drawn');
    assert.strictEqual(names.filter((n) => n === 'Food & Beverage').length, 1, 'a repeated category name is one category');
    const fnb = categories.find((c) => c.name === 'Food & Beverage');
    assert.deepStrictEqual(Array.from(fnb.codes).sort(), ['FNB1', 'FNB2', 'FOOD1'], 'its products from both groups are combined');
    assert.strictEqual(fnb.imageUrl, 'https://cdn.example/fnb.png');
    assert.strictEqual(fnb.vouchersOnly, true);
    assert.strictEqual(categories.find((c) => c.name === 'Game Credits').vouchersOnly, false);
  });

  await test('a category a native tile already sells is merged into it', () => {
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Prepaid' }, NATIVE), 'recharge');
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Data' }, NATIVE), 'internet');
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Pin' }, NATIVE), 'rechargePin');
    // A bill is not a prepaid reload, however much the names overlap.
    // A bill is not a prepaid reload, however much the names overlap: it goes
    // to Bill Payment, by its group.
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Postpaid', group: 'Bills' }, NATIVE), 'billpayment');
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Postpaid' }, ['recharge']), '');
    assert.strictEqual(tiles.nativeTileFor({ name: 'International Topup' }, NATIVE), 'recharge');
    // No native tile on this grid, nothing to merge into.
    assert.strictEqual(tiles.nativeTileFor({ name: 'Mobile Prepaid' }, ['salary']), '');
  });

  await test('the merged grid has each destination once', () => {
    const keys = tiles.mergeCatalogTiles(overflow, CATALOG, NATIVE).map((t) => t.key);
    assert.strictEqual(new Set(keys).size, keys.length, 'duplicate keys: ' + keys.join(', '));
    for (const gone of ['iimmpact_mobile_prepaid', 'iimmpact_mobile_data', 'iimmpact_mobile_pin']) {
      assert.ok(!keys.includes(gone), gone + ' duplicates a native tile');
    }
    // Bills fold into Bill Payment and International Topup into Mobile
    // Recharge: the native tiles sell exactly those products.
    for (const merged of ['iimmpact_international_topup', 'iimmpact_mobile_postpaid', 'iimmpact_water_bills']) {
      assert.ok(!keys.includes(merged), merged + ' duplicates a native tile');
    }
    for (const kept of ['iimmpact_game_credits', 'iimmpact_e_wallets_reload', 'iimmpact_idd']) {
      assert.ok(keys.includes(kept), kept + ' missing from ' + keys.join(', '));
    }
    assert.ok(keys.includes('salary'), 'unrelated tiles are untouched');
  });

  await test('every PIN Generator category is a native tile, and voucher categories fold into them', () => {
    const keys = tiles.mergeCatalogTiles(overflow, CATALOG, NATIVE).map((t) => t.key);
    for (const key of ['pinCategoryMobile', 'pinCategoryCoffee', 'pinCategoryWellness', 'pinCategoryTransport',
      'pinCategoryApple', 'pinCategoryShopping', 'pinCategoryGrocery', 'pinCategoryFood', 'pinCategoryGaming', 'pinCategoryFuel', 'pinCategoryOther']) {
      assert.ok(keys.includes(key), key + ' missing from ' + keys.join(', '));
    }
    for (const folded of ['iimmpact_food_and_beverage', 'iimmpact_retail_and_shopping', 'iimmpact_digital_voucher',
      'iimmpact_grocery', 'iimmpact_transportation', 'iimmpact_wellness_and_beauty', 'iimmpact_console_and_app_stores', 'iimmpact_fuel']) {
      assert.ok(!keys.includes(folded), folded + ' is drawn beside the PIN tiles that already sell it');
    }
  });

  await test('the PIN tiles and the PIN screen sort products the same way', () => {
    const byId = Object.fromEntries(Array.from(pins.categorizePinProducts(CATALOG)).map((c) => [c.id, Array.from(c.products).map((p) => p.code).sort()]));
    assert.deepStrictEqual(byId.mobile, ['PIN1', 'RED1'], 'everything IIMMPACT files under Mobile Pin is a mobile operator PIN');
    assert.deepStrictEqual(byId.fuel, ['FUEL1'], 'Fuel has its own PIN category');
    assert.deepStrictEqual(byId.coffee, ['FNB1', 'FNB2']);
    assert.deepStrictEqual(byId.food, ['FOOD1']);
    assert.deepStrictEqual(byId.gaming, ['GAMEPIN1']);
    assert.deepStrictEqual(byId.apple, ['APP1']);
    assert.ok(!Object.values(byId).flat().includes('GAME1'), 'a live game top-up is not a voucher');
  });

  await test('every active product in the catalogue is reachable from some tile', () => {
    const merged = tiles.mergeCatalogTiles(overflow, CATALOG, NATIVE);
    const keys = new Set(merged.map((t) => t.key));
    const categories = Array.from(tiles.catalogCategories(CATALOG));
    const pinCodes = new Set(Array.from(pins.categorizePinProducts(CATALOG)).flatMap((c) => Array.from(c.products).map((p) => p.code)));
    const reachable = new Set();
    for (const category of categories) {
      const native = tiles.nativeTileFor(category, NATIVE);
      const own = keys.has(tiles.catalogTileKey(category.name));
      for (const code of category.codes) {
        if (native || own || pinCodes.has(code)) reachable.add(code);
      }
    }
    const missing = Object.keys(CATALOG.products).filter((code) => CATALOG.products[code].is_active !== false && !reachable.has(code));
    assert.deepStrictEqual(missing, [], 'unreachable: ' + missing.join(', '));
    assert.ok(keys.has('iimmpact_other_products'), 'a product in no category still gets a tile');
  });

  await test('Internet lists every data operator IIMMPACT sells beyond the built-in names', () => {
    const extra = Array.from(recharge.extraDataOperators(CATALOG, ['Celcom', 'Digi', 'Hotlink', 'U Mobile', 'Tunetalk', 'XOX', 'Yes']));
    assert.deepStrictEqual(extra, ['Unifi Mobile Data'], 'Digi Internet is covered by Digi; Unifi is not covered by anything');
  });

  await test('All Products and Fuel are declared tiles', () => {
    const declared = fs.readFileSync(path.join(ROOT, 'src/components/serviceTiles.js'), 'utf8');
    assert.ok(/key: 'iimmpactCatalog'[^\n]*kind: 'iimmpactCatalog'/.test(declared));
    assert.ok(/key: 'pinCategoryFuel'[^\n]*pinCategory: 'fuel'/.test(declared));
  });

  await test('a PIN category with no products is not drawn once the catalogue is known', () => {
    const noGaming = { ...CATALOG, products: Object.fromEntries(Object.entries(CATALOG.products).filter(([code]) => code !== 'GAMEPIN1')) };
    const keys = tiles.mergeCatalogTiles(overflow, noGaming, NATIVE).map((t) => t.key);
    assert.ok(!keys.includes('pinCategoryGaming'));
    assert.ok(keys.includes('pinCategoryCoffee'));
  });

  await test('with no catalogue the grid is returned exactly as it was', () => {
    assert.deepStrictEqual(tiles.mergeCatalogTiles(overflow, null, NATIVE), overflow);
    assert.deepStrictEqual(tiles.mergeCatalogTiles(overflow, { products: {}, tree: { groups: [] } }, NATIVE), overflow);
  });

  await test('a catalogue tile opens its product form by category name', () => {
    const tile = tiles.mergeCatalogTiles([], CATALOG, NATIVE).find((t) => t.key === 'iimmpact_idd');
    assert.strictEqual(tile.kind, 'iimmpactProducts');
    assert.strictEqual(tile.iimmpactCategory, 'IDD');
    assert.ok(tile.art, 'a category without a logo still gets a drawing');
    const grid = fs.readFileSync(path.join(ROOT, 'src/components/ServiceGrid.js'), 'utf8');
    assert.ok(/s\.kind === 'iimmpactProducts'\) return setScreen\('iimmpactCategory:'/.test(grid), 'the tile kind must have a destination');
  });

  await test('Food & Delivery and Gaming are declared tiles that open their PIN category', () => {
    const declared = fs.readFileSync(path.join(ROOT, 'src/components/serviceTiles.js'), 'utf8');
    assert.ok(/key: 'pinCategoryFood'[^\n]*kind: 'pinCategory', pinCategory: 'food'/.test(declared));
    assert.ok(/key: 'pinCategoryGaming'[^\n]*kind: 'pinCategory', pinCategory: 'gaming'/.test(declared));
  });

  console.log('\nRecharge operators');

  const COUNTRIES = ['Malaysia', 'Indonesia', 'Nepal', 'Bangladesh'];
  await test('Malaysia lists every operator IIMMPACT files under Mobile Prepaid', () => {
    const names = Array.from(recharge.rechargeProductsFromCatalog(CATALOG, { country: 'MY', countryName: 'Malaysia', countryNames: COUNTRIES })).map((p) => p.name);
    assert.deepStrictEqual(names, ['Celcom', 'Digi', 'Hotlink']);
  });

  await test('another country lists its own International Topup products', () => {
    const names = Array.from(recharge.rechargeProductsFromCatalog(CATALOG, { country: 'ID', countryName: 'Indonesia', countryNames: COUNTRIES })).map((p) => p.name);
    assert.deepStrictEqual(names, ['Indonesia'], 'a product named after its country is how international top-up is sold');
  });

  await test('a country IIMMPACT has no top-up for gets none, not every other country’s', () => {
    const names = Array.from(recharge.rechargeProductsFromCatalog(CATALOG, { country: 'IN', countryName: 'India', countryNames: [...COUNTRIES, 'India'] })).map((p) => p.name);
    assert.deepStrictEqual(names, [], 'picking India used to offer the Indonesia and Nepal top-ups as operators');
  });

  await test('International Reload lists only the countries IIMMPACT sells, never Malaysia', () => {
    const list = [{ code: 'MY', name: 'Malaysia' }, { code: 'ID', name: 'Indonesia' }, { code: 'NP', name: 'Nepal' }, { code: 'IN', name: 'India' }];
    assert.deepStrictEqual(Array.from(recharge.internationalRechargeCountries(CATALOG, list)), ['ID', 'NP']);
  });

  await test('the app prices a typed amount exactly as the server charges it', () => {
    const server = require(path.join(ROOT, 'functions/apiProviderService.js'))._test_iimmpactCustomerPrice;
    const app = runEsm('src/utils/iimmpactPrice.js');
    const cases = [
      [100, { denomination_currency: 'BDT', denomination_unit_price: 0.0385 }],
      [50000, { denomination_currency: 'IDR', denomination_unit_price: 0.00029, pricing: { unit_price: 1.02 } }],
      [10, { denomination_currency: 'MYR' }],
      [20, { denomination_currency: 'NPR', denomination_unit_price: 0.033, pricing: { price_adjustment: { type: 'fixed', value: 0.5 } } }],
      [20, { denomination_currency: 'PKR', denomination_unit_price: 0.016, pricing: { unit_price: -0.2, price_adjustment: { type: 'percentage', value: 1.01 } } }],
    ];
    for (const [amount, product] of cases) assert.strictEqual(app.iimmpactCustomerPrice(amount, product), server(amount, product), JSON.stringify(product));
    assert.strictEqual(app.canPriceTypedAmount({ denomination_currency: 'BDT' }), false, 'no unit price yet: cannot price');
    assert.strictEqual(app.canPriceTypedAmount({ denomination_currency: 'BDT', denomination_unit_price: 0.04 }), true);
  });

  await test('bills, data, PINs, IDD, wallets and games never appear as airtime', () => {
    const codes = Array.from(recharge.rechargeProductsFromCatalog(CATALOG, { country: 'MY', countryName: 'Malaysia', countryNames: COUNTRIES })).map((p) => p.code);
    for (const code of ['POST1', 'WATER1', 'DATA1', 'PIN1', 'IDD1', 'EW1', 'GAME1', 'IDT1']) assert.ok(!codes.includes(code), code);
  });

  console.log('\nCommission on the confirmation page');

  await test('the page shows the commission the server will actually credit', () => {
    const client = runEsm('src/utils/commission.js');
    const server = require('../functions/commissionService');
    const settings = {
      commissionRules: { recharge: { type: 'percent', value: 1 }, internet: { type: 'fixed', value: 0.3 } },
      catalogProductPricing: [{ productId: 'PKG9', service: '', commissions: { dealer: { type: 'fixed', value: 2 } } }],
    };
    const cases = [
      ['recharge', 50, 'customer', { raw: { operator: 'Digi Prepaid' } }],
      ['internet', 35, 'customer', { raw: { operator: 'Digi' } }],
      ['billpayment', 40, 'customer', { raw: {} }],
      ['billpayment', 120, 'customer', { raw: {} }],
      ['entertainment', 20, 'customer', { raw: {} }],
      ['internet', 35, 'dealer', { raw: { packageId: 'PKG9' } }],
    ];
    for (const [service, amount, role, payload] of cases) {
      assert.strictEqual(client.resolveCommission(settings, { service, amount, role, payload }),
        server.resolveCommission(settings, { service, amount, role, payload }), `${service} ${amount} ${role}`);
    }
    // walletService pays none on these, so the page must not promise any.
    assert.strictEqual(client.resolveCommission(settings, { service: 'remittance', amount: 500, role: 'customer', payload: { raw: {} } }), 0);
    assert.strictEqual(client.resolveCommission(settings, { service: 'billpayment', amount: 40, role: 'customer', payload: { raw: { provider: "Touch 'n Go eWallet" } } }), 0);
    assert.strictEqual(client.resolveCommission(settings, { service: 'recharge', amount: 50, role: 'retail', payload: { raw: {} } }), 0.5);
    // A customer earns nothing unless commissionRules.byRole.customer says so.
    assert.strictEqual(client.resolveCommission(settings, { service: 'recharge', amount: 50, role: 'customer', payload: { raw: {} } }), 0);
  });

  await test('Bill Payment lists every IIMMPACT biller with its product code', () => {
    const bills = Array.from(tiles.billCategories(CATALOG));
    const byLabel = Object.fromEntries(bills.map((c) => [c.label, c]));
    assert.deepStrictEqual(Object.keys(byLabel).sort(), ['Mobile Postpaid', 'Water Bills'], 'only the bills group, and only categories with billers');
    assert.deepStrictEqual(Array.from(byLabel['Water Bills'].billers).map((b) => [b.name, b.code]), [['Air Selangor', 'WATER1']]);
    assert.strictEqual(byLabel['Water Bills'].art, 'billWater');
    assert.strictEqual(byLabel['Mobile Postpaid'].art, 'billMobile');
    assert.ok(byLabel['Water Bills'].key.startsWith('iimmpact:'));
    const steps = fs.readFileSync(path.join(ROOT, 'src/steps/BillPaymentSteps.js'), 'utf8');
    assert.ok(/operatorCode: b\.code \|\| ''/.test(steps), 'the chosen biller must carry its product code into the order');
  });

  console.log('\nProvider grids');

  // The production E-Wallets category: TnG PIN, TnG Pinless and TrueMoney.
  const WALLETS = {
    ...CATALOG,
    products: { ...CATALOG.products,
      TNGPIN: { code: 'TNGPIN', name: "Touch 'n Go PIN", is_active: true, processing_time: 'pin', image_url: 'https://cdn.example/tng.png' },
      TNGRELOAD: { code: 'TNGRELOAD', name: "Touch 'n Go Pinless", is_active: true },
      TRUEMONEY: { code: 'TRUEMONEY', name: 'TrueMoney eWallet', is_active: true },
      LOAN1: { code: 'LOAN1', name: 'AEON Credit', is_active: true },
      MPKJ: { code: 'MPKJ', name: 'MP Kajang', is_active: true },
    },
    tree: { groups: [
      ...CATALOG.tree.groups.filter((g) => g.name !== 'E-Wallet Reloads' && g.name !== 'Bills'),
      { name: 'Bills', categories: [
        { name: 'Mobile Postpaid', product_codes: ['POST1'] },
        { name: 'Water Bills', product_codes: ['WATER1'], icon_url: 'https://cdn.example/water.png' },
        { name: 'Loans', product_codes: ['LOAN1'] },
        { name: 'Local Councils', product_codes: ['MPKJ'] },
      ] },
      { name: 'E-Wallet Reloads', categories: [{ name: 'E-Wallets Reload', product_codes: ['TNGPIN', 'TNGRELOAD', 'TRUEMONEY'] }] },
    ] },
  };
  const group = (key) => grids.providerGroup({ provider: 'iimmpact', groupKey: key, catalog: WALLETS });
  const names = (key) => Array.from(group(key).tiles).map((t) => t.name);

  await test("a Malaysian home leads with Mobile's five tiles, then Bills, Vouchers, Games and E-Wallet", () => {
    const home = Array.from(grids.providerHomeTiles({ country: 'MY' }));
    assert.deepStrictEqual(home.map((t) => t.name), ['Prepaid Reload', 'PIN', 'Internet', 'International Reload', 'International Internet', 'Bills', 'Vouchers', 'Games', 'E-Wallet']);
    assert.ok(home.every((t) => t.provider === 'iimmpact' && /^photo/.test(t.art)), 'every tile has a picture');
    const mobile = home.slice(0, 5);
    assert.ok(mobile.every((t) => t.parentKey === 'grp_mobile'), "the Mobile switch still governs Mobile's tiles");
    assert.deepStrictEqual(mobile.map((t) => t.kind), ['seededService', 'pinCategory', 'seededService', 'seededService', 'seededService'], 'each opens its own flow directly');
    assert.ok(home.slice(5).every((t) => t.kind === 'providerGroup'), 'the other groups stay groups');
  });

  await test('Mobile: Prepaid Reload, PIN, Internet, International Reload, International Internet', () => {
    assert.deepStrictEqual(names('grp_mobile'), ['Prepaid Reload', 'PIN', 'Internet', 'International Reload', 'International Internet']);
    const [prepaid, pin, internet, intl] = Array.from(group('grp_mobile').tiles);
    assert.deepStrictEqual([prepaid.service, prepaid.startStep, prepaid.seed.country], ['recharge', 1, 'MY']);
    assert.deepStrictEqual([pin.kind, pin.pinCategory], ['pinCategory', 'mobile']);
    assert.deepStrictEqual([internet.service, internet.startStep], ['internet', 1]);
    assert.deepStrictEqual([intl.service, intl.startStep], ['recharge', 0], 'international reload starts at the country');
  });

  await test('Bills: every bill type IIMMPACT has a category for, JomPAY and international', () => {
    assert.deepStrictEqual(names('grp_bills'), ['Postpaid Bill', 'Water Bill', 'Loan', 'Local Council', 'JomPAY', 'International Bills']);
    const tile = (name) => Array.from(group('grp_bills').tiles).find((t) => t.name === name);
    assert.deepStrictEqual([tile('Water Bill').seed.category, tile('Water Bill').startStep, tile('Water Bill').imageUrl], ['iimmpact:water bills', 2, 'https://cdn.example/water.png'], 'IIMMPACT’s own billers and logo');
    assert.strictEqual(tile('Loan').seed.category, 'iimmpact:loans');
    assert.strictEqual(tile('Local Council').seed.category, 'iimmpact:local councils');
    assert.strictEqual(tile('Electric Bill'), undefined, 'no IIMMPACT category, so no tile - the old built-in billers are gone');
    assert.deepStrictEqual([tile('JomPAY').seed.category, tile('JomPAY').startStep], ['jompay', 3]);
    assert.deepStrictEqual([tile('International Bills').service, tile('International Bills').startStep], ['billpayment', 0]);
    assert.ok(Array.from(group('grp_bills').tiles).every((t) => t.service === 'billpayment' && /^photo/.test(t.art)));
  });

  await test('Bills without a catalogue offer no old built-in biller lists', () => {
    const offline = Array.from(grids.providerGroup({ provider: 'iimmpact', groupKey: 'grp_bills', catalog: null }).tiles).map((t) => t.name);
    assert.deepStrictEqual(offline, ['JomPAY', 'International Bills'], 'the bill types wait for IIMMPACT');
  });

  await test('Vouchers and Games: IIMMPACT categories, opening products then amounts', () => {
    const vouchers = names('grp_vouchers');
    for (const name of ['Food & Beverage', 'Retail & Shopping', 'Digital Voucher', 'Grocery', 'Transportation', 'Wellness & Beauty', 'Fuel']) assert.ok(vouchers.includes(name), name);
    for (const name of ['Mobile Pin', 'E-Wallets Reload', 'Console & App Stores']) assert.ok(!vouchers.includes(name), name + ' belongs elsewhere');
    assert.deepStrictEqual(names('grp_games').sort(), ['Console & App Stores', 'Game Credits']);
    assert.ok(Array.from(group('grp_vouchers').tiles).every((t) => t.kind === 'iimmpactProducts'));
  });

  await test('E-Wallet: each wallet product is a tile that opens on its amounts', () => {
    const tiles = Array.from(group('grp_ewallet').tiles);
    assert.deepStrictEqual(tiles.map((t) => t.name), ["Touch 'n Go PIN", "Touch 'n Go Pinless", 'TrueMoney eWallet']);
    assert.ok(tiles.every((t) => t.kind === 'iimmpactProduct'));
    assert.deepStrictEqual(tiles.map((t) => t.productCode), ['TNGPIN', 'TNGRELOAD', 'TRUEMONEY']);
    assert.strictEqual(tiles[0].imageUrl, 'https://cdn.example/tng.png', 'IIMMPACT’s own logo');
    assert.strictEqual(tiles[1].art, 'photoTngewallet', 'and the TnG picture where it has none');
  });

  await test('the old product tiles, TnG and JomPAY leave the home screen; other features stay', () => {
    const covered = grids.coveredKeys({ country: 'MY' });
    for (const key of ['recharge', 'internet', 'rechargePin', 'billpayment', 'tngewallet', 'jompay', 'pinCategoryCoffee']) assert.ok(covered.has(key), key);
    for (const key of ['flight', 'bus', 'train', 'salary', 'offerpacks', 'esim', 'iimmpactCatalog']) assert.ok(!covered.has(key), key + ' stays');
  });

  await test('a Bangladeshi home is built from Success TopUp\u2019s services, operators and billers', () => {
    const home = Array.from(grids.providerHomeTiles({ country: 'BD', catalog: CATALOG }));
    assert.deepStrictEqual(home.map((t) => t.name), ['Mobile Recharge', 'Internet Packages', 'Bill Payment']);
    const internet = Array.from(grids.providerGroup({ provider: 'successtopup', groupKey: 'grp_bd_internet' }).tiles);
    const offers = internet.find((t) => t.key === 'offerpacks_bd');
    assert.ok(offers, 'Offer Packs is inside Internet');
    assert.deepStrictEqual([offers.service, offers.startStep, offers.seed.country, internet[internet.length - 1].key], ['offerpacks', 1, 'BD', 'offerpacks_bd']);
    assert.ok(grids.coveredKeys({ country: 'BD' }).has('offerpacks'), 'and the old Offer Packs tile is not drawn again');
    const recharge = grids.providerGroup({ provider: 'successtopup', groupKey: 'grp_bd_recharge' });
    const gp = Array.from(recharge.tiles).find((t) => t.name === 'Grameenphone');
    assert.deepStrictEqual([gp.service, gp.startStep, gp.seed.country, gp.seed.operator], ['recharge', 1, 'BD', 'Grameenphone']);
    const bills = Array.from(grids.providerGroup({ provider: 'successtopup', groupKey: 'grp_bd_bills' }).tiles);
    assert.deepStrictEqual(bills.map((t) => t.seed.category).sort(), ['electricity', 'gas', 'internet', 'mobile', 'water']);
    assert.ok(bills.every((t) => t.service === 'billpayment' && t.startStep === 2 && t.seed.country === 'BD'));
    const covered = grids.coveredKeys({ country: 'BD' });
    for (const key of ['recharge', 'billpayment', 'tngewallet', 'jompay', 'rechargePin', 'esim']) assert.ok(covered.has(key), key);
    assert.ok(!covered.has('salary'));
  });

  await test('every role gets the provider groups, not only a customer’s home', () => {
    const grid = fs.readFileSync(path.join(ROOT, 'src/components/ServiceGrid.js'), 'utf8');
    assert.ok(!/if \(homeOnly\) \{\s*const groups/.test(grid), 'grouping is not limited to homeOnly');
    assert.ok(/const groups = providerHomeTiles\(\{ country \}\)/.test(grid));
    const admin = fs.readFileSync(path.join(ROOT, 'src/screens/AdminFeaturesScreen.js'), 'utf8');
    assert.ok(/providerHomeTiles\(\{ country: adminCountry \}\)/.test(admin), 'admin landing draws the groups');
    assert.ok(/adminHomeList\.filter\(\(item\) => !covered\.has\(item\.key\)\)/.test(admin), 'and drops the tiles they replace');
  });

  await test('the new tile kinds have destinations', () => {
    const grid = fs.readFileSync(path.join(ROOT, 'src/components/ServiceGrid.js'), 'utf8');
    assert.ok(/s\.kind === 'providerGroup'\) return setScreen\('providerGroup:'/.test(grid));
    assert.ok(/s\.kind === 'seededService'\) return startService\(s\.service, s\.seed \|\| \{\}, s\.startStep \|\| 0\)/.test(grid));
    assert.ok(/s\.kind === 'iimmpactProduct'\) return setScreen\('iimmpactProduct:'/.test(grid));
    const app = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
    assert.ok(/renderedScreen\.startsWith\('providerGroup:'\) && .*<ProviderGroupScreen/.test(app));
    assert.ok(/renderedScreen\.startsWith\('iimmpactProduct:'\) && <IimmpactProductScreen productCode=/.test(app));
  });

  console.log('\nBill Payment asks what each biller needs');

  const billForm = runEsm('src/utils/iimmpactBillForm.js');
  // Shaped like an IIMMPACT loan biller: account, IC, a district list that
  // depends on the account, and a typed amount with limits.
  const LOAN = {
    iimmpactFields: [
      { id: 'district', label: 'District', type: 'select', required: true, order: 3, data_source: { depends_on: ['acc'] } },
      { id: 'acc', label: 'Loan Account No.', type: 'text', required: true, order: 1, validation: { pattern: '^[0-9]{10}$', message: 'Loan account is 10 digits.' } },
      { id: 'ic', label: 'IC Number', type: 'text', required: true, order: 2 },
      { id: 'note', label: 'Note', type: 'text', required: false, order: 4 },
      { id: 'amt', label: 'Amount', type: 'money', required: true, order: 5, validation: { min: 10, max: 5000 } },
    ],
    iimmpactFulfillment: {
      account: { from_field: 'acc' },
      amount: { from_field: 'amt' },
      extras: { ic_number: { from_field: 'ic' }, biller_code: { from_field: 'district', path: 'code' }, unknown_key: { from_field: 'note' } },
    },
  };

  await test('the account step asks for the biller\u2019s own fields, in its order, and holds the customer to them', () => {
    const form = billForm.billForm(LOAN);
    assert.strictEqual(form.account.label, 'Loan Account No.', 'the account box carries the biller\u2019s own label');
    assert.strictEqual(form.amount.id, 'amt');
    assert.deepStrictEqual(Array.from(form.extra).map((f) => f.id), ['ic', 'district', 'note']);
    const err = (data) => billForm.accountStepError({ ...LOAN, ...data });
    assert.strictEqual(err({ accountNumber: '' }), 'Please enter Loan Account No..');
    assert.strictEqual(err({ accountNumber: '12345' }), 'Loan account is 10 digits.', 'the biller\u2019s own pattern and message');
    assert.strictEqual(err({ accountNumber: '1234567890' }), 'Please enter IC Number.');
    assert.strictEqual(err({ accountNumber: '1234567890', fieldValues: { ic: '901010101234' } }), 'Please enter District.');
    assert.strictEqual(err({ accountNumber: '1234567890', fieldValues: { ic: '901010101234' }, selectedOptions: { district: { code: 'KL', label: 'Kuala Lumpur' } } }), '', 'an optional field may stay empty');
  });

  await test('the amount step keeps to the biller\u2019s limits, or to its packages', () => {
    assert.strictEqual(billForm.amountStepError({ ...LOAN, amount: 5 }), 'Amount must be at least 10.');
    assert.strictEqual(billForm.amountStepError({ ...LOAN, amount: 6000 }), 'Amount must be at most 5000.');
    assert.strictEqual(billForm.amountStepError({ ...LOAN, amount: 150 }), '');
    const PACKAGES = { iimmpactFields: [{ id: 'acc', type: 'text' }, { id: 'plan', label: 'Package', type: 'select', role: 'pricing', required: true }], iimmpactFulfillment: { account: { from_field: 'acc' }, amount: { from_field: 'plan', path: 'denomination' } } };
    assert.strictEqual(billForm.amountStepError({ ...PACKAGES }), 'Please choose Package.');
    assert.strictEqual(billForm.amountStepError({ ...PACKAGES, selectedOptions: { plan: { code: 'P99' } } }), '');
    assert.strictEqual(JSON.stringify(billForm.billOrderFields({ ...PACKAGES, accountNumber: '1', selectedOptions: { plan: { code: 'P99' } } })), JSON.stringify({ extras: {}, subproductCode: 'P99' }), 'the chosen package is the plan sent');
    assert.strictEqual(billForm.optionAmount({ price: { amount: 49.9 } }), 49.9);
  });

  await test('the order carries the extras IIMMPACT documents, from the fields that fill them', () => {
    const order = billForm.billOrderFields({ ...LOAN, accountNumber: '1234567890', fieldValues: { ic: '901010101234', note: 'hi' }, selectedOptions: { district: { code: 'KL' } } });
    assert.deepStrictEqual({ ...order.extras }, { ic_number: '901010101234', biller_code: 'KL' }, 'undocumented keys are not sent');
    assert.deepStrictEqual({ ...billForm.billOrderFields({ accountNumber: '1' }) }, {}, 'a built-in biller is unchanged');
    const wallet = fs.readFileSync(path.join(ROOT, 'functions/walletService.js'), 'utf8');
    assert.ok(/billpayment: new Set\(\[[^\]]*'extras'[^\]]*'selectedOptions'/.test(wallet), 'the server keeps them on a bill order');
    const app = fs.readFileSync(path.join(ROOT, 'src/context/AppContext.js'), 'utf8');
    assert.ok(/currentService === "billpayment" \? \{ \.\.\.serviceData, \.\.\.billOrderFields\(serviceData\) \}/.test(app), 'and the app sends them');
  });

  await test('choosing an IIMMPACT biller stores its fields for the next steps', () => {
    const steps = fs.readFileSync(path.join(ROOT, 'src/steps/BillPaymentSteps.js'), 'utf8');
    assert.ok(/iimmpactFields: Array\.isArray\(product\?\.fields\) \? product\.fields : \[\], iimmpactFulfillment: product\?\.fulfillment \|\| null/.test(steps));
    assert.ok(/billForm\(serviceData\)\.active && !\['jompay', 'tax'\]\.includes\(serviceData\.category\)\s*\? accountStepError\(serviceData\)/.test(steps), 'and validates against them');
  });

  console.log('\nMarkup');

  await test('the most specific markup wins, and payouts are never marked up', () => {
    const server = require('../functions/markupService');
    const pricing = { markups: {
      services: { recharge: { percent: 2, fixed: 0 }, billpayment: { percent: 0, fixed: 0.5 }, rechargePin: { percent: 10 } },
      countries: { 'recharge:ID': { percent: 5, fixed: 0.2 } },
      products: { YESPIN: { percent: 0, fixed: 1 } },
    } };
    const at = (service, amount, country, productCode) => server.applyMarkup(pricing, { service, amount, country, productCode });
    assert.deepStrictEqual(at('recharge', 10, 'MY'), { amount: 10.2, markup: 0.2 });
    assert.deepStrictEqual(at('recharge', 10, 'ID'), { amount: 10.7, markup: 0.7 }, 'country beats service');
    assert.deepStrictEqual(at('rechargePin', 10, 'MY', 'YESPIN'), { amount: 11, markup: 1 }, 'product beats service');
    assert.deepStrictEqual(at('billpayment', 40, 'MY'), { amount: 40.5, markup: 0.5 });
    assert.deepStrictEqual(at('internet', 35, 'MY'), { amount: 35, markup: 0 }, 'no rule, no markup');
    assert.deepStrictEqual(at('remittance', 500, 'BD'), { amount: 500, markup: 0 });
    assert.deepStrictEqual(at('mobilebanking', 100, 'BD'), { amount: 100, markup: 0 });
    assert.deepStrictEqual(server.applyMarkup({}, { service: 'recharge', amount: 10 }), { amount: 10, markup: 0 }, 'no markups configured changes nothing');
  });

  await test('the app shows exactly the price the server charges', () => {
    const client = runEsm('src/utils/markup.js');
    const server = require('../functions/markupService');
    const pricing = { markups: { services: { recharge: { percent: 3.5, fixed: 0.1 }, iimmpact: { percent: 1 }, esim: { fixed: 2 } }, countries: { 'recharge:NP': { percent: 7 } }, products: { D: { percent: 0.5, fixed: 0.05 } } } };
    const cases = [['recharge', 50, 'MY', 'D'], ['recharge', 50, 'MY', 'X'], ['recharge', 33.33, 'NP', ''], ['iimmpact', 9.99, 'MY', ''], ['esim', 20, 'MY', ''], ['remittance', 100, 'NP', '']];
    for (const [service, amount, country, productCode] of cases) {
      assert.deepStrictEqual({ ...client.applyMarkup(pricing, { service, amount, country, productCode }) },
        server.applyMarkup(pricing, { service, amount, country, productCode }), `${service} ${amount} ${country} ${productCode}`);
    }
  });

  await test('the wallet charge includes the markup and the provider is still sent its own price', () => {
    const src = fs.readFileSync(path.join(ROOT, 'functions/walletService.js'), 'utf8');
    assert.ok(/const customerCharge=Math\.round\(\(baseProviderAmount\+markupAmount\+serviceFee\)\*100\)\/100;/.test(src));
    assert.ok(/markupAmount=service==='remittance'\|\|service==='mobilebanking'\?0:/.test(src), 'payouts are never marked up');
    assert.ok(/amount: result\.apiAmount, total: result\.apiTotal/.test(src), 'the provider is dispatched its own amount');
  });

  await test('superadmin can save markups, and a deleted rule really goes', () => {
    const src = fs.readFileSync(path.join(ROOT, 'functions/pricingMutationService.js'), 'utf8');
    assert.ok(/'commissionRules','markups'/.test(src));
    assert.ok(/key === 'markups' \? \{ mergeFields: \[key, 'updatedBy', 'updatedAt'\] \}/.test(src));
  });

  console.log('\nDenominations kept in MySheba');

  await test('amounts come from IIMMPACT once, then from the device until a purchase says they are stale', async () => {
    const calls = [];
    const answers = { YESPIN: { items: [{ code: 'YES10', price: { amount: 10 } }] }, EMPTY: { items: [] } };
    const storage = new Map();
    const code = esbuild.transformSync(fs.readFileSync(path.join(ROOT, 'src/firebase/apiProviderService.js'), 'utf8'), { loader: 'js', format: 'cjs' }).code;
    const box = { module: { exports: {} }, exports: {}, Promise, JSON, Date, Map, Object, Array, String, Number, Set, console };
    box.module.exports = box.exports;
    box.require = (id) => {
      if (id === 'firebase/functions') {
        return { httpsCallable: (_f, name) => async (input) => {
          calls.push(name);
          if (name === 'getIimmpactOptions') return { data: answers[input.productCode] };
          if (name === 'listProviderDataPlans') return { data: { supported: true, plans: [{ id: 'P1' }] } };
          if (name === 'chargeIimmpactProduct') { const e = new Error('This IIMMPACT price has changed - please review your order.'); throw e; }
          return { data: {} };
        } };
      }
      if (id === './config') return { functions: {}, db: {} };
      if (id === './deviceSessionService') return { getSessionProof: async () => ({ sessionId: 's', deviceId: 'd' }) };
      if (id === 'firebase/firestore') {
        // MySheba's saved amount lists (iimmpactOptionsMirror), by document id.
        return {
          doc: (_db, collection, docId) => ({ collection, docId }),
          getDoc: async (ref) => {
            const saved = mirror.get(ref.docId);
            return { exists: () => !!saved, data: () => saved };
          },
        };
      }
      if (id === '@react-native-async-storage/async-storage') {
        return { __esModule: true, default: { getItem: async (k) => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v); } } };
      }
      throw new Error('unexpected require: ' + id);
    };
    const mirror = new Map([['SAVED__amount', { json: JSON.stringify({ items: [{ code: 'S5', price: { amount: 5 } }] }), savedAt: { toMillis: () => Date.now() } }]]);
    vm.createContext(box);
    vm.runInContext(code, box);
    const api = box.module.exports;
    const ask = (productCode, accountNumber = '') => api.getIimmpactOptions({ productCode, fieldId: 'amount', accountNumber, service: 'Recharge PIN', country: 'MY' });
    const count = () => calls.filter((n) => n === 'getIimmpactOptions').length;

    assert.strictEqual((await ask('YESPIN')).items.length, 1);
    await ask('YESPIN');
    await ask('YESPIN');
    assert.strictEqual(count(), 1, 'reopening the amounts must not call IIMMPACT again');
    await Promise.all([ask('YESPIN', '0123'), ask('YESPIN', '0123')]);
    assert.strictEqual(count(), 2, 'a different number is its own answer, and two screens asking at once share one call');
    await ask('EMPTY'); await ask('EMPTY');
    assert.strictEqual(count(), 4, 'an empty answer is not kept');
    assert.ok(storage.has('@mysheba/iimmpact-options/v1'), 'kept amounts survive an app restart');
    const before = count();
    assert.strictEqual((await ask('SAVED')).items[0].code, 'S5', 'a list MySheba has saved is read from Firestore');
    assert.strictEqual(count(), before, 'without calling the server or IIMMPACT');

    await api.listProviderDataPlans({ service: 'Internet', country: 'MY', operator: 'Digi', phone: '0123456789' });
    await api.listProviderDataPlans({ service: 'Internet', country: 'MY', operator: 'Digi', phone: '012-345 6789' });
    assert.strictEqual(calls.filter((n) => n === 'listProviderDataPlans').length, 1, 'data plans are kept per number too');

    await assert.rejects(() => api.chargeIimmpactProduct({ raw: { productCode: 'YESPIN' } }), /price has changed/);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await ask('YESPIN');
    assert.strictEqual(count(), 5, 'after the server refuses a stale price, the next open asks IIMMPACT afresh');
  });

  console.log('\nDenomination cards');

  await test('a ringgit option leads with its face value and hides a pay line that says the same', () => {
    const items = Array.from(denoms.denominationItems([
      { code: 'D5', label: 'RM5', denomination: 5, price: { amount: 5 } },
      { code: 'D10', label: 'Unlimited 7 days', denomination: 10, price: { amount: 10 }, validity: '7 days' },
    ]));
    assert.deepStrictEqual(items.map((i) => [i.key, i.value, i.caption, i.face, i.pay]), [
      ['D5', 'RM 5', '', 5, 5],
      ['D10', 'RM 10', 'Unlimited 7 days • 7 days', 10, 10],
    ]);
  });

  await test('MySheba’s markup shows as the amount the wallet pays', () => {
    const [item] = Array.from(denoms.denominationItems([{ code: 'D5', denomination: 5, price: { amount: 5 } }], { payFor: (p) => p * 1.02 }));
    assert.deepStrictEqual([item.value, item.face, item.pay], ['RM 5', 5, 5.1]);
  });

  await test('an international option is shown in the destination’s currency, with the ringgit it costs', () => {
    const [item] = Array.from(denoms.denominationItems([{ code: 'ID50', label: 'IDR 50000', denomination: 50000, denomination_currency: 'IDR', price: { amount: 14.2 } }]));
    assert.deepStrictEqual([item.value, item.face, item.pay], ['IDR 50,000', undefined, 14.2]);
  });

  await test('a product’s fixed amounts become cards too', () => {
    assert.deepStrictEqual(Array.from(denoms.amountItems([5, '10', 0, 'x'])).map((i) => i.value), ['RM 5', 'RM 10']);
  });

  console.log('\nBack inside the provider grids');

  await test('a grid and everything opened from it are one trail, so Back walks it a page at a time', () => {
    const keeps = (a, b) => !featureGroups.crossesFeature(a, b);
    assert.ok(keeps('providerGroup:iimmpact:grp_bills', 'service'), 'Bills -> Water Bill');
    assert.ok(keeps('service', 'confirmTransaction'), 'flow -> confirm');
    assert.ok(keeps('providerGroup:iimmpact:grp_vouchers', 'iimmpactCategory:Food%20%26%20Beverage'), 'Vouchers -> a category');
    assert.ok(keeps('iimmpactCategory:Food', 'iimmpactProduct:FNB1'));
    assert.ok(keeps('providerGroup:iimmpact:grp_mobile', 'rechargePinCategory:mobile'), 'Mobile -> PIN');
    assert.ok(keeps('providerGroup:iimmpact:grp_ewallet', 'iimmpactProduct:EW1'), 'E-Wallet -> a wallet');
  });

  await test('Home is never part of that trail, so Back from Home cannot step into a grid', () => {
    assert.ok(featureGroups.crossesFeature('customerHome', 'providerGroup:iimmpact:grp_bills'));
    assert.ok(featureGroups.crossesFeature('service', 'customerHome'));
    assert.strictEqual(featureGroups.featureOf('salaryDashboard'), 'salary', 'other features are unchanged');
  });

  console.log('\nMySheba keeps its own copy of the catalogue');

  const mirror = require(path.join(ROOT, 'functions/iimmpactCatalogMirror.js'));
  function fakeDb() {
    const store = new Map();
    const ref = (p) => ({
      path: p,
      get: async () => ({ exists: store.has(p), data: () => store.get(p) }),
      set: async (data, opts) => { store.set(p, opts && opts.merge ? { ...(store.get(p) || {}), ...data } : { ...data }); },
      collection: (name) => ({ doc: (id) => ref(p + '/' + name + '/' + id) }),
    });
    return {
      store,
      collection: (name) => ({ doc: (id) => ref(name + '/' + id) }),
      batch: () => {
        const ops = [];
        return { set: (r, d) => ops.push(() => store.set(r.path, { ...d })), delete: (r) => ops.push(() => store.delete(r.path)), commit: async () => ops.forEach((op) => op()) };
      },
    };
  }

  await test('a catalogue larger than one Firestore document is saved in pieces and read back whole', async () => {
    const db = fakeDb();
    const big = { providerId: 'p1', products: {} };
    for (let i = 0; i < 4000; i += 1) big.products['P' + i] = { code: 'P' + i, name: 'Product ' + i + ' '.repeat(100) };
    const written = await mirror.write(db, 'MY', big);
    assert.ok(written.chunkCount > 1, 'split into chunks');
    const back = await mirror.read(db, 'MY');
    assert.strictEqual(JSON.stringify(back.catalog), JSON.stringify(big));
  });

  await test('a new save replaces the old one and leaves no stray pieces', async () => {
    const db = fakeDb();
    const one = { products: {} };
    for (let i = 0; i < 3000; i += 1) one.products['A' + i] = { name: 'x'.repeat(120) };
    await mirror.write(db, 'MY', one);
    await mirror.write(db, 'MY', { products: { B: { name: 'only' } } });
    const chunks = [...db.store.keys()].filter((k) => k.includes('/chunks/'));
    assert.strictEqual(chunks.length, 1);
    assert.deepStrictEqual(JSON.parse(JSON.stringify((await mirror.read(db, 'MY')).catalog)), { products: { B: { name: 'only' } } });
  });

  await test('the saved copy is served while fresh, so IIMMPACT is not asked', async () => {
    const db = fakeDb();
    await mirror.write(db, 'MY', { products: { S: {} } });
    let asked = 0;
    const got = await mirror.cachedCatalog(db, 'MY', async () => { asked += 1; return { products: { L: {} } }; });
    assert.strictEqual(asked, 0);
    assert.ok(got.products.S);
  });

  await test('an old or stale-marked copy is refreshed, and kept when IIMMPACT fails', async () => {
    const db = fakeDb();
    await mirror.write(db, 'MY', { products: { S: {} } }, { now: new Date(Date.now() - 7 * 3600 * 1000) });
    const fresh = await mirror.cachedCatalog(db, 'MY', async () => ({ products: { L: {} } }));
    assert.ok(fresh.products.L, 'old copy refreshed');
    await mirror.markStale(db, 'MY', new Date(Date.now() + 1000));
    const kept = await mirror.cachedCatalog(db, 'MY', async () => { throw new Error('IIMMPACT down'); });
    assert.ok(kept.products.L, 'IIMMPACT failing still serves the saved copy');
  });

  await test('International Reload does not offer Malaysia', () => {
    const intl = Array.from(grids.providerGroup({ provider: 'iimmpact', groupKey: 'grp_mobile', catalog: null }).tiles).find((t) => t.key === 'mobile_international');
    assert.strictEqual(intl.seed.internationalOnly, true);
    const src = fs.readFileSync(path.join(ROOT, 'src/steps/RechargeSteps.js'), 'utf8');
    assert.ok(/internationalOnly\s*\?\s*countries\.filter\(\(c\) => c\.code !== 'MY'/.test(src), 'the country step leaves Malaysia out');
  });

  await test('International Internet sells packages abroad (Bangladesh included), not Malaysia', () => {
    const tiles = Array.from(grids.providerGroup({ provider: 'iimmpact', groupKey: 'grp_mobile', catalog: null }).tiles);
    const intl = tiles.find((t) => t.key === 'mobile_international_internet');
    assert.ok(intl, 'the Mobile group has an International Internet tile');
    assert.strictEqual(intl.service, 'internet');
    assert.strictEqual(intl.seed.internationalOnly, true);
    assert.strictEqual(intl.startStep, 0, 'it starts at the country');
    const home = Array.from(grids.providerHomeTiles({ country: 'MY' })).map((t) => t.key);
    assert.ok(home.includes('mobile_international_internet'), 'a Malaysian home screen shows it');
    const src = fs.readFileSync(path.join(ROOT, 'src/steps/InternetSteps.js'), 'utf8');
    assert.ok(/internationalOnly\s*\?\s*countries\.filter\(\(c\) => c\.code !== 'MY' && \(internetOperators\[c\.code\]/.test(src), 'the country step leaves Malaysia out');
  });

  await test('International Bills does not offer Malaysia', () => {
    const intl = Array.from(grids.providerGroup({ provider: 'iimmpact', groupKey: 'grp_bills', catalog: null }).tiles).find((t) => t.key === 'bill_international');
    assert.strictEqual(intl.seed.internationalOnly, true);
    const src = fs.readFileSync(path.join(ROOT, 'src/steps/BillPaymentSteps.js'), 'utf8');
    assert.ok(/serviceData\.internationalOnly \? countries\.filter\(\(c\) => c\.code !== 'MY'\)/.test(src));
  });

  await test('a voucher or game category opens straight on its products, with no brand page between', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/screens/IimmpactProductScreen.js'), 'utf8');
    assert.ok(!/>View products<|selectedBrand|brandGroups/.test(src), 'no brand step');
    assert.ok(/productList\]\.sort\([\s\S]{0,200}setSelectedProduct\(product\)/.test(src), 'products listed directly');
  });

  console.log('\nAmount lists kept in MySheba');

  const optMirror = require(path.join(ROOT, 'functions/iimmpactOptionsMirror.js'));

  await test('only lists that are the same for everyone are shared', () => {
    const product = { code: 'DIGI', fields: [
      { id: 'amount', type: 'select', role: 'pricing', data_source: { type: 'options', params: { product_code: { static: 'DIGI' }, field_id: { static: 'amount' } } } },
      { id: 'district', type: 'select', data_source: { depends_on: ['state'] } },
      { id: 'plan', type: 'select', data_source: { params: { account_number: { from_field: 'phone' } } } },
      { id: 'phone', type: 'text' },
    ] };
    assert.deepStrictEqual(Array.from(optMirror.shareableOptionFields(product)).map((f) => [f.productCode, f.fieldId]), [['DIGI', 'amount']]);
  });

  await test('a saved list reads back, an old one does not, and an oversized one is not saved', async () => {
    const db = fakeDb();
    const answer = { items: [{ code: 'D5', price: { amount: 5 } }] };
    assert.strictEqual(await optMirror.write(db, 'DIGI', 'amount', answer), true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await optMirror.read(db, 'DIGI', 'amount'))), answer);
    assert.strictEqual(await optMirror.read(db, 'DIGI', 'amount', { now: Date.now() + 7 * 3600 * 1000 }), null);
    assert.strictEqual(await optMirror.write(db, 'BIG', 'list', { items: [{ x: 'y'.repeat(300000) }] }), false);
  });

  await test('the app reads the same Firestore document the server writes', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/firebase/apiProviderService.js'), 'utf8');
    const body = src.match(/export function optionsMirrorId\(productCode, fieldId\) \{([\s\S]*?)\n\}/)[1];
    const appId = new Function('productCode', 'fieldId', body);
    for (const [code, field] of [['DIGI', 'amount'], ['A/B C', 'f/x'], [' sp ', 'plan id']]) {
      assert.strictEqual(appId(code, field), optMirror.docId(code, field), code);
    }
  });

  await test('the amounts function stays warm', () => {
    const src = fs.readFileSync(path.join(ROOT, 'functions/apiProviderService.js'), 'utf8');
    assert.ok(/exports\.getIimmpactOptions = onCall\(\{ enforceAppCheck: ENFORCE_APP_CHECK, minInstances: 1 \}/.test(src));
  });

  console.log('\nFailed orders say so');

  const txf = runEsm('src/utils/txFailure.js');

  await test('a failed order is labelled Failed, not Pending, and says it was refunded', () => {
    assert.strictEqual(txf.txStatusLabel('failed'), 'Failed');
    assert.strictEqual(txf.txStatusLabel('unknown'), 'Under review');
    assert.strictEqual(txf.txStatusLabel(undefined), 'Pending');
    const reason = txf.txFailureReason({ status: 'failed', apiRefunded: true, apiError: 'Provider HTTP 403: Forbidden' });
    assert.ok(/could not complete/.test(reason) && /refunded to your wallet/.test(reason), reason);
    assert.ok(!/403|Forbidden|HTTP/.test(reason), 'the provider\u2019s own wording is for staff');
  });

  await test('a reason the customer can act on is named', () => {
    assert.ok(/did not accept this number/.test(txf.txFailureReason({ status: 'failed', apiError: 'Invalid mobile number' })));
    assert.ok(/price or package changed/.test(txf.txFailureReason({ status: 'failed', apiError: 'This recharge price has changed.' })));
    assert.strictEqual(txf.txFailureReason({ status: 'completed' }), '');
    assert.ok(/refunded automatically/.test(txf.txFailureReason({ status: 'unknown' })));
  });

  await test('History draws every status from the shared badge table', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/screens/HistoryScreen.js'), 'utf8');
    assert.ok(!/getTxStatusStyle/.test(src), 'the three-status table is gone');
    assert.ok(/statusBadge\(shown\)/.test(src) && /txFailureReason\(item\)/.test(src));
  });

  await test('no purchase page shows what MySheba pays the provider, or its profit', () => {
    for (const file of ['src/screens/ConfirmTransactionScreen.js', 'src/screens/IimmpactProductScreen.js', 'src/screens/RechargePinScreen.js', 'src/steps/RechargeSteps.js']) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(!/['>]Provider cost(?! and commission are not included)/.test(src), file + ' shows provider cost');
      assert.ok(!/profit \/ loss/i.test(src), file + ' shows profit / loss');
    }
  });

  await test('a catalogue biller is looked up by its own product code', () => {
    const inputs = runEsm('src/utils/billPresentmentInputs.js');
    const req = inputs.presentmentRequest({ country: 'MY', provider: 'Air Selangor', accountNumber: '123456', category: 'iimmpact:water bills', productCode: 'WATER1' });
    assert.strictEqual(req.productCode, 'WATER1');
    assert.strictEqual(inputs.presentmentRequest({ country: 'MY', provider: 'TNB', accountNumber: '1' }).productCode, undefined, 'none sent when the biller has none');
    const src = fs.readFileSync(path.join(ROOT, 'functions/apiProviderService.js'), 'utf8');
    assert.ok(/const productCode = \(\/\^\[A-Za-z0-9_\.-\]\{1,100\}\$\/\.test\(sentCode\) \? sentCode : ''\) \|\| billerProductCodeFor\(provider, billerName\);/.test(src), 'the server prefers it, then the name list');
  });

  console.log('\nJomPAY biller lookup');

  const jp = require(path.join(ROOT, 'functions/jompayBillers.js'));

  await test('the biller directory is read whatever shape IIMMPACT wraps it in', () => {
    for (const json of [
      { data: [{ biller_code: '818625', biller_name: 'Syabas' }] },
      { data: { billers: [{ code: '818625', name: 'Syabas' }] } },
      { billers: [{ billerCode: ' 818625 ', billerName: 'Syabas' }] },
      [{ id: 818625, description: 'Syabas' }],
    ]) {
      assert.deepStrictEqual(jp.normalizeBillers(json), [{ code: '818625', name: 'Syabas' }], JSON.stringify(json));
    }
    assert.deepStrictEqual(jp.normalizeBillers({ data: [{ biller_code: 'abc', biller_name: 'X' }, { biller_code: '1234' }] }), [], 'junk and nameless entries dropped');
  });

  await test('a code finds its biller, and a name search finds codes', () => {
    const list = [{ code: '818625', name: 'Syabas' }, { code: '5454', name: 'Indah Water Konsortium' }, { code: '4200', name: 'Air Selangor' }];
    assert.strictEqual(jp.findBiller(list, '5454').name, 'Indah Water Konsortium');
    assert.strictEqual(jp.findBiller(list, '9999'), null);
    assert.deepStrictEqual(jp.searchBillers(list, 'water').map((b) => b.code), ['5454']);
    assert.deepStrictEqual(jp.searchBillers(list, 'air sel').map((b) => b.code), ['4200']);
  });

  await test('an unknown code blocks the JomPAY step; an unreachable directory never does', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/steps/BillPaymentSteps.js'), 'utf8');
    assert.ok(/if \(serviceData\.jompayBillerUnknown === true\) return 'No JomPAY biller has this code/.test(src));
    assert.ok(/if \(!answer\.available\) updateServiceData\(\{ jompayBillerName: '', jompayBillerUnknown: false \}\)/.test(src), 'no directory: no verdict');
  });

  await test('a JomPAY payment is sent as IIMMPACT\u2019s JomPAY product, never without one', () => {
    const api = require(path.join(ROOT, 'functions/apiProviderService.js'));
    assert.strictEqual(api._test_isJompayOrder({ category: 'jompay', provider: 'JomPAY' }), true);
    assert.strictEqual(api._test_isJompayOrder({ category: 'tax' }), true);
    assert.strictEqual(api._test_isJompayOrder({ category: 'iimmpact:water bills', provider: 'Air Selangor' }), false);
    const src = fs.readFileSync(path.join(ROOT, 'functions/apiProviderService.js'), 'utf8');
    assert.ok(/service === 'Bill Payment' && isJompayOrder\(raw\)\) \{[\s\S]{0,400}DEFAULT_BILLER_PRODUCT_CODES/.test(src), 'falls back to the JOMPAY default');
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

  await test('a PIN purchase is charged MySheba\u2019s markup; the provider gets its own denomination', async () => {
    sent.length = 0;
    db._store.set('settings/pricing', { rechargePointCostPerUnit: 1, markups: { services: { rechargePin: { percent: 10, fixed: 0 } } } });
    const before = db._store.get('users/u1').walletBalance;
    const result = await call({ amount: 10, productCode: 'YESPIN', subproductCode: 'YES10' });
    const after = db._store.get('users/u1').walletBalance;
    assert.strictEqual(Math.round((before - after) * 100) / 100, 11, 'RM 10 voucher with a 10% markup costs RM 11');
    assert.strictEqual(result.cost, 11);
    assert.strictEqual(sent[0].payload.raw.providerAmount, 10, 'IIMMPACT is still asked for the RM 10 voucher');
    db._store.set('settings/pricing', { rechargePointCostPerUnit: 1 });
  });

  await test('a price the catalogue no longer agrees with is refused before charging', async () => {
    sent.length = 0;
    await assert.rejects(() => call({ amount: 12, productCode: 'YESPIN', subproductCode: 'YES10' }), /price has changed/);
    assert.strictEqual(sent.length, 0, 'nothing may reach the provider');
  });

  await test('the dispatcher reads data.pin for an IIMMPACT PIN without a configured path', () => {
    const src = fs.readFileSync(path.join(ROOT, 'functions/apiProviderService.js'), 'utf8');
    assert.ok(/!provider\.responsePinPath && provider\.authType !== 'iimmpactHmac'/.test(src));
    assert.ok(/\[configured, result\.providerPin, result\.deliveryLink, result\.serialNumber\]/.test(src));
  });

  await test('a voucher filed by category (Shell) is a voucher, and its phone account is waived', () => {
    const screen = fs.readFileSync(path.join(ROOT, 'src/screens/IimmpactProductScreen.js'), 'utf8');
    assert.ok(/isPinServed\(product, treeCategoryIndex\(catalog\)/.test(screen), 'product screen uses the voucher list rule');
    const pinService = fs.readFileSync(path.join(ROOT, 'functions/rechargePinService.js'), 'utf8');
    assert.ok(/voucherOrder: true/.test(pinService), 'the voucher purchase marks its order');
    const src = fs.readFileSync(path.join(ROOT, 'functions/apiProviderService.js'), 'utf8');
    assert.ok(/raw\?\.voucherOrder === true/.test(src), 'the resolver treats a voucher order as a voucher');
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
    _store: store,
    collection,
    runTransaction: async (fn) => fn({
      get: async (r) => snap(r.path),
      update: (r, data) => { store.set(r.path, { ...(store.get(r.path) || {}), ...data }); },
      create: (r, data) => { if (store.has(r.path)) throw new Error('exists'); store.set(r.path, { ...data }); },
      set: (r, data) => { store.set(r.path, { ...data }); },
    }),
  };
}
