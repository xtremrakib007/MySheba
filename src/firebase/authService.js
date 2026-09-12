// Production auth for MySheba.
//
// The app's UI collects "phone number + password" (this is the UX the
// target users - Bangladeshi migrant workers in Malaysia - already
// understand from mobile banking apps). Under the hood we use real Firebase
// Authentication (email/password), mapping each phone number to a
// deterministic pseudo email, with the password the user chose used
// directly as the Firebase Auth password. This gets us real server-side
// auth (hashed credentials, session tokens, password reset via admin, rate
// limiting) without needing SMS OTP billing/set-up. If you later want true
// SMS OTP login, swap signInWithEmailAndPassword calls below for
// signInWithPhoneNumber - nothing else in the app needs to change since the
// rest of the app only talks to this file.
import {
  signInWithEmailAndPassword,
  signInWithCredential,
  linkWithCredential,
  GoogleAuthProvider,
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
  } catch (e) {}

  return { uid: cred.user.uid, ...snap.data() };
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
    } else {
      throw new Error(friendlyAuthError(err));
    }
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
    return {
      uid: cred.user.uid,
      ...profileData,
      pendingDeviceApproval: {
        deviceId,
        email: sessionResult.email,
        phone: sessionResult.phone,
        reason: sessionResult.reason,
        availableMfaMethods: sessionResult.availableMfaMethods,
      },
    };
  }

  await setLocalSessionId(sessionResult.sessionId);
  logActivity('login', { method: 'phone' });
  return { uid: cred.user.uid, ...profileData };
}

/**
 * Google Sign-In and Sign-Up share the same Firebase Auth credential. A
 * Google Auth user that already has a MySheba users/{uid} profile is an
 * existing account and MUST bypass onboarding completely. This is important
 * after logout: signInWithCredential restores the same Firebase UID and the
 * existing profile should be used directly rather than calling the new-user
 * duplicate-email checks.
 */
export async function signInWithGoogle() {
  const idToken = await getGoogleIdToken();
  const credential = GoogleAuthProvider.credential(idToken);
  try {
    await signInWithCredential(auth, credential);
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
  return finishGoogleSignIn({});
}

export async function completeGoogleSignup(phone) {
  if (!auth.currentUser) {
    throw new Error('Your Google sign-in has expired. Please start again.');
  }
  return finishGoogleSignIn({ phone });
}

async function finishGoogleSignIn(ensureProfileArgs) {
  if (!auth.currentUser) {
    throw new Error('Your Google sign-in has expired. Please start again.');
  }

  let data;

  // CRITICAL: after logout, a valid Google credential signs back into the
  // same Firebase UID. If that UID already owns a MySheba profile, do not
  // call ensureGoogleProfile as if this were a new registration. This also
  // prevents a second invocation during GooglePhoneScreen/PIN completion
  // from falling into duplicate-email handling.
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
      await signOut(auth).catch(() => {});
      throw new Error(err.message || 'Google sign-in failed.');
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
    return {
      uid: auth.currentUser.uid,
      ...data,
      pendingDeviceApproval: {
        deviceId,
        email: sessionResult.email,
        phone: sessionResult.phone,
        reason: sessionResult.reason,
        availableMfaMethods: sessionResult.availableMfaMethods,
      },
    };
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
    if (err && err.code === 'auth/provider-already-linked') {
      throw new Error('A Google account is already linked to this account.');
    }
    throw new Error(friendlyAuthError(err));
  }
  await updateDoc(doc(db, 'users', user.uid), { googleLinked: true });
  logActivity('linkGoogleAccount');
}

export async function startGoogleAccountMerge(email) {
  const fn = httpsCallable(functions, 'startAccountMerge');
  try {
    const { data } = await fn({ email });
    return data;
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}

export async function confirmGoogleAccountMerge(code) {
  const fn = httpsCallable(functions, 'confirmAccountMerge');
  try {
    const { data } = await fn({ code });
    return data;
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}

export async function retryDeviceSession(uid, phoneIdToken, emailIdToken, emailOtp, resendEmailChallenge = false) {
  const deviceId = await getDeviceId();
  const sessionFn = httpsCallable(functions, 'checkDeviceSession');
  const { data: sessionResult } = await sessionFn({ deviceId, deviceLabel: getDeviceLabel(), phoneIdToken, emailIdToken, emailOtp, resendEmailChallenge });

  if (sessionResult.requiresOtp) {
    return {
      uid,
      pendingDeviceApproval: {
        deviceId,
        email: sessionResult.email,
        phone: sessionResult.phone,
        reason: sessionResult.reason,
        availableMfaMethods: sessionResult.availableMfaMethods,
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
  try {
    const deviceId = await getDeviceId();
    const clearFn = httpsCallable(functions, 'clearActiveSession');
    await clearFn({ deviceId });
  } catch (e) {}
  await clearLocalSessionId();
  await googleSignOut();
  await signOut(auth);
}

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export function subscribeProfile(uid, callback, onError) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => callback(snap.exists() ? snap.data() : null),
    onError
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
  Object.keys(patch).forEach((k) => { clean[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k]; });
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
  Object.keys(prefs || {}).forEach((k) => { patch[`notifPrefs.${k}`] = prefs[k]; });
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, 'users', uid), patch);
}

export async function updateCallSettings(uid, settings) {
  if (!uid) return;
  const patch = {};
  Object.keys(settings || {}).forEach((k) => { patch[`callSettings.${k}`] = settings[k]; });
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, 'users', uid), patch);
}

export async function changePassword(currentPin, newPin) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to change your password.');
  if (!user.email) throw new Error('This account signed in with Google and has no password to change.');
  if (!currentPin) throw new Error('Please enter your current password.');
  if (!isValidPin(newPin)) throw new Error('New password must be 6-20 characters.');
  if (currentPin === newPin) throw new Error('New password must be different from your current password.');
  await reauthenticate(currentPin);
  try { await updatePassword(user, newPin); }
  catch (err) { throw new Error(friendlyAuthError(err)); }
  logActivity('changePassword');
}

export async function reauthenticate(currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');
  if (!user.email) throw new Error('This account signed in with Google and has no password.');
  if (!currentPassword) throw new Error('Please enter your current password.');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  try {
    await reauthenticateWithCredential(user, credential);
  } catch (err) {
    if (err && (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')) throw new Error('Your current password is incorrect.');
    throw new Error(friendlyAuthError(err));
  }
}

function friendlyAuthError(err) {
  const code = err && err.code;
  if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'Incorrect phone number or password.';
  if (code === 'auth/user-disabled') return 'This account has been suspended. Please contact support.';
  if (code === 'auth/account-exists-with-different-credential') return 'An account already exists with this email using a different sign-in method.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
  if (code === 'auth/weak-password') return 'New password is too weak. Please choose a stronger one.';
  if (code === 'auth/requires-recent-login') return 'Please sign out and sign back in, then try again.';
  return err && err.message ? err.message : 'Sign in failed. Please try again.';
}

export async function resetPassword({ phone, phoneE164, dialCode, email, newPassword, phoneIdToken, emailIdToken }) {
  try {
    const fn = httpsCallable(functions, 'resetPassword');
    await fn({ phone, phoneE164, dialCode, email, newPassword, phoneIdToken, emailIdToken });
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}
