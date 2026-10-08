const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const dns = require('dns').promises;
const https = require('https');
const crypto = require('crypto');
const providerSecretService = require('./providerSecretService');
const walletPricing = require('./walletPricing');
const progressionService = require('./progressionService');
const { getWalletCurrencyAndFx } = require('./walletCurrencyService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const catalog = require('./successTopUpCatalog');
const providerCatalog = require('./providerCatalog');
const driveWindow = require('./successTopUpWindow');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { signIimmpactRequest, decodeSecret: decodeIimmpactSecret } = require('./iimmpactSigning');
const { matchesStatus } = require('./statusMatch');
const { webhookEndpointUrl } = require('./webhookRequest');
const billPresentment = require('./billPresentment');
const networkStatus = require('./networkStatus');
const productCodes = require('./productCodes');
const providerReach = require('./providerReach');

const COLLECTION = 'api_providers';
const SETTINGS = 'api_settings/service_modes';
const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Offer Packs', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment', 'Recharge PIN'];
// `iimmpactHmac` is not a header, it is a signature over the request itself, so
// unlike the others it cannot be produced until the body exists. providerAuth
// returns nothing for it; the headers are added further down, next to the send.
const ALLOWED_AUTH = ['none', 'apiKey', 'bearer', 'basic', 'iimmpactHmac'];
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH'];
// Every country the app actually takes a recharge for, plus the places orders
// are placed FROM. NP, PK, MM and KH were missing: walletService prices a
// recharge for all eight of RECHARGE_RATE_KEYS, so an order from Nepal or
// Pakistan was perfectly chargeable while no provider could be scoped to it and
// no per-country mode could be set for it. A provider reaching 'ALL' served
// them anyway, which hid the gap - until somebody wanted one country on manual
// and its neighbour on API, and found there was no way to say so.
//
// scripts/test-api-countries.js keeps this in step with RECHARGE_RATE_KEYS and
// with the admin screen's own copy.
const ALLOWED_COUNTRIES = ['ALL', 'BD', 'MY', 'SG', 'ID', 'IN', 'PH', 'NP', 'PK', 'MM', 'KH', 'TH'];
// Services that are never dispatched to a provider, whatever the matrix says.
//
// Both move MONEY rather than buy a product. Mobile Banking pays out to a
// Bangladeshi wallet - bKash, Nagad, Rocket - and Remittance to seven
// countries' banks and cash counters; the customer pays MYR and somebody
// abroad receives their own currency. No top-up API does that. It is a
// licensed activity and the providers here sell airtime, data, vouchers and
// bills.
//
// It matters because Mobile Banking carries no country at all, so
// resolveExecutionMode's reach test ("this provider serves ALL countries")
// matched it, and a single matrix toggle would have sent a payout to Bangladesh
// at whatever provider happened to be configured. The toggle is gone, and this
// list is checked at every layer that could still route one: the mode, the
// stored settings, saving a provider, and the dispatch itself.
const NON_API_SERVICES = ['Mobile Banking', 'Remittance'];
/**
 * Does this provider sell vouchers at all?
 *
 * A PIN has to be read out of the provider's response by a configured path,
 * and there is no sane default for it. Both the requirement and the stored
 * value used to key on the PRIMARY service, which is Recharge for a provider
 * that sells airtime and vouchers from one account - so the path the form
 * sent was silently dropped on the way to the document.
 */
function servesRechargePin(service, services) {
  return service === 'Recharge PIN' || (Array.isArray(services) && services.includes('Recharge PIN'));
}
exports._test_servesRechargePin = servesRechargePin;

function isNonApiService(service) {
  return NON_API_SERVICES.includes(String(service || '').trim());
}
exports.NON_API_SERVICES = NON_API_SERVICES;
exports.isNonApiService = isNonApiService;

const DEFAULT_MODES = Object.fromEntries(ALLOWED_SERVICES.map((service) => [service, 'legacy']));
// 'ALL' is a provider's reach, not a place an order comes from, so it is not a
// row in the country matrix - the service-wide default already plays that part.
const COUNTRY_CODES = ALLOWED_COUNTRIES.filter((c) => c !== 'ALL');

/**
 * Which path a (country, service) order takes: the configured API, or the
 * manual dealer/reseller queue with its accept and reject buttons.
 *
 * Two rules, applied in order.
 *
 * 1. The superadmin's matrix states intent. countryModes[country][service]
 *    wins over the service-wide modes[service] default, so Bangladesh can run
 *    on the API while every other country keeps going to a human.
 *
 * 2. Intent cannot overrule reality. API mode only survives if an active
 *    provider actually serves that service for that country, or everywhere.
 *    Without this rule a country with no provider dispatches into nothing and
 *    the customer is told the outcome is uncertain on a wallet that has
 *    already been debited - which is exactly what a Malaysian recharge did
 *    while Recharge was switched to API globally for Bangladesh's sake.
 *
 * Returning 'legacy' is always safe: it creates the ordinary manual order.
 */
function resolveExecutionMode({ country, service, settings, providers }) {
  // Before anything else, and not reachable by configuration: a payout is not
  // a product purchase and no provider here can make one.
  if (isNonApiService(service)) return 'legacy';
  const code = String(country || '').trim().toUpperCase();
  const perCountry = settings?.countryModes?.[code]?.[service];
  const intent = (perCountry === 'api' || perCountry === 'legacy')
    ? perCountry
    : (settings?.modes?.[service] === 'api' ? 'api' : 'legacy');
  if (intent !== 'api') return 'legacy';
  const served = (providers || []).some((p) => p && p.active !== false && providerReach.servesCountry(p, code));
  return served ? 'api' : 'legacy';
}

/**
 * The country rows a newly saved provider switches to API mode on its own.
 *
 * Configuring a provider and having nothing route to it is the trap this
 * closes. Success TopUp's save has always enabled Bangladesh; a provider for
 * anywhere else left every country it serves sitting on the service-wide
 * default, which DEFAULT_MODES sets to 'legacy' for everything. So a provider
 * could be added, tested, and shown returning a balance, while every order for
 * the countries it serves still went to a dealer - and nothing on the screen
 * said why, because API Management opens scoped to BD and the toggles there are
 * Bangladesh's.
 *
 * Three limits, each deliberate:
 *
 * - An explicit setting is never overwritten. Somebody who turned a country
 *   off, during an incident or while testing, must not have live API traffic
 *   resumed under them because the provider was re-saved to change its base
 *   URL. Only a country with no setting of its own is filled in, and 'legacy'
 *   is never written here.
 * - A provider that serves everywhere changes nothing. 'ALL' is not a row in
 *   this matrix, and the alternative - flipping the service-wide default - is
 *   the thing that once routed Malaysian orders down a path with no provider
 *   behind them.
 * - An inactive provider changes nothing, because it is not taking orders.
 *
 * resolveExecutionMode still has the final say: this writes intent, and intent
 * that no active provider can serve still comes out as 'legacy' there.
 *
 * @returns {object|null} the whole countryModes map to write, or null when
 *   there is nothing to change.
 */
function autoCountryModes(provider, priorCountryModes) {
  if (!provider || provider.active === false) return null;
  const excluded = Array.isArray(provider.excludedCountries)
    ? provider.excludedCountries.map((c) => String(c || '').trim().toUpperCase())
    : [];
  if (providerReach.isGlobal(provider)) {
    // A global provider with an explicit exclusion list can safely opt every
    // other app country into API mode. A plain ALL provider still requires
    // explicit admin intent, so it changes nothing here.
    if (!excluded.length) return null;
    const countries = COUNTRY_CODES.filter((c) => !excluded.includes(c));
    if (!countries.length) return null;
    const services = (Array.isArray(provider.services) && provider.services.length ? provider.services : [provider.service])
      .filter((s) => s && ALLOWED_SERVICES.includes(s) && !isNonApiService(s));
    if (!services.length) return null;
    const next = { ...(priorCountryModes || {}) };
    let changed = false;
    for (const country of countries) {
      const row = { ...(next[country] || {}) };
      for (const service of services) {
        if (row[service] === 'api' || row[service] === 'legacy') continue;
        row[service] = 'api'; changed = true;
      }
      next[country] = row;
    }
    return changed ? next : null;
  }
  const countries = providerReach.providerCountries(provider).filter((c) => COUNTRY_CODES.includes(c));
  const services = (Array.isArray(provider.services) && provider.services.length
    ? provider.services
    : [provider.service]
  ).filter((s) => s && ALLOWED_SERVICES.includes(s) && !isNonApiService(s));
  if (!countries.length || !services.length) return null;

  const next = { ...(priorCountryModes || {}) };
  let changed = false;
  for (const country of countries) {
    const row = { ...(next[country] || {}) };
    for (const service of services) {
      if (row[service] === 'api' || row[service] === 'legacy') continue;
      row[service] = 'api';
      changed = true;
    }
    next[country] = row;
  }
  return changed ? next : null;
}
exports._test_autoCountryModes = autoCountryModes;

function assertSuperadmin(db, request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  return db.doc(`users/${request.auth.uid}`).get().then((snap) => {
    const profile = snap.exists ? snap.data() : null;
    if (!profile || profile.role !== 'superadmin') throw new HttpsError('permission-denied', 'Superadmin access required.');
    if (profile.suspended === true || profile.inactive === true || profile.disabled === true || profile.mergedInto) throw new HttpsError('permission-denied', 'Your account is not active.');
  });
}
function cleanString(v, max = 500) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
const BLOCKED_HOSTS = /^(localhost|.*\.local|.*\.internal)$/i;
function isIpLiteral(host) { if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; if (host.includes(':')) return true; return false; }
function isPrivateIp(ip) {
  let s = String(ip || '').trim().toLowerCase();
  // DNS may return IPv4-mapped IPv6 (for example ::ffff:127.0.0.1).
  // Normalize that form before applying the IPv4 private/reserved checks.
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) s = mapped[1];
  if (s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80:') || s.startsWith('ff') || s.startsWith('2001:db8:')) return true;
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a,b,c,d] = m.slice(1).map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && c === 0) || (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) || (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) || a >= 224;
}
async function resolvePublicAddress(hostname) {
  if (!hostname || isIpLiteral(hostname) || BLOCKED_HOSTS.test(hostname)) throw new Error('Provider URL host is not allowed.');
  let addresses;
  try { addresses = await dns.lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new Error('Provider hostname could not be resolved.'); }
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) throw new Error('Provider hostname resolves to a private or reserved address.');
  return addresses[0];
}
/**
 * The DNS answer for a pinned request, in whichever shape Node asked for.
 *
 * A custom lookup has two callback contracts and Node picks between them with
 * options.all: (err, address, family) when it is false, (err, [{address,
 * family}]) when it is true. Node has defaulted autoSelectFamily to true since
 * v20, so it passes all:true, and answering with the positional form made it
 * read addresses[0].address as undefined and throw
 *
 *   Invalid IP address: undefined
 *
 * before a single byte left the server. That broke every outbound provider
 * request - the recharge and bill-payment calls in executeConfiguredApi, the
 * catalogue fetch, and the Test API button - from the moment the functions
 * moved off Node 18. An ambiguous failure in the charge path is recorded as
 * `unknown`, which is why it surfaced to customers as "The API request outcome
 * is uncertain" rather than as anything naming DNS.
 */
function pinnedLookup(pinnedAddress) {
  return (_hostname, opts, callback) => {
    if (opts && opts.all) {
      return callback(null, [{ address: pinnedAddress.address, family: pinnedAddress.family }]);
    }
    return callback(null, pinnedAddress.address, pinnedAddress.family);
  };
}

// Node's https.request sends no User-Agent at all. A request without one is
// what a WAF or API gateway in front of a provider most often refuses outright,
// with a bare "Forbidden" and nothing else to go on. Identifying ourselves also
// gives a provider something to search their logs for when we ask them why a
// call was refused.
const USER_AGENT = 'MySheba/1.0';

