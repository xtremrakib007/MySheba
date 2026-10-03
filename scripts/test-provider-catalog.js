#!/usr/bin/env node
'use strict';

/**
 * The generic package catalogue.
 *
 * Success TopUp used to be the only provider that could sell a browsable
 * catalogue, because its hostname, path, request keys, response shape and
 * selling hours were written into apiProviderService. Bus, train and flight
 * APIs sell catalogues in the same shape with different names, so that
 * knowledge moved into configuration and Success TopUp became the first preset.
 *
 * These checks hold the refactor to two promises:
 *   1. Success TopUp behaves exactly as before, through the preset.
 *   2. A provider that has never been heard of works from configuration alone.
 *
 * No network: the HTTPS transport is injected, so the request a provider would
 * receive and the response handling are both checked here rather than on a
 * phone.
 */
const path = require('path');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'test-provider-catalog';
const pc = require(path.join(__dirname, '..', 'functions', 'providerCatalog.js'));
const sellingWindow = require(path.join(__dirname, '..', 'functions', 'sellingWindow.js'));

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

// A transport that records what it was asked for and replies with canned JSON.
function transportReturning(body) {
  const calls = [];
  const request = async (url, init) => {
    calls.push({ url: url.toString(), method: init.method, body: JSON.parse(init.body || '{}') });
    return body;
  };
  return { request, calls };
}

