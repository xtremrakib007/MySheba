const admin = require('firebase-admin');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// The Firebase ID token already has a bounded lifetime and is cryptographically
// verified by Admin SDK. Do not impose a second 15-minute auth_time window here:
// doing so can make a successfully verified email appear unverified when the
// registration flow is resumed after a short delay or app-link round trip.
exports.assertEmailVerified = async (idToken, email) => {
  if (!idToken) throw new Error('Please verify your email address first.');
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    throw new Error('Please verify your email address first.');
  }
  if (normalizeEmail(decoded.email) !== normalizeEmail(email) || decoded.email_verified !== true) {
    throw new Error('The verified email address does not match.');
  }
  return decoded.uid;
};

exports.assertEmailOtpVerified = async (verificationId, email) => {
  if (!verificationId) throw new Error('Please verify your email address first.');
  const normalized = normalizeEmail(email);
  const ref = admin.firestore().collection('emailVerificationProofs').doc(String(verificationId));
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Your email verification has expired. Please request a new code.');
    const proof = snap.data() || {};
    if (proof.used || normalizeEmail(proof.email) !== normalized || !proof.expiresAt || Date.now() > Number(proof.expiresAt)) {
      throw new Error('Your email verification has expired. Please request a new code.');
    }
    tx.update(ref, { used: true, consumedAt: admin.firestore.FieldValue.serverTimestamp() });
    return proof.email;
  });
};
