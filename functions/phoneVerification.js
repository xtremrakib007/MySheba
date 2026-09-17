// Phone number (SMS) verification - the SERVER half.
//
// The client half uses Firebase Phone Auth and hands back a fresh ID token.
// This helper verifies that token server-side before sensitive account flows.
const admin = require('firebase-admin');

const VERIFIED_WINDOW_MS = 15 * 60 * 1000;

function normalizePhone(phone) { return String(phone || '').replace(/[^0-9]/g, ''); }
function toE164(phone, dialCode) {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
  return `${dialCode || '+60'}${normalizePhone(phone).replace(/^0+/, '')}`;
}

exports.assertPhoneVerified = async (idToken, phone, dialCode = '+60') => {
  if (!idToken) throw new Error('Please verify your phone number first.');
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(idToken); }
  catch { throw new Error('Please verify your phone number first.'); }
  if (decoded.phone_number !== toE164(phone, dialCode)) throw new Error('The verified phone number does not match.');
  const authTimeMs = (decoded.auth_time || 0) * 1000;
  const ageMs = Date.now() - authTimeMs;
  if (!authTimeMs || ageMs < 0 || ageMs > VERIFIED_WINDOW_MS) throw new Error('Your phone verification has expired. Please verify again.');
  return decoded.uid;
};
