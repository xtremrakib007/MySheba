// Production auth for MySheba.
import {
  signInWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, functions } from './config';
import { logActivity } from './logService';
import { noteSignOut } from '../utils/authTrace';
import { getDeviceId, getDeviceLabel, setLocalSessionId, setDeviceCheckDeferred, clearDeviceCheckDeferred, isDeviceCheckUnreachable, clearLocalSessionId } from './deviceSessionService';
import { toE164 as phoneToE164 } from '../data/phoneCountries';

const APP_EMAIL_DOMAIN = 'mysheba.app';

// A callable invoked immediately after Firebase sign-in must receive the
// current ID token. Force-refreshing here prevents a stale/expired token from
// being sent to checkDeviceSession and being rejected as UNAUTHENTICATED (401).
// Records the token's length for the login screen's long-press diagnostic.
// A missing or empty token here and a rejected callable are the same bug seen
// from two ends; knowing which end failed is the whole question.
let lastTokenProbe = 'not attempted';
export function getLastTokenProbe() { return lastTokenProbe; }

async function refreshCallableAuthToken() {
  if (!auth.currentUser) {
    lastTokenProbe = 'no currentUser';
    throw new Error('Please sign in again.');
  }
  try {
    const token = await auth.currentUser.getIdToken(true);
    lastTokenProbe = `token ${String(token || '').length}`;
  } catch (e) {
    lastTokenProbe = `token failed: ${String(e?.code || e?.message || '').slice(0, 40)}`;
    throw e;
  }
}

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

export async function registerCustomer({ name, phone, phoneE164, dialCode, email, pin, phoneIdToken }) {
  if (!name || !name.trim()) throw new Error('Please enter your full name.');
  if (!isValidPhone(phone)) throw new Error('Please enter a valid phone number.');
  if (!isValidEmail(email)) throw new Error('Please enter a valid email address.');
  if (!isValidPin(pin)) throw new Error('Password must be 6-20 characters.');
  if (!phoneIdToken) throw new Error('Please verify your phone number first.');

  const registerFn = httpsCallable(functions, 'registerWithDealerCode');
  await registerFn({ name, phone, phoneE164, dialCode, email, pin, phoneIdToken });
  const authEmail = phoneToEmail(phone, dialCode);
  const cred = await signInWithEmailAndPassword(auth, authEmail, pin);
  const snap = await getDoc(doc(db, 'users', cred.user.uid));

  try {
    const deviceId = await getDeviceId();
    const sessionFn = httpsCallable(functions, 'checkDeviceSession');
    const { data: sessionResult } = await sessionFn({ deviceId, deviceLabel: getDeviceLabel() });
    if (sessionResult && sessionResult.sessionId) await setLocalSessionId(sessionResult.sessionId);
    else await setDeviceCheckDeferred();
  } catch (err) {
    // Registration has already succeeded, so this must not fail the sign-up.
    // But a bare `catch (e) {}` left no session id and no record of why, and
    // every later money action then failed with "Your secure session is
    // missing" until the person signed out and in again - which they had no
    // reason to do. Mark the device unchecked, exactly as sign-in does, so
    // getSessionProof can repair it on first use.
    await setDeviceCheckDeferred();
    logActivity('registerDeviceCheckUnreachable', { code: String(err?.code || '') });
  }

  return { uid: cred.user.uid, ...snap.data() };
}

// Sign-in failures carry a stable `reason` so the UI can pick copy without
// parsing a message, and `isUserFacing` to say the text was written for a
// person rather than thrown by Firebase. Without that flag the login screen
// cannot tell "Too many attempts" from a raw SDK string, so it has to assume
// the worst and show one generic line - which is how a rate-limited user
// ended up being told to check a password that was never wrong.
function reasonFor(err) {
  const code = String(err?.code || '').toLowerCase();
  const status = Number(err?.status || err?.httpStatus || 0);
  const raw = String(err?.message || '').toLowerCase();
  if (
    code === 'auth/user-not-found' || code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' || code === 'functions/unauthenticated' ||
    status === 401 || raw.includes('unauthenticated') ||
    raw.includes('[401]') || raw.includes('http 401')
  ) return 'credentials';
  if (code === 'auth/user-disabled' || code === 'functions/permission-denied') return 'disabled';
  if (code === 'auth/too-many-requests' || code === 'functions/resource-exhausted') return 'rate-limited';
  if (
    code === 'auth/network-request-failed' || code === 'functions/unavailable' ||
    code === 'functions/deadline-exceeded' || code === 'functions/internal' ||
    raw.includes('network') || raw.includes('failed to fetch') ||
    raw.includes('timeout') || raw.includes('timed out')
  ) return 'network';
  return 'unknown';
}

