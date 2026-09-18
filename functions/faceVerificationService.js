// Server-side KYC face verification.
// The mobile app supplies an on-device 512-d embedding produced by the
// native face-recognition module. The server never trusts a client-supplied
// "verified" flag; it recomputes the duplicate decision from the embedding.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');

const PENDING = 'pendingBiometricTemplates';
const VERIFIED = 'biometricTemplates';
const DIMENSIONS = 512;
const DUPLICATE_THRESHOLD = 0.82;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function activeProfile(profile) {
  return !!profile
    && profile.suspended !== true
    && profile.inactive !== true
    && profile.disabled !== true
    && profile.active !== false
    && profile.mergedInto == null;
}

async function requireActiveAccount(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists || !activeProfile(snap.data())) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
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

exports.verifyKycFace = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  await requireActiveAccount(db, uid);
  await checkVelocity(db, uid, 'kyc_face', { ip: getClientIp(request) });
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
  const embedding = cleanEmbedding(data.embedding);

  // Re-check inside the same approval transaction. The earlier submission-time
  // check only compared against templates that were already verified; without
  // this second check, two pending applicants could both pass that check and
  // later be approved with the same biometric identity.
  const verifiedSnap = await tx.get(db.collection(VERIFIED));
  let best = null;
  verifiedSnap.forEach((doc) => {
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
  if (best && best.score >= DUPLICATE_THRESHOLD) {
    throw new HttpsError('failed-precondition', 'This identity matches an existing verified account and cannot be approved.');
  }

  tx.set(templateRef, {
    uid,
    embedding,
    model: data.model || 'mobilefacenet-512',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  tx.delete(pendingRef);
};
