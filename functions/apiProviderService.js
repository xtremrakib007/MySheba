const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const dns = require('dns').promises;
const https = require('https');
const crypto = require('crypto');
const providerSecretService = require('./providerSecretService');

const COLLECTION = 'api_providers';
const SETTINGS = 'api_settings/service_modes';
const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment', 'Recharge PIN'];
const ALLOWED_AUTH = ['none', 'apiKey', 'bearer', 'basic'];
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH'];
const ALLOWED_COUNTRIES = ['ALL', 'BD', 'MY', 'SG', 'ID', 'IN', 'PH'];
const DEFAULT_MODES = Object.fromEntries(ALLOWED_SERVICES.map((service) => [service, 'legacy']));

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
function requestHttpsPinned(url, options, pinnedAddress) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method,
      headers: options.headers,
      signal: options.signal,
      // Pin the already-validated DNS result for this request. TLS still uses
      // the original hostname, so certificate/SNI validation is preserved.
      lookup: (_hostname, _opts, callback) => callback(null, pinnedAddress.address, pinnedAddress.family),
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
    if (typeof v === 'string' && /[\\u0000-\\u001F\\u007F]/.test(v)) throw new HttpsError('invalid-argument', 'API header values contain invalid control characters.');
  }
  return headers;
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

  const successTopUp = ['Recharge', 'Internet', 'Bill Payment'].includes(service) && name.toLowerCase() === 'success topup';
  const successTopUpBill = service === 'Bill Payment' && successTopUp;
  const successTopUpInternet = service === 'Internet' && successTopUp;
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
    service, name, country, baseUrl, endpointPath, method, authType, apiKey, secretKey,
    username: cleanString(data.username, 200), password: cleanString(data.password, 1000),
    active: data.active !== false, priority: Math.max(0, Math.min(9999, Number(data.priority) || 0)),
    timeoutMs: Math.max(3000, Math.min(60000, Number(data.timeoutMs) || 15000)), notes: cleanString(data.notes, 1000),
    headers: validateHeaders(headers), queryTemplate: validateTemplate(queryTemplate, 'Query template'),
    requestTemplate: validateTemplate(requestTemplate, 'Request template'),
    responseSuccessPath, responseSuccessValue, responseProcessingPath, responseProcessingValue,
    responseIdPath, responseMessagePath, responsePinPath: service === 'Recharge PIN' ? cleanString(data.responsePinPath, 200) : ''
  };
}

function asObject(value) { if (value && typeof value === 'object' && !Array.isArray(value)) return value; if (typeof value !== 'string') return {}; try { const x = JSON.parse(value); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } }
function getPath(obj, path) { return path ? path.split('.').reduce((v,k) => v == null ? undefined : v[k], obj) : undefined; }
function render(v, vars) {
  if (typeof v === 'string') return v.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k) => vars[k] == null ? '' : String(vars[k]));
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
const SUCCESS_TOPUP_MOBILE_OPERATORS = { Grameenphone: 'GP', Robi: 'RB', Banglalink: 'BL' };
const SUCCESS_TOPUP_INTERNET_OPERATORS = { Grameenphone: 'GP', Robi: 'RB', Banglalink: 'BL', Airtel: 'AT', Teletalk: 'TT', Skitto: 'SK', 'Brilliant Connect': 'BT', Ryze: 'RY' };

