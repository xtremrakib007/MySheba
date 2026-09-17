// Phone number (SMS) verification - the SERVER half.
// The client uses Firebase Phone Auth to prove possession of the requested
// number. This module validates the resulting ID token server-side.
const admin = require('firebase-admin');

const VERIFIED_WINDOW_MS = 15 * 60 * 1000;

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function toE164(phone, dialCode) {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
  return `${dialCode || '+60'}${normalizePhone(phone).replace(/^0+/, '')}`;
}

/** Verify that an ID token came from Firebase Phone Auth for the requested
 * phone number and was issued recently enough to be used for verification. */
exports.assertPhoneVerified = async (idToken, phone, dialCode = '+60') => {
  if (!idToken) throw new Error('Please verify your phone number first.');
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    throw new Error('Please verify your phone number first.');
  }
  if (decoded.phone_number !== toE164(phone, dialCode)) throw new Error('The verified phone number does not match.');
  const authTimeMs = (decoded.auth_time || 0) * 1000;
  if (!authTimeMs || Date.now() - authTimeMs < 0 || Date.now() - authTimeMs > VERIFIED_WINDOW_MS) {
    throw new Error('Your phone verification has expired. Please verify again.');
  }
  return decoded.uid;
};
