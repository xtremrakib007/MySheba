// Production auth for MySheba.
import {
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithCustomToken,
  linkWithCredential,
  GoogleAuthProvider,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, functions } from './config';
import { getGoogleIdToken, getGoogleIdTokenAndProfile, googleSignOut } from './googleAuth';
import { logActivity } from './logService';
import { getDeviceId, getDeviceLabel, setLocalSessionId, clearLocalSessionId } from './deviceSessionService';
import { toE164 as phoneToE164 } from '../data/phoneCountries';

const APP_EMAIL_DOMAIN = 'mysheba.app';
let pendingGoogleLinkCredential = null;
let pendingGoogleLinkEmail = '';

export function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function phoneToEmail(phone, dialCode = '+60') {
  const e164 = phoneToE164(phone, dialCode);
  return `${e164.replace(/[^0-9]/g, '')}@${APP_EMAIL_DOMAIN}`;
}

function legacyPhoneToEmail(phone) {
  return `${normalizePhone(phone)}@${APP_EMAIL_DOMAIN}`;
}

export function isValidPhone(phone) {
  return normalizePhone(phone).length >= 8;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function isValidPin(pin) {
  const value = String(pin || '');
  return value.length >= 6 && value.length <= 20;
}

export async function registerCustomer({ name, phone, phoneE164, dialCode, email, pin, phoneIdToken, emailIdToken, emailOtpVerificationId }) {
  if (!name || !name.trim()) throw new Error('Please enter your full name.');
  if (!isValidPhone(phone)) throw new Error('Please enter a valid phone number.');
  if (!isValidEmail(email)) throw new Error('Please enter a valid email address.');
  if (!isValidPin(pin)) throw new Error('Password must be 6-20 characters.');
  if (!phoneIdToken && !emailIdToken && !emailOtpVerificationId) {
    throw new Error('Please verify your phone number by SMS or verify your email address by link/OTP first.');
  }

  const registerFn = httpsCallable(functions, 'registerCustomer');
  await registerFn({
    name,
    phone,
    phoneE164,
    dialCode,
    email,
    pin,
    phoneIdToken,
    emailIdToken,
    emailOtpVerificationId,
  });
  const authEmail = phoneToEmail(phone, dialCode);
  const cred = await signInWithEmailAndPassword(auth, authEmail, pin);
  const snap = await getDoc(doc(db, 'users', cred.user.uid));

  try {
    const deviceId = await getDeviceId();
    const sessionFn = httpsCallable(functions, 'checkDeviceSession');
    const { data: sessionResult } = await sessionFn({ deviceId, deviceLabel: getDeviceLabel() });
    if (sessionResult && sessionResult.sessionId) await setLocalSessionId(sessionResult.sessionId);
  } catch (e) {}

  return { uid: cred.user.uid, ...snap.data() };
}

async function linkPendingGoogleCredentialIfNeeded() {
  if (!pendingGoogleLinkCredential) return;
  const credential = pendingGoogleLinkCredential;
  const email = pendingGoogleLinkEmail;
  pendingGoogleLinkCredential = null;
  pendingGoogleLinkEmail = '';
  const user = auth.currentUser;
  if (!user) {
    pendingGoogleLinkCredential = credential;
    pendingGoogleLinkEmail = email;
    throw new Error('Your Google sign-in could not be completed. Please try Google sign-in again.');
  }
  try {
    await linkWithCredential(user, credential);
    await updateDoc(doc(db, 'users', user.uid), { googleLinked: true, googleEmail: email || user.email || '' });
    logActivity('linkGoogleAccount', { method: 'googleRecovery' });
  } catch (err) {
    pendingGoogleLinkCredential = credential;
    pendingGoogleLinkEmail = email;
    if (err && err.code === 'auth/provider-already-linked') {
      pendingGoogleLinkCredential = null;
      pendingGoogleLinkEmail = '';
      return;
    }
    if (err && err.code === 'auth/credential-already-in-use') {
      throw new Error('This Google account is already linked to another account. Please contact MySheba support.');
    }
    throw new Error(friendlyAuthError(err));
  }
}

export function hasPendingGoogleLink() {
  return !!pendingGoogleLinkCredential;
}

export function clearPendingGoogleLink() {
  pendingGoogleLinkCredential = null;
  pendingGoogleLinkEmail = '';
}

export async function login(phone, pin, dialCode = '+60') {
  if (!isValidPhone(phone)) throw new Error('Please enter a valid phone number.');
  if (!pin) throw new Error('Please enter your password.');
  const email = phoneToEmail(phone, dialCode);
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email, pin);
  } catch (err) {
    if (dialCode === '+60') {
      try { cred = await signInWithEmailAndPassword(auth, legacyPhoneToEmail(phone), pin); }
      catch (_) { throw new Error(friendlyAuthError(err)); }
    } else throw new Error(friendlyAuthError(err));
  }

  const snap = await getDoc(doc(db, 'users', cred.user.uid));
  if (!snap.exists()) {
    await signOut(auth);
    throw new Error('No profile found for this account. Please register first.');
  }
  let profileData = snap.data();
  if (!profileData.userId) {
    try {
      const ensureFn = httpsCallable(functions, 'ensureUserId');
      const { data } = await ensureFn({});
      profileData = { ...profileData, userId: data.userId };
    } catch (e) {}
  }

  let googleWasLinked = false;
  try {
    googleWasLinked = !!pendingGoogleLinkCredential;
    await linkPendingGoogleCredentialIfNeeded();
    if (pendingGoogleLinkCredential) {
      await signOut(auth);
      throw new Error('Google could not be linked to this account. Please try again from Settings.');
    }
  } catch (err) {
    await signOut(auth);
    throw err;
  }

  const deviceId = await getDeviceId();
  const sessionFn = httpsCallable(functions, 'checkDeviceSession');
  let sessionResult;
  try {
    const res = await sessionFn({ deviceId, deviceLabel: getDeviceLabel() });
    sessionResult = res.data;
  } catch (err) {
    await signOut(auth);
    throw new Error(friendlyAuthError(err));
  }
  if (sessionResult.requiresOtp) {
    logActivity('loginPendingDeviceApproval', { method: 'phone', reason: sessionResult.reason });
    return { uid: cred.user.uid, ...profileData, pendingDeviceApproval: { deviceId, email: sessionResult.email, phone: sessionResult.phone, reason: sessionResult.reason, availableMfaMethods: sessionResult.availableMfaMethods } };
  }
  await setLocalSessionId(sessionResult.sessionId);
  logActivity('login', { method: 'phone' });
  return { uid: cred.user.uid, ...profileData, ...(googleWasLinked ? { googleLinked: true } : {}) };
}

