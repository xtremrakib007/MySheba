'use strict';

// Browsing and pricing a provider's package catalogue, for any provider.
//
// Some APIs sell a single amount - a recharge takes a number and a figure, and
// there is nothing to browse. Others sell a CATALOGUE: a list of products with
// their own ids, prices and validity, which has to be fetched, shown, marked up
// and then charged at exactly the price the provider expects. Success TopUp was
// the first of those, so the catalogue code was written around it: its
// hostname, its /api/drives path, its request keys, its response shape and its
// drive-hours window were all hardcoded in apiProviderService.
//
// Bus, train and flight providers sell catalogues too, in the same shape with
// different names. So the knowledge moves out of the code and into
// configuration: a provider that declares a catalogue gets one, and Success
// TopUp is now simply the first PRESET rather than the only implementation.
//
// Two prices, and conflating them loses money or breaks the order:
//
//   cost  what the provider charges us. It is the catalogue price and it is
//         what MUST be sent back in the order - send anything else and the
//         provider rejects it or bills us for a package the customer did not
//         buy.
//
//   sell  what the customer pays. Superadmin may override it per package.
//         With no override it equals cost, so the default is unchanged.
//
// The sell price is resolved HERE, on the server, from the live catalogue. It is
// never taken from the client.

const sellingWindow = require('./sellingWindow');
const providerSecretService = require('./providerSecretService');
const providerReach = require('./providerReach');

const PRICING_COLLECTION = 'internetPricing';
const PROVIDER_COLLECTION = 'api_providers';

const MAX_ITEMS = 500;

/**
 * Built-in catalogue shapes, so a known provider needs no hand configuration.
 *
 * A preset is only a set of defaults: anything the provider record sets
 * explicitly wins, so an operator can correct a preset without a code change.
 */