function signInError(err) {
  const e = new Error(friendlyAuthError(err));
  e.isUserFacing = true;
  e.reason = reasonFor(err);
  // Kept for the login screen's long-press diagnostic only. Never rendered
  // on its own - signInErrorCopy still decides what a person reads, and
  // these fields are not part of that decision.
  // The message distinguishes who rejected the call, which the code alone
  // cannot: the callable framework rejects an absent or invalid ID token
  // with its own "unauthenticated", while our requireAuth throws "You must
  // be signed in." Both surface to the client as functions/unauthenticated.
  // Long-press only - signInErrorCopy never reads this.
  const msg = String(err?.message || '').slice(0, 70);
  e.detail = [String(err?.code || ''), Number(err?.status || err?.httpStatus || 0) || '', msg]
    .filter(Boolean).join(' | ') || 'no code';
  return e;
}

function inputError(message, reason) {
  const e = new Error(message);
  e.isUserFacing = true;
  e.reason = reason;
  return e;
}

export async function login(phone, pin, dialCode = '+60') {
  if (!isValidPhone(phone)) throw inputError('Please enter a valid phone number.', 'invalid-phone');
  if (!pin) throw inputError('Please enter your password.', 'missing-password');
  const email = phoneToEmail(phone, dialCode);
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email, pin);
  } catch (err) {
    if (dialCode === '+60') {
      try {
        cred = await signInWithEmailAndPassword(auth, legacyPhoneToEmail(phone), pin);
      } catch (_) {
        throw signInError(err);
      }
    } else {
      throw signInError(err);
    }
  }

  // Firebase Auth has already accepted these credentials, so anything that
  // fails from here is NOT a wrong password and must not be reported as one.
  //
  // This read used to be bare. A Firestore rejection threw straight out of
  // sign-in as whatever Firestore said - "Missing or insufficient
  // permissions" - which reads like the login failed, when in fact the
  // account signed in perfectly and the profile is what could not be read.
  // The two have completely different causes and completely different fixes.
  let snap;
  try {
    snap = await getDoc(doc(db, 'users', cred.user.uid));
  } catch (err) {
    const code = String(err?.code || '');
    if (code === 'permission-denied') {
      // firestore.rules only denies someone their own users/{uid} document
      // when activeProfile() is false - the profile is suspended, inactive,
      // disabled, active:false, or merged into another account. That is a
      // definite "this account may not use the app", so end the session.
      await signOut(auth);
      const e = inputError(
        'This account is not active. Please contact support.',
        'profile-denied',
      );
      e.detail = ['permission-denied', String(err?.message || '').slice(0, 70)].filter(Boolean).join(' | ');
      throw e;
    }
    // Anything else - offline, a dropped connection, a Firestore hiccup - is
    // not an answer about this account. Leave the session signed in: the
    // profile listener retries on its own, and the app shows its restoring
    // state rather than the login form while it does.
    const e = inputError(
      'Signed in, but your profile could not be loaded. Check your connection.',
      'profile-unreachable',
    );
    e.detail = [code, String(err?.message || '').slice(0, 70)].filter(Boolean).join(' | ') || 'no code';
    throw e;
  }
  if (!snap.exists()) {
    await signOut(auth);
    throw inputError('No profile found for this account. Please register first.', 'no-profile');
  }
  const profileData = snap.data();
  if (!profileData.userId) {
    // Fire and forget. This is a backfill for profiles written before userId
    // existed, and its failure was already swallowed - so awaiting it only
    // ever added a round trip to every sign-in for a value nothing on the
    // login path reads. The callable writes to the user document, so the id
    // is there on the next profile load; ProfileScreen already guards on its
    // absence.
    httpsCallable(functions, 'ensureUserId')({}).catch(() => {});
  }

  // The forced getIdToken(true) that used to sit here was added to rule out a
  // stale token causing UNAUTHENTICATED. It was not the cause - App Check
  // enforcement was - and the SDK refreshes the token on its own, so it was
  // one more blocking round trip buying nothing.
  const deviceId = await getDeviceId();
  // Records the token for the login screen's long-press diagnostic. Unlike
  // the forced refresh this replaced, getIdToken() with no argument returns
  // the cached token and makes no network call, so the probe costs nothing.
  try {
    lastTokenProbe = `token ${String(await cred.user.getIdToken()).length}`;
  } catch (e) {
    lastTokenProbe = `token failed: ${String(e?.code || e?.message || '').slice(0, 40)}`;
  }
  const sessionFn = httpsCallable(functions, 'checkDeviceSession');
  let sessionResult;
  try {
    const res = await sessionFn({ deviceId, deviceLabel: getDeviceLabel() });
    sessionResult = res.data;
    await clearDeviceCheckDeferred();
  } catch (err) {
    // An answer of "no" blocks. No answer at all does not.
    //
    // This callable used to veto a sign-in Firebase Auth had already
    // accepted, for any reason at all - so a misconfigured deploy, a cold
    // start timing out, or Cloud Functions having a bad afternoon locked out
    // every user of the app with no fallback. That is not hypothetical: it is
    // what App Check enforcement did here for ten days.
    if (!isDeviceCheckUnreachable(err)) {
      await signOut(auth);
      throw signInError(err);
    }
    await setDeviceCheckDeferred();
    logActivity('loginDeviceCheckUnreachable', { method: 'phone', code: String(err?.code || '') });
    return { uid: cred.user.uid, ...profileData };
  }

  if (sessionResult.requiresOtp) {
    logActivity('loginPendingDeviceApproval', { method: 'phone', reason: sessionResult.reason });
    return {
      uid: cred.user.uid,
      ...profileData,
      pendingDeviceApproval: {
        deviceId,
        email: sessionResult.email,
        phone: sessionResult.phone,
        reason: sessionResult.reason,
        availableMfaMethods: sessionResult.availableMfaMethods,
        // Whether checkDeviceSession says it actually sent the email. An
        // older deployed copy does not report this at all, which is what
        // DeviceVerifyScreen uses to decide whether to ask for one.
        emailChallengeSent: sessionResult.emailChallengeSent,
      },
    };
  }

  await setLocalSessionId(sessionResult.sessionId);
  logActivity('login', { method: 'phone' });
  return { uid: cred.user.uid, ...profileData };
}