function requestHttpsPinned(url, options, pinnedAddress) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method,
      // Ours first, so an explicit header from a caller still wins.
      headers: { 'user-agent': USER_AGENT, ...options.headers },
      signal: options.signal,
      // Pin the already-validated DNS result for this request. TLS still uses
      // the original hostname, so certificate/SNI validation is preserved.
      lookup: pinnedLookup(pinnedAddress),
    }, (response) => {
      let bytes = 0;
      const chunks = [];
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes <= 1000000) chunks.push(chunk);
        else response.destroy(new Error('Provider response is too large.'));
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        ok: (response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300,
        text: () => Promise.resolve(Buffer.concat(chunks).toString('utf8')),
      }));
      response.on('error', reject);
    });
    request.on('error', reject);
    if (options.body != null) request.write(options.body);
    request.end();
  });
}
async function assertPublicHostname(hostname) {
  if (!hostname || isIpLiteral(hostname) || BLOCKED_HOSTS.test(hostname)) throw new Error('Provider URL host is not allowed.');
  let addresses;
  try { addresses = await dns.lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new Error('Provider hostname could not be resolved.'); }
  if (!addresses.length || addresses.some(a => isPrivateIp(a.address))) throw new Error('Provider hostname resolves to a private or reserved address.');
}
function validateBaseUrl(baseUrl) {
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new HttpsError('invalid-argument', 'Base URL is not a valid URL.'); }
  if (parsed.protocol !== 'https:') throw new HttpsError('invalid-argument', 'Base URL must start with https://.');
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.test(host)) throw new HttpsError('invalid-argument', 'Base URL host is not allowed.');
  if (isIpLiteral(host)) throw new HttpsError('invalid-argument', 'Base URL must use a domain name, not a raw IP address.');
  if (parsed.username || parsed.password) throw new HttpsError('invalid-argument', 'Base URL must not contain embedded credentials.');
  if (parsed.hash) throw new HttpsError('invalid-argument', 'Base URL must not contain a URL fragment.');
  for (const key of parsed.searchParams.keys()) {
    if (/^(authorization|proxy-authorization|api[-_]?key|access[-_]?token|auth[-_]?token|token|password|passwd|secret|credential|private[-_]?key)$/i.test(key)) {
      throw new HttpsError('invalid-argument', 'Sensitive credentials must not be stored in the provider base URL.');
    }
  }
}
function validateTemplate(value, label, maxBytes = 20000) {
  const obj = asObject(value);
  const json = JSON.stringify(obj);
  if (Buffer.byteLength(json, 'utf8') > maxBytes) throw new HttpsError('invalid-argument', `${label} is too large.`);
  return obj;
}
function validateHeaders(value) {
  const headers = validateTemplate(value, 'Headers', 12000);
  if (Object.keys(headers).length > 50) throw new HttpsError('invalid-argument', 'Too many API headers.');
  for (const key of Object.keys(headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(key)) throw new HttpsError('invalid-argument', 'Invalid API header name.');
    if (/^(host|content-length|connection|transfer-encoding|proxy-)/i.test(key)) throw new HttpsError('invalid-argument', 'This API header is not allowed.');
    const v = headers[key];
    if (!(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) throw new HttpsError('invalid-argument', 'API header values must be scalar.');
    if (typeof v === 'string' && /[\x00-\x1F\x7F]/.test(v)) throw new HttpsError('invalid-argument', 'API header values contain invalid control characters.');
  }
  return headers;
}
// Catalogue configuration. Only providers that sell a browsable product list
// set these; a plain recharge or bill-pay API leaves them empty and behaves
// exactly as before. A preset (see providerCatalog.PRESETS) supplies the
// defaults for a known provider, and anything set here overrides it.
function validateCatalog(data) {
  const catalogPath = cleanString(data.catalogPath, 300);
  const out = {
    catalogPreset: cleanString(data.catalogPreset, 60),
    catalogPath,
    catalogMethod: (cleanString(data.catalogMethod, 10) || '').toUpperCase(),
    catalogListPath: cleanString(data.catalogListPath, 200),
    catalogFieldId: cleanString(data.catalogFieldId, 100),
    catalogSuccessPath: cleanString(data.catalogSuccessPath, 200),
    catalogErrorLabel: cleanString(data.catalogErrorLabel, 100),
    catalogDynamicProductDiscovery: data.catalogDynamicProductDiscovery === true,
  };
  if (out.catalogPath && (out.catalogPath.includes('?') || out.catalogPath.includes('#'))) {
    throw new HttpsError('invalid-argument', 'Catalogue path must not contain a query string or fragment.');
  }
  if (out.catalogMethod && !ALLOWED_METHODS.includes(out.catalogMethod)) {
    throw new HttpsError('invalid-argument', 'Invalid catalogue HTTP method.');
  }
  if (data.catalogSuccessValue !== undefined && data.catalogSuccessValue !== null) {
    const v = data.catalogSuccessValue;
    if (!['string', 'number', 'boolean'].includes(typeof v)) {
      throw new HttpsError('invalid-argument', 'Catalogue success value must be a scalar.');
    }
    out.catalogSuccessValue = typeof v === 'string' ? cleanString(v, 100) : v;
  }
  if (data.catalogTypes !== undefined && data.catalogTypes !== null && data.catalogTypes !== '') {
    // The admin form edits this as "regular, drive", so a comma-separated
    // string is as valid an input as an array.
    const raw = Array.isArray(data.catalogTypes)
      ? data.catalogTypes
      : typeof data.catalogTypes === 'string' ? data.catalogTypes.split(',') : null;
    if (!raw) throw new HttpsError('invalid-argument', 'Catalogue types must be a list or a comma-separated string.');
    const types = raw.map((t) => cleanString(t, 40).toLowerCase()).filter(Boolean);
    if (types.length > 10) throw new HttpsError('invalid-argument', 'Too many catalogue types.');
    out.catalogTypes = [...new Set(types)];
  }
  if (data.catalogRequestTemplate !== undefined && data.catalogRequestTemplate !== null && data.catalogRequestTemplate !== '') {
    out.catalogRequestTemplate = validateTemplate(data.catalogRequestTemplate, 'Catalogue request template');
  }
  // null and '' mean "not set", the same as they do for catalogTypes above and
  // catalogWindow below. This one checked only for undefined, so the Success
  // TopUp setup form - which spreads the provider straight from
  // listApiProviders, where an unset map is projected as null - sent null back
  // and was told its catalogue item map must map "id". A provider that takes
  // its catalogue from a preset has no map of its own, so that was every save.
  //
  // An empty object is the same answer by another route: it is what clearing
  // the field produces, and "{}" is not a map missing its required keys, it is
  // no map at all.
  if (data.catalogItemMap !== undefined && data.catalogItemMap !== null && data.catalogItemMap !== ''
      && Object.keys(asObject(data.catalogItemMap)).length > 0) {
    const map = validateTemplate(data.catalogItemMap, 'Catalogue item map', 4000);
    // Values are the provider's key names: one, or a list of fallbacks.
    for (const [field, keys] of Object.entries(map)) {
      const list = Array.isArray(keys) ? keys : [keys];
      if (!list.length || list.some((k) => typeof k !== 'string' || !k.trim())) {
        throw new HttpsError('invalid-argument', `Catalogue item map for "${field}" must name at least one response key.`);
      }
    }
    // Without these two a package cannot be identified or billed.
    for (const required of ['id', 'price']) {
      if (map[required] === undefined) {
        throw new HttpsError('invalid-argument', `Catalogue item map must map "${required}".`);
      }
    }
    out.catalogItemMap = map;
  }
  // Which of the provider's product codes each biller on our Bill Payment
  // screen is. Named by OUR biller name, because that is what the screen has;
  // a biller with no entry simply gets no bill presentment, which is one of
  // the provider's own documented non-blocking answers anyway.
  for (const [field, label] of [
    ['billerProductCodes', 'Biller product code'],
    ['operatorProductCodes', 'Operator product code'],
    ['pinProductCodes', 'PIN product code'],
    ['gameProductCodes', 'Game product code'],
  ]) {
    if (data[field] === undefined || data[field] === null || data[field] === ''
        || Object.keys(asObject(data[field])).length === 0) continue;
    const map = validateTemplate(data[field], label + 's', 4000);
    // A value is a code, or a code with the amount the PROVIDER wants for it,
    // or - for a voucher range sold one product per denomination - a map from
    // amount to either of those.
    const cleanLeaf = (value, where) => {
      const object = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
      const code = cleanString(object ? object.code : (Array.isArray(value) ? value[0] : value), 40);
      if (!code) throw new HttpsError('invalid-argument', `${label} for ${where} is empty.`);
      if (!/^[A-Za-z0-9_.-]+$/.test(code)) throw new HttpsError('invalid-argument', `${label} for ${where} must be a plain product code.`);
      if (!object || object.amount === undefined || object.amount === null || object.amount === '') return code;
      const amount = Number(object.amount);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
        throw new HttpsError('invalid-argument', `${label} for ${where} has an invalid amount.`);
      }
      return { code, amount: Math.round(amount * 100) / 100 };
    };
    const cleaned = {};
    for (const [name, entry] of Object.entries(map)) {
      const object = entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
      // `code` present means this is one product; anything else keyed by an
      // object is a denomination range.
      if (object && object.code === undefined) {
        if (!Object.keys(object).length) throw new HttpsError('invalid-argument', `${label} for "${name}" is empty.`);
        const inner = {};
        for (const [denomination, value] of Object.entries(object)) {
          const amount = Number(denomination);
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new HttpsError('invalid-argument', `${label} for "${name}" is keyed by denomination, so "${String(denomination).slice(0, 20)}" must be an amount.`);
          }
          inner[String(denomination)] = cleanLeaf(value, `"${name}" at ${denomination}`);
        }
        cleaned[name] = inner;
        continue;
      }
      cleaned[name] = cleanLeaf(entry, `"${name}"`);
    }
    out[field] = cleaned;
  }
  for (const field of ['billPresentmentPath', 'networkStatusPath', 'productListPath']) {
    if (data[field] === undefined || data[field] === null) continue;
    const path = cleanString(data[field], 300);
    if (path && (path.includes('?') || path.includes('#') || /^https?:\/\//i.test(path))) {
      throw new HttpsError('invalid-argument', `${field} must be relative and carry no query string.`);
    }
    out[field] = path;
  }
  if (data.catalogQueryTemplate !== undefined && data.catalogQueryTemplate !== null && data.catalogQueryTemplate !== '') {
    out.catalogQueryTemplate = validateTemplate(data.catalogQueryTemplate, 'Catalogue query template');
  }
  if (data.catalogPerAccount !== undefined && data.catalogPerAccount !== null && data.catalogPerAccount !== '') {
    out.catalogPerAccount = data.catalogPerAccount === true || data.catalogPerAccount === 'true';
  }
  // Operator display name -> the provider's product code, or a list of them
  // when one operator could be more than one product. Validated here because a
  // code that is not a plain token would end up on a URL.
  if (data.catalogOperatorCodes !== undefined && data.catalogOperatorCodes !== null && data.catalogOperatorCodes !== ''
      && Object.keys(asObject(data.catalogOperatorCodes)).length > 0) {
    const map = validateTemplate(data.catalogOperatorCodes, 'Catalogue operator codes', 4000);
    const cleaned = {};
    for (const [operator, codes] of Object.entries(map)) {
      const list = (Array.isArray(codes) ? codes : [codes]).map((c) => cleanString(c, 40)).filter(Boolean);
      if (!list.length) throw new HttpsError('invalid-argument', `Catalogue operator codes for "${operator}" must name at least one product code.`);
      if (list.some((c) => !/^[A-Za-z0-9_.-]+$/.test(c))) {
        throw new HttpsError('invalid-argument', `Catalogue operator codes for "${operator}" must be plain product codes.`);
      }
      if (list.length > 4) throw new HttpsError('invalid-argument', `At most 4 product codes for "${operator}" - each one is another request per listing.`);
      cleaned[operator] = list;
    }
    out.catalogOperatorCodes = cleaned;
  }
  // null, '' and {} mean "not set", exactly as they do for every field above.
  // The comment on catalogItemMap already says "the same as they do for
  // catalogTypes above and catalogWindow below" - but this check never tested
  // for either, so it was the one field where the claim was untrue.
  //
  // The field's own hint reads "Leave empty to sell around the clock", and an
  // empty box is what the form sends for any provider without a window. So
  // every save of such a provider was refused, with an error about hours the
  // form had never been given, on a screen where the hours were not what was
  // being edited.
  if (data.catalogWindow !== undefined && data.catalogWindow !== null && data.catalogWindow !== ''
      && Object.keys(asObject(data.catalogWindow)).length > 0) {
    const w = validateTemplate(data.catalogWindow, 'Catalogue selling window', 2000);
    const open = Number(w.openUtcHour);
    const close = Number(w.closeUtcHour);
    if (!Number.isInteger(open) || open < 0 || open > 24 || !Number.isInteger(close) || close < 0 || close > 24) {
      throw new HttpsError('invalid-argument', 'Catalogue selling window hours must be whole hours between 0 and 24 (UTC).');
    }
    out.catalogWindow = {
      type: cleanString(w.type, 40).toLowerCase(),
      openUtcHour: open,
      closeUtcHour: close,
      label: cleanString(w.label, 300),
      noun: cleanString(w.noun, 60) || 'Packages',
    };
  }
  return out;
}

function validate(data) {
  let service = cleanString(data.service, 40), name = cleanString(data.name, 100), baseUrl = cleanString(data.baseUrl, 500);
  // A list, with `country` as its first entry. Every reader written before
  // multiple countries existed goes on using `country` and keeps working.
  const countries = providerReach.normaliseCountries(
    (Array.isArray(data.countries) && data.countries.length) || typeof data.countries === 'string'
      ? data.countries
      : [data.country],
    {
      allowed: ALLOWED_COUNTRIES,
      onInvalid: (code) => { throw new HttpsError('invalid-argument', `"${String(code).slice(0, 10)}" is not a country this app serves.`); },
    },
  );
  let country = countries[0];
  const excludedCountries = providerReach.normaliseCountries(data.excludedCountries || [], {
    allowed: ALLOWED_COUNTRIES.filter((c) => c !== 'ALL'),
    onInvalid: (code) => { throw new HttpsError('invalid-argument', '"' + String(code).slice(0, 10) + '" is not a country this app serves.'); },
  });
  let endpointPath = cleanString(data.endpointPath, 500) || '/';
  let authType = cleanString(data.authType, 20) || 'none';
  let method = cleanString(data.method, 10).toUpperCase() || 'POST';
  let apiKey = cleanString(data.apiKey, 1000);
  let secretKey = cleanString(data.secretKey, 1000);
  let headers = data.headers || {};
  let queryTemplate = data.queryTemplate || {};
  let requestTemplate = data.requestTemplate || {};
  let responseSuccessPath = cleanString(data.responseSuccessPath, 200);
  let responseSuccessValue = cleanString(data.responseSuccessValue, 200);
  let responseProcessingPath = cleanString(data.responseProcessingPath, 200);
  let responseProcessingValue = cleanString(data.responseProcessingValue, 200);
  let responseIdPath = cleanString(data.responseIdPath, 200);
  let responseMessagePath = cleanString(data.responseMessagePath, 200);
  let priority = Number.isFinite(Number(data.priority)) ? Number(data.priority) : 0;

  const successTopUp = ['Recharge', 'Bill Payment', ...SUCCESS_TOPUP_PACKAGE_SERVICES].includes(service) && name.toLowerCase() === 'success topup';
  const successTopUpBill = service === 'Bill Payment' && successTopUp;
  const successTopUpPackage = successTopUp && SUCCESS_TOPUP_PACKAGE_SERVICES.includes(service);
  if (successTopUp) {
    name = 'Success TopUp';
    baseUrl = 'https://api.successtopup.com';
    endpointPath = successTopUpBill ? '/api/bill-pay' : '/api/recharge';
    method = 'POST';
    authType = 'none';
    headers = {};
    queryTemplate = {};
    requestTemplate = successTopUpBill ? {
      billOperator: '{{billOperator}}',
      billNumber: '{{billNumber}}',
      billAmount: '{{amount}}',
      mobileNumber: '{{mobileNumber}}',
      monthName: '{{monthName}}',
      note: '{{note}}',
      trxid: '{{requestId}}',
      successtopup_key: '{{apiKey}}',
      successtopup_secret: '{{secretKey}}'
    } : successTopUpPackage ? {
      number: '{{phone}}',
      type: 'prepaid',
      operator: '{{internetOperator}}',
      amount: '{{amount}}',
      package_id: '{{packageId}}',
      trxid: '{{requestId}}',
      successtopup_key: '{{apiKey}}',
      successtopup_secret: '{{secretKey}}'
    } : {
      number: '{{phone}}',
      type: 'prepaid',
      operator: '{{operator}}',
      amount: '{{amount}}',
      trxid: '{{requestId}}',
      successtopup_key: '{{apiKey}}',
      successtopup_secret: '{{secretKey}}'
    };
    responseSuccessPath = 'result';
    responseSuccessValue = 'true';
    responseProcessingPath = '';
    responseProcessingValue = '';
    responseIdPath = '';
    responseMessagePath = 'message';
    priority = 9999;
    country = 'BD';
  }

  if (endpointPath.includes('?') || endpointPath.includes('#')) throw new HttpsError('invalid-argument', 'Endpoint path must not contain a query string or fragment; use Query Template instead.');
  if (!ALLOWED_SERVICES.includes(service)) throw new HttpsError('invalid-argument', 'Invalid service.');
  for (const entry of [service, ...(Array.isArray(data.services) ? data.services : [])]) {
    if (isNonApiService(entry)) {
      throw new HttpsError('invalid-argument', `${entry} is a payout, not a product purchase, so it cannot be given an API provider. It stays a manual order to a dealer.`);
    }
  }
  // One provider, several features. Bangladesh recharge and Bangladesh
  // internet are the same Success TopUp account; so are most bus, train and
  // flight aggregators. Before this, each needed its own row with the same
  // credentials typed again, and changing a key meant remembering every copy.
  //
  // `service` stays the primary and is always first in `services`, so the
  // existing queries keep working against documents written before this and
  // nothing has to be migrated before a deploy.
  let services;
  {
    const extra = Array.isArray(data.services) ? data.services : [];
    const list = [service, ...extra.map((x) => cleanString(x, 40))].filter(Boolean);
    const unique = [...new Set(list)];
    if (unique.length > ALLOWED_SERVICES.length) throw new HttpsError('invalid-argument', 'Too many features for one provider.');
    for (const entry of unique) {
      if (!ALLOWED_SERVICES.includes(entry)) throw new HttpsError('invalid-argument', `Invalid service: ${entry}.`);
    }
    services = unique;
  }
  if (!ALLOWED_COUNTRIES.includes(country)) throw new HttpsError('invalid-argument', 'Invalid provider country.');
  if (!name) throw new HttpsError('invalid-argument', 'API provider name is required.');
  // Serving Recharge PIN at all, not just as the primary feature. One iimmpact
  // account sells airtime and vouchers from the same credentials, so its
  // record lists Recharge PIN alongside Recharge - and keying this on the
  // primary let such a record save with no PIN path, pass validation, be
  // selected for every voucher sale, and fail each one at dispatch with
  // "missing responsePinPath configuration".
  if (servesRechargePin(service, services) && !cleanString(data.responsePinPath, 200)) throw new HttpsError('invalid-argument', 'A provider that sells Recharge PIN must define Response PIN Path.');
  validateBaseUrl(baseUrl);
  if (!ALLOWED_AUTH.includes(authType)) throw new HttpsError('invalid-argument', 'Invalid authentication type.');
  if (successTopUp && (!apiKey || !secretKey)) throw new HttpsError('invalid-argument', 'Success TopUp API key and API secret are required.');
  if ((authType === 'apiKey' || authType === 'bearer') && !apiKey) throw new HttpsError('invalid-argument', 'API key is required for this authentication type.');
  if (authType === 'basic' && (!cleanString(data.username, 200) || !cleanString(data.password, 1000))) throw new HttpsError('invalid-argument', 'Username and password are required for Basic authentication.');
  // Both halves, and the secret checked for shape here rather than at charge
  // time: a secret that is not base64 signs with the wrong key and the
  // provider answers 401, which is indistinguishable from a wrong canonical
  // string. Refusing it while someone is looking at the form is the only point
  // at which the difference can still be explained.
  if (authType === 'iimmpactHmac') {
    if (!apiKey || !secretKey) throw new HttpsError('invalid-argument', 'iimmpact requires both an API key and an HMAC secret.');
    try { decodeIimmpactSecret(secretKey); }
    catch (error) { throw new HttpsError('invalid-argument', String(error?.message || 'The iimmpact HMAC secret is not valid.')); }
  }
  if (!ALLOWED_METHODS.includes(method)) throw new HttpsError('invalid-argument', 'Invalid HTTP method.');
  return {
    service, services, name, country, countries, excludedCountries: excludedCountries.filter((c) => c !== 'ALL'), baseUrl, endpointPath, method, authType, apiKey, secretKey,
    username: cleanString(data.username, 200), password: cleanString(data.password, 1000),
    active: data.active !== false, priority: Math.max(0, Math.min(9999, Number(priority) || 0)),
    timeoutMs: Math.max(3000, Math.min(60000, Number(data.timeoutMs) || 15000)), notes: cleanString(data.notes, 1000),
    headers: validateHeaders(headers), queryTemplate: validateTemplate(queryTemplate, 'Query template'),
    requestTemplate: validateTemplate(requestTemplate, 'Request template'),
    responseSuccessPath, responseSuccessValue, responseProcessingPath, responseProcessingValue,
    responseIdPath, responseMessagePath, responsePinPath: servesRechargePin(service, services) ? cleanString(data.responsePinPath, 200) : '',
    ...validateCatalog(data),
  };
}

