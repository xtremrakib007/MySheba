const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const COLLECTION = 'api_providers';
const SETTINGS = 'api_settings/service_modes';
const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway'];
const ALLOWED_AUTH = ['none', 'apiKey', 'bearer', 'basic'];
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
  if (!ALLOWED_SERVICES.includes(service)) throw new HttpsError('invalid-argument', 'Invalid service.');
  if (!name) throw new HttpsError('invalid-argument', 'API provider name is required.');
  validateBaseUrl(baseUrl);
  if (!ALLOWED_AUTH.includes(authType)) throw new HttpsError('invalid-argument', 'Invalid authentication type.');
  return { service, name, baseUrl, authType, apiKey: cleanString(data.apiKey, 1000), username: cleanString(data.username, 200), password: cleanString(data.password, 1000), active: data.active !== false, priority: Math.max(0, Math.min(9999, Number(data.priority) || 0)), timeoutMs: Math.max(3000, Math.min(60000, Number(data.timeoutMs) || 15000)), notes: cleanString(data.notes, 1000) };
}

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