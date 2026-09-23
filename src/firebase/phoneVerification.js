// MySheba SMS OTP implementation using Firebase Phone Authentication.
import rnfbAuth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PHONE_AUTH_TIMEOUT_MS = 30000;
const SMS_RESEND_COOLDOWN_MS = 60000;
const SMS_COOLDOWN_KEY = 'mysheba:smsOtpLastRequest:v1';
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

async function getLastRequest(e164) {
  const memoryValue = lastSmsRequestByPhone.get(e164) || 0;
  try {
    const raw = await AsyncStorage.getItem(SMS_COOLDOWN_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    const storedValue = Number(saved?.[e164] || 0);
    return Math.max(memoryValue, Number.isFinite(storedValue) ? storedValue : 0);
  } catch (_) {
    return memoryValue;
  }
}

async function rememberLastRequest(e164, timestamp) {
  lastSmsRequestByPhone.set(e164, timestamp);
  try {
    const raw = await AsyncStorage.getItem(SMS_COOLDOWN_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    saved[e164] = timestamp;
    // Keep this small and discard entries older than one day.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    Object.keys(saved).forEach((key) => {
      if (Number(saved[key]) < cutoff) delete saved[key];
    });
    await AsyncStorage.setItem(SMS_COOLDOWN_KEY, JSON.stringify(saved));
  } catch (_) {
    // The in-memory guard still protects the current app process if storage fails.
  }
}

async function clearLastRequest(e164, expectedTimestamp) {
  if ((lastSmsRequestByPhone.get(e164) || 0) !== expectedTimestamp) return;
  lastSmsRequestByPhone.delete(e164);
  try {
    const raw = await AsyncStorage.getItem(SMS_COOLDOWN_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    if (Number(saved?.[e164] || 0) === expectedTimestamp) {
      delete saved[e164];
      await AsyncStorage.setItem(SMS_COOLDOWN_KEY, JSON.stringify(saved));
    }
  } catch (_) {}
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
  const last = await getLastRequest(e164);
  const remaining = SMS_RESEND_COOLDOWN_MS - (now - last);
  if (remaining > 0) {
    throw new Error(`Please wait ${Math.ceil(remaining / 1000)} seconds before requesting another SMS code.`);
  }

  await rememberLastRequest(e164, now);
  try {
    // Phone Auth is a temporary proof-of-possession session. MySheba's real
    // phone+password session is handled separately by authService.
    await rnfbAuth().signOut().catch(() => {});
    return await withTimeout(
      rnfbAuth().signInWithPhoneNumber(e164),
      PHONE_AUTH_TIMEOUT_MS,
      'SMS request took too long. Check your internet connection and try again.'
    );
  } catch (err) {
    // A failed request should not trap the user behind our local cooldown.
    await clearLastRequest(e164, now);
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
  if (code === 'auth/unknown' && /code\\s*:?\\s*39/i.test(rawMessage)) {
    return 'SMS verification is temporarily unavailable for this number. Please wait and try again later.';
  }
  if (code.includes('invalid-phone')) return 'Please enter a valid phone number.';
  if (code.includes('missing-phone')) return 'Please enter your phone number.';
  if (code.includes('too-many') || code.includes('quota')) return 'Too many SMS verification attempts. Please wait and try again later.';
  if (code.includes('invalid-verification-code')) return 'Incorrect SMS code. Please check the latest SMS and try again.';
  if (code.includes('code-expired') || code.includes('session-expired')) return 'That SMS code has expired. Please request a new code.';
  if (code.includes('operation-not-allowed')) return 'SMS verification is currently unavailable. Please try email verification instead.';
  if (code.includes('app-not-authorized') || code.includes('captcha') || code.includes('play-integrity')) return 'SMS verification is currently unavailable on this device. Please try email verification instead.';
  if (code.includes('network')) return 'Network error. Check your connection and try again.';
  return 'Could not verify your phone number. Please try again.';

