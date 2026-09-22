// Server-side KYC face verification.
// The mobile app supplies an on-device 512-d embedding produced by the
// native face-recognition module. The server never trusts a client-supplied
// "verified" flag; it recomputes the duplicate decision from the embedding.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const PENDING = 'pendingBiometricTemplates';
const VERIFIED = 'biometricTemplates';
const DIMENSIONS = 512;
const DUPLICATE_THRESHOLD = 0.82;
const PENDING_TTL_MS = 30 * 60 * 1000;

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function isActiveUser(user) {
  return user && user.suspended !== true && user.inactive !== true && user.disabled !== true && !user.mergedInto;
}

function cleanEmbedding(value) {
  if (!Array.isArray(value) || value.length !== DIMENSIONS) {
    throw new HttpsError('invalid-argument', `A ${DIMENSIONS}-value face embedding is required.`);
  }
  const out = value.map(Number);
  if (out.some((v) => !Number.isFinite(v))) {
    throw new HttpsError('invalid-argument', 'The face embedding contains invalid values.');
  }
  const norm = Math.sqrt(out.reduce((sum, v) => sum + v * v, 0));
  if (!Number.isFinite(norm) || norm < 1e-6) {
    throw new HttpsError('invalid-argument', 'The face embedding is empty.');
  }
  return out.map((v) => v / norm);
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < DIMENSIONS; i += 1) dot += a[i] * b[i];
  return dot;
}

exports.verifyKycFace = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists || !isActiveUser(userSnap.data() || {})) {
    throw new HttpsError('permission-denied', 'This account is not active.');
  }

  await checkVelocity(db, uid, 'verifyKycFace', { ip: getClientIp(request) });

  const embedding = cleanEmbedding(request.data?.embedding);
  if (request.data?.livenessPassed !== true) {
    throw new HttpsError('failed-precondition', 'Complete the live face movement check first.');
  }

  const snap = await db.collection(VERIFIED).get();
  let best = null;

  snap.forEach((doc) => {
    if (doc.id === uid) return;
    const candidate = doc.data()?.embedding;
    if (!Array.isArray(candidate) || candidate.length !== DIMENSIONS) return;
    try {
      const score = cosine(embedding, cleanEmbedding(candidate));
      if (!best || score > best.score) best = { uid: doc.id, score };
    } catch (_) {
      // Ignore malformed legacy templates.
    }
  });

  const pendingRef = db.collection(PENDING).doc(uid);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + PENDING_TTL_MS);

  if (best && best.score >= DUPLICATE_THRESHOLD) {
    await pendingRef.set({
      uid,
      status: 'duplicate',
      duplicateOf: best.uid,
      similarity: best.score,
      expiresAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    // Do not expose the matched UID or similarity score to the client.
    return { ok: false, duplicate: true };
  }

  await pendingRef.set({
    uid,
    status: 'pending',
    embedding,
    model: 'mobilefacenet-512',
    livenessPassed: true,
    expiresAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, duplicate: false };
});

// Called only after an admin approves the KYC request. Keeping templates in
// their own collection prevents ordinary KYC readers from receiving the
// sensitive biometric field.
exports.finalizeKycFaceTemplate = async (tx, db, uid) => {
  const pendingRef = db.collection(PENDING).doc(uid);
  const templateRef = db.collection(VERIFIED).doc(uid);
  const pending = await tx.get(pendingRef);
  if (!pending.exists || pending.data()?.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'A validated face template is required before approval.');
  }
  const data = pending.data();
  if (!data.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    tx.delete(pendingRef);
    throw new HttpsError('failed-precondition', 'The face verification has expired. Please verify your face again.');
  }
  tx.set(templateRef, {
    uid,
    embedding: data.embedding,
    model: data.model || 'mobilefacenet-512',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  tx.delete(pendingRef);
};