async function executeConfiguredApi(service, payload, customer, requestId, options = {}) {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).where('service','==',service).where('active','==',true).get();
  const requestedCountry = String(payload?.raw?.country || '').trim().toUpperCase() || 'ALL';
  const allProviders = snap.docs.map(d => ({ id:d.id, ...d.data() }));
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
  const isSuccessTopUpInternet = service === 'Internet' && String(provider.name || '').trim().toLowerCase() === 'success topup' && String(raw.country || '').toUpperCase() === 'BD';
  const billOperator = raw.billOperator || SUCCESS_TOPUP_BILL_OPERATORS[String(raw.provider || '').trim()] || '';
  const internetOperator = raw.operatorCode || SUCCESS_TOPUP_INTERNET_OPERATORS[String(raw.operator || '').trim()] || '';
  const packageId = raw.packageId || raw.package_id || '';
  const mobileBillOperator = SUCCESS_TOPUP_MOBILE_OPERATORS[String(raw.provider || '').trim()] || '';
  const rechargeOperator = SUCCESS_TOPUP_MOBILE_OPERATORS[String(raw.operator || '').trim()] || String(raw.operator || '').trim();
  const monthName = raw.monthName || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  if (isSuccessTopUpBill && String(raw.country || '').toUpperCase() === 'BD') {
    const category = String(raw.category || '').toLowerCase();
    const billNumber = String(raw.billNumber || raw.accountNumber || '').trim();
    const contactNumber = String(raw.mobileNumber || '').trim();
    if (!billNumber) throw new Error('Bangladesh bill account number is required.');
    if (!/^01\d{9}$/.test(contactNumber)) throw new Error('A valid Bangladesh mobile number is required for bill payment.');
    if (category === 'mobile' && !/^01\d{9}$/.test(billNumber)) throw new Error('A valid Bangladesh postpaid mobile bill number is required.');
  }
  const providerAmount = (String(provider.name || '').trim().toLowerCase() === 'success topup' && String(raw.country || '').toUpperCase() === 'BD') ? (raw.amount ?? payload?.amount ?? '') : (payload?.amount ?? raw.amount ?? '');
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
      if (typeof value === 'string' && /[\\u0000-\\u001F\\u007F]/.test(value)) throw new Error('Rendered API header contains invalid control characters.');
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
      if (isSuccessTopUpInternet && !vars.packageId) throw new Error('Success TopUp package ID is required for an internet/data-pack purchase.');
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
      .replace(/Bearer\\s+[A-Za-z0-9._~+\\/-]+/gi, 'Bearer [REDACTED]')
      .replace(/Basic\\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
      .replace(/((?:api[-_]?key|access[-_]?token|auth[-_]?token|token|password|passwd|secret|credential|private[-_]?key)\\s*[:=]\\s*)[^,;\\s]+/gi, '$1[REDACTED]')
      .slice(0,500);
    const message = sanitizedMessage || 'Provider execution failed.';
    const definitive=/^Provider HTTP 4\\d{2}$/.test(message)||message.includes('Provider rejected the request')||message.includes('missing responsePinPath configuration')||message.includes('Provider did not return a valid recharge PIN.');
    await executionRef.set({status:definitive?'failed':'unknown',message,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    throw definitive?new HttpsError('failed-precondition',message):new HttpsError('unavailable',message);
  }
}
exports.executeConfiguredApi = executeConfiguredApi;

// Pure validation helpers exported for backend unit tests. These do not expose
// provider credentials and do not perform network or Firestore operations.
exports._test = { isPrivateIp, validateBaseUrl, validateHeaders, validateTemplate, getPath, render, providerAuth, validate };

exports.testApiProvider = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
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

exports.listSuccessTopUpDrives = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const snap = await db.collection(COLLECTION)
    .where('service', '==', 'Internet')
    .where('name', '==', 'Success TopUp')
    .where('active', '==', true)
    .limit(1)
    .get();
  if (snap.empty) throw new HttpsError('failed-precondition', 'Success TopUp Internet API is not configured.');
  const provider = { id: snap.docs[0].id, ...(snap.docs[0].data() || {}) };
  Object.assign(provider, await providerSecretService.getCredentials(provider));
  if (!provider.apiKey || !provider.secretKey) throw new HttpsError('failed-precondition', 'Success TopUp credentials are not configured.');
  const url = new URL('https://api.successtopup.com/api/drives');
  const operator = String(request.data?.operator || 'ALL').trim().toUpperCase();
  const type = String(request.data?.type || 'regular').trim().toLowerCase();
  const body = JSON.stringify({
    operator: ['GP','RB','AT','TT','BL','SK','BT','RY','ALL'].includes(operator) ? operator : 'ALL',
    type: ['regular','drive'].includes(type) ? type : 'regular',
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
      headers: { 'content-type': 'application/json' },
      body
    }, pinned);
    const text = await response.text();
    if (!response.ok) throw new Error('Success TopUp drives request failed.');
    let data; try { data = JSON.parse(text || '{}'); } catch { throw new Error('Success TopUp returned invalid drive data.'); }
    if (data.result !== true) throw new Error(String(data.message || 'Success TopUp rejected the drive-list request.'));
    const drives = Array.isArray(data.drives) ? data.drives : [];
    return { drives: drives.slice(0, 500).map((d) => ({
      id: String(d.id ?? d.package_id ?? d.packageId ?? '').slice(0, 200),
      name: String(d.name ?? d.title ?? d.package_name ?? '').slice(0, 200),
      data: String(d.data ?? d.data_amount ?? d.volume ?? '').slice(0, 100),
      valid: String(d.valid ?? d.validity ?? d.duration ?? '').slice(0, 100),
      price: Number(d.price ?? d.amount ?? 0)
    })).filter(d => d.id && d.price > 0) };
  } catch (e) {
    throw new HttpsError('unavailable', String(e?.message || 'Unable to load Success TopUp packages.').slice(0, 500));
  }
});

