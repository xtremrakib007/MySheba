// Email verification for registration and the "new device" re-verification
// challenge. Firebase Auth consumes the one-time action code ONLY in the
// native app via @react-native-firebase/auth.
import rnfbAuth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EMAIL_LINK_URL = 'https://mysheba.top/verifyEmail';
const EMAIL_FOR_SIGN_IN_KEY = 'mysheba:emailForSignIn';
const EMAIL_LINK_TIMEOUT_MS = 20000;
const EMAIL_BRIDGE_SCHEME = 'mysheba://verify-email-link';

const actionCodeSettings = {
  url: EMAIL_LINK_URL,
  handleCodeInApp: true,
  android: {
    packageName: 'com.satulink.mysheba',
    installApp: true,
    minimumVersion: '1',
  },
};

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

/** Returns the original Firebase URL when the link arrived through our
 * HTTPS Hosting bridge (mysheba://verify-email-link?link=...). */
export function unwrapEmailSignInLink(url) {
  if (!url) return null;
  const value = String(url);
  if (!value.startsWith(EMAIL_BRIDGE_SCHEME)) return value;
  try {
    const parsed = new URL(value);
    const original = parsed.searchParams.get('link');
    return original ? decodeURIComponent(original) : null;
  } catch {
    return null;
  }
}

export async function sendEmailLink(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Please enter a valid email address.');
  }
  try {
    await withTimeout(
      rnfbAuth().sendSignInLinkToEmail(normalized, actionCodeSettings),
      EMAIL_LINK_TIMEOUT_MS,
      'Sending the verification email took too long. Please try again.'
    );
    await AsyncStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, normalized);
  } catch (err) {
    throw new Error(friendlyEmailLinkError(err));
  }
}

export function isEmailSignInLink(url) {
  const original = unwrapEmailSignInLink(url);
  if (!original) return false;
  try {
    return rnfbAuth().isSignInWithEmailLink(original);
  } catch {
    return false;
  }
}

export async function confirmEmailLink(url, expectedEmail) {
  const originalLink = unwrapEmailSignInLink(url);
  if (!originalLink || !isEmailSignInLink(originalLink)) {
    throw new Error('This verification link is invalid. Please request a new one.');
  }

  const storedEmail = await AsyncStorage.getItem(EMAIL_FOR_SIGN_IN_KEY).catch(() => null);
  const email = storedEmail || String(expectedEmail || '').trim().toLowerCase();
  if (!email) throw new Error('Please enter your email address again to finish verifying.');

  let userCredential;
  try {
    userCredential = await withTimeout(
      rnfbAuth().signInWithEmailLink(email, originalLink),
      EMAIL_LINK_TIMEOUT_MS,
      'Email verification took too long. Check your internet connection and try again.'
    );
  } catch (err) {
    throw new Error(friendlyEmailLinkError(err));
  }

  try {
    const idToken = await withTimeout(
      userCredential.user.getIdToken(),
      EMAIL_LINK_TIMEOUT_MS,
      'Getting your verification result took too long. Please try again.'
    );
    return { idToken, email };
  } finally {
    await AsyncStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY).catch(() => {});
    await rnfbAuth().signOut().catch(() => {});
  }
}

function friendlyEmailLinkError(err) {
  const code = err && err.code;
  if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
  if (code === 'auth/invalid-action-code') return 'That link has expired or was already used. Please request a new one.';
  if (code === 'auth/expired-action-code') return 'That link has expired. Please request a new verification email.';
  if (code === 'auth/invalid-continue-uri') return 'The verification link is not configured correctly. Please request a new one.';
  if (code === 'auth/unauthorized-domain') return 'The verification domain is not authorized in Firebase Authentication.';
  if (code === 'auth/network-request-failed') return err?.message || 'Network error. Check your connection and try again.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
  if (code === 'auth/operation-not-allowed') return 'Email-link sign-in is not enabled in Firebase Authentication.';
  return (err && err.message) || 'Could not verify your email address. Please try again.';
}
