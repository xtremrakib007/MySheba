// Compatibility entry point for the old deployed callable name.
// The callable now supports the native face-check operation and the secure
// server-side KYC submission operation. No third-party KYC provider is used.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const PENDING = 'pendingBiometricTemplates';
const VERIFIED = 'biometricTemplates';
const REQUESTS = 'verificationRequests';
const DIMENSIONS = 512;
const DUPLICATE_THRESHOLD = 0.82;
const DOCUMENT_TYPES = ['Passport', 'MyKad / National ID', 'Work Permit / ID', "Driver's License"];
const GENDERS = ['Male', 'Female', 'Other'];

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function activeUser(user) {
  return user && user.suspended !== true && user.inactive !== true && user.disabled !== true && !user.mergedInto;
}

function normalizeEmbedding(value) {
  if (!Array.isArray(value) || value.length !== DIMENSIONS) throw new HttpsError('invalid-argument', `A ${DIMENSIONS}-value face embedding is required.`);
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

function validStorageUrl(url, uid, required = true) {
  if (!url) return !required;
  if (typeof url !== 'string' || url.length > 2048) return false;
  let parsed;
  try { parsed = new URL(url); } catch (_) { return false; }
  if (parsed.protocol !== 'https:') return false;

  const bucketName = admin.storage().bucket().name;
  let objectPath = null;
  try {
    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (!match || decodeURIComponent(match[1]) !== bucketName) return false;
      objectPath = decodeURIComponent(match[2]);
    } else if (parsed.hostname === 'storage.googleapis.com') {
      const match = parsed.pathname.match(/^\/([^/]+)\/(.+)$/);
      if (!match || decodeURIComponent(match[1]) !== bucketName) return false;
      objectPath = decodeURIComponent(match[2]);
    } else {
      return false;
    }
  } catch (_) {
    return false;
  }

  const expectedPrefix = `verification-documents/${uid}/`;
  if (!objectPath.startsWith(expectedPrefix) || objectPath.length <= expectedPrefix.length) return false;
  if (objectPath.includes('..')) return false;
  return true;
}

function parseDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpsError('invalid-argument', `Invalid ${label}.`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new HttpsError('invalid-argument', `Invalid ${label}.`);
  return date;
}

function validateSubmission(data, uid, phone) {
  if (!data || data.uid !== uid) throw new HttpsError('invalid-argument', 'Invalid KYC submission.');
  if (!DOCUMENT_TYPES.includes(data.documentType)) throw new HttpsError('invalid-argument', 'Invalid document type.');
  if (!GENDERS.includes(data.gender)) throw new HttpsError('invalid-argument', 'Invalid gender.');
  if (typeof data.name !== 'string' || data.name.trim().length < 2 || data.name.length > 120) throw new HttpsError('invalid-argument', 'Enter your full legal name.');
  if (typeof phone !== 'string' || phone.trim().length < 5 || phone.length > 40) throw new HttpsError('failed-precondition', 'A verified phone number is required for KYC.');
  if (typeof data.documentNumber !== 'string' || data.documentNumber.trim().length < 3 || data.documentNumber.length > 80) throw new HttpsError('invalid-argument', 'Invalid document number.');
  if (typeof data.nationality !== 'string' || data.nationality.trim().length < 2 || data.nationality.length > 80) throw new HttpsError('invalid-argument', 'Invalid nationality.');
  const dob = parseDate(data.dateOfBirth, 'date of birth');
  const today = new Date();
  if (dob > today) throw new HttpsError('invalid-argument', 'Date of birth cannot be in the future.');
  const age = today.getUTCFullYear() - dob.getUTCFullYear() - (today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate()) ? 1 : 0);
  if (age < 18 || age > 120) throw new HttpsError('invalid-argument', 'KYC applicants must be between 18 and 120 years old.');
  if (typeof data.address !== 'string' || data.address.trim().length < 5 || data.address.length > 500) throw new HttpsError('invalid-argument', 'Invalid residential address.');
  if (data.documentType === 'Passport') {
    const expiry = parseDate(data.passportExpiryDate, 'passport expiry date');
    if (expiry < today) throw new HttpsError('invalid-argument', 'Passport expiry date cannot be in the past.');
  } else if (data.passportExpiryDate) throw new HttpsError('invalid-argument', 'Passport expiry date is only valid for passports.');
  if (!validStorageUrl(data.frontDocumentUrl, uid) || !validStorageUrl(data.documentUrl, uid)) throw new HttpsError('invalid-argument', 'Invalid identity document upload.');
  if (data.documentType !== 'Passport' && !validStorageUrl(data.backDocumentUrl, uid)) throw new HttpsError('invalid-argument', 'The back of the identity document is required.');
  if (!validStorageUrl(data.selfieUrl, uid)) throw new HttpsError('invalid-argument', 'The verified face image is required.');
  if (data.liveFaceVerified !== true) throw new HttpsError('failed-precondition', 'Complete live face verification first.');
}

