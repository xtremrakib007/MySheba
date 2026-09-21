const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const dns = require('dns').promises;
const crypto = require('crypto');

const COLLECTION = 'api_providers';
const SETTINGS = 'api_settings/service_modes';
const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment', 'Recharge PIN'];
const ALLOWED_AUTH = ['none', 'apiKey', 'bearer', 'basic'];
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH'];
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
  if (s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80:')) return true;
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a,b,c,d] = m.slice(1).map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && c === 0);
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
}
function validateTemplate(value, label, maxBytes = 20000) {
  const obj = asObject(value);
  const json = JSON.stringify(obj);
  if (json.length > maxBytes) throw new HttpsError('invalid-argument', `${label} is too large.`);
  return obj;
}
function validateHeaders(value) {
  const headers = validateTemplate(value, 'Headers', 12000);
  for (const key of Object.keys(headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(key)) throw new HttpsError('invalid-argument', 'Invalid API header name.');
    if (/^(host|content-length|connection|transfer-encoding|proxy-)/i.test(key)) throw new HttpsError('invalid-argument', 'This API header is not allowed.');
    const v = headers[key];
    if (!(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) throw new HttpsError('invalid-argument', 'API header values must be scalar.');
  }
  return headers;
}
function validate(data) {
  const service = cleanString(data.service, 40), name = cleanString(data.name, 100), baseUrl = cleanString(data.baseUrl, 500);
  const authType = cleanString(data.authType, 20) || 'none';
  const method = cleanString(data.method, 10).toUpperCase() || 'POST';
  if (!ALLOWED_SERVICES.includes(service)) throw new HttpsError('invalid-argument', 'Invalid service.');
  if (!name) throw new HttpsError('invalid-argument', 'API provider name is required.');
  validateBaseUrl(baseUrl);
  if (!ALLOWED_AUTH.includes(authType)) throw new HttpsError('invalid-argument', 'Invalid authentication type.');
  if (!ALLOWED_METHODS.includes(method)) throw new HttpsError('invalid-argument', 'Invalid HTTP method.');
  return { service, name, baseUrl, endpointPath: cleanString(data.endpointPath, 500) || '/', method, authType, apiKey: cleanString(data.apiKey, 1000), username: cleanString(data.username, 200), password: cleanString(data.password, 1000), active: data.active !== false, priority: Math.max(0, Math.min(9999, Number(data.priority) || 0)), timeoutMs: Math.max(3000, Math.min(60000, Number(data.timeoutMs) || 15000)), notes: cleanString(data.notes, 1000), headers: validateHeaders(data.headers || {}), queryTemplate: validateTemplate(data.queryTemplate || {}, 'Query template'), requestTemplate: validateTemplate(data.requestTemplate || {}, 'Request template'), responseSuccessPath: cleanString(data.responseSuccessPath, 200), responseSuccessValue: cleanString(data.responseSuccessValue, 200), responseIdPath: cleanString(data.responseIdPath, 200), responseMessagePath: cleanString(data.responseMessagePath, 200), responsePinPath: service === 'Recharge PIN' ? cleanString(data.responsePinPath, 200) : '' };
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
async function executeConfiguredApi(service, payload, customer, requestId, options = {}) {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).where('service','==',service).where('active','==',true).get();
  const providers = snap.docs.map(d => ({ id:d.id, ...d.data() })).sort((x,y)=>Number(y.priority||0)-Number(x.priority||0));
  if (!providers.length) throw new HttpsError('failed-precondition', `No active API provider is configured for ${service}.`);
  const provider = providers[0];
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
    if (state.status === 'completed') return state.result || {};
    if (state.status === 'unknown') throw new HttpsError('unavailable','The API request outcome is uncertain. Check the provider before retrying.');
    if (state.status === 'processing') throw new HttpsError('aborted','This API request is already being processed.');
    if (state.status === 'failed') throw new HttpsError('failed-precondition',state.message || 'The provider rejected this request.');
    throw new HttpsError('aborted','This API request is already being processed.');
  }
  const raw = payload?.raw || {};
  const vars = { requestId, uid:customer?.uid||'', phone:customer?.phone||'', amount:payload?.amount??raw.amount??'', total:payload?.total??raw.total??'', service, country:raw.country||'', operator:raw.operator||'', packageCode:raw.packageCode||'', details:payload?.details||'', ...Object.fromEntries(Object.entries(raw).filter(([k,v]) => !['requestId'].includes(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')).slice(0,100)) };
  try {
    let base; try { base = new URL(provider.baseUrl); } catch { throw new Error('Provider URL is invalid.'); }
    if (base.protocol !== 'https:') throw new Error('Provider URL is not allowed.');
    await assertPublicHostname(base.hostname);
    const endpointPath = String(provider.endpointPath || '/');
    if (/^https?:\/\//i.test(endpointPath) || endpointPath.startsWith('//')) throw new Error('Endpoint path must be relative to the provider base URL.');
    const url = new URL(endpointPath,base);
    for (const [k,v] of Object.entries(render(asObject(provider.queryTemplate),vars))) if(v!==''&&v!=null) url.searchParams.set(k,String(v));
    const method = String(provider.method||'POST').toUpperCase();
    const headers = { accept:'application/json', ...render(asObject(provider.headers),vars), ...providerAuth(provider) };
    let body;
    if(method!=='GET'){ headers['content-type']=headers['content-type']||'application/json'; body=JSON.stringify(render(asObject(provider.requestTemplate),vars)); }
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),Math.max(3000,Math.min(60000,Number(provider.timeoutMs)||15000)));
    let response; try { response=await fetch(url,{method,headers,body,signal:ctl.signal}); } finally { clearTimeout(timer); }
    const responseText=await response.text();
    if(Buffer.byteLength(responseText,'utf8')>1000000) throw new Error('Provider response is too large.');
    let data={}; try { data=responseText?JSON.parse(responseText):{}; } catch { data={raw:responseText.slice(0,5000)}; }
    if(!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    const success=provider.responseSuccessPath?getPath(data,provider.responseSuccessPath):true;
    if(success===false || (provider.responseSuccessValue && String(success)!==String(provider.responseSuccessValue))) throw new Error(provider.responseMessagePath?String(getPath(data,provider.responseMessagePath)||'Provider rejected the request.'):'Provider rejected the request.');
    const result={providerId:provider.id,providerName:provider.name,responseId:provider.responseIdPath?getPath(data,provider.responseIdPath):null,message:provider.responseMessagePath?getPath(data,provider.responseMessagePath):null};
    const secretPath = options.extractPath || (service === 'Recharge PIN' ? provider.responsePinPath : '');
    if (secretPath) { const secret = getPath(data, secretPath); if (typeof secret !== 'string' || !secret.trim() || secret.length > 500) throw new Error('Provider did not return a valid recharge PIN.'); result.secret = secret.trim(); }
    await executionRef.set({status:'completed',result,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    return result;
  } catch(e) {
    const message=String(e?.message||'Provider execution failed').slice(0,500);
    const definitive=/^Provider HTTP 4\d{2}$/.test(message)||message.includes('Provider rejected the request');
    await executionRef.set({status:definitive?'failed':'unknown',message,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    throw definitive?new HttpsError('failed-precondition',message):new HttpsError('unavailable',message);
  }
}
exports.executeConfiguredApi = executeConfiguredApi;

exports.listApiProviders = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.collection(COLLECTION).orderBy('priority', 'desc').get();
  return snap.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, apiKey: x.apiKey ? '••••••••' : '', password: x.password ? '••••••••' : '' }; });
});
exports.saveApiProvider = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const data = validate(request.data || {}), id = cleanString(request.data?.id, 100);
  if (id && !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'Provider id is invalid.');
  const ref = id ? db.collection(COLLECTION).doc(id) : db.collection(COLLECTION).doc();
  await db.runTransaction(async (tx) => {
    const callerSnap = await tx.get(db.collection('users').doc(request.auth.uid));
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || caller.role !== 'superadmin' || caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) {
      throw new HttpsError('permission-denied', 'Your account is no longer active.');
    }
    const existing = await tx.get(ref);
    if (existing.exists) {
      if (data.apiKey === '••••••••') data.apiKey = existing.data().apiKey || '';
      if (data.password === '••••••••') data.password = existing.data().password || '';
    }
    tx.set(ref, { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  });
  return { id: ref.id };
});
exports.deleteApiProvider = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const id = cleanString(request.data?.id, 100);
  if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'Provider id is invalid.');
  const ref = db.collection(COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const callerSnap = await tx.get(db.collection('users').doc(request.auth.uid));
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || caller.role !== 'superadmin' || caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) {
      throw new HttpsError('permission-denied', 'Your account is no longer active.');
    }
    const existing = await tx.get(ref);
    if (!existing.exists) throw new HttpsError('not-found', 'Provider not found.');
    tx.delete(ref);
  });
  return { ok: true };
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