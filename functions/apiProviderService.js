const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const dns = require('dns').promises;
const https = require('https');
const crypto = require('crypto');
const providerSecretService = require('./providerSecretService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const catalog = require('./successTopUpCatalog');
const providerCatalog = require('./providerCatalog');
const driveWindow = require('./successTopUpWindow');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const COLLECTION = 'api_providers';
const SETTINGS = 'api_settings/service_modes';
const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Offer Packs', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment', 'Recharge PIN'];
const ALLOWED_AUTH = ['none', 'apiKey', 'bearer', 'basic'];
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH'];
const ALLOWED_COUNTRIES = ['ALL', 'BD', 'MY', 'SG', 'ID', 'IN', 'PH'];
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
  const code = String(country || '').trim().toUpperCase();
  const perCountry = settings?.countryModes?.[code]?.[service];
  const intent = (perCountry === 'api' || perCountry === 'legacy')
    ? perCountry
    : (settings?.modes?.[service] === 'api' ? 'api' : 'legacy');
  if (intent !== 'api') return 'legacy';
  const served = (providers || []).some((p) => {
    if (!p || p.active === false) return false;
    const reach = String(p.country || 'ALL').trim().toUpperCase();
    return reach === code || reach === 'ALL';
  });
  return served ? 'api' : 'legacy';
}

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

function requestHttpsPinned(url, options, pinnedAddress) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method,
      headers: options.headers,
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
    catalogSuccessPath: cleanString(data.catalogSuccessPath, 200),
    catalogErrorLabel: cleanString(data.catalogErrorLabel, 100),
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
  if (data.catalogWindow !== undefined && data.catalogWindow !== null) {
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
  let country = cleanString(data.country, 10).toUpperCase() || 'ALL';
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
  if (service === 'Recharge PIN' && !cleanString(data.responsePinPath, 200)) throw new HttpsError('invalid-argument', 'Recharge PIN providers must define Response PIN Path.');
  validateBaseUrl(baseUrl);
  if (!ALLOWED_AUTH.includes(authType)) throw new HttpsError('invalid-argument', 'Invalid authentication type.');
  if (successTopUp && (!apiKey || !secretKey)) throw new HttpsError('invalid-argument', 'Success TopUp API key and API secret are required.');
  if ((authType === 'apiKey' || authType === 'bearer') && !apiKey) throw new HttpsError('invalid-argument', 'API key is required for this authentication type.');
  if (authType === 'basic' && (!cleanString(data.username, 200) || !cleanString(data.password, 1000))) throw new HttpsError('invalid-argument', 'Username and password are required for Basic authentication.');
  if (!ALLOWED_METHODS.includes(method)) throw new HttpsError('invalid-argument', 'Invalid HTTP method.');
  return {
    service, services, name, country, baseUrl, endpointPath, method, authType, apiKey, secretKey,
    username: cleanString(data.username, 200), password: cleanString(data.password, 1000),
    active: data.active !== false, priority: Math.max(0, Math.min(9999, Number(priority) || 0)),
    timeoutMs: Math.max(3000, Math.min(60000, Number(data.timeoutMs) || 15000)), notes: cleanString(data.notes, 1000),
    headers: validateHeaders(headers), queryTemplate: validateTemplate(queryTemplate, 'Query template'),
    requestTemplate: validateTemplate(requestTemplate, 'Request template'),
    responseSuccessPath, responseSuccessValue, responseProcessingPath, responseProcessingValue,
    responseIdPath, responseMessagePath, responsePinPath: service === 'Recharge PIN' ? cleanString(data.responsePinPath, 200) : '',
    ...validateCatalog(data),
  };
}

function asObject(value) { if (value && typeof value === 'object' && !Array.isArray(value)) return value; if (typeof value !== 'string') return {}; try { const x = JSON.parse(value); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } }
function getPath(obj, path) { return path ? path.split('.').reduce((v,k) => v == null ? undefined : v[k], obj) : undefined; }
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
async function catalogHttpsRequest(url, init, config) {
  await assertPublicHostname(url.hostname);
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  const pinned = addresses.find((a) => !isPrivateIp(a.address));
  if (!pinned) throw new Error('Provider hostname resolved to an invalid address.');
  const response = await requestHttpsPinned(url, init, pinned);
  const text = await response.text();
  if (!response.ok) throw new Error(`${config.errorLabel} catalogue request failed.`);
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new Error(`${config.errorLabel} returned invalid catalogue data.`);
  }
}

