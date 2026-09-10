const admin = require('firebase-admin');

const VERIFIED_WINDOW_MS = 15 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

exports.assertEmailVerified = async (idToken, email) => {
  if (!idToken) throw new Error('Please verify your email address first.');
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch {
    throw new Error('Please verify your email address first.');
  }
  if (normalizeEmail(decoded.email) !== normalizeEmail(email) || !decoded.email_verified) {
    throw new Error('The verified email address does not match.');
  }
  const authTimeMs = (decoded.auth_time || 0) * 1000;
  if (!authTimeMs || Date.now() - authTimeMs > VERIFIED_WINDOW_MS) {
    throw new Error('Your email verification has expired. Please verify again.');
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