export async function retryDeviceSession(uid, phoneIdToken, emailIdToken, emailOtp, resendEmailChallenge = false) {
  await refreshCallableAuthToken();
  const deviceId = await getDeviceId();
  const sessionFn = httpsCallable(functions, 'checkDeviceSession');
  const { data: sessionResult } = await sessionFn({
    deviceId,
    deviceLabel: getDeviceLabel(),
    phoneIdToken,
    emailIdToken,
    emailOtp,
    resendEmailChallenge,
  });
  if (sessionResult.requiresOtp) {
    return {
      uid,
      pendingDeviceApproval: {
        deviceId,
        email: sessionResult.email,
        phone: sessionResult.phone,
        reason: sessionResult.reason,
        availableMfaMethods: sessionResult.availableMfaMethods,
        // Whether checkDeviceSession says it actually sent the email. An
        // older deployed copy does not report this at all, which is what
        // DeviceVerifyScreen uses to decide whether to ask for one.
        emailChallengeSent: sessionResult.emailChallengeSent,
      },
    };
  }
  await setLocalSessionId(sessionResult.sessionId);
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) throw new Error('No profile found for this account.');
  logActivity('deviceVerified');
  return { uid, ...snap.data() };
}

export async function confirmDeviceLogin(uid, emailIdToken) {
  await refreshCallableAuthToken();
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
  logActivity('logout');
  // Record that this sign-out was asked for, so the login screen can tell a
  // deliberate logout apart from a session that died on its own. Written as
  // generic so it yields to a more specific reason recorded moments earlier -
  // the device-takeover path calls this function too, and its reason is the
  // one worth keeping.
  await noteSignOut('manual-logout', 'logout() was called', { generic: true });
  try {
    if (auth.currentUser) await refreshCallableAuthToken();
    const deviceId = await getDeviceId();
    const clearFn = httpsCallable(functions, 'clearActiveSession');
    await clearFn({ deviceId });
  } catch (e) {}
  await clearLocalSessionId();
  await signOut(auth);
}

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// The second callback argument says where the snapshot came from. A missing
// document served from the local cache means "not cached yet", not "this
// account was deleted" - only a server answer can say the profile is gone,
// and treating the two the same is what signed people out on a cold start
// with no network.
export function subscribeProfile(uid, callback, onError) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => callback(snap.exists() ? snap.data() : null, { fromCache: !!snap.metadata?.fromCache }),
    onError,
  );
}

export async function updateUserName(uid, name) {
  if (!name || !name.trim()) throw new Error('Please enter your full name.');
  await updateDoc(doc(db, 'users', uid), { name: name.trim() });
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: name.trim() });
}

export async function updateUserNameParts(uid, { firstName, lastName }) {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  if (!first) throw new Error('Please enter your first name.');
  const fullName = [first, last].filter(Boolean).join(' ');
  await updateDoc(doc(db, 'users', uid), { firstName: first, lastName: last, name: fullName });
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: fullName });
}

export async function updateUserFields(uid, patch) {
  if (!uid || !patch || Object.keys(patch).length === 0) return;
  const clean = {};
  Object.keys(patch).forEach((k) => {
    clean[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
  });
  await updateDoc(doc(db, 'users', uid), clean);
}

export async function updateUserAvatar(uid, url) {
  if (!uid || !url) return;
  await updateDoc(doc(db, 'users', uid), { avatarUrl: url });
  if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: url });
}