async function main() {
  console.log('\nWhich providers sell a catalogue');

  const successTopUp = { name: 'Success TopUp', baseUrl: 'https://api.successtopup.com', apiKey: 'K', secretKey: 'S' };
  const plainRecharge = { name: 'Some Recharge API', baseUrl: 'https://api.example.com', apiKey: 'K' };

  check('Success TopUp is recognised by name', pc.presetKeyFor(successTopUp) === 'success-topup');
  check('it sells a catalogue', pc.supportsCatalog(successTopUp) === true);
  check('a plain recharge provider does not', pc.supportsCatalog(plainRecharge) === false);
  check('and asking for its types gives nothing', pc.catalogTypesFor(plainRecharge).length === 0);
  check(
    'an explicit catalogPreset wins over the name',
    pc.presetKeyFor({ name: 'Anything At All', catalogPreset: 'success-topup' }) === 'success-topup'
  );

  console.log('\nSuccess TopUp still behaves exactly as before');

  const stConfig = pc.catalogConfigFor(successTopUp);
  check('path is /api/drives', stConfig.path === '/api/drives', stConfig.path);
  check('types are regular then drive', JSON.stringify(stConfig.types) === '["regular","drive"]', JSON.stringify(stConfig.types));
  check('regular is first so it wins a duplicate id', stConfig.types[0] === 'regular');

  {
    const { request, calls } = transportReturning({
      result: true,
      drives: [
        { id: 7, name: '1GB 7 Days', data: '1GB', valid: '7 Days', category: 'Internet', price: 98 },
        { id: 8, name: 'Bad', price: 0 },
        { name: 'No id', price: 50 },
      ],
    });
    const items = await pc.fetchCatalog(successTopUp, { operator: 'GP', type: 'drive' }, { request });
    check('it posts to the documented URL', calls[0].url === 'https://api.successtopup.com/api/drives', calls[0].url);
    check('credentials travel in the body as the API documents',
      calls[0].body.successtopup_key === 'K' && calls[0].body.successtopup_secret === 'S');
    check('operator and type are passed through', calls[0].body.operator === 'GP' && calls[0].body.type === 'drive');
    check('one usable package survives', items.length === 1, JSON.stringify(items));
    check('with every field mapped',
      items[0].id === '7' && items[0].name === '1GB 7 Days' && items[0].data === '1GB' &&
      items[0].valid === '7 Days' && items[0].category === 'Internet' && items[0].price === 98,
      JSON.stringify(items[0]));
    check('a zero-price entry is dropped', !items.some((i) => i.price === 0));
    check('an entry with no id is dropped', !items.some((i) => !i.id));
  }

  console.log('\nA provider nobody has heard of, from configuration alone');

  const busProvider = {
    name: 'Shohoz Bus',
    baseUrl: 'https://api.shohoz.example',
    apiKey: 'BUSKEY',
    secretKey: 'BUSSECRET',
    catalogPath: '/v2/trips',
    catalogMethod: 'POST',
    catalogRequestTemplate: { route: '{{operator}}', coach: '{{type}}', token: '{{apiKey}}' },
    catalogSuccessPath: 'status.ok',
    catalogSuccessValue: 'yes',
    catalogListPath: 'data.trips',
    catalogItemMap: { id: 'trip_id', name: 'route_name', price: ['fare', 'amount'], valid: 'departs', category: 'coach_type' },
    catalogTypes: ['ac', 'nonac'],
  };

  check('it sells a catalogue with no preset at all', pc.supportsCatalog(busProvider) === true);
  check('its types are its own', JSON.stringify(pc.catalogTypesFor(busProvider)) === '["ac","nonac"]');

  {
    const { request, calls } = transportReturning({
      status: { ok: 'yes' },
      data: { trips: [
        { trip_id: 'T-1', route_name: 'Dhaka to Cox', fare: 1200, departs: '22:30', coach_type: 'AC' },
        { trip_id: 'T-2', route_name: 'Dhaka to Sylhet', amount: 900, departs: '09:00', coach_type: 'Non-AC' },
      ] },
    });
    const items = await pc.fetchCatalog(busProvider, { operator: 'DHK-CXB', type: 'ac' }, { request });
    check('the URL comes from its own base and path',
      calls[0].url === 'https://api.shohoz.example/v2/trips', calls[0].url);
    check('its own request keys are filled, not Success TopUp\'s',
      calls[0].body.route === 'DHK-CXB' && calls[0].body.coach === 'ac' && calls[0].body.token === 'BUSKEY',
      JSON.stringify(calls[0].body));
    check('no Success TopUp keys leak in', calls[0].body.successtopup_key === undefined);
    check('a nested list path is followed', items.length === 2, JSON.stringify(items));
    check('its own field names are mapped', items[0].id === 'T-1' && items[0].name === 'Dhaka to Cox' && items[0].price === 1200);
    check('a fallback key is used when the first is absent', items[1].price === 900, JSON.stringify(items[1]));
    {
      const t = transportReturning({ status: { ok: 'yes' }, data: { trips: [] } });
      await pc.fetchCatalog(busProvider, { operator: 'X', type: 'sleeper' }, { request: t.request });
      check('an unknown type falls back to the first it declares', t.calls[0].body.coach === 'ac',
        JSON.stringify(t.calls[0].body));
    }
  }

  console.log('\nRefusals are reported, not swallowed');

  check('a provider saying no throws its own message', (() => {
    try {
      pc.parseCatalogResponse(pc.catalogConfigFor(successTopUp), { result: false, message: 'Invalid credentials' });
      return false;
    } catch (e) { return /Invalid credentials/.test(e.message); }
  })());

  check('a true/"true" mismatch is still treated as success', (() => {
    const items = pc.parseCatalogResponse(pc.catalogConfigFor(successTopUp), {
      result: 'true', drives: [{ id: 1, price: 10 }],
    });
    return items.length === 1;
  })());

  check('a missing list is an empty catalogue, not a crash',
    pc.parseCatalogResponse(pc.catalogConfigFor(successTopUp), { result: true }).length === 0);

  console.log('\nSelling windows');

  const driveW = pc.windowFor(successTopUp, 'drive');
  const regularW = pc.windowFor(successTopUp, 'regular');
  check('drive is restricted', driveW.alwaysOpen === false);
  check('to 04:00-16:00 UTC (10:00-22:00 Dhaka)', driveW.openUtcHour === 4 && driveW.closeUtcHour === 16);
  check('regular is always sellable', regularW.alwaysOpen === true);
  check('a provider with no window is always open', pc.windowFor(busProvider, 'ac').alwaysOpen === true);

  {
    const w = sellingWindow.createWindow({ openUtcHour: 4, closeUtcHour: 16, label: 'L', noun: 'Drive packages' });
    check('closed at 03:30 UTC', w.isOpen(new Date(Date.UTC(2026, 0, 1, 3, 30))) === false);
    check('open at 04:00 UTC', w.isOpen(new Date(Date.UTC(2026, 0, 1, 4, 0))) === true);
    check('open at 15:59 UTC', w.isOpen(new Date(Date.UTC(2026, 0, 1, 15, 59))) === true);
    check('closed at 16:00 UTC', w.isOpen(new Date(Date.UTC(2026, 0, 1, 16, 0))) === false);
    check('its message names the hours', /Drive packages are available L/.test(w.message(new Date(Date.UTC(2026, 0, 1, 2, 0)))));
    check('and is empty while open', w.message(new Date(Date.UTC(2026, 0, 1, 5, 0))) === '');

    const opening = w.nextOpening(new Date(Date.UTC(2026, 0, 1, 20, 0)));
    check('after closing, it reopens tomorrow', opening.getUTCDate() === 2 && opening.getUTCHours() === 4,
      opening && opening.toISOString());
  }

  {
    // A booking window that runs through midnight is the obvious next shape, and
    // a naive hour >= open && hour < close would make it never open at all.
    const night = sellingWindow.createWindow({ openUtcHour: 22, closeUtcHour: 6, label: 'overnight', noun: 'Sleeper coaches' });
    check('a window across midnight is open at 23:00', night.isOpen(new Date(Date.UTC(2026, 0, 1, 23, 0))) === true);
    check('and at 05:00', night.isOpen(new Date(Date.UTC(2026, 0, 1, 5, 0))) === true);
    check('and closed at 12:00', night.isOpen(new Date(Date.UTC(2026, 0, 1, 12, 0))) === false);
  }

  check('equal hours mean always open, not never',
    sellingWindow.createWindow({ openUtcHour: 9, closeUtcHour: 9 }).isOpen() === true);
  check('a window with no hours is always open',
    sellingWindow.createWindow({ label: 'x' }).alwaysOpen === true);

  console.log('\nPricing');

  const pkg = { id: 'p1', price: 100 };
  check('no override sells at cost', pc.sellPriceFor(pkg, {}) === 100);
  check('an override is applied', pc.sellPriceFor(pkg, { apiPackages: { p1: { price: 150 } } }) === 150);
  check('a zero or negative override is ignored', pc.sellPriceFor(pkg, { apiPackages: { p1: { price: 0 } } }) === 100);
  check('a non-numeric override is ignored', pc.sellPriceFor(pkg, { apiPackages: { p1: { price: 'free' } } }) === 100);
  check('hidden is respected', pc.isHidden(pkg, { apiPackages: { p1: { hidden: true } } }) === true);
  check('and defaults to visible', pc.isHidden(pkg, {}) === false);

  console.log('\nExplicit configuration overrides a preset');
  {
    const corrected = { ...successTopUp, catalogPath: '/api/v2/drives', catalogListPath: 'packages' };
    const config = pc.catalogConfigFor(corrected);
    check('the path can be corrected without a code change', config.path === '/api/v2/drives');
    check('the list path too', config.listPath === 'packages');
    check('while the rest of the preset still applies', config.requestTemplate.successtopup_key === '{{apiKey}}');
  }

  console.log('\nCredentials');
  check('the template carries placeholders, never the secret',
    JSON.stringify(pc.PRESETS['success-topup'].requestTemplate).includes('{{secretKey}}'));
  check('and they are substituted only at request time',
    pc.fillTemplate({ k: '{{apiKey}}' }, { apiKey: 'REAL' }).k === 'REAL');
  check('an unknown placeholder is left alone rather than blanked',
    pc.fillTemplate({ k: '{{nope}}' }, {}).k === '{{nope}}');

  console.log('\nPrices and silent drops');
  // A package with no id or no price is correctly dropped - but dropping every
  // one without a word tells the customer their operator has no packages,
  // which is a different and wrong statement.
  const cfg = { listPath: 'drives', itemMap: pc.PRESETS['success-topup'].itemMap, errorLabel: 'Success TopUp' };

  check('a thousand separator is still a price, not a dropped package',
    pc.parseCatalogResponse(cfg, { drives: [{ id: '1', name: 'A', price: '1,198' }] })[0].price === 1198);
  check('and so is a price written with its currency',
    pc.parseCatalogResponse(cfg, { drives: [{ id: '2', name: 'B', price: 'BDT 198.50' }] })[0].price === 198.5);
  check('a real number is untouched',
    pc.parseCatalogResponse(cfg, { drives: [{ id: '3', name: 'C', price: 49 }] })[0].price === 49);

  let threw = '';
  try {
    pc.parseCatalogResponse(cfg, { drives: [{ sku: 'x', title: 'A', cost: 10 }, { sku: 'y', title: 'B', cost: 20 }] });
  } catch (e) { threw = e.message; }
  check('a catalogue that maps to nothing says so instead of looking empty',
    /returned 2 package/.test(threw));
  check('and names the fields that did arrive, so the mapping can be corrected',
    /sku/.test(threw) && /title/.test(threw) && /cost/.test(threw));

  // An genuinely empty catalogue is not an error: that operator may simply
  // have no packages today.
  check('an empty catalogue stays empty rather than throwing',
    pc.parseCatalogResponse(cfg, { drives: [] }).length === 0);
  check('and one unusable row among usable ones is still just dropped',
    pc.parseCatalogResponse(cfg, { drives: [{ id: '1', name: 'A', price: 10 }, { name: 'no id', price: 5 }] }).length === 1);

  console.log('');
  if (failed) {
    console.error(`${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('The package catalogue is generic, and Success TopUp is one preset of it.');

}

main().catch((err) => { console.error(err); process.exit(1); });
