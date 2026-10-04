'use strict';

// Which countries a provider serves.
//
// It used to be one. One API key often covers several, and saying so meant
// duplicating the whole record - credentials included - once per country.
//
// Two things make this worth testing hard. The first is that FIVE places
// decide reach - the execution mode, the charge path's choice between a
// specific provider and the global fallback, the catalogue lookup's two, and
// the admin screen's count - and they have to agree, because a screen saying
// "1 provider serves Malaysia" while a Malaysian order finds none is the kind
// of disagreement nobody notices until an order fails.
//
// The second is 'ALL'. It is not a country, it is every country, so a provider
// listing ALL and Malaysia would be both the specific provider for Malaysia
// and the global fallback at once - and "a specific provider beats a global
// one" has nothing to say about one that is both.

const assert = require('assert');
const reach = require('../functions/providerReach');
const api = require('../functions/apiProviderService');

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

console.log('\nReading a provider’s countries');

test('a list is what it says', () => {
  assert.deepStrictEqual(reach.providerCountries({ countries: ['MY', 'SG'] }), ['MY', 'SG']);
  assert.deepStrictEqual(reach.providerCountries({ countries: ['my', ' sg '] }), ['MY', 'SG'], 'case and spacing are not a different country');
  assert.deepStrictEqual(reach.providerCountries({ countries: ['MY', 'MY'] }), ['MY']);
});

test('a provider saved before lists existed still works', () => {
  // Every record in the database today has only `country`.
  assert.deepStrictEqual(reach.providerCountries({ country: 'BD' }), ['BD']);
  assert.deepStrictEqual(reach.providerCountries({ country: 'ALL' }), ['ALL']);
  assert.deepStrictEqual(reach.providerCountries({}), ['ALL'], 'and one with neither serves everywhere, as it always did');
  assert.deepStrictEqual(reach.providerCountries({ countries: [] , country: 'MY' }), ['MY'], 'an empty list is no list');
});

test('ALL swallows the rest, because it already includes them', () => {
  assert.deepStrictEqual(reach.providerCountries({ countries: ['ALL', 'MY'] }), ['ALL']);
  assert.deepStrictEqual(reach.providerCountries({ countries: ['MY', 'ALL'] }), ['ALL']);
});

console.log('\nSpecific beats global, and nothing is both');

test('a named country is specific; ALL is not', () => {
  assert.strictEqual(reach.isSpecificFor({ countries: ['MY', 'SG'] }, 'MY'), true);
  assert.strictEqual(reach.isSpecificFor({ countries: ['MY', 'SG'] }, 'SG'), true);
  assert.strictEqual(reach.isSpecificFor({ countries: ['MY', 'SG'] }, 'BD'), false);
  assert.strictEqual(reach.isSpecificFor({ countries: ['ALL'] }, 'MY'), false, 'the global fallback is nobody’s first choice');
  assert.strictEqual(reach.isSpecificFor({ countries: ['MY'] }, 'ALL'), false, 'ALL is not a country to be specific about');
  assert.strictEqual(reach.isSpecificFor({ countries: ['MY'] }, ''), false);
});

test('no provider is both specific and global', () => {
  // The one state that would break the preference rule, so the normaliser
  // cannot produce it however the list arrives.
  for (const countries of [['ALL', 'MY'], ['MY', 'ALL'], ['ALL', 'MY', 'SG']]) {
    const provider = { countries };
    assert.strictEqual(reach.isGlobal(provider) && reach.isSpecificFor(provider, 'MY'), false, JSON.stringify(countries));
  }
});

test('serving means by name OR by serving all of them', () => {
  assert.strictEqual(reach.servesCountry({ countries: ['MY', 'SG'] }, 'SG'), true);
  assert.strictEqual(reach.servesCountry({ countries: ['MY', 'SG'] }, 'BD'), false);
  assert.strictEqual(reach.servesCountry({ countries: ['ALL'] }, 'BD'), true);
  assert.strictEqual(reach.servesCountry({ country: 'BD' }, 'MY'), false);
});

console.log('\nSaving a list');

test('a submitted list is cleaned, not trusted', () => {
  const clean = (input) => reach.normaliseCountries(input, { allowed: ['ALL', 'MY', 'SG', 'BD'] });
  assert.deepStrictEqual(clean(['my', 'SG', 'my']), ['MY', 'SG']);
  assert.deepStrictEqual(clean('MY, SG'), ['MY', 'SG'], 'a comma-separated string is a list too');
  assert.deepStrictEqual(clean([]), ['ALL'], 'nothing chosen means everywhere, as an unset provider always has');
  assert.deepStrictEqual(clean(['ALL', 'MY']), ['ALL']);
});

test('a country the app does not serve is refused, not dropped', () => {
  // A code that silently vanished would leave a provider that quietly stops
  // taking orders from somewhere, which looks like the provider being down.
  assert.throws(
    () => reach.normaliseCountries(['MY', 'XX'], { allowed: ['ALL', 'MY'], onInvalid: (c) => { throw new Error(`bad ${c}`); } }),
    /bad XX/,
  );
});