function asObject(value) { if (value && typeof value === 'object' && !Array.isArray(value)) return value; if (typeof value !== 'string') return {}; try { const x = JSON.parse(value); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } }
function getPath(obj, path) { return path ? path.split('.').reduce((v,k) => v == null ? undefined : v[k], obj) : undefined; }

/**
 * The figure the PROVIDER is told to top up, which is not the one the customer
 * pays.
 *
 * A package order has two numbers. The sell price is what leaves the wallet;
 * the catalogue figure - Success TopUp's package price, iimmpact's denomination
 * - is what the provider's own request must carry. Sending the sell price
 * instead buys a different product or is refused outright, and the difference
 * is our margin, so getting this backwards is visible only as failed orders.
 *
 * packageCostAmount being present is what makes it the server's figure:
 * resolvePackagePricing drops whatever the client sent before setting its own,
 * so there is no client value left here to trust. It used to be read only for
 * Bangladesh; any resolved catalogue now gets the same treatment.
 */
function providerAmountFor({ raw, payload, isSuccessTopUpBd, mappedAmount }) {
  const r = raw || {};
  const packageCost = Number(r.packageCostAmount);
  if (Number.isFinite(packageCost) && packageCost > 0) return packageCost;
  // Stated on the provider record for a fixed product that has no catalogue to
  // resolve a price from - a game pack, a voucher. Same rule, different source.
  if (Number.isFinite(mappedAmount) && mappedAmount > 0) return mappedAmount;
  // The legacy orders differ and are kept: a Success TopUp Bangladesh order
  // reads raw first, everything else reads the payload first.
  return isSuccessTopUpBd
    ? (r.amount ?? payload?.amount ?? '')
    : (payload?.amount ?? r.amount ?? '');
}

/**
 * What a provider's reply means: 'completed', 'processing' or 'rejected'.
 *
 * Pure, and separate from the request, because it is the decision that moves
 * money: 'rejected' refunds the customer, and refunding a transaction the
 * provider actually created pays for it twice.
 *
 * Pending is decided FIRST, and this order is the whole point. Some providers
 * report the final outcome and the "not finished yet" outcome through the SAME
 * field. iimmpact's /v2/topup answers data.status, which is Accepted, then
 * Processing, then Succesful or Failed. Testing success first, an Accepted or
 * Processing reply failed `status === "Succesful"`, was filed as a refusal, and
 * the customer was refunded for a transaction that then completed anyway.
 *
 * So a pending reply is never a rejection. A reply matching neither pending nor
 * success is - that is a provider saying no, and the charge is safe to return.
 */
function classifyResponse(provider, data) {
  const p = provider || {};
  if (p.responseProcessingPath && matchesStatus(getPath(data, p.responseProcessingPath), p.responseProcessingValue)) {
    return 'processing';
  }
  // No success path configured at all means the HTTP 200 was the answer.
  const success = p.responseSuccessPath ? getPath(data, p.responseSuccessPath) : true;
  if (success === false) return 'rejected';
  if (p.responseSuccessValue && !matchesStatus(success, p.responseSuccessValue)) return 'rejected';
  return 'completed';
}

// A template value that is nothing but one placeholder takes that value's own
// type; anything with text around it is interpolation and stays a string.
//
// Success TopUp documents amount as `number` and their own example sends
// `"amount": 50`. Every value went out as a string because the replace()
// stringifies, so we were sending "50" against a documented number. Providers
// mostly coerce it, but sending a documented type wrongly on the charge path
// is not something to leave to a parser's good nature.
const WHOLE_PLACEHOLDER = /^\{\{\s*([A-Za-z0-9_]+)\s*\}\}$/;
function render(v, vars) {
  if (typeof v === 'string') {
    const whole = v.match(WHOLE_PLACEHOLDER);
    if (whole) {
      const value = vars[whole[1]];
      if (value == null) return '';
      // Only a value that is already a number or boolean keeps its type. A
      // numeric-looking string stays a string: it was given as one.
      return (typeof value === 'number' || typeof value === 'boolean') ? value : String(value);
    }
    return v.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k) => vars[k] == null ? '' : String(vars[k]));
  }
  if (Array.isArray(v)) return v.map(x => render(x, vars));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x]) => [k, render(x, vars)]));
  return v;
}
function providerAuth(p) {
  if (p.authType === 'apiKey' && p.apiKey) return { 'x-api-key': p.apiKey };
  if (p.authType === 'bearer' && p.apiKey) return { authorization: `Bearer ${p.apiKey}` };
  if (p.authType === 'basic' && p.username) return { authorization: `Basic ${Buffer.from(`${p.username}:${p.password || ''}`).toString('base64')}` };
  return {};
}
const SUCCESS_TOPUP_BILL_OPERATORS = {
  'Palli Bidyut (Prepaid)': 'pbp',
  'Palli Bidyut (Postpaid)': 'pbd',
  'DESCO (Prepaid)': 'dsp',
  'DESCO (Postpaid)': 'dsd',
  'NESCO (Prepaid)': 'nsp',
  'NESCO (Postpaid)': 'nsd',
  'DPDC (Prepaid)': 'dpp',
  'DPDC (Postpaid)': 'dpd',
  'Titas Gas': 'ttg',
  'Karnaphuli Gas': 'krp',
  'Jalalabad Gas': 'jlb',
  'Sundarban Gas': 'sbg',
  'Bakhrabad Gas': 'brd',
  'Amber IT': 'art',
  'Dhaka WASA': 'DAWA',
};
const SUCCESS_TOPUP_OPERATORS = {
  Grameenphone: 'GP', Robi: 'RB', Banglalink: 'BL', Airtel: 'AT',
  Teletalk: 'TT', Skitto: 'SK', 'Brilliant Connect': 'BT', Ryze: 'RY',
};
const SUCCESS_TOPUP_OPERATOR_CODES = Object.values(SUCCESS_TOPUP_OPERATORS);
const SUCCESS_TOPUP_POSTPAID_BILL_OPERATORS = { Grameenphone: 'GP', Robi: 'RB', Banglalink: 'BL' };
const SUCCESS_TOPUP_PACKAGE_SERVICES = ['Internet', 'Offer Packs', 'Entertainment'];
const PACKAGE_CHARGE_KINDS = { Internet: 'internet', 'Offer Packs': 'offerpacks', Entertainment: 'entertainment' };

/**
 * A function from a catalogue price to what this customer's wallet pays.
 *
 * The catalogue is in BDT and the wallet may be in MYR, INR or anything else
 * supported, with a per-unit price for the role, a tier discount and a sell
 * rate in between. Doing that arithmetic on the client gave a figure that was
 * none of those things - the rate conversion alone - so the list quoted one
 * number and the charge took another.
 *
 * Every input is read once per listing, not once per package, and the sums are
 * walletPricing's, the same ones chargeProduct uses.
 *
 * Returns null for a package it cannot price, so the caller can fall back to
 * showing the catalogue price rather than a wrong one or a blank.
 */
const QUOTE_RATE_KEYS = { BD: 'rechargeBD', IN: 'rechargeIN', NP: 'rechargeNP', ID: 'rechargeID', PK: 'rechargePK', MM: 'rechargeMM', PH: 'rechargePH', KH: 'rechargeKH' };

/**
 * The exchange rate the CHARGE would use for one country.
 *
 * It must agree with walletService's amountToPoints exactly, because this
 * quotes the price a customer is shown and that computes the price they are
 * charged. Malaysia is the one that bit: a MYR price is already in wallet
 * currency and amountToPoints says so by returning a rate of 1, while this had
 * no MY entry at all and answered NaN - so every Malaysian price quoted as
 * null. Nothing asked it for one until now, so the only cost was no quote.
 * With a Malaysian catalogue it is worse than that: the picker falls back to
 * the raw catalogue price while the wallet is still debited through the
 * per-unit markup, the tier discount and the wallet FX, and the customer is
 * shown one number and charged another.
 */
function quoteRateFor(country, rates) {
  const code = String(country || '').toUpperCase();
  if (code === 'MY') return 1;
  const key = QUOTE_RATE_KEYS[code];
  return key ? Number((rates || {})[key]) : NaN;
}
exports._test_quoteRateFor = quoteRateFor;

async function customerWalletQuoter(db, uid, service, country) {
  const chargeKind = PACKAGE_CHARGE_KINDS[service];
  const wantedCountry = String(country || 'BD').toUpperCase();
  try {
    const [userSnap, pricingSnap, ratesSnap, settings] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('settings').doc('pricing').get(),
      db.collection('rates').doc('current').get(),
      progressionService.getProgressionSettings(),
    ]);
    const profile = userSnap.exists ? (userSnap.data() || {}) : {};
    const pricing = pricingSnap.exists ? (pricingSnap.data() || {}) : {};
    const rates = ratesSnap.exists ? (ratesSnap.data() || {}) : {};
    const fx = await getWalletCurrencyAndFx(db, profile);
    const unitKey = walletPricing.PER_UNIT_PRICE_KEYS[chargeKind];
    const unitPrice = unitKey ? walletPricing.safePrice(pricing, unitKey, profile.role) : 1;
    const discountPercent = progressionService.discountPercentFromSettings(settings, profile.tier);
    return (localPrice) => {
      const n = Number(localPrice);
      const effectiveRate = quoteRateFor(wantedCountry, rates);
      if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(effectiveRate) || effectiveRate <= 0) return null;
      // Rounded to the cent before the markup, exactly as amountToPoints does
      // in the charge path - rounding later would differ by a cent.
      const baseAmount = Math.round((n / effectiveRate) * 100) / 100;
      try {
        const { walletCost, currency } = walletPricing.walletChargeFor({ baseAmount, unitPrice, discountPercent, fx });
        return { walletPrice: walletCost, walletCurrency: currency };
      } catch { return null; }
    };
  } catch (error) {
    console.error('Wallet quote unavailable', String(error?.message || error));
    return () => null;
  }
}
// Provisioned automatically from the Recharge provider, so they are not shown
// as separately editable rows in Superadmin.
const SUCCESS_TOPUP_COMPANION_SERVICES = ['Internet', 'Offer Packs', 'Entertainment', 'Bill Payment'];

/**
 * "Not configured" was a dead end for exactly these four services.
 *
 * They are provisioned as companions when the Recharge provider is saved
 * (see the companion block in saveApiProvider), and listApiProviders filters
 * them out so nobody edits them by hand. So the message sent a superadmin to
 * look for an Offer Packs row in API Management that is deliberately not
 * there, with no way to act on what it told them.
 */
function unconfiguredError(service) {
  if (SUCCESS_TOPUP_COMPANION_SERVICES.includes(service)) {
    return new HttpsError(
      'failed-precondition',
      `Success TopUp ${service} is set up from the Recharge provider, not on its own. Open API Management, save the Success TopUp Recharge provider, and ${service} is provisioned with it.`,
    );
  }
  return new HttpsError('failed-precondition', `Success TopUp ${service} API is not configured.`);
}

function resolveSuccessTopUpOperator(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (SUCCESS_TOPUP_OPERATORS[raw]) return SUCCESS_TOPUP_OPERATORS[raw];
  const upper = raw.toUpperCase();
  return SUCCESS_TOPUP_OPERATOR_CODES.includes(upper) ? upper : '';
}

// The one place a catalogue request leaves this server. The listing callables,
// the credential test and the order-time price check all go through it, so the
// response mapping cannot differ between what a customer is shown and what they
// are charged.
//
// The shape of the request and response is no longer written here: that is
// providerCatalog's configuration, so bus/train/flight providers get the same
// treatment. What stays here is the part that must not be configurable - the
// public-hostname assertion and the DNS pinning that stop a provider URL being
// pointed at an internal address.
//
// Signed with the provider's own credentials. Until catalogues, every provider
// here put them in the request body (Success TopUp's successtopup_key/secret),
// so this needed none and had none. A signed API has nowhere to put them but
// the headers, and an unsigned read against one is simply a 401 - nothing would
// load and nothing would say why.
//
// Signing happens last because it covers the URL and the body exactly as they
// go out: the query is already on the URL by this point.
async function signedProviderRequest(url, init, provider) {
  await assertPublicHostname(url.hostname);
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  const pinned = addresses.find((a) => !isPrivateIp(a.address));
  if (!pinned) throw new Error('Provider hostname resolved to an invalid address.');
  const headers = { ...(init && init.headers) };
  if (provider && provider.authType === 'iimmpactHmac') {
    headers['X-API-Version'] = String(provider.iimmpactApiVersion || '2026-09-16');
    Object.assign(headers, signIimmpactRequest({
      apiKey: provider.apiKey,
      secretKey: provider.secretKey,
      method: init && init.method,
      url,
      body: init && init.body,
    }));
  } else if (provider) {
    Object.assign(headers, providerAuth(provider));
  }
  const response = await requestHttpsPinned(url, { ...init, headers }, pinned);
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : {}; } catch { json = null; }
  // Returned rather than thrown: a catalogue treats a non-200 as a failure, a
  // bill presentment reads the body either way. The caller decides.
  return { ok: response.ok, status: response.status, json };
}

async function catalogHttpsRequest(url, init, config, provider) {
  const { ok, json } = await signedProviderRequest(url, init, provider);
  if (!ok) throw new Error(`${config.errorLabel} catalogue request failed.`);
  if (json === null) throw new Error(`${config.errorLabel} returned invalid catalogue data.`);
  return json;
}
/** Fetch any provider's catalogue, normalised. */
function fetchProviderCatalog(provider, operator, type, account) {
  return providerCatalog.fetchCatalog(provider, { operator, type, account }, { request: catalogHttpsRequest });
}

// Success TopUp's operator codes are still validated here, because they are
// specific to that provider's API rather than to catalogues in general.
async function fetchSuccessTopUpCatalog(provider, operator, type) {
  const safeOperator = SUCCESS_TOPUP_OPERATOR_CODES.includes(operator) || operator === 'ALL' ? operator : 'ALL';
  return fetchProviderCatalog(provider, safeOperator, type);
}

exports.fetchSuccessTopUpCatalog = fetchSuccessTopUpCatalog;
exports.fetchProviderCatalog = fetchProviderCatalog;

/**
 * Every active provider that serves one feature.
 *
 * Two queries, merged. A provider written before multi-feature support has no
 * `services` array, and one written since has `service` as well - so asking
 * only one way would either miss the old documents or miss the extra features
 * of the new ones. Deliberately not a migration: this is a money path, and a
 * provider going quiet because a backfill had not run yet is not a failure
 * mode worth accepting for one saved read.
 */
async function providersForService(db, service) {
  const [legacy, multi] = await Promise.all([
    db.collection(COLLECTION).where('service', '==', service).where('active', '==', true).limit(100).get(),
    db.collection(COLLECTION).where('services', 'array-contains', service).where('active', '==', true).limit(100).get(),
  ]);
  const byId = new Map();
  for (const d of [...legacy.docs, ...multi.docs]) byId.set(d.id, { id: d.id, ...d.data() });
  return [...byId.values()];
}
exports._providersForService = providersForService;

// Short-lived in-memory catalog lookup. Product codes are provider-owned and
// can change, so this is intentionally a cache, never a permanent product map.
const IIMMPACT_PRODUCT_CODE_CACHE = new Map();
const IIMMPACT_PRODUCT_CODE_CACHE_MS = 5 * 60 * 1000;