exports.listApiProviders = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.collection(COLLECTION).orderBy('priority', 'desc').get();
  // Return only non-secret configuration fields. Do not spread the provider
  // document here: custom headers/templates may contain credentials or other
  // sensitive values that should never be sent back to the mobile/admin client.
  return snap.docs.filter((d) => !(String(d.data()?.name || '').trim().toLowerCase() === 'success topup' && ['Bill Payment', 'Internet'].includes(d.data()?.service))).map((d) => {
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
      hasApiKey: Boolean(x.apiKeySecretName || x.apiKey),
      hasSecretKey: Boolean(x.secretKeySecretName || x.secretKey),
      hasUsername: Boolean(x.username),
      hasPassword: Boolean(x.passwordSecretName || x.password),
      hasCustomHeaders: Boolean(x.headers && Object.keys(x.headers).length),
      hasQueryTemplate: Boolean(x.queryTemplate && Object.keys(x.queryTemplate).length),
      hasRequestTemplate: Boolean(x.requestTemplate && Object.keys(x.requestTemplate).length),
    };
  });
});
exports.saveApiProvider = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const id = cleanString(request.data?.id, 100);
  if (id && !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'Provider id is invalid.');
  const ref = id ? db.collection(COLLECTION).doc(id) : db.collection(COLLECTION).doc();
  const existingSnap = await ref.get();
  const current = existingSnap.exists ? (existingSnap.data() || {}) : {};
  const existingCredentials = existingSnap.exists ? await providerSecretService.getCredentials(current) : {};
  const incoming = { ...(request.data || {}) };

  if (existingSnap.exists) {
    if (!incoming.apiKey || incoming.apiKey === providerSecretService.MASK) incoming.apiKey = existingCredentials.apiKey || current.apiKey || '';
    if (!incoming.secretKey || incoming.secretKey === providerSecretService.MASK) incoming.secretKey = existingCredentials.secretKey || current.secretKey || '';
    if (!incoming.password || incoming.password === providerSecretService.MASK) incoming.password = existingCredentials.password || current.password || '';
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
    tx.set(ref, stored, { merge: false });

    if (data.name === 'Success TopUp' && data.service === 'Recharge') {
      const webhookRef = db.collection('api_webhooks').doc(ref.id);
      const settingsRef = db.doc(SETTINGS);
      const [webhookSnap, settingsSnap] = await Promise.all([tx.get(webhookRef), tx.get(settingsRef)]);
      const oldHook = webhookSnap.exists ? (webhookSnap.data() || {}) : {};
      const oldSettings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
      webhookToken = oldHook.webhookToken || crypto.randomBytes(32).toString('hex');
      tx.set(webhookRef, {
        providerId: ref.id, enabled: true, authHeader: 'x-webhook-token', webhookToken,
        transactionIdPath: 'transactionId', statusPath: 'status', messagePath: 'comment',
        successStatus: 'Success', processingStatus: 'Processing', cancelStatus: 'Cancel',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid
      }, { merge: false });
      tx.set(settingsRef, {
        modes: { ...DEFAULT_MODES, ...(oldSettings.modes || {}), Recharge: 'api', Internet: 'api', 'Bill Payment': 'api' },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid
      }, { merge: true });

      const companionBase = {
        name: 'Success TopUp', country: 'BD', baseUrl: 'https://api.successtopup.com',
        method: 'POST', authType: 'none', headers: {}, queryTemplate: {},
        responseSuccessPath: 'result', responseSuccessValue: 'true',
        responseProcessingPath: '', responseProcessingValue: '', responseIdPath: '', responseMessagePath: 'message',
        apiKeySecretName: secretNames.apiKeySecretName, secretKeySecretName: secretNames.secretKeySecretName,
        active: data.active !== false, priority: 9999, timeoutMs: data.timeoutMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid
      };
      tx.set(db.collection(COLLECTION).doc('success-topup-internet'), {
        ...companionBase, service: 'Internet', endpointPath: '/api/recharge',
        requestTemplate: {}, notes: 'Fixed Success TopUp Bangladesh internet/data-pack integration.'
      }, { merge: false });
      tx.set(db.collection(COLLECTION).doc('success-topup-bill-payment'), {
        ...companionBase, service: 'Bill Payment', endpointPath: '/api/bill-pay',
        requestTemplate: {
          billOperator: '{{billOperator}}', billNumber: '{{billNumber}}', billAmount: '{{amount}}',
          mobileNumber: '{{mobileNumber}}', monthName: '{{monthName}}', note: '{{note}}', trxid: '{{requestId}}',
          successtopup_key: '{{apiKey}}', successtopup_secret: '{{secretKey}}'
        },
        notes: 'Fixed Success TopUp Bangladesh bill-payment integration.'
      }, { merge: false });
    }
  });

  if (data.name === 'Success TopUp' && data.service === 'Recharge') {
    return {
      id: ref.id, successTopUp: true, webhookToken,
      webhookUrl: 'https://us-central1-satulink-solutions.cloudfunctions.net/apiWebhook?providerId=' + encodeURIComponent(ref.id)
    };
  }
  return { id: ref.id, successTopUp: false };
});
exports.deleteApiProvider = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
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

exports.migrateApiProviderSecrets = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.collection(COLLECTION).get();
  let migrated = 0;
  for (const doc of snap.docs) {
    if (await providerSecretService.migrateDocument(doc)) migrated += 1;
  }
  return { migrated };
});

exports.getServiceApiSettings = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.doc(SETTINGS).get();
  return { modes: { ...DEFAULT_MODES, ...(snap.exists ? (snap.data().modes || {}) : {}) } };
});
exports.saveServiceApiSettings = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const incoming = request.data?.modes || {};
  const modes = { ...DEFAULT_MODES };
  for (const service of ALLOWED_SERVICES) {
    const mode = incoming[service];
    if (mode === 'api' || mode === 'legacy') modes[service] = mode;
  }
  await db.runTransaction(async (tx) => {
    const callerSnap = await tx.get(db.collection('users').doc(request.auth.uid));
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || caller.role !== 'superadmin' || caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) {
      throw new HttpsError('permission-denied', 'Your account is no longer active.');
    }
    tx.set(db.doc(SETTINGS), { modes, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  });
  return { modes };
});