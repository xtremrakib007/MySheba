// Email verification for registration and the "new device" re-verification
// challenge. The same email contains both a Firebase magic link and a 6-digit
// OTP; either method proves control of the mailbox.
import rnfbAuth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const EMAIL_FOR_SIGN_IN_KEY = 'mysheba:emailForSignIn';
const EMAIL_LINK_TIMEOUT_MS = 20000;
const EMAIL_OTP_TIMEOUT_MS = 20000;
const EMAIL_BRIDGE_SCHEME = 'mysheba://verify-email-link';

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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Returns the original Firebase URL when the link arrived through our
 * HTTPS Hosting bridge (mysheba://verify-email-link?link=...). */
export function unwrapEmailSignInLink(url) {
  if (!url) return null;
  const value = String(url);
  if (!value.startsWith(EMAIL_BRIDGE_SCHEME)) return value;
  try {
    const parsed = new URL(value);
    return parsed.searchParams.get('link');
  } catch {
    return null;
  }
}

/** Sends ONE custom email containing both the Firebase magic link and a 6-digit OTP. */
export async function sendEmailLink(email) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Please enter a valid email address.');
  }
  try {
    const fn = httpsCallable(functions, 'registerWithDealerCode');
    const result = await withTimeout(
      fn({ action: 'sendEmailVerificationChallenge', email: normalized }),
      EMAIL_LINK_TIMEOUT_MS,
      'Sending the verification email took too long. Please try again.'
    );
    await AsyncStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, normalized);
    return result.data;
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
  const email = storedEmail || normalizeEmail(expectedEmail);
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

/** Verifies the 6-digit code and converts the server-issued proof into the
 * same short-lived Firebase ID token expected by customerRegistration. */
export async function confirmEmailOtp(email, code) {
  const normalized = normalizeEmail(email);
  const value = String(code || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!/^\d{6}$/.test(value)) {
    throw new Error('Enter the 6-digit verification code.');
  }

  try {
    const fn = httpsCallable(functions, 'registerWithDealerCode');
    const result = await withTimeout(
      fn({ action: 'verifyEmailOtp', email: normalized, code: value }),
      EMAIL_OTP_TIMEOUT_MS,
      'Email OTP verification took too long. Please try again.'
    );
    const customToken = result?.data?.customToken;
    if (!customToken) throw new Error('The verification result was incomplete. Please request a new code.');

    const credential = await withTimeout(
      rnfbAuth().signInWithCustomToken(customToken),
      EMAIL_OTP_TIMEOUT_MS,
      'Signing in with the email verification result took too long. Please try again.'
    );
    try {
      const idToken = await withTimeout(
        credential.user.getIdToken(),
        EMAIL_OTP_TIMEOUT_MS,
        'Getting your verification result took too long. Please try again.'
      );
      return { idToken, email: normalized };
    } finally {
      await AsyncStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY).catch(() => {});
      await rnfbAuth().signOut().catch(() => {});
    }
  } catch (err) {
    throw new Error(friendlyEmailOtpError(err));
  }
}

function friendlyEmailOtpError(err) {
  const code = err && err.code;
  if (code === 'functions/invalid-argument') return err.message || 'Enter the 6-digit verification code.';
  if (code === 'functions/failed-precondition') return err.message || 'That code has expired. Please request a new one.';
  if (code === 'functions/already-exists') return err.message || 'This email address is already registered.';
  if (code === 'functions/resource-exhausted') return 'Too many attempts. Please wait and try again.';
  if (code === 'auth/network-request-failed') return err?.message || 'Network error. Check your connection and try again.';
  return (err && err.message) || 'Could not verify the email code. Please try again.';
}

function friendlyEmailLinkError(err) {
  const code = err && err.code;
  if (code === 'functions/invalid-argument') return err.message || 'Please enter a valid email address.';
  if (code === 'functions/failed-precondition') return err.message || 'Could not create the verification email. Please try again.';
  if (code === 'functions/already-exists') return err.message || 'This email address is already registered.';
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