function normaliseCatalogText(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

async function discoverIimmpactProductCodes(provider, operatorName, service) {
  const base = new URL(provider.baseUrl);
  const url = new URL('/v2/catalog', base);
  url.searchParams.set('is_active', 'true');
  const { ok, json } = await signedProviderRequest(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  }, provider);
  if (!ok || !json || typeof json !== 'object') return [];

  const wanted = normaliseCatalogText(operatorName);
  if (!wanted) return [];
  const products = Object.values(json.products || {}).filter((p) => p && p.is_active !== false && p.code);
  const scored = products.map((p) => {
    const name = normaliseCatalogText(p.name);
    const note = normaliseCatalogText(p.note);
    let score = 0;
    if (name === wanted) score = 120;
    else if (name.includes(wanted)) score = 100;
    else if (wanted.includes(name) && name) score = 90;
    if (note && note.includes(wanted)) score = Math.max(score, 60);
    // Mobile-data products are the per-number catalogue we need for Internet
    // and Offer Packs. Do not accidentally select an unrelated product that
    // happens to contain the operator's name.
    if (['Internet', 'Offer Packs'].includes(service)) {
      const dataField = Array.isArray(p.fields) && p.fields.some((f) =>
        f && f.type === 'select' && f.data_source
      );
      if (!dataField) score = 0;
    }
    return { code: String(p.code), score };
  }).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return [];
  const best = scored[0].score;
  return scored.filter((x) => x.score === best).slice(0, 8).map((x) => x.code);
}

