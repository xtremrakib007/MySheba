#!/usr/bin/env node
'use strict';
/**
 * Opening a market and adding an operator, without a release.
 *
 * The country and operator lists were literals in data/countries.js. The risk
 * in making them editable is not the editing - it is the blast radius.
 *
 * `countries` has about thirty consumers, and most of them have nothing to do
 * with selling: the signup dial codes, KYC, ad targeting, the language list,
 * salary. "Stop selling to India" must never mean "nobody with a +91 number
 * can sign in". So the overrides reach the three SERVICE pickers and nothing
 * else, and the checks below hold that line.
 *
 * The second risk is an operator customers can pick that no API provider can
 * fulfil. That order fails after the wallet is charged, so the editing screen
 * has to say so first.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   ' + name); passed += 1; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.message)); failed += 1; }
}

// The rules, RUN rather than pattern-matched: a merge that reads right can
// still drop a market.
function load(rel, exportList, extraGlobals = {}) {
  const src = read(rel)
    .replace(/^import[\s\S]*?from\s+'[^']*';$/gm, '')
    .replace(/^export (const|function|async function) /gm, '$1 ');
  const box = {
    module: { exports: {} }, URL, console, Math, JSON, Object, String, Array,
    Number, Boolean, RegExp, Set, Map, isNaN, parseInt, parseFloat, ...extraGlobals,
  };
  vm.createContext(box);
  vm.runInContext(`${src}\nmodule.exports = { ${exportList.join(', ')} };`, box);
  return box.module.exports;
}
const cat = load('src/utils/catalogue.js',
  ['cleanCatalogue', 'cleanCountry', 'serviceCountries', 'operatorsForCountry', 'providerCoverage']);

const DEFAULT_COUNTRIES = [
  { code: 'MY', name: 'Malaysia', dial: '+60', curr: 'MYR' },
  { code: 'BD', name: 'Bangladesh', dial: '+880', curr: 'BDT' },
  { code: 'IN', name: 'India', dial: '+91', curr: 'INR' },
];
const DEFAULT_OPERATORS = { MY: ['Celcom', 'XOX', 'Hotlink'], BD: ['Grameenphone', 'Robi'] };
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));

console.log('\nNothing is ever deleted from what the app ships with');
test('an empty document means the shipped lists stand', () => {
  for (const doc of [null, {}, 'nonsense', []]) {
    const c = cat.cleanCatalogue(doc);
    assert.deepStrictEqual(plain(cat.serviceCountries(DEFAULT_COUNTRIES, c)).map((x) => x.code), ['MY', 'BD', 'IN']);
    assert.deepStrictEqual(plain(cat.operatorsForCountry(DEFAULT_OPERATORS, c, 'MY')), ['Celcom', 'XOX', 'Hotlink']);
  }
});
test('turning a market off and on again restores it exactly', () => {
  const off = cat.cleanCatalogue({ countries: { disabled: ['IN'] } });
  assert.deepStrictEqual(plain(cat.serviceCountries(DEFAULT_COUNTRIES, off)).map((x) => x.code), ['MY', 'BD']);
  const back = cat.cleanCatalogue({ countries: { disabled: [] } });
  assert.deepStrictEqual(plain(cat.serviceCountries(DEFAULT_COUNTRIES, back)), plain(DEFAULT_COUNTRIES));
});
test('the same for an operator', () => {
  const off = cat.cleanCatalogue({ operators: { disabled: { MY: ['XOX'] } } });
  assert.deepStrictEqual(plain(cat.operatorsForCountry(DEFAULT_OPERATORS, off, 'MY')), ['Celcom', 'Hotlink']);
  const back = cat.cleanCatalogue({ operators: { disabled: {} } });
  assert.deepStrictEqual(plain(cat.operatorsForCountry(DEFAULT_OPERATORS, back, 'MY')), ['Celcom', 'XOX', 'Hotlink']);
});
test('a disabled entry in one country does not touch another', () => {
  const c = cat.cleanCatalogue({ operators: { disabled: { MY: ['Celcom'] } } });
  assert.ok(cat.operatorsForCountry(DEFAULT_OPERATORS, c, 'BD').includes('Grameenphone'));
  assert.ok(!cat.operatorsForCountry(DEFAULT_OPERATORS, c, 'MY').includes('Celcom'));
});

console.log('\nAdded entries land after the shipped ones');
test('a market is added at the end, not sorted in', () => {
  // A new market must not reshuffle a grid people already know.
  const c = cat.cleanCatalogue({ countries: { added: [{ code: 'LK', name: 'Sri Lanka' }] } });
  assert.deepStrictEqual(plain(cat.serviceCountries(DEFAULT_COUNTRIES, c)).map((x) => x.code), ['MY', 'BD', 'IN', 'LK']);
});
test('an operator likewise', () => {
  const c = cat.cleanCatalogue({ operators: { added: { MY: ['New Telco'] } } });
  assert.deepStrictEqual(plain(cat.operatorsForCountry(DEFAULT_OPERATORS, c, 'MY')), ['Celcom', 'XOX', 'Hotlink', 'New Telco']);
});
test('adding something that already ships changes nothing', () => {
  const c = cat.cleanCatalogue({ countries: { added: [{ code: 'MY', name: 'Malaysia Again' }] }, operators: { added: { MY: ['Celcom'] } } });
  assert.deepStrictEqual(plain(cat.serviceCountries(DEFAULT_COUNTRIES, c)).map((x) => x.code), ['MY', 'BD', 'IN']);
  assert.deepStrictEqual(plain(cat.operatorsForCountry(DEFAULT_OPERATORS, c, 'MY')), ['Celcom', 'XOX', 'Hotlink']);
});
test('disabled beats added, so one switch turns a new entry off too', () => {
  const c = cat.cleanCatalogue({
    countries: { disabled: ['LK'], added: [{ code: 'LK', name: 'Sri Lanka' }] },
    operators: { disabled: { MY: ['New Telco'] }, added: { MY: ['New Telco'] } },
  });
  assert.ok(!cat.serviceCountries(DEFAULT_COUNTRIES, c).some((x) => x.code === 'LK'));
  assert.ok(!cat.operatorsForCountry(DEFAULT_OPERATORS, c, 'MY').includes('New Telco'));
});

console.log('\nThe stored document can only say what it is for');
test('a country needs a real two-letter code and a name', () => {
  for (const bad of [{ code: 'XYZ', name: 'x' }, { code: 'L', name: 'x' }, { code: '12', name: 'x' }, { code: 'LK' }, { code: 'LK', name: '   ' }, null, 'LK']) {
    assert.strictEqual(cat.cleanCountry(bad), null, JSON.stringify(bad) + ' was accepted');
  }
  const ok = cat.cleanCountry({ code: 'lk', name: ' Sri Lanka ', dial: '94', curr: 'lkr', flag: '\u{1F1F1}\u{1F1F0}' });
  assert.deepStrictEqual(plain(ok), { code: 'LK', name: 'Sri Lanka', flag: '\u{1F1F1}\u{1F1F0}', dial: '+94', curr: 'LKR' });
});
test('a dial code keeps exactly one plus', () => {
  assert.strictEqual(cat.cleanCountry({ code: 'LK', name: 'x', dial: '+94' }).dial, '+94');
  assert.strictEqual(cat.cleanCountry({ code: 'LK', name: 'x', dial: '94' }).dial, '+94');
  assert.strictEqual(cat.cleanCountry({ code: 'LK', name: 'x', dial: '' }).dial, '');
});
test('duplicates and junk are dropped, not stored', () => {
  const c = cat.cleanCatalogue({
    countries: { disabled: ['IN', 'IN', 'nope', ''], added: [{ code: 'LK', name: 'A' }, { code: 'LK', name: 'B' }, { code: 'ZZZ', name: 'C' }] },
    operators: { disabled: { MY: ['XOX', 'XOX'] }, added: { MY: ['A', 'A', '   '], '': ['B'] } },
  });
  assert.deepStrictEqual(plain(c.countries.disabled), ['IN']);
  assert.deepStrictEqual(plain(c.countries.added).map((x) => x.code), ['LK']);
  assert.deepStrictEqual(plain(c.operators.disabled.MY), ['XOX']);
  assert.deepStrictEqual(plain(c.operators.added.MY), ['A']);
  assert.ok(!('' in c.operators.added));
});
test('the document cannot grow without bound from a client write', () => {
  // Every signed-in app reads it on every launch.
  // VALID codes. 'A0'..'A399' all contain a digit, so cleanCountry rejected
  // every one of them and the cap was never reached - the fixture passed the
  // test while exercising nothing.
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const many = [];
  for (const a of letters) for (const b of letters) if (many.length < 400) many.push({ code: a + b, name: `x${a}${b}` });
  assert.strictEqual(many.length, 400);
  assert.ok(many.every((c) => cat.cleanCountry(c)), 'the fixture must be made of codes that are actually accepted');
  assert.ok(cat.cleanCatalogue({ countries: { added: many } }).countries.added.length <= 60);
  const names = Array.from({ length: 400 }, (_, i) => 'op' + i);
  assert.ok(cat.cleanCatalogue({ operators: { added: { MY: names } } }).operators.added.MY.length <= 60);
});
test('no packages branch is stored, because packages live elsewhere', () => {
  // Admin > Pricing has edited packages for a long time. A second place would
  // be two write paths to one idea.
  const c = cat.cleanCatalogue({ packages: { added: { Celcom: [{ name: 'x', price: 1 }] } } });
  assert.ok(!('packages' in c), 'the catalogue must not carry packages');
  assert.ok(!/packagesForOperator|cleanPackage/.test(read('src/utils/catalogue.js')),
    'a package rule in utils/catalogue.js would compete with getMergedPackages');
});

console.log('\nThe blast radius is the service pickers, and only those');
const PICKERS = ['src/steps/RechargeSteps.js', 'src/steps/InternetSteps.js', 'src/steps/OfferPacksSteps.js'];
test('each picker resolves its countries and operators through the catalogue', () => {
  for (const f of PICKERS) {
    const src = read(f);
    assert.ok(/serviceCountries\(countries, catalogue\)/.test(src), f + ' does not filter its country list');
    assert.ok(/operatorsForCountry\(rechargeOperators, catalogue, serviceData\.country\)/.test(src),
      f + ' does not filter its operator list');
    // And actually renders the filtered one - a computed list nothing maps
    // over is the bug this check exists for.
    assert.ok(/COUNTRY_LIST\.map/.test(src), f + ' computes a country list and renders another');
    assert.ok(!/\bcountries\.map\(/.test(src), f + ' still maps the raw shipped list');
  }
});
test('signing in, KYC, ad targeting and salary are NOT filtered', () => {
  // The whole point. These read the shipped list and must keep doing so: a
  // market closed for selling is not a reason anyone cannot sign in.
  for (const f of ['src/components/CountryModal.js', 'src/screens/RegisterScreen.js',
    'src/screens/VerifyIdentityScreen.js', 'src/constants/adTargeting.js',
    'src/data/salaryConstants.js', 'src/utils/phoneCountry.js']) {
    const src = read(f);
    assert.ok(!/serviceCountries|operatorsForCountry/.test(src),
      f + ' filters countries by the sales catalogue - closing a market would lock people out');
  }
});
test('an added operator can be priced, or adding one is a dead end', () => {
  // PRICING_OPERATORS was Object.keys(internetPackagesByOperator) - a module
  // constant - so an operator added here could never get packages.
  const admin = read('src/screens/AdminHomeScreen.js');
  assert.ok(/const pricingOperators = useMemo/.test(admin), 'the Pricing list must be computed, not a constant');
  assert.ok(/operatorsForCountry\(rechargeOperators, catalogue, code\)/.test(admin),
    'the Pricing list must include catalogue operators');
  assert.ok(/\{pricingOperators\.map\(/.test(admin), 'and must render that list');
  assert.ok(!/\{PRICING_OPERATORS\.map\(/.test(admin), 'the old constant is still what is rendered');
});
test('a disabled operator is not priced either', () => {
  const admin = read('src/screens/AdminHomeScreen.js');
  assert.ok(/off\.has\(name\)/.test(admin), 'Pricing still lists operators the catalogue has turned off');
});

console.log('\nAn operator no provider can serve is flagged before a customer finds it');
test('coverage counts only active providers that name the operator', () => {
  const providers = [
    { active: true, operatorProductCodes: { Celcom: 'C1' } },
    { active: true, operatorProductCodes: { celcom: 'C2' } },   // case differs, same operator
    { active: false, operatorProductCodes: { Celcom: 'C3' } },  // inactive
    { active: true, catalogOperatorCodes: { Celcom: ['L1'] } },  // listing only
  ];
  assert.deepStrictEqual(plain(cat.providerCoverage(providers, 'Celcom')), { fulfil: 2, catalogue: 1 });
  assert.deepStrictEqual(plain(cat.providerCoverage(providers, 'New Telco')), { fulfil: 0, catalogue: 0 });
});
test('a missing or malformed provider list does not throw', () => {
  for (const bad of [null, undefined, 'x', [null], [{}], [{ operatorProductCodes: 'x' }]]) {
    assert.deepStrictEqual(plain(cat.providerCoverage(bad, 'Celcom')), { fulfil: 0, catalogue: 0 });
  }
});
test('the screen warns, and only when it knows', () => {
  const screen = read('src/screens/CatalogueScreen.js');
  assert.ok(/No provider can fulfil this yet/.test(screen), 'the screen must warn about an unservable operator');
  assert.ok(/cover && cover\.fulfil === 0 && on/.test(screen),
    'the warning must depend on knowing the coverage, and on the operator being offered');
  // providers === null means the lookup failed. An unknown is not a no, and a
  // red warning on every row because a call failed would train people to
  // ignore it.
  assert.ok(/if \(providers === null\) return null;/.test(screen),
    'a failed provider lookup must say nothing rather than claim no coverage');
});

console.log('\nOnly a superadmin can change what the app sells');
test('the route guard and the screen both say so', () => {
  assert.ok(/catalogue: \['superadmin'\]/.test(read('src/context/AppContext.js')), 'the route guard must restrict it');
  assert.ok(/profile\?\.role === 'superadmin'/.test(read('src/screens/CatalogueScreen.js')), 'and the screen too');
});
test('and so do the rules', () => {
  const line = read('firestore.rules').split('\n').find((l) => l.includes('match /settings/catalogue'));
  assert.ok(line, 'settings/catalogue has no rule at all');
  assert.ok(/isSuperadmin\(\)/.test(line), 'anyone can write the catalogue');
  assert.ok(/hasOnly\(\['countries','operators','updatedAt'\]\)/.test(line), 'the document has no key allowlist');
  assert.ok(/allow read: if activeProfile\(\)/.test(line), 'the pickers cannot read it');
  assert.ok(/allow delete: if false/.test(line), 'the document can be deleted');
});

console.log(failed ? `\n${failed} check(s) failed.\n` : `\n${passed} checks passed.\n`);
process.exit(failed ? 1 : 0);