const PRESETS = {
  'success-topup': {
    baseUrl: 'https://api.successtopup.com',
    path: '/api/drives',
    method: 'POST',
    // {{apiKey}} and {{secretKey}} are filled from Secret Manager, never stored
    // in the template itself.
    requestTemplate: {
      operator: '{{operator}}',
      type: '{{type}}',
      successtopup_key: '{{apiKey}}',
      successtopup_secret: '{{secretKey}}',
    },
    successPath: 'result',
    successValue: true,
    listPath: 'drives',
    // Field names observed on a live /api/drives response, not inferred:
    //   title, price, driveId, operator, type, commission, duration, product_type
    //
    // driveId is the one that mattered. Without it every package failed the
    // `id && price > 0` filter and all 63 were dropped, which the screen
    // reported as the operator having no packages.
    //
    // product_type is listed before type deliberately: `type` here is the
    // catalogue being read (regular or drive), not what the package is, so
    // reading a category from it would label every row "regular".
    itemMap: {
      id: ['id', 'package_id', 'packageId', 'driveId', 'drive_id'],
      name: ['name', 'title', 'package_name'],
      data: ['data', 'data_amount', 'volume'],
      valid: ['valid', 'validity', 'duration'],
      category: ['category', 'pack_type', 'packType', 'product_type', 'type'],
      price: ['price', 'amount'],
    },
    // `regular` first so it wins a duplicate id.
    types: ['regular', 'drive'],
    window: {
      type: 'drive',
      openUtcHour: 4,   // 10:00 Asia/Dhaka
      closeUtcHour: 16, // 22:00 Asia/Dhaka
      label: '10:00 AM - 10:00 PM Bangladesh time (12:00 PM - 12:00 AM Malaysia time)',
      noun: 'Drive packages',
    },
    errorLabel: 'Success TopUp',
  },

  // iimmpact's mobile-data plans, which are PERSONALISED PER PHONE NUMBER.
  //
  // Every other catalogue in here is a price list: ask once for an operator and
  // everyone sees the same packages. This one is not. iimmpact resolves what a
  // specific number is eligible for, and two customers on the same operator get
  // different lists - so the number is part of the request, the answer is never
  // reusable between numbers, and nothing here may be cached against an
  // operator alone.
  //
  // It is also a GET with query parameters rather than a POST with a body,
  // which is why fetchCatalog grew a query template.
  // IIMMPACT Dynamic Catalog migration preset. The catalog itself is fetched
  // from /v2/catalog by the dedicated catalog callables. Product flows that
  // need selectable options use /v2/options, whose product/field identifiers
  // come from the catalog rather than the deprecated product-list/subproducts
  // endpoints.
  'iimmpact-catalog': {
    path: '/v2/options',
    method: 'GET',
    perAccount: true,
    fieldId: 'plan',
    queryTemplate: {
      product_code: '{{operator}}',
      field_id: '{{fieldId}}',
      account_number: '{{account}}',
      limit: '25000',
    },
    listPath: 'items',
    itemMap: {
      id: ['code', 'subproduct_code', 'subproductCode', 'id'],
      name: ['name', 'label', 'description', 'title', 'product_name'],
      data: ['data', 'volume', 'quota'],
      valid: ['validity', 'valid', 'duration', 'period'],
      category: ['category', 'type', 'product_group'],
      price: ['denomination', 'price', 'amount'],
    },
    types: ['regular'],
    operatorCodes: {
      Celcom: ['CEL'],
      CelcomDigi: ['CEL', 'DI'],
      Hotlink: ['HI'],
      'U Mobile': ['UMI'],
      Tunetalk: ['TI'],
      XOX: ['OXI'],
      Yes: ['YESI'],
    },
    errorLabel: 'iimmpact',
  },

  'iimmpact-options': {
    path: '/v2/options',
    method: 'GET',
    perAccount: true,
    fieldId: 'plan',
    queryTemplate: {
      product_code: '{{operator}}',
      field_id: '{{fieldId}}',
      account_number: '{{account}}',
      limit: '25000',
    },
    // Options API returns selectable package items in `items`.
    // It replaces the deprecated /v2/subproducts endpoint and uses the
    // catalog-defined field id (`plan` for personalised Internet plans).
    listPath: 'items',
    itemMap: {
      // The subproduct code is what goes back as extras.subproduct_code, and
      // iimmpact's own example shows it can be a whole sentence
      // ("Unlimited data with hotspot and calls 30-days (3Mbps) H") rather
      // than a short code. It is passed through verbatim.
      id: ['code', 'subproduct_code', 'subproductCode', 'id'],
      name: ['name', 'label', 'description', 'title', 'product_name'],
      data: ['data', 'volume', 'quota'],
      valid: ['validity', 'valid', 'duration', 'period'],
      category: ['category', 'type', 'product_group'],
      // denomination FIRST, and this is not a preference.
      //
      // It is the face value, and iimmpact's guide says to send the selected
      // option's denomination as `amount`. `cost` is a different number - what
      // we pay, 29.40 against a face value of 30 - and sending that as the
      // amount buys a different product or is rejected. The margin is taken
      // between this and the customer's sell price, not by quietly topping up
      // less than was asked for.
      price: ['denomination', 'price', 'amount'],
    },
    types: ['regular'],
    // Which iimmpact product code each operator's plans come from.
    //
    // CelcomDigi is deliberately TWO codes. Celcom and Digi merged under one
    // brand but iimmpact still sells CEL and DI separately, and our prefix
    // table answers "CelcomDigi" for 010/011/013/016/019 without knowing
    // which half a number is on. Guessing one would offer a Celcom customer
    // Digi's plans. Instead both are asked, and because the catalogue is
    // per-number the provider itself answers for only the one the number is
    // on. Each plan carries the code it came from, so the order is placed
    // against that product and not against a second guess.
    //
    // Unifi has no entry: iimmpact publishes no internet product for it, so
    // it keeps the built-in package list.
    operatorCodes: {
      Celcom: ['CEL'],
      CelcomDigi: ['CEL', 'DI'],
      Hotlink: ['HI'],
      'U Mobile': ['UMI'],
      Tunetalk: ['TI'],
      XOX: ['OXI'],
      Yes: ['YESI'],
    },
    errorLabel: 'iimmpact',
  },
};

/** The default item mapping, used when a provider names no keys of its own. */
const DEFAULT_ITEM_MAP = {
  id: ['id', 'package_id', 'packageId', 'code'],
  name: ['name', 'title', 'label'],
  data: ['data', 'volume', 'quantity'],
  valid: ['valid', 'validity', 'duration'],
  category: ['category', 'type'],
  price: ['price', 'amount', 'fare'],
};

