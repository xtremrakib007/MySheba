// Phone number (SMS) verification - the SERVER half.
//
// The client half (src/firebase/phoneVerification.js) uses real Firebase
// Phone Auth to prove the person registering can receive SMS at the phone
// number they typed, and hands back a fresh ID token for that (throwaway,
// separate-from-the-real-account) Firebase Auth identity. This file is
// what functions/customerRegistration.js calls to check that token
// server-side before creating the account - never trust the client's word
// alone that verification happened, same reasoning as otpService.js's
// assertRecentlyVerified for the email OTP step.
//
// Not a callable itself - only used internally by registerWithDealerCode.

const admin = require('firebase-admin');

const VERIFIED_WINDOW_MS = 15 * 60 * 1000; // how long a phone-auth ID token stays usable for registration

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

/** Malaysian local numbers are typed with a leading 0 that isn't part of
 * the E.164 form the ID token's phone_number claim will be in - same
 * conversion as the client's toE164 in src/firebase/phoneVerification.js. */
function toE164(phone, dialCode) {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
  return `${dialCode || '+60'}${normalizePhone(phone).replace(/^0+/, '')}`;
}

/** Verifies `idToken` (from src/firebase/phoneVerification.js's
 * confirmPhoneOtp) actually belongs to a Firebase Phone Auth sign-in for
 * `phone`, done recently. Returns the verified uid (of that throwaway
 * phone-auth identity, NOT the real account - registerWithDealerCode
 * deletes it afterward) on success, or throws. */
exports.assertPhoneVerified = async (idToken, phone, dialCode = '+60') => {
  if (!idToken) {
    throw new Error('Please verify your phone number first.');
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    throw new Error('Please verify your phone number first.');
  }

  if (decoded.phone_number !== toE164(phone, dialCode)) {
    throw new Error('The verified phone number does not match.');
  }

  const authTimeMs = (decoded.auth_time || 0) * 1000;
  if (Date.now() - authTimeMs > VERIFIED_WINDOW_MS) {
    throw new Error('Your phone verification has expired. Please verify again.');
  }

  return decoded.uid;
};
