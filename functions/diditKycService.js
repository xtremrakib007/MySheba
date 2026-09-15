// Compatibility entry point for the old deployed callable name.
// IMPORTANT: this file makes no Didit/network request. It now performs the
// native on-device embedding duplicate check so older deployed function names
// remain callable while the app migrates to the native KYC implementation.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const PENDING = 'pendingBiometricTemplates';
const VERIFIED = 'biometricTemplates';
const DIMENSIONS = 512;
const DUPLICATE_THRESHOLD = 0.82;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function normalizeEmbedding(value) {
  if (!Array.isArray(value) || value.length !== DIMENSIONS) {
    throw new HttpsError('invalid-argument', `A ${DIMENSIONS}-value face embedding is required.`);
  }
  const values = value.map(Number);
  if (values.some((v) => !Number.isFinite(v))) throw new HttpsError('invalid-argument', 'Invalid face embedding.');
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  if (!Number.isFinite(norm) || norm < 1e-6) throw new HttpsError('invalid-argument', 'Empty face embedding.');
  return values.map((v) => v / norm);
}

function cosine(a, b) {
  let score = 0;
  for (let i = 0; i < DIMENSIONS; i += 1) score += a[i] * b[i];
  return score;
}

exports.createDiditKycSession = onCall(async (request) => {
  const uid = requireAuth(request);
  const embedding = normalizeEmbedding(request.data?.embedding);
  if (request.data?.livenessPassed !== true) {
    throw new HttpsError('failed-precondition', 'Complete the live face movement check first.');
  }

  const db = admin.firestore();
  const snap = await db.collection(VERIFIED).get();
  let best = null;
  snap.forEach((doc) => {
    if (doc.id === uid) return;
    const candidate = doc.data()?.embedding;
    if (!Array.isArray(candidate) || candidate.length !== DIMENSIONS) return;
    try {
      const score = cosine(embedding, normalizeEmbedding(candidate));
      if (!best || score > best.score) best = { uid: doc.id, score };
    } catch (_) {}
  });

  if (best && best.score >= DUPLICATE_THRESHOLD) {
    await db.collection(PENDING).doc(uid).set({
      uid,
      status: 'duplicate',
      duplicateOf: best.uid,
      similarity: best.score,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: false, duplicate: true, similarity: best.score };
  }

  await db.collection(PENDING).doc(uid).set({
    uid,
    status: 'pending',
    embedding,
    model: 'mobilefacenet-512',
    livenessPassed: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, duplicate: false, similarity: best?.score || 0 };
});

exports.diditKycWebhook = async (_request, response) => {
  response.status(410).json({ error: 'Legacy hosted KYC webhook is disabled.' });
};