function slug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Which preset, if any, a provider record falls under. */
function presetKeyFor(provider) {
  const explicit = slug(provider && provider.catalogPreset);
  if (explicit) return explicit;
  return slug(provider && provider.name);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * The catalogue configuration for a provider: its preset, overlaid with
 * anything the record states explicitly.
 *
 * Returns null when the provider sells no catalogue, which is the normal case
 * for a plain recharge or bill-payment API.
 */
function catalogConfigFor(provider) {
  if (!provider) return null;
  const preset = PRESETS[presetKeyFor(provider)] || null;

  let path = String(provider.catalogPath || (preset && preset.path) || '').trim();
  if (!path) return null;
  const legacyIimmpact =
    path === '/v2/subproducts' &&
    (
      provider.authType === 'iimmpactHmac' ||
      String(provider.name || '').trim().toLowerCase() === 'iimmpact' ||
      String(provider.catalogPreset || '').trim() === 'iimmpact-subproducts'
    );
  const dynamicIimmpact = path === '/v2/catalog' &&
    String(provider.catalogPreset || '').trim() === 'iimmpact-catalog';
  if (legacyIimmpact || dynamicIimmpact) path = '/v2/options';

  const baseUrl = String(provider.catalogBaseUrl || provider.baseUrl || (preset && preset.baseUrl) || '').trim();
  if (!baseUrl) return null;

  const types = Array.isArray(provider.catalogTypes) && provider.catalogTypes.length
    ? provider.catalogTypes.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 10)
    : (preset && preset.types) || ['regular'];

  const windowSpec = asObject(provider.catalogWindow) || (preset && preset.window) || null;

  return {
    baseUrl,
    path,
    method: String(provider.catalogMethod || (preset && preset.method) || 'POST').toUpperCase(),
    requestTemplate: asObject(provider.catalogRequestTemplate) || (preset && preset.requestTemplate) || {},
    queryTemplate: legacyIimmpact ? { product_code: '{{operator}}', field_id: '{{fieldId}}', account_number: '{{account}}', limit: '25000' } : (asObject(provider.catalogQueryTemplate) || (preset && preset.queryTemplate) || {}),
    // A per-account catalogue is personalised to one phone number: it may not
    // be fetched without one, and its answer is never reusable for another.
    perAccount: provider.catalogPerAccount !== undefined
      ? provider.catalogPerAccount === true
      : Boolean(preset && preset.perAccount),
    fieldId: String(provider.catalogFieldId || (preset && preset.fieldId) || (legacyIimmpact ? 'plan' : '')).trim(),
    operatorCodes:
      asObject(provider.catalogOperatorCodes) ||
      (legacyIimmpact ? PRESETS['iimmpact-options'].operatorCodes : (preset && preset.operatorCodes)) ||
      null,
    successPath: provider.catalogSuccessPath !== undefined
      ? String(provider.catalogSuccessPath || '')
      : (preset ? preset.successPath : ''),
    successValue: provider.catalogSuccessValue !== undefined
      ? provider.catalogSuccessValue
      : (preset ? preset.successValue : undefined),
    listPath: legacyIimmpact ? 'items' : String(provider.catalogListPath || (preset && preset.listPath) || '').trim(),
    itemMap: asObject(provider.catalogItemMap) || (preset && preset.itemMap) || DEFAULT_ITEM_MAP,
    types,
    window: windowSpec,
    errorLabel: String(provider.catalogErrorLabel || (preset && preset.errorLabel) || provider.name || 'The provider'),
  };
}

/**
 * Whether a provider's catalogue is personalised per phone number.
 *
 * It changes two things: the number has to be part of the request, and the
 * answer may never be reused for a different number.
 */
function isPerAccountCatalog(provider) {
  const config = catalogConfigFor(provider);
  return Boolean(config && config.perAccount);
}

/**
 * The provider's product codes for one operator, in the order to ask them.
 *
 * Returns [] for an operator the provider sells no plans for, which is a real
 * answer rather than a failure: that operator keeps whatever package list it
 * had before.
 *
 * THE SAME function decides what the picker shows and what the charge resolves
 * against. Two copies of this rule is how a customer comes to be shown a price
 * from one list and charged against another.
 */
function productCodesFor(provider, operatorName) {
  const config = catalogConfigFor(provider);
  if (!config || !config.operatorCodes) return [];
  const entry = config.operatorCodes[String(operatorName || '').trim()];
  if (!entry) return [];
  const codes = (Array.isArray(entry) ? entry : [entry])
    .map((c) => String(c || '').trim())
    .filter(Boolean);
  // Bounded: this is a loop of outbound HTTPS calls, one per code.
  return [...new Set(codes)].slice(0, 4);
}

/** Whether this provider sells a browsable catalogue at all. */
function supportsCatalog(provider) {
  return catalogConfigFor(provider) !== null;
}