async function resolveIimmpactCatalogProductCode(provider, service, subject, raw = {}) {
  const key = [provider.id || provider.name || 'iimmpact', service, subject, raw.operator || '', raw.provider || ''].join('|').toLowerCase();
  const cached = IIMMPACT_PRODUCT_CODE_CACHE.get(key);
  if (cached && Date.now() - cached.at < IIMMPACT_PRODUCT_CODE_CACHE_MS) return cached.code;

  const base = new URL(provider.baseUrl);
  const url = new URL('/v2/catalog', base);
  url.searchParams.set('is_active', 'true');
  const { ok, json } = await signedProviderRequest(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  }, provider);
  if (!ok || !json || typeof json !== 'object') return '';

  const wanted = new Set([
    subject,
    raw.operator,
    raw.provider,
    raw.game,
    raw.gameName,
    raw.package,
    raw.packageName,
  ].map(normaliseCatalogText).filter(Boolean));
  if (!wanted.size) return '';

  const allProducts = Object.values(json.products || {}).filter((p) => p && p.is_active !== false && p.code);
  // Recharge PIN is a fulfillment type, not merely a product name. IIMMPACT
  // can expose the same operator/brand as both airtime and a voucher product.
  // Restrict PIN matching to products explicitly fulfilled as PINs before
  // scoring the operator name; otherwise an airtime product can tie with its
  // PIN sibling and the safe ambiguity guard returns no code.
  const products = service === 'Recharge PIN'
    ? allProducts.filter((p) => String(p.processing_time || '').toLowerCase() === 'pin')
    : allProducts;
  const scored = products.map((p) => {
    const name = normaliseCatalogText(p.name);
    const note = normaliseCatalogText(p.note);
    const code = normaliseCatalogText(p.code);
    let score = 0;
    for (const term of wanted) {
      if (term === code) score = Math.max(score, 100);
      if (term === name) score = Math.max(score, 100);
      if (name.includes(term) || term.includes(name)) score = Math.max(score, 80);
      if (note && (note.includes(term) || term.includes(note))) score = Math.max(score, 60);
    }
    return { code: String(p.code), score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  // Never guess between equally plausible products. A missing map is safer than
  // silently buying a different product from the one the customer selected.
  const code = scored.length && (scored.length === 1 || scored[0].score > scored[1].score)
    ? scored[0].code
    : '';
  if (code) IIMMPACT_PRODUCT_CODE_CACHE.set(key, { code, at: Date.now() });
  return code;
}

async function executeConfiguredApi(service, payload, customer, requestId, options = {}) {
  // The last line of defence, and the one that would do the damage. Everything
  // above this refuses a payout earlier - the mode, the stored settings, the
  // provider form - but this is the function that actually sends somebody's
  // money somewhere, so it does not take any of that on trust.
  if (isNonApiService(service)) {
    throw new HttpsError('failed-precondition', `${service} is a payout, not a product purchase. It is never dispatched to an API provider.`);
  }
  const db = admin.firestore();
  const allProvidersRaw = await providersForService(db, service);
  const requestedCountry = String(payload?.raw?.country || '').trim().toUpperCase() || 'ALL';
  const allProviders = allProvidersRaw;
  // A provider that NAMES this country beats one that serves all of them, and
  // a provider now names several.
  const countryProviders = allProviders.filter((p) => providerReach.isSpecificFor(p, requestedCountry));
  const globalProviders = allProviders.filter((p) => providerReach.isGlobal(p));
  const providers = [...(countryProviders.length ? countryProviders : globalProviders)].sort((x,y)=>Number(y.priority||0)-Number(x.priority||0));
  if (!providers.length) throw new HttpsError('failed-precondition', `No active API provider is configured for ${service}.`);
  const provider = { ...providers[0] };
  Object.assign(provider, await providerSecretService.getCredentials(provider));
  const executionKey = crypto.createHash('sha256').update(`${service}|${customer?.uid || ''}|${requestId}`).digest('hex');
  const executionRef = db.collection('apiExecutions').doc(executionKey);
  // Atomically claim this request before making any external side effect.
  // A read-then-create sequence is race-prone: two concurrent invocations can
  // both observe a missing document and both call the provider.
  const claim = await db.runTransaction(async tx => {
    const s = await tx.get(executionRef);
    if (s.exists) return { owned: false, state: s.data() || {} };
    tx.create(executionRef, {
      service,
      requestId,
      providerId: provider.id,
      status: 'processing',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { owned: true, state: null };
  });
  if (!claim.owned) {
    const state = claim.state || {};
    if (state.status === 'completed') {
      if (service === 'Recharge PIN' && typeof state.result?.secret === 'string' && state.result.secret) return state.result;
      if (service === 'Recharge PIN') throw new HttpsError('unavailable','The provider request completed, but the voucher PIN is not recoverable from the cached execution. Reconciliation is required.');
      return state.result || {};
    }
    if (state.status === 'unknown') throw new HttpsError('unavailable','The API request outcome is uncertain. Check the provider before retrying.');
    if (state.status === 'processing') {
      // A crashed invocation can leave the execution claim in processing.
      // Never retry a possibly side-effecting provider request automatically.
      // After the recovery window, explicitly mark the execution unknown so
      // support/reconciliation can investigate it without leaving a permanent
      // "processing" lock.
      const updatedAt = state.updatedAt;
      const updatedMillis = updatedAt && typeof updatedAt.toMillis === 'function' ? updatedAt.toMillis() : 0;
      const staleAfterMs = 15 * 60 * 1000;
      if (updatedMillis > 0 && Date.now() - updatedMillis >= staleAfterMs) {
        await executionRef.set({
          status: 'unknown',
          message: 'Provider execution timed out before the outcome was confirmed. Reconciliation is required.',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        throw new HttpsError('unavailable','The previous provider request timed out before its outcome was confirmed. Reconciliation is required.');
      }
      throw new HttpsError('aborted','This API request is already being processed.');
    }
    if (state.status === 'failed') throw new HttpsError('failed-precondition',state.message || 'The provider rejected this request.');
    throw new HttpsError('aborted','This API request is already being processed.');
  }
  let requestSent = false;
  if (service === 'Recharge PIN' && !provider.responsePinPath) throw new Error('Recharge PIN provider is missing responsePinPath configuration.');
  const raw = payload?.raw || {};
  const isSuccessTopUpBill = service === 'Bill Payment' && String(provider.name || '').trim().toLowerCase() === 'success topup';
  const isSuccessTopUp = String(provider.name || '').trim().toLowerCase() === 'success topup' && String(raw.country || '').toUpperCase() === 'BD';
  // Internet and Entertainment are the same transaction to Success TopUp: a
  // /api/recharge call carrying package_id. Their documented API has no
  // separate package or entertainment endpoint - a bundle is bought by naming
  // its id from /api/drives - so both services share one code path.
  const isSuccessTopUpPackage = isSuccessTopUp && SUCCESS_TOPUP_PACKAGE_SERVICES.includes(service);
  const isSuccessTopUpInternet = isSuccessTopUpPackage;
  const isSuccessTopUpRecharge = isSuccessTopUp && service === 'Recharge';
  const billOperator = raw.billOperator || SUCCESS_TOPUP_BILL_OPERATORS[String(raw.provider || '').trim()] || '';
  const internetOperator = resolveSuccessTopUpOperator(raw.operatorCode || raw.operator);
  const packageId = raw.packageId || raw.package_id || '';
  const mobileBillOperator = SUCCESS_TOPUP_POSTPAID_BILL_OPERATORS[String(raw.provider || '').trim()] || '';
  const rechargeOperator = resolveSuccessTopUpOperator(raw.operator);
  // The provider's own code for the operator the customer picked, resolved
  // HERE rather than taken from the client: it decides which product a real
  // top-up buys, and the screen has no business naming it. raw.operatorCode
  // still wins where the server already put one there - an internet order
  // carries the product its plan was actually found under.
  // Per SERVICE, because airtime, a voucher PIN, a game pack and an internet
  // plan are different products with different codes - and per SUBJECT,
  // because what a map is keyed by differs too: nobody buys "PUBG", they buy
  // "60 UC", so Entertainment is keyed by the pack rather than by an operator.
  // The denomination goes along for a voucher range sold one product per
  // denomination.
  const codeSubject = productCodes.codeSubjectFor(service, raw);
  const codeOptions = { service, denomination: raw.amount };
  let mappedOperatorCode = productCodes.productCodeFor(provider, codeSubject, codeOptions);
  // Dynamic Catalog is the fallback for IIMMPACT. Manual product-code maps
  // remain supported for other providers, but an IIMMPACT order can resolve a
  // live product code from /v2/catalog when no legacy map was entered. This is
  // especially important for PIN, biller and newly-added products whose codes
  // are not known when MySheba is released.
  if (!mappedOperatorCode && provider.authType === 'iimmpactHmac') {
    mappedOperatorCode = await resolveIimmpactCatalogProductCode(provider, service, codeSubject, raw);
  }
  const providerOperatorCode = raw.operatorCode || mappedOperatorCode;
  // A fixed product's amount is the provider's to state. Ours is the
  // customer's SELL price, and sending that buys the wrong thing or is
  // refused - so where the map says what the provider wants, that is what
  // goes, exactly as a resolved catalogue price does.
  const mappedProductAmount = productCodes.productAmountFor(provider, codeSubject, codeOptions);
  const monthName = raw.monthName || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  if (isSuccessTopUpBill && String(raw.country || '').toUpperCase() === 'BD') {
    const category = String(raw.category || '').toLowerCase();
    const billNumber = String(raw.billNumber || raw.accountNumber || '').trim();
    const contactNumber = String(raw.mobileNumber || '').trim();
    if (!billNumber) throw new Error('Bangladesh bill account number is required.');
    if (!/^01\d{9}$/.test(contactNumber)) throw new Error('A valid Bangladesh mobile number is required for bill payment.');
    if (category === 'mobile' && !/^01\d{9}$/.test(billNumber)) throw new Error('A valid Bangladesh postpaid mobile bill number is required.');
  }
  const isSuccessTopUpBd = String(provider.name || '').trim().toLowerCase() === 'success topup' && String(raw.country || '').toUpperCase() === 'BD';
  // packageCostAmount is set by walletService's resolvePackagePricing from the
  // live catalogue. raw.amount is the SELL price and must never reach the
  // provider: /api/recharge checks amount against package_id.
  const packageCost = Number(raw.packageCostAmount);
  //
  // No longer only Success TopUp's: ANY order whose price the server resolved
  // from a catalogue sends the catalogue's own figure. iimmpact's guide says
  // the same thing in its own words - send the selected plan's denomination as
  // the amount - and sending the customer's price instead buys a different
  // product or is refused.
  //
  // packageCostAmount being present is what makes it server-resolved:
  // resolvePackagePricing drops whatever the client sent before setting its
  // own, so there is no client value left for this to trust.
  const providerAmount = providerAmountFor({ raw, payload, isSuccessTopUpBd, mappedAmount: mappedProductAmount });
  // The client's own fields FIRST, so nothing it sends can overwrite a value
  // this server worked out. They used to come last, and last wins:
  //
  //   operator was resolved to the provider's code ("GP") and then overwritten
  //   by the raw name ("Grameenphone"), so Success TopUp answered "Invalid
  //   operator [400]" on every Bangladesh recharge;
  //
  //   amount was set to the catalogue cost and then overwritten by raw.amount,
  //   the SELL price - the exact thing the comment above it says must never
  //   reach the provider, because /api/recharge checks amount against
  //   package_id;
  //
  //   and apiKey/secretKey were overwritable by a client field of the same
  //   name.
  //
  // `phone` is the one value that genuinely comes from raw - it is the number
  // being topped up, not the customer's own - so it says so explicitly rather
  // than relying on the spread to win.
  const vars = { ...Object.fromEntries(Object.entries(raw).filter(([k,v]) => !['requestId'].includes(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')).slice(0,100)), requestId, uid:customer?.uid||'', phone:raw.phone||customer?.phone||'', amount:providerAmount, total:payload?.total??raw.total??'', service, country:raw.country||'', operator:(String(provider.name || '').trim().toLowerCase() === 'success topup' && String(raw.country || '').toUpperCase() === 'BD' ? rechargeOperator : (raw.operator || '')), internetOperator, packageId, billOperator, billNumber:raw.billNumber||raw.accountNumber||'', mobileNumber:raw.mobileNumber||'', monthName, note:raw.note||'', operatorCode:providerOperatorCode, packageCode:raw.packageCode||'', details:payload?.details||'', apiKey:provider.apiKey||'', secretKey:provider.secretKey||'' };
  try {
    let base; try { base = new URL(provider.baseUrl); } catch { throw new Error('Provider URL is invalid.'); }
    if (base.protocol !== 'https:') throw new Error('Provider URL is not allowed.');
    const pinnedAddress = await resolvePublicAddress(base.hostname);
    let endpointPath = String(provider.endpointPath || '/');
    const isBangladeshMobileBill = isSuccessTopUpBill && String(raw.country || '').toUpperCase() === 'BD' && String(raw.category || '').toLowerCase() === 'mobile';
    if (isBangladeshMobileBill) endpointPath = '/api/recharge';
    if (/^https?:\/\//i.test(endpointPath) || endpointPath.startsWith('//')) throw new Error('Endpoint path must be relative to the provider base URL.');
    const url = new URL(endpointPath,base);
    for (const [k,v] of Object.entries(render(asObject(provider.queryTemplate),vars))) {
      if (!/^[A-Za-z0-9_.-]{1,100}$/.test(k)) throw new Error('Provider query parameter name is invalid.');
      if (/^(authorization|proxy-authorization|api[-_]?key|access[-_]?token|auth[-_]?token|token|password|passwd|secret|credential|private[-_]?key)$/i.test(k)) {
        throw new Error('Sensitive credentials must not be sent through provider query parameters.');
      }
      if (v !== '' && v != null) {
        const value = String(v);
        if (value.length > 2000) throw new Error('Provider query parameter value is too large.');
        url.searchParams.set(k, value);
      }
    }
    const method = String(provider.method||'POST').toUpperCase();
    if (!ALLOWED_METHODS.includes(method)) throw new Error('Provider HTTP method is not allowed.');
    if (url.search.length > 8000) throw new Error('Provider query string is too large.');
    const headers = { accept:'application/json', ...render(asObject(provider.headers),vars), ...providerAuth(provider) };
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string' && /[\x00-\x1F\x7F]/.test(value)) throw new Error('Rendered API header contains invalid control characters.');
      if (String(value).length > 4000) throw new Error('Rendered API header value is too large.');
    }
    if (Object.keys(headers).length > 50) throw new Error('Too many rendered API headers.');
    let body;
    if(method!=='GET'){
      headers['content-type']=headers['content-type']||'application/json';
      const requestBody = isBangladeshMobileBill ? {
        number: vars.billNumber,
        type: 'postpaid',
        operator: mobileBillOperator,
        amount: vars.amount,
        trxid: vars.requestId,
        successtopup_key: vars.apiKey,
        successtopup_secret: vars.secretKey,
      } : isSuccessTopUpInternet ? {
        number: vars.phone,
        type: 'prepaid',
        operator: vars.internetOperator,
        amount: vars.amount,
        package_id: vars.packageId,
        trxid: vars.requestId,
        successtopup_key: vars.apiKey,
        successtopup_secret: vars.secretKey,
      } : render(asObject(provider.requestTemplate),vars);
      if (isBangladeshMobileBill && !mobileBillOperator) throw new Error('Success TopUp does not have a supported postpaid mobile operator mapping for this biller.');
      if (isSuccessTopUpInternet && !vars.internetOperator) throw new Error('Success TopUp does not have a supported Bangladesh internet operator mapping.');
      // Plain recharge had no equivalent guard, so an operator the map does not
      // know reached the provider as a display name and was rejected there.
      if (isSuccessTopUpRecharge && !rechargeOperator) throw new Error(`Success TopUp does not support the Bangladesh operator "${String(raw.operator || '').slice(0, 40)}".`);
      // A provider that declares an operator code map is saying it needs codes.
      // Sending the display name instead is not a near miss - "Hotlink" is not
      // a product - so an operator missing from the map is refused here, before
      // the request leaves, where the charge is still cleanly refundable and
      // the message can say which operator to add.
      //
      // Only for an order that NAMES an operator. A bill payment or a
      // remittance has none, and the same provider record can serve those too -
      // guarding on the map alone would refuse every bill the moment somebody
      // filled in recharge codes.
      // `declaresProductCodes` asks whether SOME code was filled in, which is
      // the right question for a provider that may not use codes at all. It is
      // the wrong one for a provider that cannot work without them: with every
      // map still empty it answers false, the guard is skipped, and the order
      // goes out with no product at all - refused by iimmpact with their own
      // wording, for a cause that is entirely ours and that this message
      // already names exactly. An iimmpact order that names an operator always
      // needs a code, filled maps or not.
      const requiresProductCode = provider.authType === 'iimmpactHmac';
      if ((productCodes.declaresProductCodes(provider) || requiresProductCode) && codeSubject && !providerOperatorCode) {
        const field = {
          pinProductCodes: 'PIN product codes',
          gameProductCodes: 'Game product codes',
        }[productCodes.codeFieldFor(service)] || 'Operator product codes';
        throw new Error(`${provider.name || 'This provider'} has no ${service} product code configured for "${codeSubject.slice(0, 40)}". Add it under ${field}.`);
      }
      if (isSuccessTopUpInternet && !vars.packageId) throw new Error('Success TopUp package ID is required for an internet/data-pack purchase.');
      if (isSuccessTopUpPackage && !(Number.isFinite(packageCost) && packageCost > 0)) throw new Error('The package cost price was not resolved on the server; refusing to send a customer-facing price to Success TopUp.');
      if (service === 'Bill Payment' && String(provider.name || '').trim().toLowerCase() === 'success topup' && !billOperator && !isBangladeshMobileBill) throw new Error('Success TopUp does not have a supported bill operator mapping for this biller.');
      body=JSON.stringify(requestBody);
      if(Buffer.byteLength(body,'utf8')>100000) throw new Error('Rendered API request body is too large.');
    }
    // Signed LAST, because the signature covers the body and the query, and
    // neither existed until now. A header template cannot do this, which is
    // why this one auth type is code rather than configuration.
    //
    // It also overwrites rather than defers to a stored header of the same
    // name: a leftover x-signature in a provider's header template would
    // otherwise be sent instead of the real one and fail every call.
    if (provider.authType === 'iimmpactHmac') {
      const signed = signIimmpactRequest({
        apiKey: provider.apiKey,
        secretKey: provider.secretKey,
        method,
        url,
        body,
      });
      // Case-insensitively, because HTTP header names are and a stored
      // `X-Signature` would otherwise ride along beside our `x-signature`.
      const signedNames = new Set(Object.keys(signed));
      for (const existing of Object.keys(headers)) {
        if (signedNames.has(existing.toLowerCase())) delete headers[existing];
      }
      Object.assign(headers, signed);
      if (Object.keys(headers).length > 50) throw new Error('Too many rendered API headers.');
    }
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),Math.max(3000,Math.min(60000,Number(provider.timeoutMs)||15000)));
    // Set before the call, not after: everything that throws above this line
    // failed before the request left us, so no recharge can exist and the
    // charge is always safe to refund. Only once it is sent can an outcome be
    // genuinely unknown.
    requestSent = true;
    let response; try { response=await requestHttpsPinned(url,{method,headers,body,signal:ctl.signal},pinnedAddress); } finally { clearTimeout(timer); }
    const responseText=await response.text();
    if(Buffer.byteLength(responseText,'utf8')>1000000) throw new Error('Provider response is too large.');
    let data={}; try { data=responseText?JSON.parse(responseText):{}; } catch { data={raw:responseText.slice(0,5000)}; }
    if(!response.ok){
      // The body is already parsed here and usually says exactly what is
      // wrong - "Invalid product", "Insufficient balance". Throwing only the
      // status discarded it, which is how a real order came back as
      // "Provider HTTP 400 [400]": a number, twice, and nothing to act on.
      const reason=String(getPath(data,'error.message')||getPath(data,'message')||'').trim().slice(0,300);
      const failure=new Error(reason?`Provider HTTP ${response.status}: ${reason}`:`Provider HTTP ${response.status}`);
      // A 4xx is the provider replying and refusing, so no top-up can have
      // happened and the charge is safe to refund. That used to be decided by
      // matching the message against /^Provider HTTP 4\d{2}$/, which a reason
      // appended to it no longer matches - so the flag carries it instead,
      // which is what the flag is for. Get this wrong and a refused order is
      // filed as 'unknown' and the customer stays charged.
      if(response.status>=400&&response.status<500) failure.providerRejected=true;
      throw failure;
    }
    const outcome = classifyResponse(provider, data);
    const isProcessing = outcome === 'processing';
    if(outcome === 'rejected') {
      // The provider answered and said no. That is a decision, not a doubt, so
      // it carries a flag rather than a phrase: when responseMessagePath is
      // configured this message is the PROVIDER's wording - "Insufficient
      // balance", "Invalid number" - which matches none of the strings the
      // classifier used to look for, so every clear refusal was filed as an
      // uncertain outcome and the customer stayed charged.
      const rejection = new Error(provider.responseMessagePath?String(getPath(data,provider.responseMessagePath)||'Provider rejected the request.'):'Provider rejected the request.');
      rejection.providerRejected = true;
      throw rejection;
    }
    const responseId = provider.responseIdPath ? getPath(data, provider.responseIdPath) : null;
    const responseMessage = provider.responseMessagePath ? getPath(data, provider.responseMessagePath) : null;
    const safeResponseId = responseId == null ? null : (typeof responseId === 'string' || typeof responseId === 'number' || typeof responseId === 'boolean' ? String(responseId).slice(0, 200) : null);
    const safeResponseMessage = responseMessage == null ? null : (typeof responseMessage === 'string' || typeof responseMessage === 'number' || typeof responseMessage === 'boolean' ? String(responseMessage).slice(0, 500) : null);
    const result={providerId:provider.id,providerName:provider.name,responseId:safeResponseId,message:safeResponseMessage,status:isProcessing?'processing':'completed'};
    if (provider.authType === 'iimmpactHmac') {
      // IIMMPACT explicitly recommends matching product, account and amount
      // in addition to refid before accepting a callback. Keep only the
      // non-secret request values needed for that server-side comparison.
      result.requestCheck = {
        product: String(providerOperatorCode || '').slice(0, 100),
        account: String(raw.accountNumber || raw.billNumber || raw.phone || raw.mobileNumber || raw.playerId || '').slice(0, 200),
        amount: Number(providerAmount),
      };
    }
    const secretPath = options.extractPath || (service === 'Recharge PIN' ? provider.responsePinPath : '');
    if (secretPath) { const secret = getPath(data, secretPath); if (typeof secret !== 'string' || !secret.trim() || secret.length > 500) throw new Error('Provider did not return a valid recharge PIN.'); result.secret = secret.trim(); }
    const { secret: _secret, ...safeResult } = result;
    await executionRef.set({status:isProcessing ? 'processing' : 'completed',result:service === 'Recharge PIN' ? { ...safeResult, secret: result.secret } : safeResult,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    return result;
  } catch(e) {
    const rawMessage = String(e?.message || 'Provider execution failed');
    const sanitizedMessage = rawMessage
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
      .replace(/((?:api[-_]?key|access[-_]?token|auth[-_]?token|token|password|passwd|secret|credential|private[-_]?key)\s*[:=]\s*)[^,;\s]+/gi, '$1[REDACTED]')
      .slice(0,500);
    const message = sanitizedMessage || 'Provider execution failed.';
    // Definitive means: no recharge can have happened, so refunding is safe.
    // Two facts decide it - the request never left us, or the provider replied
    // and refused. The string tests stay only as a backstop for paths that
    // predate the flags.
    const definitive=requestSent===false||e?.providerRejected===true
      ||/^Provider HTTP 4\d{2}$/.test(message)||message.includes('Provider rejected the request')
      ||message.includes('missing responsePinPath configuration')||message.includes('Provider did not return a valid recharge PIN.');
    await executionRef.set({status:definitive?'failed':'unknown',message,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    throw definitive?new HttpsError('failed-precondition',message):new HttpsError('unavailable',message);
  }
}
exports.executeConfiguredApi = executeConfiguredApi;

// Pure validation helpers exported for backend unit tests. These do not expose
// provider credentials and do not perform network or Firestore operations.
exports.resolveExecutionMode = resolveExecutionMode;
exports.providersForService = providersForService;
exports.COUNTRY_CODES = COUNTRY_CODES;
exports._test = { isPrivateIp, resolveExecutionMode, pinnedLookup, validateBaseUrl, validateHeaders, validateTemplate, getPath, render, providerAuth, validate, matchesStatus, classifyResponse, providerAmountFor };

exports.testApiProvider = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  await checkVelocity(db, request.auth.uid, 'testApiProvider', { ip: getClientIp(request) });
  const id = cleanString(request.data?.id, 100);
  if (!id) throw new HttpsError('invalid-argument', 'Provider id is required.');
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'API provider not found.');
  const provider = { id, ...(snap.data() || {}) };
  Object.assign(provider, await providerSecretService.getCredentials(provider));
  // Only providers with a known read-only probe can be tested. A generic
  // "send the configured request" test would be a live charge.
  const isSuccessTopUp = String(provider.name || '').trim().toLowerCase() === 'success topup';
  const isIimmpact = provider.authType === 'iimmpactHmac';
  if (!isSuccessTopUp && !isIimmpact) {
    throw new HttpsError('failed-precondition', 'Safe connection testing is available for Success TopUp and iimmpact only.');
  }
  if (!provider.apiKey || !provider.secretKey) throw new HttpsError('failed-precondition', 'API key and API secret are not configured.');

  // GET /v2/balance is the probe iimmpact's own collection recommends for
  // checking API-key authentication: it reads, it costs nothing and it
  // exercises the whole signing path. Signed over an EMPTY body, which still
  // has a hash - the one place a "no body means no body hash" reading of the
  // spec would pass every charge and fail every test, or the reverse.
  const label = isIimmpact ? 'iimmpact' : 'Success TopUp';
  const url = isIimmpact
    ? new URL('/v2/balance', provider.baseUrl)
    : new URL('https://api.successtopup.com/api/drives');
  const method = isIimmpact ? 'GET' : 'POST';
  const body = isIimmpact ? undefined : JSON.stringify({
    operator: 'ALL',
    type: 'regular',
    successtopup_key: provider.apiKey,
    successtopup_secret: provider.secretKey
  });
  try {
    if (isIimmpact && url.protocol !== 'https:') throw new Error('Provider URL is not allowed.');
    await assertPublicHostname(url.hostname);
    const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
    const pinned = addresses.find(a => !isPrivateIp(a.address));
    if (!pinned) throw new Error('Provider hostname resolved to an invalid address.');
    const headers = isIimmpact
      ? { accept: 'application/json', ...signIimmpactRequest({ apiKey: provider.apiKey, secretKey: provider.secretKey, method, url, body }) }
      : { 'content-type': 'application/json', accept: 'application/json' };
    const response = await requestHttpsPinned(url, { method, headers, body }, pinned);
    const responseText = await response.text();
    let data = {};
    try { data = JSON.parse(responseText || '{}'); } catch {}
    if (isIimmpact) {
      if (!response.ok) {
        const reason = String(getPath(data, 'error.message') || getPath(data, 'message') || `HTTP ${response.status}`);
        throw new Error(response.status === 401
          ? `iimmpact refused the credentials: "${reason}". ${iimmpactAuthHint(reason, provider.baseUrl)}`
          // The HTTP status belongs in the message. Without it the only number
          // the screen shows is our own callable's 503, which reads as though
          // iimmpact answered 503 when they never did.
          : `iimmpact rejected the request (HTTP ${response.status}): "${reason}". ${iimmpactRejectionHint(response.status, provider.baseUrl)}`);
      }
      const balance = getPath(data, 'data.balance');
      if (balance == null) throw new Error('iimmpact answered without a balance; the credentials may not be for this environment.');
      return { ok: true, message: `iimmpact credentials are valid. Account balance: ${String(balance).slice(0, 40)}.` };
    }
    if (!response.ok || data.result !== true) {
      throw new Error(String(data.message || 'Success TopUp rejected the credentials.'));
    }
    return { ok: true, message: 'Success TopUp API credentials are valid and the API is reachable.' };
  } catch (e) {
    throw new HttpsError('unavailable', String(e?.message || `Unable to connect to ${label}.`).slice(0, 500));
  }
});

exports.listSuccessTopUpDrives = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const service = String(request.data?.service || 'Internet').trim();
  if (!SUCCESS_TOPUP_PACKAGE_SERVICES.includes(service)) {
    throw new HttpsError('invalid-argument', `Package listings are available for ${SUCCESS_TOPUP_PACKAGE_SERVICES.join(', ')} only.`);
  }
  const snap = await db.collection(COLLECTION)
    .where('service', '==', service)
    .where('name', '==', 'Success TopUp')
    .where('active', '==', true)
    .limit(1)
    .get();
  if (snap.empty) throw unconfiguredError(service);
  const provider = { id: snap.docs[0].id, ...(snap.docs[0].data() || {}) };
  Object.assign(provider, await providerSecretService.getCredentials(provider));
  if (!provider.apiKey || !provider.secretKey) throw new HttpsError('failed-precondition', 'Success TopUp credentials are not configured.');
  const operator = String(request.data?.operator || 'ALL').trim().toUpperCase();
  const type = String(request.data?.type || 'regular').trim().toLowerCase();
  const operatorName = cleanString(request.data?.operatorName, 100);
  if (type === 'drive' && !driveWindow.isDriveWindowOpen()) {
    return { drives: [], driveWindowOpen: false, driveWindowMessage: driveWindow.driveWindowMessage() };
  }
  try {
    const packages = await fetchSuccessTopUpCatalog(provider, operator, type);
    // Superadmin's price is what the customer sees and is charged. The
    // catalogue cost is deliberately NOT returned - the client has no use for
    // it and it is our margin.
    const pricingDoc = await catalog.readPricingDoc(db, operatorName);
    const quote = await customerWalletQuoter(db, request.auth.uid, service, 'BD');
    const drives = packages
      .filter((pkg) => !catalog.isHidden(pkg, pricingDoc))
      .map((pkg) => {
        const price = catalog.sellPriceFor(pkg, pricingDoc);
        return { ...pkg, price, ...(quote(price) || { walletPrice: null, walletCurrency: '' }) };
      });
    return { drives, driveWindowOpen: true, driveWindowMessage: '' };
  } catch (e) {
    throw new HttpsError('unavailable', String(e?.message || 'Unable to load Success TopUp packages.').slice(0, 500));
  }
});

/**
 * What to actually go and check after a 401, given what the provider said.
 *
 * A 401 has three causes and they send you to three different places, so one
 * blanket "check the HMAC secret" is worse than nothing: it sent somebody to
 * re-paste a secret that was fine.
 *
 *   "API key not found"  the key is not recognised AT ALL, which is almost
 *                        never a signing problem. The usual cause is a staging
 *                        key against the production host or the reverse - the
 *                        keys page is on dashboard-staging, and the preset
 *                        points at api.iimmpact.com.
 *   anything else        the key is known and the signature did not verify, so
 *                        the secret is the thing to look at.
 */
function iimmpactAuthHint(reason, baseUrl) {
  const host = (() => { try { return new URL(String(baseUrl || '')).host; } catch { return ''; } })();
  const onStaging = /staging/i.test(host);
  const other = onStaging ? 'https://api.iimmpact.com' : 'https://staging.iimmpact.com';
  if (/key\s*not\s*found|unknown\s*(api\s*)?key|invalid\s*api\s*key/i.test(String(reason || ''))) {
    return `That is the key itself being unrecognised rather than the signature failing, so the secret is probably fine. A key issued for one environment does not work on the other: this provider points at ${host || 'its base URL'}, so try ${other} instead, or get a key for ${host || 'this host'}.`;
  }
  return 'The key is recognised but the signature did not verify, so check that the HMAC secret is the base64 value from the dashboard, copied whole.';
}
exports._test_iimmpactAuthHint = iimmpactAuthHint;

/**
 * What a refusal that is NOT a 401 most likely means.
 *
 * `{"message":"Forbidden"}` with a 403 is the signature of an API gateway
 * turning the call away before iimmpact's own application ever sees it, which
 * is a different problem from a 401: the credentials were not even weighed.
 * The three causes worth naming are a key that is not enabled on the
 * environment being called, a key not attached to a usage plan, and a caller
 * address the account does not permit - the last one matters because Cloud
 * Functions egress from a wide Google range that cannot be allowlisted as a
 * fixed address.
 *
 * Anything else gets no invented explanation, only the status.
 */
function iimmpactRejectionHint(status, baseUrl) {
  const host = (() => { try { return new URL(String(baseUrl || '')).host; } catch { return ''; } })();
  const onStaging = /staging/i.test(host);
  const other = onStaging ? 'https://api.iimmpact.com' : 'https://staging.iimmpact.com';
  if (status === 403) {
    return `A 403 is their gateway refusing the call before the credentials are read, so this is not the secret. This provider points at ${host || 'its base URL'}, and a key from the other dashboard will not work there - try ${other}. Otherwise ask iimmpact whether the key is on a usage plan, and whether the account restricts caller IPs: Cloud Functions have no fixed address to allowlist.`;
  }
  if (status === 404) {
    return `A 404 is the path, not the credentials: the Base URL should have no trailing path, and this endpoint must exist on ${host || 'this host'}.`;
  }
  if (status === 429) return 'That is rate limiting; retry more slowly.';
  if (status >= 500) return 'That is a fault on their side, not a configuration problem here; retry, and tell iimmpact if it persists.';
  return 'Their message above is the whole of what they said.';
}
exports._test_iimmpactRejectionHint = iimmpactRejectionHint;

/**
 * A phone number in the national form a provider expects: digits, leading zero,
 * no country code.
 *
 * iimmpact's own examples are national ("0178855286"), and the number is what
 * the plan list is resolved against - so a number sent in a different shape
 * does not merely fail, it answers for a different subscriber or for none.
 */
const DIAL_CODES = { MY: '60', BD: '880', IN: '91', NP: '977', ID: '62', PK: '92', MM: '95', PH: '63', KH: '855', TH: '66' };
function nationalAccountNumber(phone, country) {
  let digits = String(phone || '').replace(/\D/g, '');
  const dial = DIAL_CODES[String(country || '').toUpperCase()];
  if (dial && digits.startsWith(`00${dial}`)) digits = digits.slice(dial.length + 2);
  else if (dial && digits.startsWith(dial) && digits.length > dial.length + 6) digits = digits.slice(dial.length);
  if (!digits) return '';
  return digits.startsWith('0') ? digits : `0${digits}`;
}
exports.nationalAccountNumber = nationalAccountNumber;

/**
 * The data plans one phone number is eligible for.
 *
 * Unlike listSuccessTopUpDrives this is not a price list: the provider
 * personalises the answer per number, so the request carries the number and the
 * answer is never reused for another one. Nothing is cached.
 *
 * An operator can map to more than one product code - CelcomDigi is Celcom and
 * Digi under one brand while the provider still sells CEL and DI separately -
 * so every code is asked and each plan carries the one that answered for it.
 * A code the number is not on simply returns nothing, which is the provider
 * resolving the ambiguity rather than us guessing at it.
 */
exports.listProviderDataPlans = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const service = String(request.data?.service || 'Internet').trim();
  if (!SUCCESS_TOPUP_PACKAGE_SERVICES.includes(service)) {
    throw new HttpsError('invalid-argument', `Package listings are available for ${SUCCESS_TOPUP_PACKAGE_SERVICES.join(', ')} only.`);
  }
  const country = String(request.data?.country || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpsError('invalid-argument', 'A country is required.');
  const operatorName = cleanString(request.data?.operator, 100);
  if (!operatorName) throw new HttpsError('invalid-argument', 'An operator is required.');

  // The SAME lookup the charge path uses, by calling the same function. Asking
  // the question a second way here is what would let the picker offer a list
  // the charge has never heard of - and `catalog` in this file is the Success
  // TopUp wrapper, which pins the provider name and accepts no country at all.
  const perAccount = await providerCatalog.perAccountCatalogFor(db, service, country, operatorName);
  // IIMMPACT is catalog-driven: when no legacy operator map exists, discover
  // the product codes from the provider's live catalog. This is deliberately
  // not persisted as configuration, so newly enabled operators/products appear
  // without a MySheba release.
  let provider = perAccount?.provider || null;
  let codes = perAccount?.codes || [];
  if (!provider) {
    const candidate = await providerCatalog.readProvider(db, service, { country, strictCountry: true });
    if (candidate && candidate.authType === 'iimmpactHmac' && providerCatalog.dynamicProductDiscoveryFor(candidate)) {
      provider = candidate;
      codes = await discoverIimmpactProductCodes(provider, operatorName, service);
    }
  } else if (!codes.length && provider.authType === 'iimmpactHmac' && providerCatalog.dynamicProductDiscoveryFor(provider)) {
    // A partial operator map must not make an operator look unsupported. Use
    // IIMMPACT's live catalog as a fallback so new/renamed products can still
    // resolve without a MySheba release.
    codes = await discoverIimmpactProductCodes(provider, operatorName, service);
  }
  // Not an error: most country/operator pairs have no per-number catalogue and
  // the screen simply keeps the package list it already had.
  if (!provider || !codes.length) return { plans: [], supported: false };
  if (!provider.apiKey || !provider.secretKey) throw new HttpsError('failed-precondition', 'The package provider is not configured.');

  const account = nationalAccountNumber(request.data?.phone, country);
  if (account.length < 8 || account.length > 15) {
    throw new HttpsError('invalid-argument', 'Please enter a valid mobile number to see the plans available on it.');
  }

  // One outbound call per product code, so this is rate limited like the other
  // provider-touching callables rather than left open to a loop.
  await checkVelocity(db, request.auth.uid, 'listProviderDataPlans', { ip: getClientIp(request) });

  const byId = new Map();
  const failures = [];
  for (const code of codes) {
    try {
      for (const pkg of await fetchProviderCatalog(provider, code, undefined, account)) {
        // First code wins a duplicate id, which keeps the list stable rather
        // than reordering on whichever request came back last.
        if (!byId.has(pkg.id)) byId.set(pkg.id, pkg);
      }
    } catch (error) {
      failures.push(String(error?.message || error));
    }
  }
  // Every code failed and none answered: that is the provider being
  // unreachable, not the number having no plans, and saying the latter would
  // send someone looking for a fault on their own line.
  if (!byId.size && failures.length === codes.length) {
    throw new HttpsError('unavailable', String(failures[0] || 'Unable to load plans for this number.').slice(0, 500));
  }

  const pricingDoc = await catalog.readPricingDoc(db, operatorName);
  const quote = await customerWalletQuoter(db, request.auth.uid, service, country);
  const plans = [...byId.values()]
    .filter((pkg) => !catalog.isHidden(pkg, pricingDoc))
    .map((pkg) => {
      // Superadmin's sell price is what the customer sees and is charged. The
      // catalogue denomination stays on the server: it is what the provider
      // must be sent, and it is our margin.
      const price = catalog.sellPriceFor(pkg, pricingDoc);
      const { price: _denomination, ...rest } = pkg;
      return { ...rest, price, ...(quote(price) || { walletPrice: null, walletCurrency: '' }) };
    });
  return { plans, supported: true };
});

/**
 * The provider's product code for one of our billers.
 *
 * Only the two that iimmpact's own documentation names are built in - TNB,
 * which is the worked example throughout their guide, and JomPAY, which is a
 * product in its own right. Every other biller is for whoever configures the
 * provider to fill in from the product list, because guessing a product code
 * here would mean reading somebody's electricity bill against the wrong utility.
 * A biller with no code gets no presentment, which is one of the provider's own
 * documented non-blocking answers.
 */
// Short-lived provider-catalog metadata cache. Processing time is display-only
// metadata, so it must never become a payment decision or a hardcoded promise.
const IIMMPACT_PROCESSING_TIME_CACHE = new Map();
const IIMMPACT_PROCESSING_TIME_CACHE_MS = 5 * 60 * 1000;

async function iimmpactProcessingTimeForProduct(provider, productCode) {
  if (!provider || provider.authType !== 'iimmpactHmac' || !productCode) return '';
  const key = String(provider.id || provider.name || 'iimmpact') + '|' + String(productCode).trim().toUpperCase();
  const hit = IIMMPACT_PROCESSING_TIME_CACHE.get(key);
  if (hit && Date.now() - hit.at < IIMMPACT_PROCESSING_TIME_CACHE_MS) return hit.value;
  try {
    const url = new URL('/v2/catalog', provider.baseUrl);
    url.searchParams.set('is_active', 'true');
    const { ok, json } = await signedProviderRequest(url, { method: 'GET', headers: { accept: 'application/json' } }, provider);
    if (!ok || !json || typeof json !== 'object') return '';
    const product = json.products && json.products[String(productCode).trim()];
    const value = product && product.processing_time != null
      ? String(product.processing_time).trim().slice(0, 100)
      : '';
    IIMMPACT_PROCESSING_TIME_CACHE.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.warn('IIMMPACT processing-time lookup unavailable', String(error?.message || error).slice(0, 160));
    return '';
  }
}
exports._test_iimmpactProcessingTimeForProduct = iimmpactProcessingTimeForProduct;

const DEFAULT_BILLER_PRODUCT_CODES = { TNB: 'TNB', JomPAY: 'JOMPAY' };
function billerProductCodeFor(provider, billerName) {
  const map = (provider && provider.billerProductCodes && typeof provider.billerProductCodes === 'object')
    ? provider.billerProductCodes
    : DEFAULT_BILLER_PRODUCT_CODES;
  const code = map[String(billerName || '').trim()];
  return typeof code === 'string' ? code.trim() : '';
}
exports._test_billerProductCodeFor = billerProductCodeFor;

/**
 * Read a bill before paying it.
 *
 * Advisory, and deliberately hard to fail with. Of everything this can answer,
 * exactly one outcome stops a payment - the provider saying the account number
 * is not theirs. A biller that does not support presentment, a provider having
 * a bad afternoon, a reply nobody has seen before, a timeout: all of those
 * return "nothing to show, carry on". Never throwing for a provider problem is
 * part of that; a thrown error would surface on the screen as a reason not to
 * pay a bill the customer owes.
 */
exports.getBillPresentment = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const nothing = { status: 'unavailable', blocking: false, message: '', fields: [], outstanding: null };

  const country = String(request.data?.country || '').trim().toUpperCase();
  const billerName = cleanString(request.data?.provider, 100);
  const account = cleanString(request.data?.accountNumber, 100);
  if (!/^[A-Z]{2}$/.test(country) || !billerName || !account) return nothing;

  const provider = await providerCatalog.readProvider(db, 'Bill Payment', { country, strictCountry: true });
  if (!provider || !provider.apiKey || !provider.secretKey) return nothing;
  const productCode = billerProductCodeFor(provider, billerName);
  if (!productCode) return nothing;

  await checkVelocity(db, request.auth.uid, 'getBillPresentment', { ip: getClientIp(request) });

  let url;
  try {
    const path = cleanString(provider.billPresentmentPath, 300) || '/v2/bill-presentment';
    url = new URL(path, provider.baseUrl);
    if (url.protocol !== 'https:') return nothing;
  } catch { return nothing; }
  url.searchParams.set('product', productCode);
  url.searchParams.set('account', account);
  // JomPAY validates the biller code, the amount and - for some billers - Ref-2
  // as well as the account, so they go when we have them. Each is omitted
  // rather than sent empty: an empty biller_code is a different question from
  // no biller_code.
  const billerCode = cleanString(request.data?.billerCode, 40);
  const ref2 = cleanString(request.data?.ref2, 100);
  const amount = Number(request.data?.amount);
  if (billerCode) url.searchParams.set('biller_code', billerCode);
  if (ref2) url.searchParams.set('ref2', ref2);
  if (Number.isFinite(amount) && amount > 0) url.searchParams.set('amount', amount.toFixed(2));

  try {
    const { json } = await signedProviderRequest(url, { method: 'GET', headers: { accept: 'application/json' } }, provider);
    if (json === null) return nothing;
    // Their envelope is `data` on every v2 endpoint; a flat body is read as
    // itself rather than as nothing.
    const body = (json && typeof json.data === 'object' && json.data !== null) ? json.data : json;
    const result = billPresentment.readBillPresentment(body);
    // Bangladesh bill-payment screens show the provider's live catalogue
    // processing_time when the configured IIMMPACT product publishes one.
    // This is advisory metadata only: missing metadata never blocks payment.
    if (country === 'BD' && provider.authType === 'iimmpactHmac') {
      const processingTime = await iimmpactProcessingTimeForProduct(provider, productCode);
      if (processingTime) return { ...result, processingTime };
    }
    return result;
  } catch (error) {
    console.warn('Bill presentment unavailable', String(error?.message || error).slice(0, 200));
    return billPresentment.readBillPresentment({}, { reachable: false });
  }
});

// A status is the same answer for everybody, so asking the provider again for
// each customer who opens the step is waste - and a screen somebody can walk
// back into repeatedly turns that into a lot of waste. Kept in the instance
// rather than in Firestore because it is worth nothing once it is a minute old
// and is not worth a document write.
//
// A stale ok for up to a minute is the cost, and it is the right way round:
// this only ever decides whether to show a sentence, and under-warning for a
// minute is better than the write amplification.
const NETWORK_STATUS_TTL_MS = 60 * 1000;
const NETWORK_STATUS_MAX = 200;
const networkStatusCache = new Map();
function cachedNetworkStatus(key, now) {
  const hit = networkStatusCache.get(key);
  if (!hit || now - hit.at > NETWORK_STATUS_TTL_MS) return null;
  return hit.value;
}
function rememberNetworkStatus(key, value, now) {
  // Bounded, oldest first: an unbounded Map in a long-lived instance is a leak,
  // and the keys are provider product codes so there is no sensible upper limit
  // to rely on.
  if (networkStatusCache.size >= NETWORK_STATUS_MAX) {
    const oldest = networkStatusCache.keys().next();
    if (!oldest.done) networkStatusCache.delete(oldest.value);
  }
  networkStatusCache.set(key, { at: now, value });
}
exports._test_networkStatusCache = { cachedNetworkStatus, rememberNetworkStatus, cache: networkStatusCache, TTL: NETWORK_STATUS_TTL_MS, MAX: NETWORK_STATUS_MAX };

/**
 * Which product code to ask the status of, for one screen's selection.
 *
 * Returns '' when there is nothing unambiguous to ask about, and that is a real
 * answer rather than a gap. CelcomDigi maps to BOTH Celcom and Digi, and the
 * customer's number is on one of them: warning because the other is down would
 * be a false alarm, and talking somebody out of a payment that would have
 * worked is the damage this whole feature can do. So before a plan is chosen
 * an ambiguous operator is simply not asked about, and afterwards the chosen
 * plan says exactly which product it is on.
 *
 * A product code named by the client is honoured only if it is one the operator
 * could legitimately be, so the screen cannot be used to probe arbitrary codes.
 */
function statusProductCodeFor(provider, { service, billerName, operatorName, productCode }) {
  if (service === 'Bill Payment') return billerProductCodeFor(provider, billerName);
  // A recharge is charged against exactly one product, named by the same map
  // the charge itself uses - so there is nothing ambiguous and nothing for the
  // client to name.
  // A charge against exactly one product, named by the same map the charge
  // itself uses - so there is nothing ambiguous and nothing for the client to
  // name. Any code from an operator's voucher range will do here: they all
  // belong to that operator, and this only decides whether to show a sentence.
  if (service === 'Recharge' || service === 'Recharge PIN') {
    return productCodes.anyProductCodeFor(provider, operatorName, service);
  }
  const codes = providerCatalog.productCodesFor(provider, operatorName);
  const named = String(productCode || '').trim();
  if (named) return codes.includes(named) ? named : '';
  return codes.length === 1 ? codes[0] : '';
}
exports._test_statusProductCodeFor = statusProductCodeFor;

/**
 * Whether the biller or operator behind this selection is having problems.
 *
 * Advisory only, and it has no way to say otherwise: the reply carries a status
 * and nothing that could stop a payment. iimmpact's guide is explicit that an
 * interruption must not block the flow, and the damage this can do is the
 * opposite of bill presentment's - a warning shown on a healthy product talks
 * somebody out of paying for no reason. So anything short of an explicit
 * interruption, including an unreachable provider, is silence.
 */
exports.getNetworkStatus = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const silent = { status: 'unknown', notice: '' };

  const service = String(request.data?.service || '').trim();
  if (!ALLOWED_SERVICES.includes(service)) return silent;
  const country = String(request.data?.country || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return silent;

  const provider = await providerCatalog.readProvider(db, service, { country, strictCountry: true });
  if (!provider || !provider.apiKey || !provider.secretKey) return silent;
  const code = statusProductCodeFor(provider, {
    service,
    billerName: cleanString(request.data?.provider, 100),
    operatorName: cleanString(request.data?.operator, 100),
    productCode: cleanString(request.data?.productCode, 40),
  });
  if (!code) return silent;

  const now = Date.now();
  const cacheKey = `${provider.id}|${code}`;
  const cached = cachedNetworkStatus(cacheKey, now);
  if (cached) return cached;

  await checkVelocity(db, request.auth.uid, 'getNetworkStatus', { ip: getClientIp(request) });

  let url;
  try {
    url = new URL(cleanString(provider.networkStatusPath, 300) || '/v2/networkstatus', provider.baseUrl);
    if (url.protocol !== 'https:') return silent;
  } catch { return silent; }
  url.searchParams.set('product', code);

  let result;
  try {
    const { json } = await signedProviderRequest(url, { method: 'GET', headers: { accept: 'application/json' } }, provider);
    const body = (json && typeof json.data === 'object' && json.data !== null) ? json.data : json;
    result = networkStatus.readNetworkStatus(body === null ? {} : body, { reachable: json !== null });
  } catch (error) {
    console.warn('Network status unavailable', String(error?.message || error).slice(0, 200));
    result = networkStatus.readNetworkStatus({}, { reachable: false });
  }

  const answer = { status: result.status, notice: networkStatus.interruptionNotice(result) };
  // Only a definite answer is worth remembering. Caching "unknown" would hold
  // a blip for a minute after the provider came back.
  if (result.status !== 'unknown') rememberNetworkStatus(cacheKey, answer, now);
  return answer;
});

/**
 * Superadmin-only: the provider's own product list, so the code maps can be
 * filled in from the horse's mouth.
 *
 * This exists because nothing else could honestly supply those codes. There are
 * 37 non-Bangladesh operators across the countries the app sells recharge for,
 * iimmpact's documentation names a code for none of them, and a guessed code is
 * a real top-up sent to the wrong product. Reading the list from the provider
 * turns "we do not know the codes" from a blocker into a form to fill in.
 *
 * Read-only, and it charges nothing.
 */
const PRODUCT_LIST_KEYS = {
  code: ['code', 'product_code', 'productCode', 'product', 'id'],
  name: ['name', 'product_name', 'productName', 'description', 'title'],
  category: ['category', 'product_group', 'productGroup', 'group', 'type'],
};
function readProductList(json) {
  const body = json && typeof json === 'object' ? json : {};
  const list = Array.isArray(body) ? body
    : Array.isArray(body.data) ? body.data
      : Array.isArray(body.products) ? body.products
        : Array.isArray(body.data?.products) ? body.data.products : [];
  const out = [];
  for (const item of list.slice(0, 1000)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const pick = (keys) => {
      for (const key of keys) {
        const value = item[key];
        if (value === undefined || value === null || value === '' || typeof value === 'object') continue;
        return String(value).slice(0, 120);
      }
      return '';
    };
    const code = pick(PRODUCT_LIST_KEYS.code);
    if (!code) continue;
    out.push({ code, name: pick(PRODUCT_LIST_KEYS.name), category: pick(PRODUCT_LIST_KEYS.category) });
  }
  // By name, because that is what somebody filling in "Hotlink" is scanning
  // for; the code is what they copy once they have found it.
  return out.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
}
exports._test_readProductList = readProductList;

/**
 * IIMMPACT Dynamic Catalog API.
 *
 * The catalog is the source of truth for product codes, fields and fulfillment.
 * These callables keep IIMMPACT credentials on the server and never expose
 * wholesale pricing to normal users.
 */
async function loadIimmpactProvider(db, id) {
  const providerId = cleanString(id, 100);
  if (!providerId) throw new HttpsError('invalid-argument', 'Provider id is required.');
  const snap = await db.collection(COLLECTION).doc(providerId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'API provider not found.');
  const provider = { id: providerId, ...(snap.data() || {}) };
  const isIimmpact =
    provider.authType === 'iimmpactHmac' ||
    String(provider.name || '').trim().toLowerCase() === 'iimmpact' ||
    String(provider.baseUrl || '').trim().toLowerCase() === 'https://api.iimmpact.com';
  if (!isIimmpact) throw new HttpsError('failed-precondition', 'The selected provider is not configured as an IIMMPACT provider.');
  if (provider.active === false) throw new HttpsError('failed-precondition', 'The IIMMPACT provider is inactive.');
  Object.assign(provider, await providerSecretService.getCredentials(provider));
  if (!provider.apiKey || !provider.secretKey) {
    throw new HttpsError('failed-precondition', 'IIMMPACT API key and HMAC secret are not configured.');
  }
  return provider;
}

function iimmpactUrl(provider, path) {
  let base;
  try { base = new URL(provider.baseUrl); } catch { throw new HttpsError('failed-precondition', 'IIMMPACT base URL is invalid.'); }
  if (base.protocol !== 'https:') throw new HttpsError('failed-precondition', 'IIMMPACT base URL must use HTTPS.');
  const cleanPath = String(path || '').trim();
  if (!cleanPath.startsWith('/') || cleanPath.includes('?') || cleanPath.includes('#')) {
    throw new HttpsError('invalid-argument', 'IIMMPACT API path is invalid.');
  }
  return new URL(cleanPath, base);
}

function publicIimmpactCatalog(catalog) {
  const products = {};
  for (const [code, product] of Object.entries(catalog?.products || {})) {
    if (!product || typeof product !== 'object') continue;
    const { pricing: _pricing, ...safeProduct } = product;
    products[code] = safeProduct;
  }
  return { last_updated: catalog?.last_updated || null, tree: catalog?.tree || { groups: [] }, products };
}

function publicIimmpactOptions(data) {
  const items = Array.isArray(data?.items) ? data.items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const { cost: _cost, has_loss_risk: _loss, ...safe } = item;
    return safe;
  }) : [];
  return {
    product_code: data?.product_code || '',
    field_id: data?.field_id || '',
    items,
    meta: data?.meta || {},
  };
}

exports.getIimmpactCatalog = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  await checkVelocity(db, request.auth.uid, 'getIimmpactCatalog', { ip: getClientIp(request) });
  const provider = await loadIimmpactProvider(db, request.data?.id);
  const url = iimmpactUrl(provider, '/v2/catalog');
  const productCode = cleanString(request.data?.productCode, 100);
  if (productCode) url.searchParams.set('product_code', productCode);
  if (request.data?.includeInactive === true) {
    url.searchParams.set('include_inactive', 'true');
  } else {
    url.searchParams.set('is_active', 'true');
  }

  try {
    const { ok, status, json } = await signedProviderRequest(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    }, provider);
    if (!ok || !json || typeof json !== 'object') {
      const reason = String(getPath(json, 'message') || getPath(json, 'error.message') || `HTTP ${status}`);
      throw new HttpsError('unavailable', `IIMMPACT catalog request failed: ${reason.slice(0, 300)}`);
    }
    return json;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', String(error?.message || 'Unable to load the IIMMPACT catalog.').slice(0, 500));
  }
});