exports.createDiditKycSession = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'Your user profile was not found.');
  const user = userSnap.data() || {};
  if (!activeUser(user)) throw new HttpsError('permission-denied', 'This account is not active.');

  // Secure KYC submission. The client can upload evidence, but it cannot
  // directly create or overwrite a verification request anymore.
  if (request.data?.mode === 'submit') {
    if (user.verified === true || user.verificationStatus === 'approved') throw new HttpsError('failed-precondition', 'Your KYC is already approved.');
    const existing = await db.collection(REQUESTS).doc(uid).get();
    if (existing.exists && existing.data()?.status === 'pending') throw new HttpsError('failed-precondition', 'Your KYC is already under review.');

    const phone = String(user.phone || user.mobileNumber || user.mobile || '').trim();
    const data = request.data?.kycData || {};
    const submission = {
      uid,
      phone,
      name: String(data.name || '').trim(),
      documentType: data.documentType,
      documentNumber: String(data.documentNumber || '').trim(),
      nationality: String(data.nationality || '').trim(),
      dateOfBirth: data.dateOfBirth,
      gender: data.gender,
      address: String(data.address || '').trim(),
      passportExpiryDate: data.documentType === 'Passport' ? data.passportExpiryDate : undefined,
      frontDocumentUrl: data.frontDocumentUrl || data.documentUrl || '',
      documentUrl: data.frontDocumentUrl || data.documentUrl || '',
      backDocumentUrl: data.backDocumentUrl || '',
      selfieUrl: data.selfieUrl || '',
      liveFaceVerified: data.liveFaceVerified === true,
      faceVerificationMethod: data.faceVerificationMethod || 'native',
      faceVerificationModel: data.faceVerificationModel || 'mobilefacenet-512',
      status: 'pending',
      note: '',
      rejectionReason: '',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: null,
      reviewedAt: null,
    };
    validateSubmission(submission, uid, phone);

    const pendingFace = await db.collection(PENDING).doc(uid).get();
    if (!pendingFace.exists || pendingFace.data()?.status !== 'pending' || pendingFace.data()?.livenessPassed !== true) throw new HttpsError('failed-precondition', 'Complete the live face verification before submitting KYC.');

    await db.runTransaction(async tx => {
      const [latestUser, latestRequest, latestFace] = await Promise.all([
        tx.get(userRef),
        tx.get(db.collection(REQUESTS).doc(uid)),
        tx.get(db.collection(PENDING).doc(uid)),
      ]);
      if (!latestUser.exists || !activeUser(latestUser.data() || {})) throw new HttpsError('permission-denied', 'This account is not active.');
      const latestUserData = latestUser.data() || {};
      if (latestUserData.verified === true || latestUserData.verificationStatus === 'approved') throw new HttpsError('failed-precondition', 'Your KYC is already approved.');
      if (latestRequest.exists && latestRequest.data()?.status === 'pending') throw new HttpsError('failed-precondition', 'Your KYC is already under review.');
      if (!latestFace.exists || latestFace.data()?.status !== 'pending' || latestFace.data()?.livenessPassed !== true) throw new HttpsError('failed-precondition', 'Complete the live face verification before submitting KYC.');
      const requestRef = db.collection(REQUESTS).doc(uid);
      tx.set(requestRef, submission, { merge: false });
      tx.update(userRef, { verificationStatus: 'pending', verified: false });
    });
    return { ok: true, status: 'pending' };
  }

  const embedding = normalizeEmbedding(request.data?.embedding);
  if (request.data?.livenessPassed !== true) throw new HttpsError('failed-precondition', 'Complete the live face movement check first.');

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
    await db.collection(PENDING).doc(uid).set({ uid, status: 'duplicate', duplicateOf: best.uid, similarity: best.score, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ok: false, duplicate: true, similarity: best.score };
  }

  await db.collection(PENDING).doc(uid).set({ uid, status: 'pending', embedding, model: 'mobilefacenet-512', livenessPassed: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, duplicate: false, similarity: best?.score || 0 };
});

exports.diditKycWebhook = async (_request, response) => {
  response.status(410).json({ error: 'Legacy hosted KYC webhook is disabled.' });
};
