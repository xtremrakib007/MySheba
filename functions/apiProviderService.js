const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

// NOTE: `db` is intentionally NOT created at module load time. index.js
// requires this file before it calls admin.initializeApp().
const COLLECTION = 'api_providers';
const SETTINGS = 'api_settings/service_modes';
const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway'];
const ALLOWED_AUTH = ['none', 'apiKey', 'bearer', 'basic'];
const DEFAULT_MODES = Object.fromEntries(ALLOWED_SERVICES.map((service) => [service, 'legacy']));
const MASK = '••••••••';

const secretManager = new SecretManagerServiceClient();
const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;

async function assertSuperadmin(db, request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const snap = await db.doc(`users/${request.auth.uid}`).get();
  const data = snap.exists ? (snap.data() || {}) : null;
  if (!data || data.suspended === true || data.inactive === true || data.disabled === true) {
    throw new HttpsError('permission-denied', 'Your account is not available.');
  }
  if (data.role !== 'superadmin') throw new HttpsError('permission-denied', 'Superadmin access required.');
}
function cleanString(v, max = 500) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

// SSRF hardening for baseUrl. Nothing calls out to a stored provider's
// baseUrl today, but future server-side integrations must not inherit an
// unsafe URL configuration.
const BLOCKED_HOSTS = /^(localhost|.*\\.local|.*\\.internal)$/i;
function isIpLiteral(host) {
  if (/^\\d{1,3}(\\.\\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(':')) return true;
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
  return {
    service, name, baseUrl, authType,
    apiKey: cleanString(data.apiKey, 1000),
    username: cleanString(data.username, 200),
    password: cleanString(data.password, 1000),
    active: data.active !== false,
    priority: Math.max(0, Math.min(9999, Number(data.priority) || 0)),
    timeoutMs: Math.max(3000, Math.min(60000, Number(data.timeoutMs) || 15000)),
    notes: cleanString(data.notes, 1000),
  };
}

function secretId(providerId, field) {
  const safeId = String(providerId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return `mysheba-api-${safeId}-${field}`;
}
function secretResource(secretName) {
  if (!projectId || !secretName) throw new HttpsError('failed-precondition', 'Google Cloud project is not configured.');
  return `projects/${projectId}/secrets/${secretName}`;
}
async function ensureSecret(secretName) {
  const parent = `projects/${projectId}`;
  try {
    await secretManager.getSecret({ name: secretResource(secretName) });
  } catch (err) {
    if (err.code !== 5) throw err; // NOT_FOUND
    await secretManager.createSecret({
      parent,
      secretId: secretName,
      secret: { replication: { automatic: {} } },
    });
  }
}
async function putSecret(secretName, value) {
  if (!value) return;
  await ensureSecret(secretName);
  await secretManager.addSecretVersion({
    parent: secretResource(secretName),
    payload: { data: Buffer.from(value, 'utf8') },
  });
}
async function readSecret(secretName) {
  if (!secretName) return '';
  const [version] = await secretManager.accessSecretVersion({ name: `${secretResource(secretName)}/versions/latest` });
  return version.payload?.data?.toString('utf8') || '';
}
async function deleteSecret(secretName) {
  if (!secretName) return;
  try { await secretManager.deleteSecret({ name: secretResource(secretName) }); } catch (err) {
    if (err.code !== 5) throw err;
  }
}

// Server-side helper for future provider integrations. Secrets never need to
// be returned to the mobile/admin client.
exports.getApiProviderCredentials = async (providerId) => {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).doc(String(providerId)).get();
  if (!snap.exists) throw new Error('API provider not found.');
  const data = snap.data() || {};
  return {
    apiKey: await readSecret(data.apiKeySecretName),
    username: data.username || '',
    password: await readSecret(data.passwordSecretName),
    authType: data.authType || 'none',
  };
};

exports.listApiProviders = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.collection(COLLECTION).orderBy('priority', 'desc').get();
  return {
    providers: snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        ...x,
        apiKey: x.apiKeySecretName ? MASK : '',
        password: x.passwordSecretName ? MASK : '',
      };
    }),
  };
});

exports.saveApiProvider = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const data = validate(request.data || {});
  const id = cleanString(request.data?.id, 100);
  const ref = id ? db.collection(COLLECTION).doc(id) : db.collection(COLLECTION).doc();
  const existing = await ref.get();
  const previous = existing.exists ? (existing.data() || {}) : {};
  const apiKeyProvided = Boolean(data.apiKey && data.apiKey !== MASK);
  const passwordProvided = Boolean(data.password && data.password !== MASK);

  const apiKeySecretName = previous.apiKeySecretName || secretId(ref.id, 'api-key');
  const passwordSecretName = previous.passwordSecretName || secretId(ref.id, 'password');
  if (apiKeyProvided) await putSecret(apiKeySecretName, data.apiKey);
  if (passwordProvided) await putSecret(passwordSecretName, data.password);

  const stored = {
    service: data.service,
    name: data.name,
    baseUrl: data.baseUrl,
    authType: data.authType,
    username: data.username,
    active: data.active,
    priority: data.priority,
    timeoutMs: data.timeoutMs,
    notes: data.notes,
    apiKeySecretName: apiKeyProvided || previous.apiKeySecretName ? apiKeySecretName : '',
    passwordSecretName: passwordProvided || previous.passwordSecretName ? passwordSecretName : '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
  };
  await ref.set(stored, { merge: true });
  return { id: ref.id };
});

exports.deleteApiProvider = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const id = cleanString(request.data?.id, 100);
  if (!id) throw new HttpsError('invalid-argument', 'Provider id is required.');
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() || {};
    await deleteSecret(data.apiKeySecretName);
    await deleteSecret(data.passwordSecretName);
  }
  await ref.delete();
  return { ok: true };
});

// One-time migration for existing Firestore credentials. It is intentionally
// callable only by a superadmin and leaves no credential value in Firestore.
exports.migrateApiProviderSecrets = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.collection(COLLECTION).get();
  let migrated = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const apiKey = cleanString(data.apiKey, 1000);
    const password = cleanString(data.password, 1000);
    const updates = {};
    if (apiKey) {
      const name = data.apiKeySecretName || secretId(doc.id, 'api-key');
      await putSecret(name, apiKey);
      updates.apiKeySecretName = name;
    }
    if (password) {
      const name = data.passwordSecretName || secretId(doc.id, 'password');
      await putSecret(name, password);
      updates.passwordSecretName = name;
    }
    if (apiKey || password) {
      updates.apiKey = admin.firestore.FieldValue.delete();
      updates.password = admin.firestore.FieldValue.delete();
      updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.updatedBy = request.auth.uid;
      await doc.ref.update(updates);
      migrated += 1;
    }
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
  await db.doc(SETTINGS).set({ modes, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  return { modes };
});
