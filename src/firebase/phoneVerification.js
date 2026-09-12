// Phone number (SMS) verification for registration - real Firebase Phone Auth.
import rnfbAuth from '@react-native-firebase/auth';

const PHONE_AUTH_TIMEOUT_MS = 30000;

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

  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    throw new Error('Please enter a valid international phone number.');
  }
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
  try {
    // Ensure an abandoned prior SMS session cannot interfere with a new one.
    await rnfbAuth().signOut().catch(() => {});
    return await withTimeout(
      rnfbAuth().signInWithPhoneNumber(e164),
      PHONE_AUTH_TIMEOUT_MS,
      'SMS request took too long. Check your internet connection and try again.'
    );
  } catch (err) {
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
      'SMS verification took too long. Check your internet connection and try again.'
    );
    const idToken = await withTimeout(
      userCredential.user.getIdToken(true),
      PHONE_AUTH_TIMEOUT_MS,
      'Getting your phone verification result took too long. Please try again.'
    );
    return { idToken };
  } catch (err) {
    throw new Error(friendlyPhoneAuthError(err));
  } finally {
    await rnfbAuth().signOut().catch(() => {});
  }
}

function friendlyPhoneAuthError(err) {
  const code = String(err?.code || '').toLowerCase();
  // Include the actionable Firebase code in release builds so an SMS failure
  // can be diagnosed from the on-screen error instead of appearing generic.
  const detail = code ? ` [Firebase: ${code}]` : '';
  if (code.includes('invalid-phone')) return 'Please enter a valid international phone number.' + detail;
  if (code.includes('missing-phone')) return 'Please enter your phone number.' + detail;
  if (code.includes('too-many') || code.includes('quota')) return 'Too many SMS attempts. Please try again later.' + detail;
  if (code.includes('invalid-verification-code')) return 'Incorrect code. Please try again.' + detail;
  if (code.includes('code-expired') || code.includes('session-expired')) return 'That SMS code has expired. Please request a new code.' + detail;
  if (code.includes('operation-not-allowed')) return 'Phone sign-in is not enabled in Firebase Authentication.' + detail;
  if (code.includes('app-not-authorized')) return 'This MySheba app is not authorized for Firebase Phone Auth. Check the release SHA-1/SHA-256 and Firebase Android app configuration.' + detail;
  if (code.includes('captcha') || code.includes('play-integrity')) return 'Firebase security verification failed. Please update Google Play services and try again.' + detail;
  if (code.includes('network')) return 'Network error. Check your connection and try again.' + detail;
  return (err?.message || 'Could not verify your phone number. Please try again.') + detail;
}