exports.getIimmpactCatalogForUser = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  await checkVelocity(db, request.auth.uid, 'getIimmpactCatalogForUser', { ip: getClientIp(request) });
  let provider;
  const requestedId = cleanString(request.data?.providerId, 100);
  if (requestedId) {
    provider = await loadIimmpactProvider(db, requestedId);
  } else {
    const service = cleanString(request.data?.service, 60) || 'Recharge';
    const country = cleanString(request.data?.country, 2).toUpperCase();
    provider = await providerCatalog.readProvider(db, service, {
      country,
      strictCountry: Boolean(country),
    });
    if (!provider || provider.authType !== 'iimmpactHmac') {
      throw new HttpsError('failed-precondition', 'No active IIMMPACT provider is configured for this service and country.');
    }
  }
  const url = iimmpactUrl(provider, '/v2/catalog');
  try {
    const { ok, status, json } = await signedProviderRequest(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    }, provider);
    if (!ok || !json || typeof json !== 'object') {
      const reason = String(getPath(json, 'message') || getPath(json, 'error.message') || `HTTP ${status}`);
      throw new HttpsError('unavailable', `IIMMPACT catalog request failed: ${reason.slice(0, 300)}`);
    }
    return { providerId: provider.id || '', ...publicIimmpactCatalog(json) };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', String(error?.message || 'Unable to load the IIMMPACT catalog.').slice(0, 500));
  }
});

