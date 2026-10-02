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
    itemMap: {
      id: ['id', 'package_id', 'packageId'],
      name: ['name', 'title', 'package_name'],
      data: ['data', 'data_amount', 'volume'],
      valid: ['valid', 'validity', 'duration'],
      category: ['category', 'pack_type', 'packType', 'type'],
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

  const path = String(provider.catalogPath || (preset && preset.path) || '').trim();
  if (!path) return null;

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
    successPath: provider.catalogSuccessPath !== undefined
      ? String(provider.catalogSuccessPath || '')
      : (preset ? preset.successPath : ''),
    successValue: provider.catalogSuccessValue !== undefined
      ? provider.catalogSuccessValue
      : (preset ? preset.successValue : undefined),
    listPath: String(provider.catalogListPath || (preset && preset.listPath) || '').trim(),
    itemMap: asObject(provider.catalogItemMap) || (preset && preset.itemMap) || DEFAULT_ITEM_MAP,
    types,
    window: windowSpec,
    errorLabel: String(provider.catalogErrorLabel || (preset && preset.errorLabel) || provider.name || 'The provider'),
  };
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
function normaliseItem(item, itemMap) {
  const map = itemMap || DEFAULT_ITEM_MAP;
  return {
    id: String(firstOf(item, map.id) ?? '').slice(0, 200),
    name: String(firstOf(item, map.name) ?? '').slice(0, 200),
    data: String(firstOf(item, map.data) ?? '').slice(0, 100),
    valid: String(firstOf(item, map.valid) ?? '').slice(0, 100),
    category: String(firstOf(item, map.category) ?? '').slice(0, 60),
    price: Number(firstOf(item, map.price) ?? 0),
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
  return items
    .slice(0, MAX_ITEMS)
    .map((item) => normaliseItem(item && typeof item === 'object' ? item : {}, config.itemMap))
    .filter((item) => item.id && item.price > 0);
}

/**
 * Fetch and normalise a provider's catalogue.
 *
 * `request` performs the actual HTTPS call. It is injected rather than imported
 * so the SSRF protections (public-hostname assertion, DNS pinning) stay in the
 * one place that owns them, apiProviderService, and so this module can be
 * tested without a network.
 */
async function fetchCatalog(provider, { operator, type } = {}, { request } = {}) {
  const config = catalogConfigFor(provider);
  if (!config) throw new Error('This provider does not publish a package catalogue.');
  if (typeof request !== 'function') throw new Error('No HTTPS transport was provided.');

  const wantedType = String(type || config.types[0] || 'regular').trim().toLowerCase();
  const safeType = config.types.includes(wantedType) ? wantedType : config.types[0];

  const url = new URL(config.path, config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);
  const payload = fillTemplate(config.requestTemplate, {
    operator: String(operator || 'ALL'),
    type: safeType,
    apiKey: provider.apiKey || '',
    secretKey: provider.secretKey || '',
  });

  const data = await request(url, {
    method: config.method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  }, config);

  return parseCatalogResponse(config, data);
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
async function readProvider(db, service, { name, country } = {}) {
  let query = db.collection(PROVIDER_COLLECTION)
    .where('service', '==', service)
    .where('active', '==', true);
  if (name) query = query.where('name', '==', name);
  const snap = await query.limit(name ? 1 : 20).get();
  if (snap.empty) return null;

  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const wanted = String(country || '').toUpperCase();
  const matching = wanted ? docs.filter((p) => String(p.country || 'ALL').toUpperCase() === wanted) : [];
  const pool = matching.length ? matching : docs;
  // Same ordering as the charge path: a catalogue must come from the provider
  // that will actually be billed.
  const provider = pool.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];
  if (!provider) return null;

  Object.assign(provider, await providerSecretService.getCredentials(provider));
  return provider;
}

/**
 * Resolve one package by id, for an order about to be charged.
 *
 * Returns an `error` rather than throwing so the caller can refuse the order
 * with a reason rather than guessing a price.
 */
async function resolveOrderPackage({
  db, service, operatorName, operatorCode, packageId, fetchCatalog: fetchFn, providerName, country,
}) {
  const provider = await readProvider(db, service, { name: providerName, country });
  if (!provider || !provider.apiKey || !provider.secretKey) return { error: 'provider-unconfigured' };

  const config = catalogConfigFor(provider);
  if (!config) return { error: 'provider-has-no-catalog' };

  const pricingDoc = await readPricingDoc(db, operatorName);
  const closedTypes = [];

  for (const type of config.types) {
    const window = windowFor(provider, type);
    if (!window.isOpen()) { closedTypes.push({ type, window }); continue; }
    let packages;
    try {
      packages = await fetchFn(provider, operatorCode || 'ALL', type);
    } catch (err) {
      return { error: 'catalog-unreachable', message: err && err.message };
    }
    const match = packages.find((p) => String(p.id) === String(packageId));
    if (!match) continue;
    if (isHidden(match, pricingDoc)) return { error: 'package-hidden' };
    return {
      package: match,
      costAmount: match.price,
      sellAmount: sellPriceFor(match, pricingDoc),
    };
  }

  // Not in any open catalogue. If a closed one holds it, say so - "not found"
  // would send someone looking for a package that is simply out of hours.
  for (const { type, window } of closedTypes) {
    try {
      const outOfHours = await fetchFn(provider, operatorCode || 'ALL', type);
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
  resolveOrderPackage,
  _test: { pickOverride, firstOf, slug },
};