// Google sign-in handles both an existing phone/password account and a new
// Google account. The backend resolver verifies that the Google provider is
// actually owned by the target MySheba UID before returning a custom token.
export async function signInWithGoogle() {
  const idToken = await getGoogleIdToken();
  const credential = GoogleAuthProvider.credential(idToken);
  try {
    await signInWithCredential(auth, credential);
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }

  const temporaryGoogleUser = auth.currentUser;
  const googleEmail = temporaryGoogleUser?.email || '';
  const resolveFn = httpsCallable(functions, 'signInExistingGoogleAccount');
  try {
    const { data: resolved } = await resolveFn({});
    if (resolved && resolved.found && resolved.customToken) {
      // The resolver has already verified that this exact Google provider is
      // attached to the target UID. Do NOT call linkWithCredential here: the
      // provider is already linked to that account and attempting to relink it
      // can produce auth/provider-already-linked or auth/credential-already-in-use.
      await signInWithCustomToken(auth, resolved.customToken);

      // The temporary Google Auth user is no longer current after the custom
      // token sign-in. Do not call delete() on it from the client; doing so can
      // fail unpredictably and can turn a successful sign-in into a failure.
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        googleLinked: true,
        googleEmail: googleEmail || auth.currentUser.email || '',
      });
      logActivity('linkGoogleAccount', { method: 'googleExistingAccount' });
      return finishGoogleSignIn({}, null);
    }
  } catch (err) {
    if (err && err.code === 'functions/permission-denied') throw new Error(err.message || 'Google sign-in is not permitted.');
    if (err && err.code === 'functions/unauthenticated') throw new Error('Google sign-in expired. Please try again.');
    // Resolver availability failures may fall back to the normal Google
    // onboarding flow. Identity/security failures are handled above.
    if (err && (err.code === 'functions/failed-precondition' || err.code === 'functions/internal')) {
      throw new Error(err.message || 'Google sign-in could not be completed. Please try again.');
    }
    if (err && err.message && err.message.includes('Google sign-in could not be linked')) throw err;
  }

  return finishGoogleSignIn({}, credential);
}

export async function completeGoogleSignup(phone) {
  if (!auth.currentUser) throw new Error('Your Google sign-in has expired. Please start again.');
  return finishGoogleSignIn({ phone }, null);
}

