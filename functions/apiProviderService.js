const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// NOTE: `db` is intentionally NOT created at module load time. index.js
// requires this file (to build its exports) before it calls
// admin.initializeApp() - calling admin.firestore() at the top level here
// would throw "The default Firebase app does not exist" and crash the whole
// Functions deployment on cold start. Every other service file in this repo
// (adPaymentService.js, adTrackingService.js, adControlsService.js, etc.)
// avoids this by calling admin.firestore() lazily inside each function body,
// once initializeApp() has definitely already run - same pattern here.
const COLLECTION = 'api_providers';
const SETTINGS = 'api_settings/service_modes';
const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway'];
const ALLOWED_AUTH = ['none', 'apiKey', 'bearer', 'basic'];
const DEFAULT_MODES = Object.fromEntries(ALLOWED_SERVICES.map((service) => [service, 'legacy']));

function assertSuperadmin(db, request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  return db.doc(`users/${request.auth.uid}`).get().then((snap) => {
    if (!snap.exists || snap.data().role !== 'superadmin') throw new HttpsError('permission-denied', 'Superadmin access required.');
  });
}
function cleanString(v, max = 500) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

// SSRF hardening for baseUrl. Nothing calls out to a stored provider's
// baseUrl today (see API_PROVIDER_MANAGEMENT.md - this is the config layer
// only), but a "test connection" button or a real integration will fetch it
// eventually from a trusted server context, so the URL a Superadmin can
// store is restricted now rather than left as a future SSRF hole:
// - https:// only (no plaintext http, no other schemes like file:// etc.)
// - no localhost/loopback, link-local, private (RFC1918/ULA), or
//   .internal/.local hostnames, and no bare IPv4/IPv6 literals at all
//   (a literal IP skips DNS entirely, which is the classic SSRF bypass for
//   hostname-based blocklists)
const BLOCKED_HOSTS = /^(localhost|.*\.local|.*\.internal)$/i;
function isIpLiteral(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4
  if (host.includes(':')) return true; // IPv6 (bracketed host from URL parser)
  return false;
}
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

exports.listApiProviders = onCall(async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.collection(COLLECTION).orderBy('priority', 'desc').get();
  return snap.docs.map((d) => { const x = d.data(); return { id: d.id, ...x, apiKey: x.apiKey ? '••••••••' : '', password: x.password ? '••••••••' : '' }; });
});
exports.saveApiProvider = onCall(async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const data = validate(request.data || {}), id = cleanString(request.data?.id, 100);
  const ref = id ? db.collection(COLLECTION).doc(id) : db.collection(COLLECTION).doc();
  const existing = await ref.get();
  if (existing.exists) { if (data.apiKey === '••••••••') data.apiKey = existing.data().apiKey || ''; if (data.password === '••••••••') data.password = existing.data().password || ''; }
  await ref.set({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  return { id: ref.id };
});
exports.deleteApiProvider = onCall(async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const id = cleanString(request.data?.id, 100);
  if (!id) throw new HttpsError('invalid-argument', 'Provider id is required.');
  await db.collection(COLLECTION).doc(id).delete();
  return { ok: true };
});

// Superadmin chooses which backend each service uses. Legacy is the safe default
// so adding API providers never changes existing behaviour until explicitly switched.
exports.getServiceApiSettings = onCall(async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.doc(SETTINGS).get();
  return { modes: { ...DEFAULT_MODES, ...(snap.exists ? (snap.data().modes || {}) : {}) } };
});
exports.saveServiceApiSettings = onCall(async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const incoming = request.data?.modes || {};
  const modes = { ...DEFAULT_MODES };
  for (const service of ALLOWED_SERVICES) {
    const mode = incoming[service];
    if (mode === 'api' || mode === 'legacy') modes[service] = mode;
  }
  await db.doc(SETTINGS).set({ modes, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  return { modes };
});
