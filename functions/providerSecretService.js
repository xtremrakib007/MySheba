const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const MASK = '••••••••';

async function request(path, options = {}) {
  const credential = admin.app().options.credential;
  const tokenResult = await credential.getAccessToken();
  const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.access_token;
  if (!token) throw new HttpsError('failed-precondition', 'Google Cloud credentials are unavailable.');
  const res = await fetch(`https://secretmanager.googleapis.com/v1/${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Secret Manager request failed (${res.status}): ${body.slice(0, 300)}`);
    err.code = res.status === 404 ? 5 : res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}
function resource(name) {
  if (!PROJECT_ID) throw new HttpsError('failed-precondition', 'Google Cloud project is not configured.');
  return `projects/${PROJECT_ID}/secrets/${name}`;
}
function secretName(providerId, field) {
  const safe = String(providerId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60);
  return `mysheba-api-${safe}-${field}`;
}
async function ensure(name) {
  try { await request(encodeURI(resource(name))); }
  catch (e) {
    if (e.code !== 5) throw e;
    await request(`projects/${PROJECT_ID}/secrets?secretId=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: JSON.stringify({ replication: { automatic: {} } }),
    });
  }
}
async function put(name, value) {
  if (!value || value === MASK) return;
  try {
    await ensure(name);
    await request(`${encodeURI(resource(name))}:addVersion`, {
      method: 'POST',
      body: JSON.stringify({ payload: { data: Buffer.from(String(value), 'utf8').toString('base64') } }),
    });
  } catch (e) {
    // Saving a provider writes its key and secret here before anything is
    // stored, so this is the first thing that fails when the role is missing.
    // Not Secret Accessor: saving creates the secret the first time and adds a
    // version every time, neither of which that role permits. Naming it here
    // would send the reader to a role that cannot fix what they are seeing.
    throw secretError(e, 'store this credential', 'the Secret Manager Admin role');
  }
}
async function read(name) {
  if (!name) return '';
  try {
    const r = await request(encodeURI(`${resource(name)}/versions/latest:access`));
    return r.payload?.data ? Buffer.from(r.payload.data, 'base64').toString('utf8') : '';
  } catch (e) {
    if (e.code === 5) return '';
    throw e;
  }
}
async function remove(name) {
  if (!name) return;
  try { await request(encodeURI(resource(name)), { method: 'DELETE' }); }
  catch (e) { if (e.code !== 5) throw e; }
}
/**
 * Turn a Secret Manager failure into something the caller can act on.
 *
 * read() and put() throw a plain Error carrying the HTTP status, and a plain
 * Error out of a callable reaches the app as "INTERNAL [500]" - naming neither
 * the secret, the status, nor the fix. "API test failed INTERNAL [500]" was
 * this. A missing secret is already handled as empty (code 5), so anything
 * reaching here is a real failure, and by far the most common is the functions
 * service account lacking Secret Manager Secret Accessor.
 */
function secretError(e, action, role) {
  if (e instanceof HttpsError) return e;
  const detail = String(e?.message || e);
  const status = /\((\d{3})\)/.exec(detail)?.[1];
  const denied = status === '403' || status === '401';
  return new HttpsError('failed-precondition',
    `Could not ${action} in Secret Manager${status ? ` (HTTP ${status})` : ''}. ` +
    (denied
      ? `Grant the Cloud Functions service account ${role} on this project, and check the Secret Manager API is enabled.`
      : 'Check the Secret Manager API is enabled for this project and try again.'));
}

async function getCredentials(provider) {
  try {
    return {
      apiKey: provider.apiKeySecretName ? await read(provider.apiKeySecretName) : '',
      secretKey: provider.secretKeySecretName ? await read(provider.secretKeySecretName) : '',
      password: provider.passwordSecretName ? await read(provider.passwordSecretName) : '',
      username: String(provider.username || ''),
    };
  } catch (e) {
    throw secretError(e, "read this provider's stored credentials", 'the Secret Manager Secret Accessor role');
  }
}
async function migrateDocument(doc) {
  const data = doc.data() || {};
  const names = {
    apiKeySecretName: data.apiKeySecretName || secretName(doc.id, 'api-key'),
    secretKeySecretName: data.secretKeySecretName || secretName(doc.id, 'secret-key'),
    passwordSecretName: data.passwordSecretName || secretName(doc.id, 'password'),
  };
  const values = {
    apiKey: typeof data.apiKey === 'string' ? data.apiKey.trim() : '',
    secretKey: typeof data.secretKey === 'string' ? data.secretKey.trim() : '',
    password: typeof data.password === 'string' ? data.password.trim() : '',
  };
  const updates = {};
  for (const field of Object.keys(values)) {
    if (values[field]) {
      await put(names[field + 'SecretName'], values[field]);
      updates[field + 'SecretName'] = names[field + 'SecretName'];
      updates[field] = admin.firestore.FieldValue.delete();
    }
  }
  if (Object.keys(updates).length) {
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await doc.ref.update(updates);
    return true;
  }
  return false;
}
async function cleanupUnreferenced(db, names) {
  const values = Object.values(names).filter(Boolean);
  if (!values.length) return;
  const used = new Set();
  let lastDoc = null;
  do {
    let query = db.collection('api_providers').orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    snap.forEach((d) => {
      const x = d.data() || {};
      for (const key of ['apiKeySecretName', 'secretKeySecretName', 'passwordSecretName']) {
        if (x[key]) used.add(x[key]);
      }
    });
    lastDoc = snap.docs[snap.docs.length - 1] || null;
    if (snap.size < 200) break;
  } while (lastDoc);
  for (const name of values) if (!used.has(name)) await remove(name);
}
module.exports = {
  MASK, secretName, getCredentials, migrateDocument, cleanupUnreferenced,
  put, remove,
  _test: { secretError },
};