test('the provider form saves the list and keeps country as its first entry', () => {
  const validate = api._test.validate;
  const base = { name: 'x', service: 'Recharge', baseUrl: 'https://api.example.com', endpointPath: '/v2/topup', method: 'POST', authType: 'none' };
  const saved = validate({ ...base, countries: ['MY', 'SG'] });
  assert.deepStrictEqual(saved.countries, ['MY', 'SG']);
  assert.strictEqual(saved.country, 'MY', 'every reader written before lists existed uses this');
  // A form that posts only the old field still saves.
  assert.deepStrictEqual(validate({ ...base, country: 'BD' }).countries, ['BD']);
  assert.deepStrictEqual(validate({ ...base }).countries, ['ALL']);
  assert.throws(() => validate({ ...base, countries: ['MY', 'XX'] }), /not a country this app serves/);
});

console.log('\nThe five places that decide reach agree');

// Every case that has ever mattered, run through each decision.
const CASES = [
  { provider: { countries: ['MY', 'SG'] }, country: 'MY', serves: true, specific: true },
  { provider: { countries: ['MY', 'SG'] }, country: 'SG', serves: true, specific: true },
  { provider: { countries: ['MY', 'SG'] }, country: 'BD', serves: false, specific: false },
  { provider: { countries: ['ALL'] }, country: 'MY', serves: true, specific: false },
  { provider: { country: 'BD' }, country: 'BD', serves: true, specific: true },
  { provider: { country: 'BD' }, country: 'MY', serves: false, specific: false },
  { provider: {}, country: 'MY', serves: true, specific: false },
];

test('the execution mode uses it', () => {
  const settings = { modes: { Recharge: 'api' } };
  for (const { provider, country, serves } of CASES) {
    const mode = api.resolveExecutionMode({ country, service: 'Recharge', settings, providers: [{ ...provider, active: true }] });
    assert.strictEqual(mode, serves ? 'api' : 'legacy', `${JSON.stringify(provider)} for ${country}`);
  }
});

test('the admin screen uses the same rules, not a second copy of them', () => {
  // The screen saying "1 provider serves Malaysia" while a Malaysian order
  // finds none is a disagreement nobody notices until an order fails.
  const client = requireEsm('src/utils/providerReach.js', 'servesCountry', 'isSpecificFor', 'providerCountries', 'toggleCountry');
  for (const { provider, country, serves, specific } of CASES) {
    assert.strictEqual(client.servesCountry(provider, country), serves, `serves ${JSON.stringify(provider)} ${country}`);
    assert.strictEqual(client.isSpecificFor(provider, country), specific, `specific ${JSON.stringify(provider)} ${country}`);
    assert.deepStrictEqual(client.providerCountries(provider), reach.providerCountries(provider));
  }
  assert.deepStrictEqual(client.providerCountries({ countries: ['ALL', 'MY'] }), ['ALL']);
});

test('the charge path prefers a provider that names the country', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  assert.ok(/countryProviders = allProviders\.filter\(\(p\) => providerReach\.isSpecificFor\(p, requestedCountry\)\)/.test(source));
  assert.ok(/globalProviders = allProviders\.filter\(\(p\) => providerReach\.isGlobal\(p\)\)/.test(source));
  assert.ok(!/String\(p\.country \|\| 'ALL'\)/.test(source), 'no call site may still compare the single field itself');
});

test('the catalogue lookup does too', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/providerCatalog.js'), 'utf8');
  assert.ok(/providerReach\.isSpecificFor\(p, wanted\)/.test(source));
  assert.ok(/providerReach\.isGlobal\(p\)/.test(source));
  assert.ok(!/String\(p\.country \|\| 'ALL'\)/.test(source));
});

console.log('\nPicking countries in the form');

test('choosing ALL clears the rest, and a country clears ALL', () => {
  const { toggleCountry } = requireEsm('src/utils/providerReach.js', 'toggleCountry');
  assert.deepStrictEqual(toggleCountry(['MY', 'SG'], 'ALL'), ['ALL']);
  assert.deepStrictEqual(toggleCountry(['ALL'], 'MY'), ['MY']);
  assert.deepStrictEqual(toggleCountry(['MY'], 'SG'), ['MY', 'SG']);
  assert.deepStrictEqual(toggleCountry(['MY', 'SG'], 'SG'), ['MY'], 'tapping a chosen one unpicks it');
});

test('the last country cannot be unpicked into nothing', () => {
  // An empty list is not a state a provider can be in; it falls back to ALL,
  // which is what an unset provider has always meant.
  const { toggleCountry } = requireEsm('src/utils/providerReach.js', 'toggleCountry');
  assert.deepStrictEqual(toggleCountry(['MY'], 'MY'), ['ALL']);
  assert.deepStrictEqual(toggleCountry(['ALL'], 'ALL'), ['ALL']);
});

test('the form keeps both fields in step', () => {
  const form = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/components/ApiProviderFormModal.js'), 'utf8');
  assert.ok(/const countries = toggleCountry\(providerCountries\(f\), code\);/.test(form));
  assert.ok(/return \{ \.\.\.f, countries, country: countries\[0\] \};/.test(form),
    'country must stay the first entry or an older reader sees a different provider');
  assert.ok(!/set\('country', x\.code\)/.test(form), 'the single-select handler must be gone');
});

test('the provider row lists every country it serves', () => {
  const screen = require('fs').readFileSync(require('path').join(__dirname, '..', 'src/screens/ApiProviderManagementScreen.js'), 'utf8');
  assert.ok(/providerCountries\(item\)\.map\(countryLabel\)\.join\(', '\)/.test(screen),
    'showing only the first would hide the rest of a provider’s reach');
});

console.log(`\n${passed} checks passed.\n`);
