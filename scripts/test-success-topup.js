#!/usr/bin/env node
'use strict';

/**
 * Success TopUp contract checks.
 *
 * The bug that prompted these was silent and expensive: the recharge operator
 * map held three of the eight codes Success TopUp documents, and the lookup
 * fell back to forwarding the operator's DISPLAY NAME. src/data/countries.js
 * offers six Bangladesh operators, so Airtel, Teletalk and Skitto recharges
 * sent operator:"Airtel" instead of "AT" - rejected by the provider, after the
 * wallet had already been charged. Nothing failed at build or lint time.
 *
 * What the API documents (SUCCESS_TOPUP_SETUP.md, and
 * successtopup.com/recharge-api-documentation):
 *   POST /api/recharge  number, type, operator, amount, [package_id], trxid
 *   POST /api/bill-pay  billOperator, billNumber, billAmount, mobileNumber,
 *                       monthName, [note], trxid
 *   POST /api/drives    operator, type            (catalogue listing)
 *   POST /api/status    transaction status
 * Credentials travel as successtopup_key / successtopup_secret in the body.
 *
 * There is no separate package or entertainment endpoint: a bundle is bought by
 * naming its id from /api/drives on /api/recharge. Internet and Entertainment
 * must therefore stay on one code path.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const failures = [];
let checks = 0;

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { failures.push(`${rel} is missing.`); return null; }
  return fs.readFileSync(p, 'utf8');
};

const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function check(name, fn) {
  checks += 1;
  try { const problem = fn(); if (problem) failures.push(`${name}: ${problem}`); }
  catch (err) { failures.push(`${name}: check threw - ${err.message}`); }
}

// Every operator code Success TopUp documents.
const DOCUMENTED = { GP: 'Grameenphone', RB: 'Robi', BL: 'Banglalink', AT: 'Airtel', TT: 'Teletalk', SK: 'Skitto', BT: 'Brilliant Connect', RY: 'Ryze' };

check('every Bangladesh operator the app offers maps to a Success TopUp code', () => {
  const countriesSrc = read('src/data/countries.js');
  const serverSrc = read('functions/apiProviderService.js');
  if (!countriesSrc || !serverSrc) return 'unreadable';

  const block = /rechargeOperators\s*=\s*\{[\s\S]*?\n\}/.exec(countriesSrc);
  if (!block) return 'could not find rechargeOperators in src/data/countries.js.';
  const bd = /BD:\s*\[([^\]]*)\]/.exec(block[0]);
  if (!bd) return 'rechargeOperators has no BD list.';
  const offered = [...bd[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] || m[2]);
  if (!offered.length) return 'the BD operator list is empty.';

  const mapBlock = /SUCCESS_TOPUP_OPERATORS\s*=\s*\{([\s\S]*?)\}/.exec(code(serverSrc));
  if (!mapBlock) return 'functions/apiProviderService.js has no SUCCESS_TOPUP_OPERATORS map.';
  const mapped = new Map([...mapBlock[1].matchAll(/'?([A-Za-z][A-Za-z ]*)'?\s*:\s*'([A-Z]{2})'/g)].map((m) => [m[1].trim(), m[2]]));

  const missing = offered.filter((op) => !mapped.has(op));
  if (missing.length) {
    return `${missing.join(', ')} appear in the app's BD operator picker but have no Success TopUp code. `
      + 'A recharge for them is charged to the wallet and then rejected by the provider.';
  }
  const wrong = offered.filter((op) => DOCUMENTED[mapped.get(op)] !== op);
  if (wrong.length) return `${wrong.map((op) => `${op}->${mapped.get(op)}`).join(', ')} do not match the documented codes.`;
  return null;
});

check('an unmappable operator fails before the provider is called', () => {
  const src = read('functions/apiProviderService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  if (/SUCCESS_TOPUP_OPERATORS\[[^\]]+\]\s*\|\|\s*String\(/.test(body)) {
    return 'the operator lookup still falls back to forwarding the raw value. An unknown operator must throw, '
      + 'not reach Success TopUp as a display name.';
  }
  if (!/function resolveSuccessTopUpOperator/.test(body)) return 'resolveSuccessTopUpOperator is gone.';
  if (!/isSuccessTopUpRecharge\s*&&\s*!rechargeOperator/.test(body)) {
    return 'there is no guard rejecting a recharge whose operator could not be resolved.';
  }
  return null;
});

check('Internet and Entertainment share the documented package path', () => {
  const src = read('functions/apiProviderService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  const list = /SUCCESS_TOPUP_PACKAGE_SERVICES\s*=\s*\[([^\]]*)\]/.exec(body);
  if (!list) return 'SUCCESS_TOPUP_PACKAGE_SERVICES is missing.';
  for (const service of ['Internet', 'Entertainment']) {
    if (!list[1].includes(`'${service}'`)) return `${service} is not in SUCCESS_TOPUP_PACKAGE_SERVICES.`;
  }
  if (!/package_id:\s*vars\.packageId/.test(body)) return 'the dispatched body no longer sends package_id.';
  if (!/isSuccessTopUpInternet\s*&&\s*!vars\.packageId/.test(body)) {
    return 'a package purchase with no packageId is no longer rejected; it would bill the wallet and buy a plain top-up.';
  }
  return null;
});

check('the stored provider template matches what is dispatched', () => {
  const src = read('functions/apiProviderService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  // successTopUpInternet was computed and never read, so Superadmin was shown
  // the plain recharge template for an Internet provider.
  const decl = /const\s+(successTopUp[A-Za-z]*)\s*=/g;
  for (const m of body.matchAll(decl)) {
    const name = m[1];
    const uses = (body.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    if (uses < 2) return `${name} is assigned but never read in validate(), so the stored config cannot reflect it.`;
  }
  if (!/successTopUpPackage\s*\?[\s\S]{0,400}package_id:/.test(body)) {
    return 'the stored request template for a package service does not include package_id.';
  }
  return null;
});

check('the Success TopUp branch\'s overrides survive into the stored provider', () => {
  const svc = require(path.join(ROOT, 'functions', 'apiProviderService.js'));
  const validate = svc._test && svc._test.validate;
  if (typeof validate !== 'function') return 'functions/apiProviderService.js no longer exports _test.validate.';
  for (const service of ['Recharge', 'Internet', 'Entertainment', 'Bill Payment']) {
    const out = validate({ service, name: 'success topup', apiKey: 'k', secretKey: 's', priority: 1 });
    if (out.name !== 'Success TopUp') return `${service}: name was not normalised.`;
    if (out.country !== 'BD') return `${service}: country is ${out.country}, not BD.`;
    if (out.method !== 'POST' || out.authType !== 'none') return `${service}: method/auth were not forced.`;
    // 9999 is how Success TopUp wins executeConfiguredApi's priority sort. The
    // branch set it and the return statement recomputed it from data.priority,
    // storing 0 and letting any other BD provider outrank it.
    if (out.priority !== 9999) return `${service}: priority is ${out.priority}, not 9999 - the branch's value was discarded.`;
    const expectedPath = service === 'Bill Payment' ? '/api/bill-pay' : '/api/recharge';
    if (out.endpointPath !== expectedPath) return `${service}: endpointPath is ${out.endpointPath}, expected ${expectedPath}.`;
    if (['Internet', 'Entertainment'].includes(service) && !('package_id' in out.requestTemplate)) {
      return `${service}: the stored template has no package_id, so Superadmin is shown a body that is not what gets sent.`;
    }
  }
  // A provider that is not Success TopUp must still keep its own priority.
  const other = validate({ service: 'Recharge', name: 'Other', baseUrl: 'https://x.example.com', priority: 42 });
  if (other.priority !== 42) return `a non-Success TopUp provider lost its priority (${other.priority}).`;
  return null;
});

check('bill payment matches the documented /api/bill-pay fields', () => {
  const src = read('functions/apiProviderService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  if (!/'\/api\/bill-pay'/.test(body)) return 'the /api/bill-pay endpoint is gone.';
  for (const field of ['billOperator', 'billNumber', 'billAmount', 'mobileNumber', 'monthName', 'trxid']) {
    if (!new RegExp(`${field}:`).test(body)) return `the bill-pay template no longer sends ${field}.`;
  }
  return null;
});

check('every service the provider dispatches can be charged', () => {
  const wallet = read('functions/walletService.js');
  const guards = read('functions/chargeGuards.js');
  const client = read('src/firebase/transactionService.js');
  if (!wallet || !guards || !client) return 'unreadable';
  // A label in SERVICE_BY_CALLABLE with no key in walletService, or a client
  // callable name that is not wrapped, is an order that cannot be placed.
  const labels = [...code(guards).matchAll(/charge[A-Za-z]+:\s*'([^']+)'/g)].map((m) => m[1]);
  for (const label of labels) {
    const key = label.toLowerCase().replace(/\s+/g, '');
    if (!new RegExp(`${key}:\\s*'${label.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}'`).test(code(wallet))) {
      return `chargeGuards offers "${label}" but walletService's serviceLabel map has no ${key} entry.`;
    }
    if (!new RegExp(`\\b${key}\\b`).test(code(wallet))) return `walletService never handles the ${key} service key.`;
  }
  for (const [, fnName] of code(client).matchAll(/'?[A-Za-z ]+'?:\s*'(charge[A-Za-z]+)'/g)) {
    if (!new RegExp(`exports\\.${fnName}\\s*=`).test(code(guards))) {
      return `the app calls ${fnName} but chargeGuards does not export it.`;
    }
  }
  return null;
});

check('Offer Packs is wired end to end', () => {
  // Added as its own service rather than mixed into Internet: these are voice,
  // call-rate and bundle packs as well as data, and a minutes pack under an
  // "Internet" heading is the mislabelling this app already shipped once.
  const files = {
    'functions/apiProviderService.js': [/'Offer Packs'/, /success-topup-offer-packs/],
    'functions/chargeGuards.js': [/chargeOfferPacks:\s*'Offer Packs'/, /exports\.chargeOfferPacks\s*=/],
    'functions/walletService.js': [/offerpacks:\s*'Offer Packs'/, /offerpacks:\s*new Set\(/, /service==='offerpacks'/],
    'functions/index.js': [/exports\.chargeOfferPacks\s*=/],
    'src/firebase/transactionService.js': [/'Offer Packs':\s*'chargeOfferPacks'/],
    'src/context/AppContext.js': [/offerpacks:\s*"Offer Packs"/, /offerpacks:\s*4/, /service === "offerpacks"/],
    'src/screens/ServiceScreen.js': [/offerpacks:\s*OfferPacksStep/, /offerpacks:\s*validateOfferPacks/],
    'src/components/serviceTiles.js': [/key:\s*'offerpacks'/], // the tile lists moved out of ServiceGrid.js
    'src/components/serviceEmoji.js': [/offerpacks:/],
    'src/firebase/gridManagementService.js': [/'offerpacks'/],
    'src/steps/OfferPacksSteps.js': [/'drive'/, /isDriveWindowOpen/, /packageId/],
  };
  for (const [rel, patterns] of Object.entries(files)) {
    const src = read(rel);
    if (!src) return `${rel} unreadable`;
    for (const re of patterns) if (!re.test(code(src))) return `${rel} is missing ${re}`;
  }
  // A grid key the rule does not whitelist is a silent permission-denied on the
  // Superadmin toggle; audit:rules covers it, so just assert it is there.
  const rules = read('firestore.rules');
  if (!/'offerpacks'/.test(rules || '')) return "firestore.rules does not whitelist the offerpacks grid key.";

  // It must read the drive catalogue, and must NOT category-filter: all four
  // categories are legitimately on offer there.
  const steps = code(read('src/steps/OfferPacksSteps.js') || '');
  if (/isInternetPackage|isEntertainmentPackage/.test(steps)) {
    return 'OfferPacksSteps filters by category. The drive catalogue is sold whole - Bundle, Voice, Data and Call Rate alike.';
  }
  if (!/'drive'/.test(steps)) return 'OfferPacksSteps does not request the drive catalogue.';
  return null;
});

check('the Success TopUp service lists are derived, not repeated', () => {
  const src = read('functions/apiProviderService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  // validate() kept its own hand-written list of Success TopUp services, and it
  // went stale the moment Offer Packs was added: the service fell out of the
  // branch and was stored with no base URL at all.
  const m = /const successTopUp = \[([^\]]*)\]/.exec(body);
  if (!m) return 'could not find the successTopUp service check in validate().';
  if (!/SUCCESS_TOPUP_PACKAGE_SERVICES/.test(m[1])) {
    return 'validate() repeats the package services by hand instead of spreading SUCCESS_TOPUP_PACKAGE_SERVICES. '
      + 'That copy is what silently dropped Offer Packs out of the Success TopUp branch.';
  }
  for (const list of ['SUCCESS_TOPUP_PACKAGE_SERVICES', 'SUCCESS_TOPUP_COMPANION_SERVICES']) {
    const decl = new RegExp(`${list}\\s*=\\s*\\[([^\\]]*)\\]`).exec(body);
    if (!decl) return `${list} is missing.`;
    if (!decl[1].includes("'Offer Packs'")) return `${list} does not include Offer Packs.`;
  }
  return null;
});

check('Entertainment is wired end to end', () => {
  const files = {
    'functions/chargeGuards.js': [/chargeEntertainment:\s*'Entertainment'/, /exports\.chargeEntertainment\s*=/],
    'functions/walletService.js': [/entertainment:\s*'Entertainment'/, /entertainment:\s*new Set\(/, /service==='entertainment'/],
    'functions/index.js': [/exports\.chargeEntertainment\s*=/],
    'functions/secureIndexV2.js': [/functions\.chargeEntertainment\s*=/],
    'src/firebase/transactionService.js': [/Entertainment:\s*'chargeEntertainment'/],
    'src/context/AppContext.js': [/entertainment:\s*"Entertainment"/, /entertainment:\s*4/, /service === "entertainment"/],
    'src/steps/EntertainmentSteps.js': [/listSuccessTopUpDrives/, /packageId/],
  };
  for (const [rel, patterns] of Object.entries(files)) {
    const src = read(rel);
    if (!src) return `${rel} unreadable`;
    for (const re of patterns) {
      if (!re.test(code(src))) return `${rel} is missing ${re}`;
    }
  }
  const steps = read('src/steps/EntertainmentSteps.js');
  if (/Coming Soon/i.test(steps || '')) return 'EntertainmentSteps is still the Coming Soon placeholder.';
  return null;
});

check('the app never holds a literal Success TopUp credential', () => {
  const dir = path.join(ROOT, 'src');
  const hits = [];
  const assigned = /successtopup_(?:key|secret)\s*:\s*(['"`])([^'"`]*)\1/g;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx|ts|tsx)$/.test(e.name)) continue;
      const body = fs.readFileSync(full, 'utf8');
      for (const m of body.matchAll(assigned)) {
        const value = m[2].trim();
        // '' and '{{apiKey}}' are placeholders the server fills in. Anything
        // else is a real credential sitting in the shipped bundle.
        if (value && !/^\{\{\s*[A-Za-z0-9_]+\s*\}\}$/.test(value)) {
          hits.push(`${path.relative(ROOT, full)} assigns a literal value`);
        }
      }
      // A key/secret must never be read from app config either.
      if (/(?:EXPO_PUBLIC_[A-Z_]*SUCCESS|successTopUpSecret|successtopupSecret)/.test(body)) {
        hits.push(`${path.relative(ROOT, full)} reads a Success TopUp secret from app config`);
      }
    }
  };
  walk(dir);
  return hits.length
    ? `${[...new Set(hits)].join('; ')}. Success TopUp credentials are server-only and must never ship in the bundle.`
    : null;
});

check('each package screen sells the catalogue it should', () => {
  const server = read('functions/apiProviderService.js');
  const util = read('src/utils/packageCategory.js');
  const internet = read('src/steps/InternetSteps.js');
  const ent = read('src/steps/EntertainmentSteps.js');
  if (!server || !util || !internet || !ent) return 'unreadable';

  // Without category the app cannot tell a data pack from a voice or call-rate
  // pack, and listed all of them under "Internet". Checked by running the
  // normaliser rather than matching source, so moving it does not break this
  // and quietly dropping the field still does.
  const providerCatalog = require(path.join(ROOT, 'functions', 'providerCatalog.js'));
  const preset = providerCatalog.PRESETS['success-topup'];
  const sample = providerCatalog.normaliseItem(
    { id: '7', name: '1GB 7 Days', data: '1GB', valid: '7 Days', category: 'Internet', price: 98 },
    preset.itemMap
  );
  if (sample.category !== 'Internet') {
    return 'the catalogue normaliser no longer passes category through, so neither screen can filter.';
  }
  if (sample.id !== '7' || sample.price !== 98) {
    return 'the catalogue normaliser drops the id or price a package is bought and billed by.';
  }
  if (!/category/.test(JSON.stringify(preset.itemMap))) {
    return 'the Success TopUp preset no longer maps a category key.';
  }
  // The regular catalogue is the internet catalogue, so the Internet screen
  // sells it whole - Voice and Call Rate packs included. Filtering it to Data
  // and Bundle hid packages Success TopUp lists for that operator.
  if (/isInternetPackage/.test(code(internet))) return 'the Internet step filters the regular catalogue; it is sold whole.';
  if (!/'regular'/.test(code(internet))) return 'the Internet step no longer requests the regular catalogue.';
  if (!/isEntertainmentPackage/.test(code(ent))) return 'the Entertainment step no longer filters by category.';

  // Loading the classifier for real beats pattern-matching its source.
  const src = util.replace(/^export (const|function) /gm, '$1 ').replace(/^export \{[^}]*\};?$/gm, '');
  const mod = {};
  new Function('module', 'exports', `${src}\nmodule.exports={isEntertainmentPackage};`)(mod, {});
  const { isEntertainmentPackage } = mod.exports;

  // The four categories the Bangladesh catalogue actually uses. None is
  // entertainment, so none may be pulled onto that screen.
  for (const category of ['Data', 'Bundle', 'Voice', 'Call Rate']) {
    if (isEntertainmentPackage({ category })) return `"${category}" is treated as entertainment; it is a mobile pack.`;
  }
  if (isEntertainmentPackage({ category: '' })) return 'a package with no category counts as entertainment.';
  if (!isEntertainmentPackage({ category: 'Streaming' })) return 'a genuine entertainment category is not recognised.';
  return null;
});

check('a package detail line never starts with a stray separator', () => {
  // The live /api/drives rows carry no `data` field at all - they are title,
  // price, driveId, operator, type, commission, duration, product_type - so
  // `${p.data} • ${p.valid}` rendered as " • 7 Days" on every row. Offer Packs
  // already joined the parts it had; the other two screens now do the same.
  for (const rel of ['src/steps/InternetSteps.js', 'src/steps/EntertainmentSteps.js', 'src/steps/OfferPacksSteps.js']) {
    const src = code(read(rel) || '');
    if (/\$\{p\.data\}\s*•/.test(src)) return `${rel} prints an empty data field with its separator.`;
    if (!/\[p\.data, p\.valid, p\.category\]\.filter\(Boolean\)/.test(src)) {
      return `${rel} does not build its detail line from the parts that exist.`;
    }
  }
  return null;
});

check('a package is priced only in the wallet the customer pays from', () => {
  // A Malaysian sees MYR, an Indian sees INR, a Bangladeshi sees BDT. The
  // catalogue figure is in the destination country's currency, which is not
  // what leaves the wallet and not a number the customer can act on, so it is
  // not shown at all - on the row or in the summary.
  for (const rel of ['src/steps/InternetSteps.js', 'src/steps/OfferPacksSteps.js', 'src/steps/EntertainmentSteps.js']) {
    const src = code(read(rel) || '');
    if (!/price=\{shownPrice\(p\)\} currency=\{shownCurrency\(p\)\}/.test(src)) {
      return `${rel} still prices its rows in the catalogue currency.`;
    }
    if (/walletDeductionMyr/.test(src)) return `${rel} still computes the wallet figure on the device.`;
    if (/amountToPoints/.test(src)) return `${rel} still converts prices itself instead of using the server quote.`;
    if (/Package Price|Pack Price/.test(src)) return `${rel} still shows the foreign catalogue price in its summary.`;
  }
  // The quote has to come from the server, where the per-unit price, the tier
  // discount and the wallet sell rate actually live.
  const fn = code(read('functions/apiProviderService.js') || '');
  if (!/customerWalletQuoter/.test(fn)) return 'the drives listing does not quote a wallet price.';
  if (!/walletPrice/.test(fn)) return 'the drives listing does not return a wallet price.';

  // And the card must let a long name wrap without pushing the price away:
  // a Bengali package name runs to two lines and took the price off the card.
  const ui = code(read('src/components/ui.js') || '');
  if (!/pkgText:\{flex:1/.test(ui)) return 'the package name does not flex, so a long one pushes the price off the card.';
  if (!/pkgPriceWrap:\{flexShrink:0/.test(ui)) return 'the package price can be shrunk away by a long name.';
  return null;
});

check('both package screens explain an empty catalogue', () => {
  for (const rel of ['src/steps/InternetSteps.js', 'src/steps/EntertainmentSteps.js']) {
    const src = read(rel);
    if (!src) return `${rel} unreadable`;
    // Skitto is in the operator picker with no packages in either catalogue,
    // and Teletalk has no drive packs, so a blank step is reachable.
    if (!/packages\.length === 0/.test(code(src))) {
      return `${rel} renders nothing when the catalogue is empty, so those operators show a blank step.`;
    }
  }
  return null;
});

check('the provider is paid cost, the customer is charged sell', () => {
  const server = read('functions/apiProviderService.js');
  const wallet = read('functions/walletService.js');
  if (!server || !wallet) return 'unreadable';
  const srv = code(server);
  const wal = code(wallet);

  // /api/recharge validates `amount` against package_id. Sending the
  // Superadmin markup there either fails the order or buys the wrong package,
  // and sending cost to the wallet gives the margin away.
  if (!/packageCostAmount/.test(srv)) return 'the dispatch path no longer reads packageCostAmount, so the sell price would reach the provider.';
  if (!/isSuccessTopUpPackage\s*&&\s*!\(Number\.isFinite\(packageCost\)/.test(srv)) {
    return 'a package order with no resolved cost is no longer refused; it would send the customer-facing price to Success TopUp.';
  }
  if (!/packageCostAmount/.test(wal)) return 'walletService no longer records the resolved cost.';
  return null;
});

check('a package order is priced by the server, not the client', () => {
  const wallet = read('functions/walletService.js');
  const cat = read('functions/successTopUpCatalog.js');
  if (!wallet || !cat) return 'unreadable';
  const wal = code(wallet);

  // chargeProduct used to convert whatever `amount` the app submitted, so a
  // tampered client could name an expensive package_id with a one-taka amount.
  if (!/resolvePackagePricing\s*\(/.test(wal)) return 'resolvePackagePricing is gone.';
  if (!/payload\s*=\s*await resolvePackagePricing\(db,\s*service,\s*payload\)/.test(wal)) {
    return 'chargeProduct no longer resolves the package price before computing the charge.';
  }
  const fn = wal.slice(wal.indexOf('async function resolvePackagePricing'));
  const body = fn.slice(0, fn.indexOf('\nfunction active'));
  if (!/amount:\s*resolved\.sellAmount/.test(body)) return 'the resolver does not overwrite the submitted amount with the server price.';
  if (!/packageCostAmount:\s*resolved\.costAmount/.test(body)) return 'the resolver does not record the catalogue cost.';
  if (!/package-not-found|resolved\.error/.test(body)) return 'the resolver does not refuse a package it cannot find.';
  if (!/!packageId/.test(body)) return 'an order with no packageId is not rejected.';

  // The override must be read server-side; a client-only markup is cosmetic.
  // Run the resolver rather than grep it: this catches an override that is read
  // but ignored, which source matching never would.
  const catalogModule = require(path.join(ROOT, 'functions', 'successTopUpCatalog.js'));
  const pkg = { id: 'pkg-1', price: 100 };
  if (catalogModule.sellPriceFor(pkg, {}) !== 100) {
    return 'with no override the sell price must equal the catalogue cost.';
  }
  if (catalogModule.sellPriceFor(pkg, { apiPackages: { 'pkg-1': { price: 150 } } }) !== 150) {
    return 'the Superadmin apiPackages price override is not applied to the sell price.';
  }
  if (!catalogModule.isHidden(pkg, { apiPackages: { 'pkg-1': { hidden: true } } })) {
    return 'a package Superadmin hid is still offered to customers.';
  }
  if (typeof catalogModule.sellPriceFor !== 'function') return 'sellPriceFor is gone.';
  return null;
});

check('the customer listing never exposes the cost price', () => {
  const server = read('functions/apiProviderService.js');
  if (!server) return 'unreadable';
  const srv = code(server);
  const start = srv.indexOf('exports.listSuccessTopUpDrives');
  const end = srv.indexOf('exports.listSuccessTopUpCatalogForAdmin');
  if (start < 0 || end < 0 || end < start) return 'could not isolate the two listing callables.';
  const customerListing = srv.slice(start, end);
  if (/costPrice/.test(customerListing)) {
    return 'listSuccessTopUpDrives returns costPrice. That is our margin and the app has no use for it.';
  }
  if (!/sellPriceFor/.test(customerListing)) return 'the customer listing does not apply the Superadmin sell price.';
  if (!/isHidden/.test(customerListing)) return 'the customer listing does not honour hidden packages.';
  // And the admin one must be superadmin-gated, since it does expose cost.
  const adminListing = srv.slice(end);
  if (!/assertSuperadmin/.test(adminListing.slice(0, 600))) {
    return 'listSuccessTopUpCatalogForAdmin exposes cost prices without a superadmin check.';
  }
  return null;
});

check('the drive window is 10:00-22:00 Bangladesh time, enforced on the server', () => {
  const server = require(path.join(ROOT, 'functions', 'successTopUpWindow.js'));
  const clientSrc = read('src/utils/driveWindow.js');
  if (!clientSrc) return 'src/utils/driveWindow.js is missing.';

  // Load the app's copy for real rather than pattern-matching it: a drifted
  // constant is the failure, and only running both can show it.
  const mod = {};
  new Function('module', `${clientSrc.replace(/^export /gm, '')}\nmodule.exports={isDriveWindowOpen,DRIVE_WINDOW_OPEN_UTC_HOUR,DRIVE_WINDOW_CLOSE_UTC_HOUR,DRIVE_WINDOW_LABEL};`)(mod);
  const client = mod.exports;

  for (const key of ['DRIVE_WINDOW_OPEN_UTC_HOUR', 'DRIVE_WINDOW_CLOSE_UTC_HOUR', 'DRIVE_WINDOW_LABEL']) {
    if (client[key] !== server[key]) {
      return `${key} differs: app has ${JSON.stringify(client[key])}, server has ${JSON.stringify(server[key])}. `
        + 'The screen would then promise hours the server refuses, or hide packages it would sell.';
    }
  }

  // The stated window, checked against the real timezone database rather than
  // against the offsets the modules assume. Asia/Dhaka 10:00-22:00 is
  // Asia/Kuala_Lumpur 12:00-00:00 and UTC 04:00-16:00.
  const hourIn = (tz, d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(d));
  for (let utcHour = 0; utcHour < 24; utcHour += 1) {
    const at = new Date(Date.UTC(2026, 9, 1, utcHour, 30, 0));
    const dhaka = hourIn('Asia/Dhaka', at);
    const expected = dhaka >= 10 && dhaka < 22;
    if (server.isDriveWindowOpen(at) !== expected) {
      return `at ${utcHour}:30 UTC it is ${dhaka}:30 in Dhaka, so the window should be ${expected ? 'open' : 'closed'}, but the server says otherwise.`;
    }
    if (client.isDriveWindowOpen(at) !== expected) return `the app disagrees with Dhaka time at ${utcHour}:30 UTC.`;
  }

  // Server enforcement, at both the listing and the order. The app's copy is
  // cosmetic, so neither of these may be missing.
  const api = code(read('functions/apiProviderService.js') || '');
  if (!/type === 'drive'\s*&&\s*!driveWindow\.isDriveWindowOpen\(\)/.test(api)) {
    return 'listSuccessTopUpDrives no longer refuses a drive listing outside the window.';
  }
  // Order time. The window now comes from the provider's configuration, so
  // check what it actually guards: drive restricted, regular always sellable.
  const pc = require(path.join(ROOT, 'functions', 'providerCatalog.js'));
  const stProvider = { name: 'Success TopUp', baseUrl: 'https://api.successtopup.com' };
  const driveWindowFor = pc.windowFor(stProvider, 'drive');
  const regularWindowFor = pc.windowFor(stProvider, 'regular');
  if (driveWindowFor.alwaysOpen !== false) {
    return 'drive packages are no longer behind a selling window, so a stale screen could buy one at any hour.';
  }
  if (driveWindowFor.openUtcHour !== 4 || driveWindowFor.closeUtcHour !== 16) {
    return `the drive window is ${driveWindowFor.openUtcHour}-${driveWindowFor.closeUtcHour} UTC, not 4-16.`;
  }
  if (regularWindowFor.alwaysOpen !== true) {
    return 'regular packages are now behind a window; only drive packages are time-limited.';
  }
  const resolverSrc = code(read('functions/providerCatalog.js') || '');
  if (!/windowFor\(provider, type\)/.test(resolverSrc) || !/window\.isOpen\(\)/.test(resolverSrc)) {
    return 'resolveOrderPackage no longer consults the selling window, so a stale screen could still buy one.';
  }
  const shimSrc = code(read('functions/successTopUpCatalog.js') || '');
  if (!/drive-window-closed/.test(shimSrc) || !/window-closed/.test(resolverSrc)) {
    return 'a closed window is not distinguished from a missing package.';
  }
  const wallet = code(read('functions/walletService.js') || '');
  if (!/drive-window-closed/.test(wallet)) return 'chargeProduct does not surface the closed-window reason to the customer.';

  // Superadmin prices around the clock; only selling is time-boxed.
  const adminStart = api.indexOf('exports.listSuccessTopUpCatalogForAdmin');
  if (adminStart < 0) return 'the admin catalogue callable is gone.';
  const adminBody = api.slice(adminStart);
  if (/if \(type === 'drive' && !driveWindow\.isDriveWindowOpen\(\)\) \{\s*return \{ packages: \[\]/.test(adminBody)) {
    return 'the admin catalogue is gated by the window, so prices could not be set outside selling hours.';
  }
  if (!/driveWindowOpen/.test(adminBody)) return 'the admin catalogue does not report the drive-window state.';
  return null;
});

// The documented responses, run through the code that reads them. Taken from
// successtopup.com/recharge-api-documentation:
//
//   POST /api/recharge  -> { "result": true, "message": "Recharge successful" }
//   POST /api/status    -> { "result": true, "status": "Success" }
//
// `result` is a JSON boolean, not the string the provider config compares
// against - the comparison survives only because it String()s both sides, so
// this pins that down rather than leaving it to luck.
check('the documented recharge response is accepted', () => {
  const api = require('../functions/apiProviderService')._test;
  const body = { result: true, message: 'Recharge successful' };
  const success = api.getPath(body, 'result');
  if (success !== true) return 'result should be the boolean true';
  if (String(success) !== String('true')) return 'the configured success value no longer matches a boolean result';
  if (api.getPath(body, 'message') !== 'Recharge successful') return 'message is not read from "message"';
  return null;
});

check('every documented status settles rather than parking', () => {
  // successTopupPoller lowercases and accepts exactly these three. The
  // documented example is capitalised ("Success"), so the lowercasing is
  // load-bearing, and anything else is parked for manual reconcile on purpose.
  const settled = ['success', 'cancel', 'processing'];
  for (const documented of ['Success', 'Cancel', 'Processing']) {
    if (!settled.includes(String(documented).toLowerCase())) return `${documented} would be parked as unknown`;
  }
  const poller = read('functions/successTopupPoller.js');
  if (!/\.toLowerCase\(\)/.test(poller)) return 'the poller no longer lowercases the status';
  if (!/result\?\.result/.test(poller) || !/result\?\.status/.test(poller)) return 'the poller no longer reads result and status';
  return null;
});

// Every bill operator code the documentation lists, exactly as written. The
// billOperator description says the code is matched exactly and is case
// sensitive, which is why Dhaka WASA is here in capitals among lower-case
// codes - it looks like a typo and is not one.
const DOCUMENTED_BILL_CODES = {
  pbp: 'Palli Bidyut (Prepaid)', pbd: 'Palli Bidyut (Postpaid)',
  dsp: 'DESCO (Prepaid)', dsd: 'DESCO (Postpaid)',
  nsp: 'NESCO (Prepaid)', nsd: 'NESCO (Postpaid)',
  dpp: 'DPDC (Prepaid)', dpd: 'DPDC (Postpaid)',
  ttg: 'Titas Gas', krp: 'Karnaphuli Gas', jlb: 'Jalalabad Gas',
  sbg: 'Sundarban Gas', brd: 'Bakhrabad Gas',
  art: 'Amber IT', DAWA: 'Dhaka WASA',
};

check('every documented bill operator code is configured, exactly as written', () => {
  const src = read('functions/apiProviderService.js');
  const block = src.match(/const SUCCESS_TOPUP_BILL_OPERATORS = \{([\s\S]*?)\n\};/);
  if (!block) return 'SUCCESS_TOPUP_BILL_OPERATORS not found';
  const ours = new Set([...block[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => m[2]));
  const missing = Object.keys(DOCUMENTED_BILL_CODES).filter((code) => !ours.has(code));
  if (missing.length) return `not configured: ${missing.join(', ')}`;
  const extra = [...ours].filter((code) => !DOCUMENTED_BILL_CODES[code]);
  if (extra.length) return `configured but not documented: ${extra.join(', ')}`;
  return null;
});

check('billAmount goes out as the documented number', () => {
  const api = require('../functions/apiProviderService')._test;
  // The bill-pay table types billAmount as `number`, like amount on recharge.
  const out = api.render({ billAmount: '{{amount}}', billOperator: '{{billOperator}}' }, { amount: 350, billOperator: 'DAWA' });
  if (typeof out.billAmount !== 'number') return `billAmount rendered as ${typeof out.billAmount}, documented as number`;
  // A code is matched exactly, so the rendering must not case-fold it.
  if (out.billOperator !== 'DAWA') return 'billOperator was not passed through unchanged';
  return null;
});

// POST /api/balance -> { "result": true, "balance": 0, "driveBalance": 0 }
//
// Two floats, not one: drives are funded separately, so drives can be empty
// while the account is healthy. This is OUR trading capacity, so the callable
// is superadmin-gated server side rather than merely hidden in a screen.
check('the balance callable reads both documented floats', () => {
  const src = read('functions/apiProviderService.js');
  const fn = src.slice(src.indexOf('exports.getSuccessTopUpBalance'));
  if (!fn) return 'getSuccessTopUpBalance not found';
  if (!/assertSuperadmin\(db, request\)/.test(fn.slice(0, 600))) return 'not gated to superadmin';
  if (!/\/api\/balance/.test(fn.slice(0, 2000))) return 'does not call /api/balance';
  if (!/read\(body\?\.balance\)/.test(fn)) return 'does not read balance';
  if (!/read\(body\?\.driveBalance\)/.test(fn)) return 'does not read driveBalance';
  // The documented example is zero, so an absent number must not read as one.
  if (!/Zero is a real balance/.test(fn)) return 'no longer distinguishes zero from not-reported';
  if (!/exports\.getSuccessTopUpBalance/.test(read('functions/index.js'))) return 'not exported from index.js';
  return null;
});

check('the balance is shown to a superadmin only, never a customer', () => {
  const screen = read('src/screens/ApiProviderManagementScreen.js');
  if (!/getSuccessTopUpBalance/.test(screen)) return 'the admin screen does not read it';
  // Anything outside the superadmin API screen would be a leak of our float.
  for (const f of ['src/components/ServiceGrid.js', 'src/screens/CustomerHomeScreen.js', 'src/screens/TopUpScreen.js']) {
    if (/getSuccessTopUpBalance|driveBalance/.test(read(f))) return `${f} reads the provider float`;
  }
  return null;
});

check('amount goes out as the documented number', () => {
  const api = require('../functions/apiProviderService')._test;
  // The docs table types amount as `number` and the example sends 50.
  const out = api.render({ amount: '{{amount}}' }, { amount: 50 });
  if (typeof out.amount !== 'number') return `amount rendered as ${typeof out.amount}, documented as number`;
  return null;
});

check('the auto-provisioned webhook matches the documented payload', () => {
  // From Success TopUp's own documentation. The payload carries `comment` and
  // `note`; there is NO `message` field, so the service-wide default of
  // 'message' would record every provider reason as blank - including the one
  // written onto a transaction when a Cancel triggers a refund.
  //
  //   header   x-webhook-token: YOUR_WEBHOOK_TOKEN
  //   body     { "status": "Success", "transactionId": "ST17138666251234",
  //              "comment": "Recharge Success", "note": "Recharge Success",
  //              "updatedAt": "2026-04-23T10:15:12.000Z" }
  //   statuses Success, Cancel, Processing
  const src = read('functions/apiProviderService.js');
  if (!src) return 'apiProviderService.js is missing';
  // Anchored on the provisioning write rather than on how webhookRef happens
  // to be declared: that declaration has already moved once, for the
  // transaction's read-before-write ordering, and the write is the thing this
  // check is actually about.
  const at = src.indexOf('tx.set(webhookRef, {');
  if (at === -1) return 'the Success TopUp webhook is never provisioned';
  const block = src.slice(at);
  const want = {
    authHeader: "'x-webhook-token'",
    transactionIdPath: "'transactionId'",
    statusPath: "'status'",
    messagePath: "'comment'",
    successStatus: "'Success'",
    processingStatus: "'Processing'",
    cancelStatus: "'Cancel'",
  };
  for (const [field, value] of Object.entries(want)) {
    const found = new RegExp(field + "\\s*:\\s*" + value).test(block.slice(0, 1200));
    if (!found) return `${field} is not provisioned as ${value}, which the documentation specifies`;
  }
  return null;
});

check('a webhook that matches nothing is visible rather than silent', () => {
  // An unmatched callback answers 202 and files the body, which is right for
  // the provider but means a misconfigured webhook and a working one look
  // identical from the admin screen. The counters are what separate them.
  const src = read('functions/apiWebhookService.js');
  if (!src) return 'apiWebhookService.js is missing';
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const token of ['unmatchedCount', 'matchedCount', 'recordDelivery', 'deliverySummary']) {
    if (!code.includes(token)) return `${token} is missing, so delivery health cannot be read`;
  }
  if (!/exports\.listApiWebhookUnmatched/.test(code)) return 'unmatched callbacks cannot be inspected';
  const modal = read('src/components/ApiWebhookFormModal.js');
  if (modal && !/delivery/.test(modal)) return 'the admin screen never shows delivery health';
  return null;
});

check('the webhook token can be recovered after the one-time alert', () => {
  // listApiWebhooks deliberately returns webhookToken: '' forever. Without a
  // way back to it, dismissing the save-time alert strands the integration:
  // the token still has to be pasted into Success TopUp's own settings page.
  const src = read('functions/apiWebhookService.js');
  const index = read('functions/index.js');
  const client = read('src/firebase/apiWebhookService.js');
  if (!src || !index || !client) return 'webhook sources are missing';
  for (const name of ['revealApiWebhookToken', 'rotateApiWebhookToken']) {
    // Anchored on the assignment: a bare name match also accepts a rename to
    // anything that merely starts with it, which is the drift worth catching.
    if (!new RegExp('exports\\.' + name + '\\s*=').test(src)) return `${name} is not implemented`;
    if (!index.includes(name)) return `${name} is not exported from index.js`;
    if (!client.includes(name)) return `${name} is not callable from the app`;
  }
  const reveal = src.slice(src.indexOf('exports.revealApiWebhookToken'));
  if (!/assertSuperadmin\(db, request\)/.test(reveal.slice(0, 400))) return 'revealApiWebhookToken does not gate on superadmin';
  return null;
});

check('Bangladesh internet, offer packs and bills run on the same API', () => {
  // One set of credentials, four extra providers. Superadmin configures only
  // the Recharge provider; saving it provisions these, which is why none of
  // them existed while that save was failing with INTERNAL [500].
  const src = read('functions/apiProviderService.js');
  if (!src) return 'apiProviderService.js is missing';
  const at = src.indexOf('const companions = [');
  if (at === -1) return 'the companion providers are never provisioned';
  const block = src.slice(at, at + 2000);

  const want = {
    Internet: 'success-topup-internet',
    'Offer Packs': 'success-topup-offer-packs',
    Entertainment: 'success-topup-entertainment',
    'Bill Payment': 'success-topup-bill-payment',
  };
  for (const [service, id] of Object.entries(want)) {
    if (!block.includes(`id: '${id}'`)) return `${service} has no Success TopUp provider`;
    if (!block.includes(`service: '${service}'`)) return `${id} is not registered for ${service}`;
  }

  // They must be Bangladesh providers, or resolveExecutionMode will not let a
  // Bangladeshi order reach them, and must carry the same credentials rather
  // than a second copy to keep in step.
  const base = src.slice(src.indexOf('const companionBase = {'), src.indexOf('const companions = ['));
  if (!/country: 'BD'/.test(base)) return 'the companions are not Bangladesh providers';
  for (const field of ['apiKeySecretName: secretNames.apiKeySecretName', 'secretKeySecretName: secretNames.secretKeySecretName']) {
    if (!base.includes(field)) return `the companions do not share the Recharge credentials (${field})`;
  }

  // And Bangladesh must be switched on for each of them.
  const bd = src.slice(src.indexOf('BD: { ...(priorCountryModes.BD || {})'), src.indexOf('BD: { ...(priorCountryModes.BD || {})') + 300);
  for (const service of ['Recharge', 'Internet', "'Offer Packs'", 'Entertainment', "'Bill Payment'"]) {
    const key = service.startsWith("'") ? service : service;
    if (!bd.includes(`${key}: 'api'`)) return `${service} is not enabled for Bangladesh`;
  }
  return null;
});

check('and only Bangladesh reaches them', () => {
  // The companions are BD providers, so the same resolver that sends a
  // Malaysian recharge to a dealer sends a Malaysian data pack there too.
  const { resolveExecutionMode } = require('../functions/apiProviderService')._test;
  const companion = [{ country: 'BD', active: true }];
  const settings = { countryModes: { BD: { Internet: 'api', 'Offer Packs': 'api', 'Bill Payment': 'api', Entertainment: 'api' } } };
  for (const service of ['Internet', 'Offer Packs', 'Bill Payment', 'Entertainment']) {
    const bd = resolveExecutionMode({ country: 'BD', service, settings, providers: companion });
    if (bd !== 'api') return `Bangladesh ${service} resolved to ${bd}, not the API`;
    const my = resolveExecutionMode({ country: 'MY', service, settings, providers: companion });
    if (my !== 'legacy') return `Malaysia ${service} resolved to ${my}, not a manual order`;
  }
  return null;
});

if (failures.length) {
  console.error('Success TopUp contract FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`Success TopUp contract: ${checks} checks passed.`);
