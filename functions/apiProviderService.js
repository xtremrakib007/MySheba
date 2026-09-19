const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const COLLECTION = 'api_providers';
const SETTINGS = 'api_settings/service_modes';
const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment'];
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
function validateBaseUrl(baseUrl) {
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new HttpsError('invalid-argument', 'Base URL is not a valid URL.'); }
  if (parsed.protocol !== 'https:') throw new HttpsError('invalid-argument', 'Base URL must start with https://.');
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.test(host)) throw new HttpsError('invalid-argument', 'Base URL host is not allowed.');
  if (isIpLiteral(host)) throw new HttpsError('invalid-argument', 'Base URL must use a domain name, not a raw IP address.');
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
  return { service, name, baseUrl, endpointPath: cleanString(data.endpointPath, 500) || '/', method, authType, apiKey: cleanString(data.apiKey, 1000), username: cleanString(data.username, 200), password: cleanString(data.password, 1000), active: data.active !== false, priority: Math.max(0, Math.min(9999, Number(data.priority) || 0)), timeoutMs: Math.max(3000, Math.min(60000, Number(data.timeoutMs) || 15000)), notes: cleanString(data.notes, 1000), headers: data.headers || {}, queryTemplate: data.queryTemplate || {}, requestTemplate: data.requestTemplate || {}, responseSuccessPath: cleanString(data.responseSuccessPath, 200), responseSuccessValue: cleanString(data.responseSuccessValue, 200), responseIdPath: cleanString(data.responseIdPath, 200), responseMessagePath: cleanString(data.responseMessagePath, 200) };
}

function asObject(value) { if (value && typeof value === 'object' && !Array.isArray(value)) return value; if (typeof value !== 'string') return {}; try { const x = JSON.parse(value); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } }
function getPath(obj, path) { return path ? path.split('.').reduce((v,k) => v == null ? undefined : v[k], obj) : undefined; }
function render(v, vars) {
  if (typeof v === 'string') return v.replace(/\\{\\{\\s*([A-Za-z0-9_]+)\\s*\\}\\}/g, (_, k) => vars[k] == null ? '' : String(vars[k]));
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
async function executeConfiguredApi(service, payload, customer, requestId) {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).where('service','==',service).where('active','==',true).get();
  const providers = snap.docs.map(d => ({id:d.id,...d.data()})).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));
  if (!providers.length) throw new HttpsError('failed-precondition', `No active API provider is configured for ${service}.`);
  const raw = payload?.raw || {};
  const vars = { requestId, uid: customer?.uid || '', phone: customer?.phone || '', amount: payload?.amount ?? raw.amount ?? '', total: payload?.total ?? raw.total ?? '', service, country: raw.country || '', operator: raw.operator || '', packageCode: raw.packageCode || '', details: payload?.details || '' };
  try {
      const p = provider;
      let base; try { base = new URL(p.baseUrl); } catch { throw new Error('Provider URL is invalid.'); }
      if (base.protocol !== 'https:' || isIpLiteral(base.hostname) || BLOCKED_HOSTS.test(base.hostname)) throw new Error('Provider URL is not allowed.');
      const url = new URL(String(p.endpointPath || '/'), base);
      for (const [k,v] of Object.entries(render(asObject(p.queryTemplate), vars))) if (v !== '' && v != null) url.searchParams.set(k,String(v));
      const method = String(p.method || 'POST').toUpperCase();
      const headers = { accept:'application/json', ...(render(asObject(p.headers), vars)), ...providerAuth(p) };
      let body;
      if (method !== 'GET') { headers['content-type'] = headers['content-type'] || 'application/json'; body = JSON.stringify(render(asObject(p.requestTemplate), vars)); }
      const ctl = new AbortController(); const timer = setTimeout(()=>ctl.abort(), Math.max(3000,Math.min(60000,Number(p.timeoutMs)||15000)));
      let response; try { response = await fetch(url,{method,headers,body,signal:ctl.signal}); } finally { clearTimeout(timer); }
      const text = await response.text(); if (Buffer.byteLength(text,'utf8') > 1000000) throw new Error('Provider response is too large.');
      let data={}; try { data=text ? JSON.parse(text) : {}; } catch { data={raw:text.slice(0,5000)}; }
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      const success = p.responseSuccessPath ? getPath(data,p.responseSuccessPath) : true;
      if (success === false || (p.responseSuccessValue && String(success)!==String(p.responseSuccessValue))) throw new Error(p.responseMessagePath ? String(getPath(data,p.responseMessagePath)||'Provider rejected the request.') : 'Provider rejected the request.');
      const result = { providerId:p.id, providerName:p.name, responseId:p.responseIdPath ? getPath(data,p.responseIdPath) : null, message:p.responseMessagePath ? getPath(data,p.responseMessagePath) : null };
      await executionRef.set({ status: 'completed', result, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return result;
    } catch(e) {
      const message = String(e?.message || 'Provider execution failed').slice(0, 500);
      const definitive = /^Provider HTTP 4\\d{2}$/.test(message) || message.includes('Provider rejected the request');
      await executionRef.set({ status: definitive ? 'failed' : 'unknown', message, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      throw definitive ? new HttpsError('failed-precondition', message) : new HttpsError('unavailable', message);
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