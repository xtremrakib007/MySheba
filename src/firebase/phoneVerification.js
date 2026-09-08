// Phone number (SMS) verification for registration - real Firebase Phone
// Auth via @react-native-firebase/auth. No custom/fake OTP is generated.
import rnfbAuth from '@react-native-firebase/auth';

const PHONE_AUTH_TIMEOUT_MS = 20000;

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function toE164(phone, dialCode) {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) {
    const international = `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
    if (international.length < 8 || international.length > 16) {
      throw new Error('Please enter a valid phone number.');
    }
    return international;
  }
  const digits = normalizePhone(phone).replace(/^0+/, '');
  const cleanDialCode = String(dialCode || '').replace(/[^0-9+]/g, '');
  if (!digits || !/^\+?[0-9]{1,4}$/.test(cleanDialCode)) {
    throw new Error('Please enter a valid phone number.');
  }
  const e164 = `${cleanDialCode.startsWith('+') ? cleanDialCode : `+${cleanDialCode}`}${digits}`;
  if (e164.length < 8 || e164.length > 16) {
    throw new Error('Please enter a valid phone number.');
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
  if (!/^\d{6}$/.test(otp)) {
    throw new Error('Please enter the 6-digit code we sent you.');
  }
  if (!confirmation || typeof confirmation.confirm !== 'function') {
    throw new Error('This SMS verification session has expired. Please request a new code.');
  }

  let userCredential;
  try {
    userCredential = await withTimeout(
      confirmation.confirm(otp),
      PHONE_AUTH_TIMEOUT_MS,
      'SMS verification took too long. Check your internet connection and try again.'
    );
  } catch (err) {
    throw new Error(friendlyPhoneAuthError(err));
  }

  try {
    const idToken = await withTimeout(
      userCredential.user.getIdToken(),
      PHONE_AUTH_TIMEOUT_MS,
      'Getting your phone verification result took too long. Please try again.'
    );
    return { idToken };
  } finally {
    await rnfbAuth().signOut().catch(() => {});
  }
}

function friendlyPhoneAuthError(err) {
  const code = err && err.code;
  if (code === 'auth/invalid-phone-number') return 'Please enter a valid phone number.';
  if (code === 'auth/missing-phone-number') return 'Please enter your phone number.';
  if (code === 'auth/too-many-requests') return 'Too many SMS attempts. Please try again later.';
  if (code === 'auth/invalid-verification-code') return 'Incorrect code. Please try again.';
  if (code === 'auth/code-expired') return 'That code has expired. Please request a new one.';
  if (code === 'auth/session-expired') return 'The SMS verification session expired. Please request a new code.';
  if (code === 'auth/network-request-failed') return err?.message || 'Network error. Check your connection and try again.';
  if (code === 'auth/quota-exceeded') return 'SMS verification is temporarily unavailable. Please try again later.';
  if (code === 'auth/operation-not-allowed') return 'Phone sign-in is not enabled in Firebase Authentication.';
  if (code === 'auth/app-not-authorized') return 'This MySheba app is not authorized for Firebase Phone Auth. Check the Android Firebase configuration.';
  if (code === 'auth/captcha-check-failed') return 'Firebase security verification failed. Please try again.';
  return (err && err.message) || 'Could not verify your phone number. Please try again.';
}
