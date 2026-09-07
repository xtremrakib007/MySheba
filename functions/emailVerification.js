// Email verification - the SERVER half.
//
// The client half (src/firebase/emailVerification.js) uses real Firebase
// Auth email-link sign-in to prove the person can open the inbox for the
// email address they typed, and hands back a fresh ID token for that
// (throwaway, separate-from-the-real-account) Firebase Auth identity. This
// file is what functions/customerRegistration.js and
// functions/deviceSessionService.js's confirmDeviceSwitch call to check
// that token server-side before proceeding - never trust the client's word
// alone that verification happened, same reasoning/shape as
// functions/phoneVerification.js's assertPhoneVerified.
//
// Not a callable itself - only used internally by other Functions.

const admin = require('firebase-admin');

const VERIFIED_WINDOW_MS = 15 * 60 * 1000; // how long an email-link ID token stays usable

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Verifies `idToken` (from src/firebase/emailVerification.js's
 * confirmEmailLink) actually belongs to a Firebase email-link sign-in for
 * `email`, done recently. Returns the verified uid (of that throwaway
 * email-auth identity, NOT the real account - callers delete it afterward)
 * on success, or throws. */
exports.assertEmailVerified = async (idToken, email) => {
  if (!idToken) {
    throw new Error('Please verify your email address first.');
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    throw new Error('Please verify your email address first.');
  }

  if (normalizeEmail(decoded.email) !== normalizeEmail(email) || !decoded.email_verified) {
    throw new Error('The verified email address does not match.');
  }

  const authTimeMs = (decoded.auth_time || 0) * 1000;
  if (Date.now() - authTimeMs > VERIFIED_WINDOW_MS) {
    throw new Error('Your email verification has expired. Please verify again.');
  }

  return decoded.uid;
};