exports.getIimmpactOptions = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  await checkVelocity(db, request.auth.uid, 'getIimmpactOptions', { ip: getClientIp(request) });
  let provider;
  const requestedId = cleanString(request.data?.providerId, 100);
  if (requestedId) {
    provider = await loadIimmpactProvider(db, requestedId);
  } else {
    const service = cleanString(request.data?.service, 60) || 'Recharge';
    const country = cleanString(request.data?.country, 2).toUpperCase();
    provider = await providerCatalog.readProvider(db, service, {
      country,
      strictCountry: Boolean(country),
    });
    if (!provider || provider.authType !== 'iimmpactHmac') {
      throw new HttpsError('failed-precondition', 'No active IIMMPACT provider is configured for this service and country.');
    }
  }
  const productCode = cleanString(request.data?.productCode, 100);
  const fieldId = cleanString(request.data?.fieldId, 100);
  if (!productCode || !fieldId) throw new HttpsError('invalid-argument', 'productCode and fieldId are required.');

  const page = Math.max(1, Math.min(100000, Number(request.data?.page) || 1));
  const limit = Math.max(1, Math.min(25000, Number(request.data?.limit) || 100));
  const accountNumber = cleanString(request.data?.accountNumber, 200);
  const billerCode = cleanString(request.data?.billerCode, 100);
  const url = iimmpactUrl(provider, '/v2/options');
  url.searchParams.set('product_code', productCode);
  url.searchParams.set('field_id', fieldId);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  if (accountNumber) url.searchParams.set('account_number', accountNumber);
  if (billerCode) url.searchParams.set('biller_code', billerCode);

  try {
    const { ok, status, json } = await signedProviderRequest(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    }, provider);
    if (!ok || !json || typeof json !== 'object') {
      const reason = String(getPath(json, 'message') || getPath(json, 'error.message') || `HTTP ${status}`);
      throw new HttpsError('unavailable', `IIMMPACT options request failed: ${reason.slice(0, 300)}`);
    }
    return publicIimmpactOptions(json);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', String(error?.message || 'Unable to load IIMMPACT options.').slice(0, 500));
  }
});

exports.listProviderProductCodes = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  await checkVelocity(db, request.auth.uid, 'listProviderProductCodes', { ip: getClientIp(request) });
  const id = cleanString(request.data?.id, 100);
  if (!id) throw new HttpsError('invalid-argument', 'Provider id is required.');
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'API provider not found.');
  const provider = { id, ...(snap.data() || {}) };
  Object.assign(provider, await providerSecretService.getCredentials(provider));
  if (!provider.apiKey || !provider.secretKey) throw new HttpsError('failed-precondition', 'This provider has no credentials configured.');

  let url;
  try {
    url = new URL(cleanString(provider.productListPath, 300) || '/v2/product-list', provider.baseUrl);
    if (url.protocol !== 'https:') throw new Error('not https');
  } catch { throw new HttpsError('failed-precondition', 'This provider has no usable base URL.'); }

  try {
    const { ok, status, json } = await signedProviderRequest(url, { method: 'GET', headers: { accept: 'application/json' } }, provider);
    if (!ok) {
      const reason = String(getPath(json, 'error.message') || getPath(json, 'message') || `HTTP ${status}`);
      throw new HttpsError('unavailable', status === 401
        ? `The provider refused the credentials: "${reason}". ${iimmpactAuthHint(reason, provider.baseUrl)}`
        : `The provider answered HTTP ${status}.`);
    }
    const products = readProductList(json);
    if (!products.length) {
      throw new HttpsError('unavailable', 'The provider answered, but no product codes could be read from it.');
    }
    return { products };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', String(error?.message || 'Unable to read the product list.').slice(0, 300));
  }
});

/**
 * Superadmin-only: the catalogue WITH its cost price, so a price can be set
 * against something. Customers get listSuccessTopUpDrives, which never
 * exposes cost.
 */
exports.listSuccessTopUpCatalogForAdmin = onCall({ enforceAppCheck: false }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const service = String(request.data?.service || 'Internet').trim();
  if (!SUCCESS_TOPUP_PACKAGE_SERVICES.includes(service)) {
    throw new HttpsError('invalid-argument', `Package pricing is available for ${SUCCESS_TOPUP_PACKAGE_SERVICES.join(', ')} only.`);
  }
  const provider = await catalog.readProvider(db, service);
  if (!provider) throw unconfiguredError(service);
  if (!provider.apiKey || !provider.secretKey) throw new HttpsError('failed-precondition', 'Success TopUp credentials are not configured.');
  const operator = String(request.data?.operator || 'ALL').trim().toUpperCase();
  const operatorName = cleanString(request.data?.operatorName, 100);
  const type = String(request.data?.type || 'regular').trim().toLowerCase();
  try {
    const packages = await fetchSuccessTopUpCatalog(provider, operator, type);
    const pricingDoc = await catalog.readPricingDoc(db, operatorName);
    return {
      driveWindowOpen: driveWindow.isDriveWindowOpen(),
      driveWindowLabel: driveWindow.DRIVE_WINDOW_LABEL,
      packages: packages.map((pkg) => ({
        ...pkg,
        costPrice: pkg.price,
        sellPrice: catalog.sellPriceFor(pkg, pricingDoc),
        hidden: catalog.isHidden(pkg, pricingDoc),
        overridden: catalog.sellPriceFor(pkg, pricingDoc) !== pkg.price,
      })),
    };
  } catch (e) {
    throw new HttpsError('unavailable', String(e?.message || 'Unable to load the Success TopUp catalogue.').slice(0, 500));
  }
});

exports.listApiProviders = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.collection(COLLECTION).orderBy('priority', 'desc').limit(100).get();
  // Return only non-secret configuration fields. Do not spread the provider
  // document here: custom headers/templates may contain credentials or other
  // sensitive values that should never be sent back to the mobile/admin client.
  return snap.docs.filter((d) => !(String(d.data()?.name || '').trim().toLowerCase() === 'success topup' && SUCCESS_TOPUP_COMPANION_SERVICES.includes(d.data()?.service))).map((d) => {
    const x = d.data() || {};
    return {
      id: d.id,
      service: x.service || '',
      name: x.name || '',
      country: x.country || 'ALL',
      countries: providerReach.providerCountries(x),
      excludedCountries: Array.isArray(x.excludedCountries) ? x.excludedCountries : [],
      baseUrl: x.baseUrl || '',
      endpointPath: x.endpointPath || '/',
      method: x.method || 'POST',
      authType: x.authType || 'none',
      active: x.active !== false,
      priority: Number(x.priority || 0),
      timeoutMs: Number(x.timeoutMs || 15000),
      notes: x.notes || '',
      responseSuccessPath: x.responseSuccessPath || '',
      responseSuccessValue: x.responseSuccessValue || '',
      responseProcessingPath: x.responseProcessingPath || '',
      responseProcessingValue: x.responseProcessingValue || '',
      responseIdPath: x.responseIdPath || '',
      responseMessagePath: x.responseMessagePath || '',
      responsePinPath: x.responsePinPath || '',
      hasApiKey: Boolean(x.apiKeySecretName),
      hasSecretKey: Boolean(x.secretKeySecretName),
      hasUsername: Boolean(x.username),
      hasPassword: Boolean(x.passwordSecretName),
      hasCustomHeaders: Boolean(x.headers && Object.keys(x.headers).length),
      hasQueryTemplate: Boolean(x.queryTemplate && Object.keys(x.queryTemplate).length),
      hasRequestTemplate: Boolean(x.requestTemplate && Object.keys(x.requestTemplate).length),
      // Catalogue configuration: where a provider's product list lives and how
      // to read it. Paths, field mappings and selling hours are configuration,
      // not credentials, so unlike the templates above they come back in full -
      // Superadmin cannot correct a mapping it cannot see. The one exception is
      // catalogRequestTemplate, which follows the same rule as requestTemplate
      // because someone may paste a literal key into it.
      catalogPreset: x.catalogPreset || '',
      catalogPath: x.catalogPath || '',
      catalogMethod: x.catalogMethod || '',
      catalogListPath: x.catalogListPath || '',
      catalogFieldId: x.catalogFieldId || '',
      catalogSuccessPath: x.catalogSuccessPath || '',
      catalogSuccessValue: x.catalogSuccessValue === undefined ? '' : x.catalogSuccessValue,
      catalogTypes: Array.isArray(x.catalogTypes) ? x.catalogTypes : [],
      services: Array.isArray(x.services) && x.services.length ? x.services : [x.service || ''].filter(Boolean),
      catalogItemMap: x.catalogItemMap || null,
      catalogQueryTemplate: x.catalogQueryTemplate || null,
      catalogPerAccount: x.catalogPerAccount === true,
      catalogDynamicProductDiscovery: x.catalogDynamicProductDiscovery === true,
      catalogOperatorCodes: x.catalogOperatorCodes || null,
      billerProductCodes: x.billerProductCodes || null,
      operatorProductCodes: x.operatorProductCodes || null,
      pinProductCodes: x.pinProductCodes || null,
      gameProductCodes: x.gameProductCodes || null,
      billPresentmentPath: x.billPresentmentPath || '',
      networkStatusPath: x.networkStatusPath || '',
      productListPath: x.productListPath || '',
      catalogWindow: x.catalogWindow || null,
      hasCatalogRequestTemplate: Boolean(x.catalogRequestTemplate && Object.keys(x.catalogRequestTemplate).length),
    };
  });
});
/**
 * The Success TopUp floats, for a superadmin only.
 *
 * This is OUR prepaid trading capacity with the provider, not any customer's
 * money, so it is gated server side rather than merely hidden in the UI.
 *
 * Two numbers, not one. From the documentation:
 *
 *   POST /api/balance -> { "result": true, "balance": 0, "driveBalance": 0 }
 *
 * Drive packages are funded from their own float, so drives can fail while
 * the account balance is healthy and the account can be empty while drives
 * still work. Reporting one number would hide exactly the case worth seeing.
 */
