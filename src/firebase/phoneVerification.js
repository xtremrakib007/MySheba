// MySheba SMS OTP implementation using Firebase Phone Authentication.
import rnfbAuth from '@react-native-firebase/auth';

const PHONE_AUTH_TIMEOUT_MS = 30000;
const SMS_RESEND_COOLDOWN_MS = 60000;
let lastSmsRequestByPhone = new Map();

function digitsOnly(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function toE164(phone, dialCode) {
  const raw = String(phone || '').trim();
  let e164;
  if (raw.startsWith('+')) {
    const digits = digitsOnly(raw);
    e164 = `+${digits}`;
  } else {
    const localDigits = digitsOnly(raw).replace(/^0+/, '');
    const countryDigits = digitsOnly(dialCode || '+60');
    if (!localDigits || !countryDigits) throw new Error('Please enter a valid phone number.');
    e164 = `+${countryDigits}${localDigits}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) throw new Error('Please enter a valid international phone number.');
  return e164;
}

export function phoneToE164(phone, dialCode = '+60') {
  return toE164(phone, dialCode);
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.code = 'auth/network-request-failed';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function sendPhoneOtp(phone, dialCode = '+60') {
  const e164 = toE164(phone, dialCode);
  const now = Date.now();
  const last = lastSmsRequestByPhone.get(e164) || 0;
  const remaining = SMS_RESEND_COOLDOWN_MS - (now - last);
  if (remaining > 0) {
    throw new Error(`Please wait ${Math.ceil(remaining / 1000)} seconds before requesting another SMS code.`);
  }
  lastSmsRequestByPhone.set(e164, now);
  try {
    await rnfbAuth().signOut().catch(() => {});
    return await withTimeout(
      rnfbAuth().signInWithPhoneNumber(e164),
      PHONE_AUTH_TIMEOUT_MS,
      'SMS request took too long. Check your internet connection and try again.'
    );
  } catch (err) {
    // A failed request should not trap the user behind our local cooldown.
    lastSmsRequestByPhone.delete(e164);
    throw new Error(friendlyPhoneAuthError(err));
  }
}

export async function confirmPhoneOtp(confirmation, code) {
  const otp = String(code || '').trim();
  if (!/^\d{6}$/.test(otp)) throw new Error('Please enter the 6-digit code we sent you.');
  if (!confirmation || typeof confirmation.confirm !== 'function') {
    throw new Error('This SMS verification session has expired. Please request a new code.');
  }

  try {
    const userCredential = await withTimeout(
      confirmation.confirm(otp),
      PHONE_AUTH_TIMEOUT_MS,
      'SMS verification took too long. Check your connection and try again.'
    );
    const idToken = await withTimeout(
      userCredential.user.getIdToken(true),
      PHONE_AUTH_TIMEOUT_MS,
      'Getting your phone verification result took too long. Please try again.'
    );
    return { idToken, phoneNumber: userCredential.user.phoneNumber || '' };
  } catch (err) {
    throw new Error(friendlyPhoneAuthError(err));
  } finally {
    // The phone-auth identity is only a temporary proof-of-possession identity.
    // The verified ID token is handed to the device-session callable, which
    // verifies it against the real MySheba account before trusting the device.
    await rnfbAuth().signOut().catch(() => {});
  }
}

function friendlyPhoneAuthError(err) {
  const code = String(err?.code || '').toLowerCase();
  const rawMessage = String(err?.message || '');
  const detail = code ? ` [Firebase: ${code}]` : '';

  if (code === 'auth/unknown' && /code\s*:?\s*39/i.test(rawMessage)) {
    return 'Firebase has temporarily rate-limited SMS verification for this phone number or device. Do not keep retrying; wait for the Firebase limit to clear, then request one new code.' + detail;
  }
  if (code.includes('invalid-phone')) return 'Please enter a valid international phone number.' + detail;
  if (code.includes('missing-phone')) return 'Please enter your phone number.' + detail;
  if (code.includes('too-many') || code.includes('quota')) return 'Too many SMS verification attempts. Please wait and try again later.' + detail;
  if (code.includes('invalid-verification-code')) return 'Incorrect SMS code. Please check the latest SMS and try again.' + detail;
  if (code.includes('code-expired') || code.includes('session-expired')) return 'That SMS code has expired. Please request a new code.' + detail;
  if (code.includes('operation-not-allowed')) return 'Firebase Phone Authentication is not enabled. Enable Phone in Firebase Authentication.' + detail;
  if (code.includes('app-not-authorized')) return 'This MySheba Android release is not authorized for Firebase Phone Auth. Add the release SHA-1/SHA-256 to Firebase and rebuild.' + detail;
  if (code.includes('captcha') || code.includes('play-integrity')) return 'Firebase app verification failed. Check Google Play services and the Android SHA-256/SHA-1 configuration.' + detail;
  if (code.includes('network')) return 'Network error. Check your connection and try again.' + detail;
  return (err?.message || 'Could not verify your phone number. Please try again.') + detail;
}