/** Fetch any provider's catalogue, normalised. */
function fetchProviderCatalog(provider, operator, type) {
  return providerCatalog.fetchCatalog(provider, { operator, type }, { request: catalogHttpsRequest });
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

async function executeConfiguredApi(service, payload, customer, requestId, options = {}) {
  const db = admin.firestore();
  const allProvidersRaw = await providersForService(db, service);
  const requestedCountry = String(payload?.raw?.country || '').trim().toUpperCase() || 'ALL';
  const allProviders = allProvidersRaw;
  const countryProviders = allProviders.filter((p) => String(p.country || 'ALL').toUpperCase() === requestedCountry);
  const globalProviders = allProviders.filter((p) => String(p.country || 'ALL').toUpperCase() === 'ALL');
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
  const providerAmount = isSuccessTopUpBd
    ? (Number.isFinite(packageCost) && packageCost > 0 ? packageCost : (raw.amount ?? payload?.amount ?? ''))
    : (payload?.amount ?? raw.amount ?? '');
  const vars = { requestId, uid:customer?.uid||'', phone:customer?.phone||'', amount:providerAmount, total:payload?.total??raw.total??'', service, country:raw.country||'', operator:(String(provider.name || '').trim().toLowerCase() === 'success topup' && String(raw.country || '').toUpperCase() === 'BD' ? rechargeOperator : (raw.operator || '')), internetOperator, packageId, billOperator, billNumber:raw.billNumber||raw.accountNumber||'', mobileNumber:raw.mobileNumber||'', monthName, note:raw.note||'', packageCode:raw.packageCode||'', details:payload?.details||'', apiKey:provider.apiKey||'', secretKey:provider.secretKey||'', ...Object.fromEntries(Object.entries(raw).filter(([k,v]) => !['requestId'].includes(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')).slice(0,100)) };
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
      if (isSuccessTopUpInternet && !vars.packageId) throw new Error('Success TopUp package ID is required for an internet/data-pack purchase.');
      if (isSuccessTopUpPackage && !(Number.isFinite(packageCost) && packageCost > 0)) throw new Error('The package cost price was not resolved on the server; refusing to send a customer-facing price to Success TopUp.');
      if (service === 'Bill Payment' && String(provider.name || '').trim().toLowerCase() === 'success topup' && !billOperator && !isBangladeshMobileBill) throw new Error('Success TopUp does not have a supported bill operator mapping for this biller.');
      body=JSON.stringify(requestBody);
      if(Buffer.byteLength(body,'utf8')>100000) throw new Error('Rendered API request body is too large.');
    }
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),Math.max(3000,Math.min(60000,Number(provider.timeoutMs)||15000)));
    let response; try { response=await requestHttpsPinned(url,{method,headers,body,signal:ctl.signal},pinnedAddress); } finally { clearTimeout(timer); }
    const responseText=await response.text();
    if(Buffer.byteLength(responseText,'utf8')>1000000) throw new Error('Provider response is too large.');
    let data={}; try { data=responseText?JSON.parse(responseText):{}; } catch { data={raw:responseText.slice(0,5000)}; }
    if(!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    const success=provider.responseSuccessPath?getPath(data,provider.responseSuccessPath):true;
    if(success===false || (provider.responseSuccessValue && String(success)!==String(provider.responseSuccessValue))) throw new Error(provider.responseMessagePath?String(getPath(data,provider.responseMessagePath)||'Provider rejected the request.'):'Provider rejected the request.');
    const responseId = provider.responseIdPath ? getPath(data, provider.responseIdPath) : null;
    const responseMessage = provider.responseMessagePath ? getPath(data, provider.responseMessagePath) : null;
    const isProcessing = Boolean(provider.responseProcessingPath && provider.responseProcessingValue && String(getPath(data, provider.responseProcessingPath)) === String(provider.responseProcessingValue));
    const safeResponseId = responseId == null ? null : (typeof responseId === 'string' || typeof responseId === 'number' || typeof responseId === 'boolean' ? String(responseId).slice(0, 200) : null);
    const safeResponseMessage = responseMessage == null ? null : (typeof responseMessage === 'string' || typeof responseMessage === 'number' || typeof responseMessage === 'boolean' ? String(responseMessage).slice(0, 500) : null);
    const result={providerId:provider.id,providerName:provider.name,responseId:safeResponseId,message:safeResponseMessage,status:isProcessing?'processing':'completed'};
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
    const definitive=/^Provider HTTP 4\d{2}$/.test(message)||message.includes('Provider rejected the request')||message.includes('missing responsePinPath configuration')||message.includes('Provider did not return a valid recharge PIN.');
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
exports._test = { isPrivateIp, resolveExecutionMode, pinnedLookup, validateBaseUrl, validateHeaders, validateTemplate, getPath, render, providerAuth, validate };

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
  if (String(provider.name || '').trim().toLowerCase() !== 'success topup') {
    throw new HttpsError('failed-precondition', 'Safe connection testing is currently available for Success TopUp only.');
  }
  if (!provider.apiKey || !provider.secretKey) throw new HttpsError('failed-precondition', 'API key and API secret are not configured.');
  const url = new URL('https://api.successtopup.com/api/drives');
  const body = JSON.stringify({
    operator: 'ALL',
    type: 'regular',
    successtopup_key: provider.apiKey,
    successtopup_secret: provider.secretKey
  });
  try {
    await assertPublicHostname(url.hostname);
    const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
    const pinned = addresses.find(a => !isPrivateIp(a.address));
    if (!pinned) throw new Error('Provider hostname resolved to an invalid address.');
    const response = await requestHttpsPinned(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body
    }, pinned);
    const responseText = await response.text();
    let data = {};
    try { data = JSON.parse(responseText || '{}'); } catch {}
    if (!response.ok || data.result !== true) {
      throw new Error(String(data.message || 'Success TopUp rejected the credentials.'));
    }
    return { ok: true, message: 'Success TopUp API credentials are valid and the API is reachable.' };
  } catch (e) {
    throw new HttpsError('unavailable', String(e?.message || 'Unable to connect to Success TopUp.').slice(0, 500));
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
    const drives = packages
      .filter((pkg) => !catalog.isHidden(pkg, pricingDoc))
      .map((pkg) => ({ ...pkg, price: catalog.sellPriceFor(pkg, pricingDoc) }));
    return { drives, driveWindowOpen: true, driveWindowMessage: '' };
  } catch (e) {
    throw new HttpsError('unavailable', String(e?.message || 'Unable to load Success TopUp packages.').slice(0, 500));
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
      catalogSuccessPath: x.catalogSuccessPath || '',
      catalogSuccessValue: x.catalogSuccessValue === undefined ? '' : x.catalogSuccessValue,
      catalogTypes: Array.isArray(x.catalogTypes) ? x.catalogTypes : [],
      services: Array.isArray(x.services) && x.services.length ? x.services : [x.service || ''].filter(Boolean),
      catalogItemMap: x.catalogItemMap || null,
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
    const settingsRef = isSuccessTopUpSetup ? db.doc(SETTINGS) : null;
    const [webhookSnap, settingsSnap] = isSuccessTopUpSetup
      ? await Promise.all([tx.get(webhookRef), tx.get(settingsRef)])
      : [null, null];

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
    }
  });

  if (data.name === 'Success TopUp' && data.service === 'Recharge') {
    return {
      id: ref.id, successTopUp: true,
      webhookToken,
      webhookUrl: 'https://us-central1-satulink-solutions.cloudfunctions.net/apiWebhook?providerId=' + encodeURIComponent(ref.id)
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
  return {
    modes: { ...DEFAULT_MODES, ...(stored.modes || {}) },
    countryModes: readCountryModes(stored.countryModes),
    countries: COUNTRY_CODES,
    services: ALLOWED_SERVICES,
  };
});
exports.saveServiceApiSettings = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const incoming = request.data?.modes || {};
  const modes = { ...DEFAULT_MODES };
  for (const service of ALLOWED_SERVICES) {
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