exports.getSuccessTopUpBalance = onCall({ enforceAppCheck: false }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);

  const provider = await catalog.readProvider(db, 'Recharge');
  if (!provider) throw unconfiguredError('Recharge');
  Object.assign(provider, await providerSecretService.getCredentials(provider));
  if (!provider.apiKey || !provider.secretKey) {
    throw new HttpsError('failed-precondition', 'Success TopUp credentials are not configured.');
  }

  let body;
  try {
    body = await catalogHttpsRequest(
      new URL('/api/balance', provider.baseUrl || 'https://api.successtopup.com'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          successtopup_key: provider.apiKey,
          successtopup_secret: provider.secretKey,
        }),
      },
      { errorLabel: 'Success TopUp' },
    );
  } catch (e) {
    throw new HttpsError('unavailable', String(e?.message || 'Could not reach Success TopUp.').slice(0, 300));
  }

  // `result` is a JSON boolean here as everywhere else; accept the string form
  // too rather than call a working provider broken over a type.
  if (body && body.result !== undefined && String(body.result) !== 'true') {
    throw new HttpsError('failed-precondition', String(body.message || 'Success TopUp rejected the balance request.').slice(0, 300));
  }

  // Zero is a real balance and the documented example, so an absent number and
  // a zero must not collapse into each other: null means "not reported".
  const read = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  };

  return {
    balance: read(body?.balance),
    driveBalance: read(body?.driveBalance),
    checkedAt: Date.now(),
  };
});

exports.saveApiProvider = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  await checkVelocity(db, request.auth.uid, 'saveApiProvider', { ip: getClientIp(request) });
  const id = cleanString(request.data?.id, 100);
  if (id && !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'Provider id is invalid.');
  const ref = id ? db.collection(COLLECTION).doc(id) : db.collection(COLLECTION).doc();
  const existingSnap = await ref.get();
  const current = existingSnap.exists ? (existingSnap.data() || {}) : {};
  const existingCredentials = existingSnap.exists ? await providerSecretService.getCredentials(current) : {};
  const incoming = { ...(request.data || {}) };

  if (existingSnap.exists) {
    if (!incoming.apiKey || incoming.apiKey === providerSecretService.MASK) incoming.apiKey = existingCredentials.apiKey || '';
    if (!incoming.secretKey || incoming.secretKey === providerSecretService.MASK) incoming.secretKey = existingCredentials.secretKey || '';
    if (!incoming.password || incoming.password === providerSecretService.MASK) incoming.password = existingCredentials.password || '';
    if (!incoming.username) incoming.username = current.username || '';
    if (!Object.keys(incoming.headers || {}).length && current.headers) incoming.headers = current.headers;
    if (!Object.keys(incoming.queryTemplate || {}).length && current.queryTemplate) incoming.queryTemplate = current.queryTemplate;
    if (!Object.keys(incoming.requestTemplate || {}).length && current.requestTemplate) incoming.requestTemplate = current.requestTemplate;
  }

  const data = validate(incoming);
  const secretNames = {
    apiKeySecretName: current.apiKeySecretName || providerSecretService.secretName(ref.id, 'api-key'),
    secretKeySecretName: current.secretKeySecretName || providerSecretService.secretName(ref.id, 'secret-key'),
    passwordSecretName: current.passwordSecretName || providerSecretService.secretName(ref.id, 'password'),
  };

  await providerSecretService.put(secretNames.apiKeySecretName, data.apiKey);
  await providerSecretService.put(secretNames.secretKeySecretName, data.secretKey);
  await providerSecretService.put(secretNames.passwordSecretName, data.password);

  const stored = { ...data };
  delete stored.apiKey;
  delete stored.secretKey;
  delete stored.password;
  stored.apiKeySecretName = data.apiKey || current.apiKeySecretName ? secretNames.apiKeySecretName : '';
  stored.secretKeySecretName = data.secretKey || current.secretKeySecretName ? secretNames.secretKeySecretName : '';
  stored.passwordSecretName = data.password || current.passwordSecretName ? secretNames.passwordSecretName : '';
  stored.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  stored.updatedBy = request.auth.uid;

  let webhookToken = '';
  await db.runTransaction(async (tx) => {
    const callerSnap = await tx.get(db.collection('users').doc(request.auth.uid));
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || caller.role !== 'superadmin' || caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) {
      throw new HttpsError('permission-denied', 'Your account is no longer active.');
    }
    const existing = await tx.get(ref);
    const currentDb = existing.exists ? (existing.data() || {}) : {};
    if (existing.exists) {
      if (!stored.apiKeySecretName && currentDb.apiKeySecretName) stored.apiKeySecretName = currentDb.apiKeySecretName;
      if (!stored.secretKeySecretName && currentDb.secretKeySecretName) stored.secretKeySecretName = currentDb.secretKeySecretName;
      if (!stored.passwordSecretName && currentDb.passwordSecretName) stored.passwordSecretName = currentDb.passwordSecretName;
    }
    // Firestore requires every read in a transaction to happen before the first
    // write. The Success TopUp branch below used to call tx.get after this
    // tx.set, which throws a plain Error - and a plain Error out of a callable
    // reaches the app as "INTERNAL [500]", naming nothing. So the branch's
    // reads are hoisted here, above every write in this transaction.
    const isSuccessTopUpSetup = data.name === 'Success TopUp' && data.service === 'Recharge';
    const webhookRef = isSuccessTopUpSetup ? db.collection('api_webhooks').doc(ref.id) : null;
    // Settings are read for EVERY save now, not just Success TopUp's, because
    // autoCountryModes below needs to know what is already set before it fills
    // anything in - and this is the last point at which a read is allowed.
    const settingsRef = db.doc(SETTINGS);
    const [webhookSnap, settingsSnap] = await Promise.all([
      webhookRef ? tx.get(webhookRef) : Promise.resolve(null),
      tx.get(settingsRef),
    ]);

    tx.set(ref, stored, { merge: false });

    if (isSuccessTopUpSetup) {
      const oldHook = webhookSnap.exists ? (webhookSnap.data() || {}) : {};
      const oldSettings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
      webhookToken = oldHook.webhookToken || crypto.randomBytes(32).toString('hex');
      tx.set(webhookRef, {
        providerId: ref.id, enabled: true, authHeader: 'x-webhook-token', webhookToken,
        transactionIdPath: 'transactionId', statusPath: 'status', messagePath: 'comment',
        successStatus: 'Success', processingStatus: 'Processing', cancelStatus: 'Cancel',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid
      }, { merge: false });
      // Success TopUp serves Bangladesh, so saving it enables the API for
      // Bangladesh and nothing else. This used to flip the service-wide
      // default to 'api', which also routed Malaysian and Singaporean orders
      // down a path with no provider behind them: the dispatch failed, and the
      // customer was told the outcome was uncertain on an already-debited
      // wallet instead of the order reaching a dealer.
      const priorCountryModes = readCountryModes(oldSettings.countryModes);
      tx.set(settingsRef, {
        modes: { ...DEFAULT_MODES, ...(oldSettings.modes || {}) },
        countryModes: {
          ...priorCountryModes,
          BD: { ...(priorCountryModes.BD || {}), Recharge: 'api', Internet: 'api', 'Offer Packs': 'api', Entertainment: 'api', 'Bill Payment': 'api' },
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid
      }, { merge: true });

      // Companions. Superadmin configures ONE Success TopUp provider (Recharge);
      // these carry the same credentials for the other services, because
      // executeConfiguredApi selects a provider by service. They are hidden
      // from listApiProviders and must never be edited by hand - re-saving the
      // Recharge provider rewrites them.
      //
      // Internet, Offer Packs and Entertainment are one transaction to Success
      // TopUp: POST /api/recharge with the chosen package_id. They differ only
      // in which /api/drives catalogue they read, which is a listing argument,
      // not a different endpoint - so they share one request template.
      //
      // Credentials are referenced by Secret Manager name, never written into
      // the provider document. That is the whole point of this branch, and it
      // applies to the companions as much as the provider the superadmin edits.
      const packageTemplate = {
        number: '{{phone}}', type: 'prepaid', operator: '{{internetOperator}}',
        amount: '{{amount}}', package_id: '{{packageId}}', trxid: '{{requestId}}',
        successtopup_key: '{{apiKey}}', successtopup_secret: '{{secretKey}}'
      };
      const companionBase = {
        name: 'Success TopUp', country: 'BD', baseUrl: 'https://api.successtopup.com',
        method: 'POST', authType: 'none', headers: {}, queryTemplate: {},
        responseSuccessPath: 'result', responseSuccessValue: 'true',
        responseProcessingPath: '', responseProcessingValue: '', responseIdPath: '', responseMessagePath: 'message',
        apiKeySecretName: secretNames.apiKeySecretName, secretKeySecretName: secretNames.secretKeySecretName,
        active: data.active !== false, priority: 9999, timeoutMs: data.timeoutMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid
      };
      const companions = [
        { id: 'success-topup-internet', service: 'Internet', endpointPath: '/api/recharge', requestTemplate: packageTemplate, notes: 'Fixed Success TopUp Bangladesh internet/data-pack integration.' },
        { id: 'success-topup-offer-packs', service: 'Offer Packs', endpointPath: '/api/recharge', requestTemplate: packageTemplate, notes: 'Fixed Success TopUp Bangladesh drive/offer-pack integration.' },
        { id: 'success-topup-entertainment', service: 'Entertainment', endpointPath: '/api/recharge', requestTemplate: packageTemplate, notes: 'Fixed Success TopUp Bangladesh entertainment-package integration.' },
        { id: 'success-topup-bill-payment', service: 'Bill Payment', endpointPath: '/api/bill-pay', notes: 'Fixed Success TopUp Bangladesh bill-payment integration.', requestTemplate: {
          billOperator: '{{billOperator}}', billNumber: '{{billNumber}}', billAmount: '{{amount}}',
          mobileNumber: '{{mobileNumber}}', monthName: '{{monthName}}', note: '{{note}}', trxid: '{{requestId}}',
          successtopup_key: '{{apiKey}}', successtopup_secret: '{{secretKey}}'
        } },
      ];
      for (const companion of companions) {
        tx.set(db.collection(COLLECTION).doc(companion.id), {
          ...companionBase,
          service: companion.service,
          endpointPath: companion.endpointPath,
          requestTemplate: companion.requestTemplate,
          notes: companion.notes
        }, { merge: false });
      }
    } else {
      // Every other provider gets the same courtesy Success TopUp has always
      // had for Bangladesh, for the countries this one actually serves. Not
      // folded into the branch above: Success TopUp's block also enables the
      // four companion services, which are separate documents this provider's
      // own `services` array knows nothing about.
      const oldSettings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
      const nextCountryModes = autoCountryModes(stored, readCountryModes(oldSettings.countryModes));
      if (nextCountryModes) {
        tx.set(settingsRef, {
          modes: { ...DEFAULT_MODES, ...(oldSettings.modes || {}) },
          countryModes: nextCountryModes,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid
        }, { merge: true });
      }
    }
  });

  if (data.name === 'Success TopUp' && data.service === 'Recharge') {
    return {
      id: ref.id, successTopUp: true,
      webhookToken,
      webhookUrl: webhookEndpointUrl(ref.id)
    };
  }
  return { id: ref.id, successTopUp: false };
});
exports.deleteApiProvider = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  await checkVelocity(db, request.auth.uid, 'deleteApiProvider', { ip: getClientIp(request) });
  const id = cleanString(request.data?.id, 100);
  if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'Provider id is invalid.');
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Provider not found.');
  const data = snap.data() || {};
  await db.runTransaction(async (tx) => {
    const callerSnap = await tx.get(db.collection('users').doc(request.auth.uid));
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || caller.role !== 'superadmin' || caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) {
      throw new HttpsError('permission-denied', 'Your account is no longer active.');
    }
    tx.delete(ref);
  });
  await providerSecretService.cleanupUnreferenced(db, {
    apiKeySecretName: data.apiKeySecretName,
    secretKeySecretName: data.secretKeySecretName,
    passwordSecretName: data.passwordSecretName,
  });
  return { ok: true };
});

exports.migrateApiProviderSecrets = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  await checkVelocity(db, request.auth.uid, 'migrateApiProviderSecrets', { ip: getClientIp(request) });
  let migrated = 0;
  let lastDoc = null;
  do {
    let query = db.collection(COLLECTION).orderBy(admin.firestore.FieldPath.documentId()).limit(100);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    for (const doc of snap.docs) {
      if (await providerSecretService.migrateDocument(doc)) migrated += 1;
    }
    lastDoc = snap.docs[snap.docs.length - 1] || null;
    if (snap.size < 100) break;
  } while (lastDoc);
  return { migrated };
});

/**
 * Only known countries and known services survive a read or a write, so a
 * stale or hand-edited document cannot smuggle an extra row into the matrix
 * that the admin screen will never show and nobody will ever notice.
 */
function readCountryModes(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const code of COUNTRY_CODES) {
    const row = raw[code];
    if (!row || typeof row !== 'object') continue;
    const clean = {};
    for (const service of ALLOWED_SERVICES) {
      if (isNonApiService(service)) continue;
      if (row[service] === 'api' || row[service] === 'legacy') clean[service] = row[service];
    }
    if (Object.keys(clean).length) out[code] = clean;
  }
  return out;
}

exports.getServiceApiSettings = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.doc(SETTINGS).get();
  const stored = snap.exists ? (snap.data() || {}) : {};
  const modes = { ...DEFAULT_MODES, ...(stored.modes || {}) };
  // A document written before these were fixed could still say 'api'. The
  // charge path ignores it either way; showing it would be a lie.
  for (const service of NON_API_SERVICES) modes[service] = 'legacy';
  return {
    modes,
    countryModes: readCountryModes(stored.countryModes),
    countries: COUNTRY_CODES,
    services: ALLOWED_SERVICES,
    nonApiServices: NON_API_SERVICES,
  };
});
exports.saveServiceApiSettings = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const incoming = request.data?.modes || {};
  const modes = { ...DEFAULT_MODES };
  for (const service of ALLOWED_SERVICES) {
    if (isNonApiService(service)) continue;
    const mode = incoming[service];
    if (mode === 'api' || mode === 'legacy') modes[service] = mode;
  }
  const countryModes = readCountryModes(request.data?.countryModes);
  await db.runTransaction(async (tx) => {
    const callerSnap = await tx.get(db.collection('users').doc(request.auth.uid));
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || caller.role !== 'superadmin' || caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) {
      throw new HttpsError('permission-denied', 'Your account is no longer active.');
    }
    tx.set(db.doc(SETTINGS), { modes, countryModes, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  });
  return { modes, countryModes };
});