/** The catalogue types this provider offers, e.g. ['regular','drive']. */
function catalogTypesFor(provider) {
  const config = catalogConfigFor(provider);
  return config ? config.types.slice() : [];
}

/**
 * The selling window guarding one catalogue type.
 *
 * A provider's window names the single type it restricts (Success TopUp
 * restricts `drive` and sells `regular` around the clock). Any other type is
 * always open.
 */
function windowFor(provider, type) {
  const config = catalogConfigFor(provider);
  if (!config || !config.window) return sellingWindow.ALWAYS_OPEN;
  const restricted = String(config.window.type || '').trim().toLowerCase();
  if (restricted && String(type || '').trim().toLowerCase() !== restricted) {
    return sellingWindow.ALWAYS_OPEN;
  }
  return sellingWindow.createWindow(config.window);
}

/** Read a value at a dotted path, e.g. "data.result". */
function valueAtPath(source, path) {
  if (!path) return undefined;
  let current = source;
  for (const key of String(path).split('.')) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

function firstOf(item, keys) {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function fillTemplate(template, values) {
  const out = {};
  for (const [key, raw] of Object.entries(template || {})) {
    if (typeof raw !== 'string') { out[key] = raw; continue; }
    out[key] = raw.replace(/\{\{(\w+)\}\}/g, (match, name) => (
      values[name] === undefined ? match : String(values[name])
    ));
  }
  return out;
}

/** Turn one provider item into the shape the rest of the app expects. */
/**
 * A price as the provider chose to write it.
 *
 * Number('1,198') and Number('BDT 198') are both NaN, and a NaN price fails
 * the `price > 0` filter below - so one thousand-separator drops the package
 * with no error anywhere. Providers are no more consistent about number
 * formatting than they are about true vs "true".
 */
function toAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normaliseItem(item, itemMap) {
  const map = itemMap || DEFAULT_ITEM_MAP;
  return {
    id: String(firstOf(item, map.id) ?? '').slice(0, 200),
    name: String(firstOf(item, map.name) ?? '').slice(0, 200),
    data: String(firstOf(item, map.data) ?? '').slice(0, 100),
    valid: String(firstOf(item, map.valid) ?? '').slice(0, 100),
    category: String(firstOf(item, map.category) ?? '').slice(0, 60),
    price: toAmount(firstOf(item, map.price)),
  };
}

/**
 * Read a catalogue response body into normalised items.
 *
 * Separated from the request so it can be tested without a network, which is
 * the half that actually goes wrong.
 */
function parseCatalogResponse(config, data) {
  const body = data && typeof data === 'object' ? data : {};
  if (config.successPath) {
    const flag = valueAtPath(body, config.successPath);
    const expected = config.successValue;
    // Providers are inconsistent about true vs "true" vs 1, so compare loosely
    // rather than rejecting a success as a failure.
    const ok = expected === undefined
      ? Boolean(flag)
      : String(flag).toLowerCase() === String(expected).toLowerCase();
    if (!ok) {
      const message = valueAtPath(body, 'message') || valueAtPath(body, 'error');
      throw new Error(String(message || `${config.errorLabel} rejected the catalogue request.`));
    }
  }
  const list = config.listPath ? valueAtPath(body, config.listPath) : body;
  const items = Array.isArray(list) ? list : [];
  const usable = items
    .slice(0, MAX_ITEMS)
    .map((item) => normaliseItem(item && typeof item === 'object' ? item : {}, config.itemMap))
    .filter((item) => item.id && item.price > 0);

  // A package with no id cannot be ordered and one with no price cannot be
  // charged, so dropping it is right. Dropping ALL of them silently is not:
  // the customer is told no packages are available for their operator, which
  // reads as the operator having none rather than as a mapping that no longer
  // fits the response. Naming the fields that did arrive is what makes it
  // fixable without guessing at the provider's field names.
  if (items.length && !usable.length) {
    const sample = items.find((i) => i && typeof i === 'object' && !Array.isArray(i)) || {};
    const fields = Object.keys(sample).slice(0, 12).join(', ');
    throw new Error(
      `${config.errorLabel} returned ${items.length} package(s), but none had both an id and a price. ` +
      `Fields received: ${fields || 'none'}.`);
  }
  return usable;
}

/**
 * Fetch and normalise a provider's catalogue.
 *
 * `request` performs the actual HTTPS call. It is injected rather than imported
 * so the SSRF protections (public-hostname assertion, DNS pinning) stay in the
 * one place that owns them, apiProviderService, and so this module can be
 * tested without a network.
 */
async function fetchCatalog(provider, { operator, type, account } = {}, { request } = {}) {
  const config = catalogConfigFor(provider);
  if (!config) throw new Error('This provider does not publish a package catalogue.');
  if (typeof request !== 'function') throw new Error('No HTTPS transport was provided.');

  const wantedType = String(type || config.types[0] || 'regular').trim().toLowerCase();
  const safeType = config.types.includes(wantedType) ? wantedType : config.types[0];

  // Refused rather than sent without one. A per-account catalogue asked with an
  // empty account_number does not fail - it answers with somebody's idea of a
  // default list, and that list would be priced and charged as if it were this
  // customer's.
  const accountNumber = String(account || '').trim();
  if (config.perAccount && !accountNumber) {
    throw new Error(`${config.errorLabel} prices these plans per phone number, so a number is required.`);
  }

  const url = new URL(config.path, config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);
  const values = {
    operator: String(operator || 'ALL'),
    type: safeType,
    account: accountNumber,
    fieldId: config.fieldId || 'plan',
    apiKey: provider.apiKey || '',
    secretKey: provider.secretKey || '',
  };

  for (const [key, value] of Object.entries(fillTemplate(config.queryTemplate, values))) {
    if (value === '' || value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  // A GET carries no body at all. Sending one anyway is not merely untidy for
  // a signed API: the signature covers the body, so an empty object "{}" and
  // no body hash to two different things and every request is rejected.
  const init = { method: config.method, headers: { accept: 'application/json' } };
  if (config.method !== 'GET') {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(fillTemplate(config.requestTemplate, values));
  }

  const data = await request(url, init, config, provider);

  // Each item remembers which product code answered for it. With CelcomDigi
  // asking both CEL and DI, "which product is this plan on" is not something
  // the operator name can answer later.
  return parseCatalogResponse(config, data).map((item) => ({ ...item, productCode: values.operator }));
}

function pickOverride(pricingDoc, packageId) {
  const apiPackages = (pricingDoc && pricingDoc.apiPackages) || {};
  const entry = apiPackages[packageId];
  return entry && typeof entry === 'object' ? entry : null;
}

/** The customer-facing price for one catalogue entry. */
function sellPriceFor(pkg, pricingDoc) {
  const override = pickOverride(pricingDoc, pkg.id);
  const overridden = override ? Number(override.price) : NaN;
  if (Number.isFinite(overridden) && overridden > 0) return Math.round(overridden * 100) / 100;
  return pkg.price;
}

/** Whether Superadmin has hidden this package from customers. */
function isHidden(pkg, pricingDoc) {
  const override = pickOverride(pricingDoc, pkg.id);
  return !!(override && override.hidden === true);
}

async function readPricingDoc(db, operatorName) {
  if (!operatorName) return {};
  const snap = await db.collection(PRICING_COLLECTION).doc(String(operatorName)).get();
  return snap.exists ? (snap.data() || {}) : {};
}

/**
 * The active provider for a service, optionally narrowed to one by name.
 *
 * Name narrowing is what kept this Success-TopUp-only; without a name it now
 * takes the highest-priority active provider for the service, which is the same
 * rule the charge path uses.
 */
async function readProvider(db, service, { name, country, strictCountry } = {}) {
  let query = db.collection(PROVIDER_COLLECTION)
    .where('service', '==', service)
    .where('active', '==', true);
  if (name) query = query.where('name', '==', name);
  const snap = await query.limit(name ? 1 : 20).get();
  if (snap.empty) return null;

  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const wanted = String(country || '').toUpperCase();
  // A provider serves a LIST of countries now, so "is this one of them" is a
  // shared question rather than a string compare repeated per call site.
  const matching = wanted ? docs.filter((p) => providerReach.isSpecificFor(p, wanted)) : [];
  // Without a country match this falls back to every provider, which was
  // harmless while the only catalogue was Bangladesh's: asking for BD found the
  // BD provider. Asking for MY finds it too, and would price a Malaysian order
  // against a Bangladeshi catalogue. strictCountry says "this country or a
  // provider that serves all of them, or nothing" - and the pricing path, which
  // is the one that would charge the wrong number, uses it.
  if (strictCountry) {
    const global = docs.filter((p) => providerReach.isGlobal(p));
    const strict = matching.length ? matching : global;
    if (!strict.length) return null;
    const chosen = strict.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];
    Object.assign(chosen, await providerSecretService.getCredentials(chosen));
    return chosen;
  }
  const pool = matching.length ? matching : docs;
  // Same ordering as the charge path: a catalogue must come from the provider
  // that will actually be billed.
  const provider = pool.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];
  if (!provider) return null;

  Object.assign(provider, await providerSecretService.getCredentials(provider));
  return provider;
}

/**
 * The per-number catalogue serving one country and operator, or null.
 *
 * This single answer decides BOTH whether the picker offers per-number plans
 * and whether the charge re-resolves the price on the server. Asking it twice
 * in two different ways is how a customer comes to be offered a list the
 * charge path has never heard of - or, worse, charged an amount the client
 * chose because the charge path decided there was no catalogue to check it
 * against.
 */
async function perAccountCatalogFor(db, service, country, operatorName) {
  const provider = await readProvider(db, service, { country, strictCountry: true });
  if (!provider || !isPerAccountCatalog(provider)) return null;
  const codes = productCodesFor(provider, operatorName);
  if (!codes.length) return null;
  return { provider, codes };
}

/**
 * Resolve one package by id, for an order about to be charged.
 *
 * Returns an `error` rather than throwing so the caller can refuse the order
 * with a reason rather than guessing a price.
 */
async function resolveOrderPackage({
  db, service, operatorName, operatorCode, packageId, fetchCatalog: fetchFn, providerName, country, account, strictCountry,
}) {
  const provider = await readProvider(db, service, { name: providerName, country, strictCountry });
  if (!provider || !provider.apiKey || !provider.secretKey) return { error: 'provider-unconfigured' };

  const config = catalogConfigFor(provider);
  if (!config) return { error: 'provider-has-no-catalog' };

  const pricingDoc = await readPricingDoc(db, operatorName);
  const closedTypes = [];

  // For a per-account catalogue the operator can map to more than one product
  // code, and which one a plan is on is NOT taken from the client: every code
  // for this operator is asked and the plan is priced under the one that
  // actually answers for it. A client naming a product its number is not on
  // then finds no plan, rather than being priced against it.
  const codes = isPerAccountCatalog(provider)
    ? productCodesFor(provider, operatorName)
    : [operatorCode || 'ALL'];
  if (!codes.length) return { error: 'operator-has-no-products' };

  for (const type of config.types) {
    const window = windowFor(provider, type);
    if (!window.isOpen()) { closedTypes.push({ type, window }); continue; }
    for (const code of codes) {
      let packages;
      try {
        packages = await fetchFn(provider, code, type, account);
      } catch (err) {
        // One product code failing is not the order failing when another may
        // still answer - a number simply is not on every code we ask. Only
        // having asked them all and found nothing is a refusal.
        if (codes.length === 1) return { error: 'catalog-unreachable', message: err && err.message };
        continue;
      }
      const match = packages.find((p) => String(p.id) === String(packageId));
      if (!match) continue;
      if (isHidden(match, pricingDoc)) return { error: 'package-hidden' };
      return {
        package: match,
        productCode: match.productCode || code,
        costAmount: match.price,
        sellAmount: sellPriceFor(match, pricingDoc),
      };
    }
  }

  // Not in any open catalogue. If a closed one holds it, say so - "not found"
  // would send someone looking for a package that is simply out of hours.
  for (const { type, window } of closedTypes) {
    try {
      const outOfHours = await fetchFn(provider, codes[0], type, account);
      if (outOfHours.some((p) => String(p.id) === String(packageId))) {
        return { error: 'window-closed', message: window.message() };
      }
    } catch { /* fall through to not-found */ }
  }

  return { error: 'package-not-found' };
}

module.exports = {
  PRESETS,
  DEFAULT_ITEM_MAP,
  PRICING_COLLECTION,
  PROVIDER_COLLECTION,
  presetKeyFor,
  catalogConfigFor,
  supportsCatalog,
  isPerAccountCatalog,
  productCodesFor,
  catalogTypesFor,
  windowFor,
  fetchCatalog,
  parseCatalogResponse,
  normaliseItem,
  fillTemplate,
  valueAtPath,
  sellPriceFor,
  isHidden,
  readPricingDoc,
  readProvider,
  perAccountCatalogFor,
  resolveOrderPackage,
  _test: { pickOverride, firstOf, slug },
};