async function finishGoogleSignIn(ensureProfileArgs, googleCredential = null) {
  if (!auth.currentUser) throw new Error('Your Google sign-in has expired. Please start again.');
  let data;
  const existingProfileSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
  if (existingProfileSnap.exists()) {
    data = existingProfileSnap.data();
  } else {
    const ensureProfileFn = httpsCallable(functions, 'ensureGoogleProfile');
    try {
      const result = await ensureProfileFn(ensureProfileArgs);
      data = result.data;
    } catch (err) {
      if (err && err.message === 'PHONE_REQUIRED') {
        const needsPhoneErr = new Error('A mobile number is required to finish creating your account.');
        needsPhoneErr.needsPhone = true;
        throw needsPhoneErr;
      }
      const duplicateEmail =
        (err && (err.code === 'functions/already-exists' || err.code === 'already-exists')) ||
        /already (registered|exists).*MySheba/i.test(String(err && err.message || ''));
      if (duplicateEmail && googleCredential) {
        pendingGoogleLinkCredential = googleCredential;
        pendingGoogleLinkEmail = auth.currentUser.email || '';
        const temporaryGoogleUser = auth.currentUser;
        try { await temporaryGoogleUser.delete(); }
        catch (deleteErr) {
          pendingGoogleLinkCredential = null;
          pendingGoogleLinkEmail = '';
          await signOut(auth).catch(() => {});
          throw new Error('This Google email already belongs to an existing MySheba account.');
        }
        throw new Error('This Google email already belongs to an existing MySheba account.');
      }
      await signOut(auth).catch(() => {});
      throw new Error(err && err.message || 'Google sign-in failed.');
    }
  }

  const deviceId = await getDeviceId();
  const sessionFn = httpsCallable(functions, 'checkDeviceSession');
  let sessionResult;
  try {
    const res = await sessionFn({ deviceId, deviceLabel: getDeviceLabel() });
    sessionResult = res.data;
  } catch (err) {
    await signOut(auth);
    throw new Error(friendlyAuthError(err));
  }
  if (sessionResult.requiresOtp) {
    logActivity('loginPendingDeviceApproval', { method: 'google', reason: sessionResult.reason });
    return { uid: auth.currentUser.uid, ...data, pendingDeviceApproval: { deviceId, email: sessionResult.email, phone: sessionResult.phone, reason: sessionResult.reason, availableMfaMethods: sessionResult.availableMfaMethods } };
  }
  await setLocalSessionId(sessionResult.sessionId);
  logActivity('login', { method: 'google' });
  return { uid: auth.currentUser.uid, ...data };
}

export async function linkGoogleAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');
  const { idToken, email } = await getGoogleIdTokenAndProfile();
  const credential = GoogleAuthProvider.credential(idToken);
  try {
    await linkWithCredential(user, credential);
  } catch (err) {
    if (err && err.code === 'auth/credential-already-in-use') {
      const mergeErr = new Error('That Google account is already linked to a different MySheba account.');
      mergeErr.mergeAvailable = true;
      mergeErr.googleEmail = email;
      throw mergeErr;
    }
    if (err && err.code === 'auth/provider-already-linked') throw new Error('A Google account is already linked to this account.');
    throw new Error(friendlyAuthError(err));
  }
  await updateDoc(doc(db, 'users', user.uid), { googleLinked: true, googleEmail: email || user.email || '' });
  logActivity('linkGoogleAccount');
}

export async function startGoogleAccountMerge(email) {
  const fn = httpsCallable(functions, 'startAccountMerge');
  try { const { data } = await fn({ email }); return data; }
  catch (err) { throw new Error(friendlyAuthError(err)); }
}

export async function confirmGoogleAccountMerge(code) {
  const fn = httpsCallable(functions, 'confirmAccountMerge');
  try { const { data } = await fn({ code }); return data; }
  catch (err) { throw new Error(friendlyAuthError(err)); }
}

export async function retryDeviceSession(uid, phoneIdToken, emailIdToken, emailOtp, resendEmailChallenge = false) {
  const deviceId = await getDeviceId();
  const sessionFn = httpsCallable(functions, 'checkDeviceSession');
  const { data: sessionResult } = await sessionFn({ deviceId, deviceLabel: getDeviceLabel(), phoneIdToken, emailIdToken, emailOtp, resendEmailChallenge });
  if (sessionResult.requiresOtp) return { uid, pendingDeviceApproval: { deviceId, email: sessionResult.email, phone: sessionResult.phone, reason: sessionResult.reason, availableMfaMethods: sessionResult.availableMfaMethods } };
  await setLocalSessionId(sessionResult.sessionId);
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) throw new Error('No profile found for this account.');
  logActivity('deviceVerified');
  return { uid, ...snap.data() };
}

export async function confirmDeviceLogin(uid, emailIdToken) {
  const deviceId = await getDeviceId();
  const confirmFn = httpsCallable(functions, 'confirmDeviceSwitch');
  const { data: sessionResult } = await confirmFn({ deviceId, emailIdToken });
  await setLocalSessionId(sessionResult.sessionId);
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) throw new Error('No profile found for this account.');
  logActivity('deviceVerified');
  return { uid, ...snap.data() };
}

export async function logout() {
  clearPendingGoogleLink();
  logActivity('logout');
  try {
    const deviceId = await getDeviceId();
    const clearFn = httpsCallable(functions, 'clearActiveSession');
    await clearFn({ deviceId });
  } catch (e) {}
  await clearLocalSessionId();
  await googleSignOut();
  await signOut(auth);
}

export function subscribeAuth(callback) { return onAuthStateChanged(auth, callback); }

export async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

function friendlyAuthError(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || '');
  if (code.includes('invalid-credential')) return 'Your sign-in credential is invalid or expired. Please try again.';
  if (code.includes('wrong-password') || code.includes('invalid-login-credentials')) return 'Incorrect password. Please try again.';
  if (code.includes('user-not-found')) return 'No account was found with those details.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait and try again later.';
  if (code.includes('network-request-failed')) return 'Network error. Please check your internet connection.';
  return message || 'Authentication failed. Please try again.';
}