export async function markAnnouncementsSeen(uid) {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), { lastSeenAnnouncementAt: serverTimestamp() });
}

export async function updatePushToken(uid, token, platform) {
  if (!uid || !token) return;
  await updateDoc(doc(db, 'users', uid), {
    pushToken: token,
    pushTokenPlatform: platform || '',
    pushTokenUpdatedAt: serverTimestamp(),
  });
}

export async function updateFcmToken(uid, fcmToken) {
  if (!uid || !fcmToken) return;
  await updateDoc(doc(db, 'users', uid), { fcmToken, fcmTokenUpdatedAt: serverTimestamp() });
}

export async function updateNotifPrefs(uid, prefs) {
  if (!uid) return;
  const patch = {};
  Object.keys(prefs || {}).forEach((k) => {
    patch[`notifPrefs.${k}`] = prefs[k];
  });
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, 'users', uid), patch);
}

export async function updateCallSettings(uid, settings) {
  if (!uid) return;
  const patch = {};
  Object.keys(settings || {}).forEach((k) => {
    patch[`callSettings.${k}`] = settings[k];
  });
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, 'users', uid), patch);
}

export async function changePassword(currentPin, newPin) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to change your password.');
  if (!user.email) throw new Error('This account does not have a password to change.');
  if (!currentPin) throw new Error('Please enter your current password.');
  if (!isValidPin(newPin)) throw new Error('New password must be 6-20 characters.');
  if (currentPin === newPin) throw new Error('New password must be different from your current password.');
  await reauthenticate(currentPin);
  try {
    await updatePassword(user, newPin);
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
  logActivity('changePassword');
}

export async function reauthenticate(currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');
  if (!user.email) throw new Error('This account does not have a password.');
  if (!currentPassword) throw new Error('Please enter your current password.');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  try {
    await reauthenticateWithCredential(user, credential);
  } catch (err) {
    if (err && (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')) {
      throw new Error('Your current password is incorrect.');
    }
    throw new Error(friendlyAuthError(err));
  }
}

function friendlyAuthError(err) {
  const code = String(err?.code || '').toLowerCase();
  const status = Number(err?.status || err?.httpStatus || 0);
  const raw = String(err?.message || '').toLowerCase();

  // Never return raw Firebase/HTTP/Callable messages to the UI. In
  // particular, UNAUTHENTICATED/401, App Check, Axios, stack traces and
  // provider errors are implementation details.
  if (
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'functions/unauthenticated' ||
    status === 401 ||
    raw.includes('unauthenticated') ||
    raw.includes('[401]') ||
    raw.includes('http 401')
  ) {
    return 'Incorrect phone number or password.';
  }
  if (code === 'auth/user-disabled' || code === 'functions/permission-denied') {
    return 'This account is currently unavailable. Please contact support.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with this email.';
  }
  if (code === 'auth/too-many-requests' || code === 'functions/resource-exhausted') {
    return 'Too many attempts. Please try again later.';
  }
  if (
    code === 'auth/network-request-failed' ||
    code === 'functions/unavailable' ||
    code === 'functions/deadline-exceeded' ||
    code === 'functions/internal' ||
    raw.includes('network') ||
    raw.includes('failed to fetch') ||
    raw.includes('timeout') ||
    raw.includes('timed out')
  ) {
    return 'Unable to connect right now. Please check your internet connection and try again.';
  }
  if (code === 'auth/weak-password') {
    return 'New password is too weak. Please choose a stronger one.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Please sign out and sign back in, then try again.';
  }

  // Deliberately generic for every unknown backend/provider failure.
  return 'We could not complete your sign-in. Please try again.';
}

// Google Sign-In was intentionally retired from the mobile runtime.
// Keep these exports as a compatibility boundary for any stale UI/context
// references so they fail cleanly instead of throwing "not a function".
// No native Google dependency or credential flow is present in this build.
function googleSignInRetiredError() {
  const err = new Error(
    'Google sign-in is no longer available. Please use phone/password or email verification.',
  );
  err.code = 'google-signin-retired';
  return err;
}

export async function signInWithGoogle() {
  throw googleSignInRetiredError();
}

export async function completeGoogleSignup() {
  throw googleSignInRetiredError();
}

export async function linkGoogleAccount() {
  throw googleSignInRetiredError();
}

export async function startGoogleAccountMerge() {
  throw googleSignInRetiredError();
}

export async function confirmGoogleAccountMerge() {
  throw googleSignInRetiredError();
}


export async function resetPassword({ phone, phoneE164, dialCode, email, newPassword, phoneIdToken, emailIdToken }) {
  try {
    const fn = httpsCallable(functions, 'resetPassword');
    await fn({ phone, phoneE164, dialCode, email, newPassword, phoneIdToken, emailIdToken });
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}
