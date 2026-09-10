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
  // Firebase requires 6+ char passwords - this value doubles directly as
  // the account password, so enforce that here with a clear error before
  // we ever call out to Firebase. Any letters/numbers/symbols are allowed
  // (not digits-only), 6-20 characters.
  const value = String(pin || '');
  return value.length >= 6 && value.length <= 20;
}

/** Self-service registration - always creates a `customer` role account,
 * assigned to whichever dealer the dealerCode resolves to. The account
 * itself is created server-side (functions/customerRegistration.js) since
 * resolving a dealer code to that dealer's uid requires reading another
 * user's profile, which a brand-new account can never do under
 * firestore.rules. Once the Cloud Function confirms creation, sign in
 * normally with the same phone+PIN.
 *
 * `email` is required and is what the OTP is sent to/verified against
 * (see src/screens/RegisterScreen.js + functions/otpService.js) - sign-in
 * itself still stays phone+PIN, this only changes how the phone number is
 * *proven* during registration.
 *
 * `phoneIdToken` is likewise required - the ID token from
 * src/firebase/phoneVerification.js's confirmPhoneOtp, proving real-SMS
 * ownership of `phone`. functions/customerRegistration.js re-verifies it
 * server-side (functions/phoneVerification.js) before creating the
 * account, same "never trust the client alone" reasoning as the email
 * OTP check. */
export async function registerCustomer({ name, phone, phoneE164, dialCode, email, pin, dealerCode, resellerCode, phoneIdToken }) {
  if (!name || !name.trim()) throw new Error('Please enter your full name.');
  if (!isValidPhone(phone)) throw new Error('Please enter a valid phone number.');
  if (!isValidEmail(email)) throw new Error('Please enter a valid email address.');
  if (!isValidPin(pin)) throw new Error('Password must be 6-20 characters.');
  if (!dealerCode || !normalizePhone(dealerCode)) throw new Error('Please enter a dealer code.');
  if (!phoneIdToken) throw new Error('Please verify your phone number first.');
  // resellerCode is optional, unlike dealerCode - a customer who doesn't
  // have one just has no reseller in front of their orders (see
  // functions/customerRegistration.js).

  const registerFn = httpsCallable(functions, 'registerWithDealerCode');
  await registerFn({ name, phone, phoneE164, dialCode, email, pin, dealerCode, resellerCode, phoneIdToken });

  const authEmail = phoneToEmail(phone, dialCode);
  const cred = await signInWithEmailAndPassword(auth, authEmail, pin);
  const snap = await getDoc(doc(db, 'users', cred.user.uid));

  // Marks this device as the account's active device right away, so a
  // login from a different device later correctly triggers the OTP
  // challenge instead of finding no active device on file yet. Best-effort
  // - a brand-new registration should still succeed even if this fails.
  try {
    const deviceId = await getDeviceId();
    const sessionFn = httpsCallable(functions, 'checkDeviceSession');
    const { data: sessionResult } = await sessionFn({ deviceId, deviceLabel: getDeviceLabel() });
    if (sessionResult && sessionResult.sessionId) await setLocalSessionId(sessionResult.sessionId);
  } catch (e) {
    // non-fatal
  }

  return { uid: cred.user.uid, ...snap.data() };
}

/**
 * Sign in with phone + password. There is no role picker anymore - the signed-in
 * account's `role` field in its `users/{uid}` Firestore doc is the single
 * source of truth, and AppContext routes to the matching dashboard
 * automatically. Dealer/Admin/Super Admin accounts are still not
 * self-service - they must already exist in the `users` collection with the
 * right role - set via the User Management screen (src/screens/
 * UserManagementScreen.js, backed by the manageUser Cloud Function) or
 * directly in the Firebase console; a plain phone+PIN sign-in just picks
 * up whatever role is on file.
 */
export async function login(phone, pin, dialCode = '+60') {
  if (!isValidPhone(phone)) throw new Error('Please enter a valid phone number.');
  if (!pin) throw new Error('Please enter your password.');

  const email = phoneToEmail(phone, dialCode);
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email, pin);
  } catch (err) {
    // Backward compatibility for existing Malaysian accounts created with the legacy local-number pseudo email.
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
  // Accounts created before the unique-userId feature shipped won't have
  // one yet - backfill it here so every account ends up with one, not just
  // ones created after this change. Best-effort: a failure here shouldn't
  // block sign-in, just leaves userId to backfill on a later login.
  if (!profileData.userId) {
    try {
      const ensureFn = httpsCallable(functions, 'ensureUserId');
      const { data } = await ensureFn({});
      profileData = { ...profileData, userId: data.userId };
    } catch (e) {
      // non-fatal - sign-in still proceeds without a userId this time
    }
  }

  // Single-device-login check (functions/deviceSessionService.js) - if a
  // different device is already active on this account, this doesn't sign
  // us out; it flags pendingDeviceApproval so the caller routes to
  // DeviceVerifyScreen instead of a dashboard (see AppContext.doLogin).
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
        // Only meaningful for reason: 'admin_mfa' - which of 'sms'/'email'
        // the account actually has on file, so DeviceVerifyScreen can
        // offer a toggle (both) or skip straight to the only option
        // (one). Undefined for 'new_device', which is always email-only.
        availableMfaMethods: sessionResult.availableMfaMethods,
      },
    };
  }

  await setLocalSessionId(sessionResult.sessionId);
  logActivity('login', { method: 'phone' });
  return { uid: cred.user.uid, ...profileData };
}

/**
 * Google Sign-In and Sign-Up in one - Firebase Auth doesn't distinguish
 * them for a federated credential: the very first time a given Google
 * account signs in, Firebase creates the Auth user automatically; every
 * time after that, it's just a sign-in. `ensureGoogleProfile` (Cloud
 * Function) mirrors that on the Firestore side - it creates the
 * users/{uid} profile (with a unique numeric userId, role: 'customer') the
 * first time only, and simply returns the existing profile every time
 * after. So this one function is what both the Login screen's and the
 * Register screen's "Continue with Google" buttons call.
 *
 * A mobile number is required on every account, and Google itself doesn't
 * hand us one - so the very first sign-in for a brand-new Google account
 * throws a needsPhone-flagged error instead of finishing, and
 * GooglePhoneScreen/completeGoogleSignup below collects one and finishes
 * the job. This does NOT sign out of the Google credential in that case -
 * the same signed-in Firebase Auth user is reused on the follow-up call.
 *
 * One email should only ever back one account: if this Google account's
 * email already belongs to an existing (typically phone+PIN) account,
 * ensureGoogleProfile refuses to create a second profile - see its own
 * doc comment in functions/googleAuth.js - and this throws that refusal
 * on as a plain, actionable error instead of silently signing into a
 * brand-new duplicate account.
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

/**
 * GooglePhoneScreen calls this once the person has entered a mobile number,
 * to finish what signInWithGoogle started when it threw a needsPhone
 * error. Reuses the Google credential already signed into `auth` from that
 * first call - no need to re-run the native Google picker - and just
 * re-calls ensureGoogleProfile, this time with a phone number, which
 * either creates the profile (if the number isn't already taken by another
 * account - see functions/googleAuth.js) or throws an already-exists error
 * the caller can show inline on the phone form.
 */
export async function completeGoogleSignup(phone) {
  if (!auth.currentUser) {
    throw new Error('Your Google sign-in has expired. Please start again.');
  }
  return finishGoogleSignIn({ phone });
}

/** Shared tail of signInWithGoogle/completeGoogleSignup: calls
 * ensureGoogleProfile with whatever args this attempt has (none yet, or a
 * phone number on the follow-up call), then runs the same
 * single-device-login check as phone+PIN login() above. */
async function finishGoogleSignIn(ensureProfileArgs) {
  const ensureProfileFn = httpsCallable(functions, 'ensureGoogleProfile');
  let data;
  try {
    const result = await ensureProfileFn(ensureProfileArgs);
    data = result.data;
  } catch (err) {
    // PHONE_REQUIRED (see functions/googleAuth.js) is not a real failure -
    // it means this is a brand-new Google account with no phone number
    // yet. Flag it (same isCancelled-style pattern getGoogleIdToken uses)
    // instead of throwing a raw/user-facing message, and deliberately do
    // NOT sign out - completeGoogleSignup above needs this same
    // credential still active for its follow-up call.
    if (err && err.message === 'PHONE_REQUIRED') {
      const needsPhoneErr = new Error('A mobile number is required to finish creating your account.');
      needsPhoneErr.needsPhone = true;
      throw needsPhoneErr;
    }
    // Any other failure here (duplicate email, duplicate phone once one's
    // been submitted, etc.) - ensureGoogleProfile has already deleted the
    // Auth user it auto-provisioned for this sign-in in that case (see its
    // own doc comment), so there's nothing left worth staying signed into.
    // The client is still locally "signed in" to that now-deleted Auth
    // user at this point, so clear it before surfacing the message -
    // otherwise every later Firebase call in this session would silently
    // fail against a deleted user. err.message here is already the
    // friendly, actionable text ensureGoogleProfile threw, not a raw
    // Firebase error.
    await signOut(auth).catch(() => {});
    throw new Error(err.message || 'Google sign-in failed.');
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

/**
 * Settings screen's "Link Google Account" - lets someone who registered
 * with phone+PIN also sign in with Google afterwards, without ending up
 * with a second account. Requires already being signed in:
 * linkWithCredential attaches the Google credential to *this* signed-in
 * user rather than creating or looking up a separate one, so the SAME
 * Firebase Auth uid (and so the SAME users/{uid} profile and wallet)
 * ends up authenticating either way - a later "Continue with Google" with
 * this Google account will sign straight into this account instead of
 * ensureGoogleProfile (functions/googleAuth.js) trying to spin up a
 * second one. Firebase itself refuses the link
 * (auth/credential-already-in-use) if that Google account is already the
 * primary sign-in for some other Firebase user - surfaced here as a
 * plain message rather than the raw Firebase error.
 */
export async function linkGoogleAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');
  const { idToken, email } = await getGoogleIdTokenAndProfile();
  const credential = GoogleAuthProvider.credential(idToken);
  try {
    await linkWithCredential(user, credential);
  } catch (err) {
    if (err && err.code === 'auth/credential-already-in-use') {
      // That Google account already backs a SEPARATE MySheba account
      // (typically created earlier via "Continue with Google" - see
      // ensureGoogleProfile in functions/googleAuth.js). Don't just dead-end
      // here - flag it (mergeAvailable/googleEmail) so the caller
      // (SettingsScreen, via GoogleMergeModal) can offer to merge the two
      // accounts instead of forcing the person to abandon one of them.
      // See functions/accountMergeService.js for what the merge itself does.
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
  // Recorded on the profile too (a plain, non-frozen field - see
  // firestore.rules' users/{uid} update rule) so Settings can show
  // "Linked" instead of the action row on future visits - see
  // SettingsScreen.js and AppContext.linkGoogleAccount.
  await updateDoc(doc(db, 'users', user.uid), { googleLinked: true });
  logActivity('linkGoogleAccount');
}

/** Settings screen's account-merge dialog (GoogleMergeModal), step 1 -
 * called after linkGoogleAccount above throws mergeAvailable: true. Emails
 * a confirmation code to the OTHER account (functions/accountMergeService.js
 * :startAccountMerge) and returns a masked preview (both accounts' wallet/
 * game-point balances and what they'd add up to) so the person can see
 * exactly what merging will do before confirming anything. */
export async function startGoogleAccountMerge(email) {
  const fn = httpsCallable(functions, 'startAccountMerge');
  try {
    const { data } = await fn({ email });
    return data;
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}

/** GoogleMergeModal step 2 - submits the code that arrived in the other
 * account's inbox. On success (functions/accountMergeService.js
 * :confirmAccountMerge) that account's wallet balance and game points have
 * already been added into this one (nothing lost from either side), and
 * this account can now sign in with that Google account too. */
export async function confirmGoogleAccountMerge(code) {
  const fn = httpsCallable(functions, 'confirmAccountMerge');
  try {
    const { data } = await fn({ code });
    return data;
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}

/**
 * Re-runs the device/session check after an admin_mfa phone-verification
 * challenge (see checkDeviceSession's doc comment in
 * functions/deviceSessionService.js) has been completed. `phoneIdToken` is
 * the ID token DeviceVerifyScreen got back from
 * src/firebase/phoneVerification.js's confirmPhoneOtp - passed straight
 * through so the server can independently verify it (assertPhoneVerified),
 * never trusting the client's word alone. Deliberately calls
 * checkDeviceSession again rather than confirmDeviceSwitch - this device
 * was never actually "switching" from another one, so there's no other
 * device's refresh tokens to revoke; a verified phoneIdToken lets the
 * normal same-device approval path run - which also trusts this deviceId
 * server-side (users/{uid}.trustedDevices), so future logins from the SAME
 * device skip the challenge entirely (see Settings > Trusted Devices to
 * review/revoke). In the rare case this admin is ALSO signing in from a new
 * device, the result can still come back with requiresOtp/reason:
 * 'new_device' - the caller (AppContext.confirmDeviceVerification) handles
 * that the same way doLogin does, by staying on this screen with the new
 * reason instead of assuming success.
 */
export async function retryDeviceSession(uid, phoneIdToken, emailIdToken, emailOtp, resendEmailChallenge = false) {
  const deviceId = await getDeviceId();
  const sessionFn = httpsCallable(functions, 'checkDeviceSession');
  const { data: sessionResult } = await sessionFn({ deviceId, deviceLabel: getDeviceLabel(), phoneIdToken, emailIdToken, emailOtp, resendEmailChallenge });

  if (sessionResult.requiresOtp) {
    // A verified email link may race the single-device check: if another
    // device is active, checkDeviceSession can return the legacy
    // `new_device` reason even though this call already supplied the freshly
    // verified email token. Finalize that pending switch immediately instead
    // of sending the user back to DeviceVerifyScreen for a second challenge.
    if (emailIdToken && sessionResult.reason === 'new_device') {
      return confirmDeviceLogin(uid, emailIdToken);
    }
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

/**
 * Finalizes this device as the account's active device after
 * DeviceVerifyScreen's email-link challenge succeeds (see AppContext.js's
 * confirmDeviceVerification). Calls functions/deviceSessionService.js's
 * confirmDeviceSwitch, which re-checks server-side (via emailIdToken) that
 * the email link was actually verified, stamps a new activeSessionId for
 * this device, and revokes the previously-active device's refresh tokens.
 * Then re-reads the profile the same way login() does and returns it so the
 * caller can route exactly like a plain login. Only for the 'new_device'
 * reason - see retryDeviceSession above for 'admin_mfa'.
 */
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
  logActivity('logout'); // fire before signOut, while auth.currentUser is still set

  // Best-effort: frees up this device's slot in the single-device-login
  // state (functions/deviceSessionService.js) so the account doesn't need
  // an OTP challenge to log in again from anywhere. Only clears the pieces
  // that belong to THIS deviceId - see clearActiveSession's doc comment -
  // so this is also safe to call from DeviceVerifyScreen's "Cancel and
  // sign out" without disturbing the real active device elsewhere. Must
  // run before signOut() since it requires an authenticated caller.
  try {
    const deviceId = await getDeviceId();
    const clearFn = httpsCallable(functions, 'clearActiveSession');
    await clearFn({ deviceId });
  } catch (e) {
    // non-fatal - signing out should never be blocked by this
  }
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

/** Live profile (role, walletBalance, etc.) - keeps the app in sync if an
 * admin changes a user's role or tops up their wallet while they're
 * signed in, with no re-login needed. */
export function subscribeProfile(uid, callback, onError) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => callback(snap.exists() ? snap.data() : null),
    onError
  );
}

/** Updates the display name on both the Firestore profile doc and Firebase Auth. Used by the Profile screen. */
export async function updateUserName(uid, name) {
  if (!name || !name.trim()) throw new Error('Please enter your full name.');
  await updateDoc(doc(db, 'users', uid), { name: name.trim() });
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: name.trim() });
  }
}

/**
 * Updates the First Name / Last Name pair on the Profile screen. The app's
 * single combined `name` field is still what every other screen (Sidebar,
 * chat, receipts, etc.) reads, so this recomputes it from the two parts and
 * writes firstName, lastName, and name together in one call, syncing
 * Firebase Auth's displayName the same way updateUserName above does.
 */
export async function updateUserNameParts(uid, { firstName, lastName }) {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  if (!first) throw new Error('Please enter your first name.');
  const fullName = [first, last].filter(Boolean).join(' ');
  await updateDoc(doc(db, 'users', uid), { firstName: first, lastName: last, name: fullName });
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: fullName });
  }
}

/**
 * Saves one or more editable profile fields (mobileNumber, email,
 * passportNumber, address, ...) onto the Firestore doc. Kept generic/
 * whitelist-free client-side since firestore.rules already blocks a
 * self-update from touching `role`, `walletBalance`, `dealerId`, `userId`,
 * or `createdBy` at all (frozen, not just non-negative) - anything else a
 * user wants to save about themselves is fine here. Used by the Profile
 * screen's per-field edit rows.
 */
export async function updateUserFields(uid, patch) {
  if (!uid || !patch || Object.keys(patch).length === 0) return;
  const clean = {};
  Object.keys(patch).forEach((k) => {
    clean[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
  });
  await updateDoc(doc(db, 'users', uid), clean);
}

/** Saves a newly-uploaded profile photo URL on both the Firestore profile and Firebase Auth. */
export async function updateUserAvatar(uid, url) {
  if (!uid || !url) return;
  await updateDoc(doc(db, 'users', uid), { avatarUrl: url });
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { photoURL: url });
  }
}

/** Marks this device's most recent visit to the Notifications screen, so the
 * home screen bell can tell whether there's anything new since last time. */
export async function markAnnouncementsSeen(uid) {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), { lastSeenAnnouncementAt: serverTimestamp() });
}

/**
 * Saves this device's Expo push token onto the signed-in user's profile so
 * Cloud Functions can look it up and send that user a push. Safe to call on
 * every app launch - it just overwrites with the latest token (a user's
 * token can change if they reinstall the app, so we don't want to keep a
 * stale one around). `platform` is 'ios' | 'android' | 'web', just for
 * debugging in the Firebase console.
 */
export async function updatePushToken(uid, token, platform) {
  if (!uid || !token) return;
  await updateDoc(doc(db, 'users', uid), {
    pushToken: token,
    pushTokenPlatform: platform || '',
    pushTokenUpdatedAt: serverTimestamp(),
  });
}

/** Stores this device's raw FCM token, used only to route incoming-call full-screen notifications (see src/notifications/pushService.js getFcmToken and functions/index.js onCallCreated). Separate field from pushToken, which stays an Expo push token for everything else. */
export async function updateFcmToken(uid, fcmToken) {
  if (!uid || !fcmToken) return;
  await updateDoc(doc(db, 'users', uid), {
    fcmToken,
    fcmTokenUpdatedAt: serverTimestamp(),
  });
}

/**
 * Persists the Settings screen's notification toggles onto the user's
 * profile doc (merged, so partial updates - e.g. flipping just one switch -
 * don't clobber the others). Cloud Functions read `notifPrefs.pushEnabled`
 * before sending any push, so turning this off here actually stops pushes,
 * not just the UI switch.
 */
export async function updateNotifPrefs(uid, prefs) {
  if (!uid) return;
  const patch = {};
  Object.keys(prefs || {}).forEach((k) => {
    patch[`notifPrefs.${k}`] = prefs[k];
  });
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, 'users', uid), patch);
}

/**
 * Persists the Call Settings screen's toggles/picks onto the user's profile
 * doc (merged - same dotted-path pattern as updateNotifPrefs above, so
 * flipping one option never clobbers the others). Cloud Functions read
 * `callSettings.notificationsEnabled` before ringing this device (see
 * functions/index.js onCallCreated / sendCallDataMessage) - same "server is
 * the source of truth" approach as notifPrefs.pushEnabled.
 */
export async function updateCallSettings(uid, settings) {
  if (!uid) return;
  const patch = {};
  Object.keys(settings || {}).forEach((k) => {
    patch[`callSettings.${k}`] = settings[k];
  });
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, 'users', uid), patch);
}


/**
 * Settings screen's "Change Password". Firebase requires a recent sign-in
 * before it will let an account change its own password, so this
 * re-authenticates with the current password first (via the same pseudo
 * email login() uses) and only then calls updatePassword. Google-only
 * accounts have no password credential to re-authenticate with, so this
 * throws a clear message for that case rather than a confusing Firebase
 * error.
 */
export async function changePassword(currentPin, newPin) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to change your password.');
  if (!user.email) throw new Error('This account signed in with Google and has no password to change.');
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

/** Re-authenticates the signed-in user against their own login password -
 * Firebase requires this "recent sign-in" proof before it will trust a
 * sensitive account action. Shared by changePassword above and
 * AppContext.resetSecurityPin (functions/securityPinService.js's
 * resetSecurityPin trusts this same freshly-reauthenticated auth context
 * instead of asking for the old security PIN too). Throws a user-facing
 * message on failure. */
export async function reauthenticate(currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');
  if (!user.email) throw new Error('This account signed in with Google and has no password.');
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
  const code = err && err.code;
  if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Incorrect phone number or password.';
  }
  if (code === 'auth/user-disabled') {
    return 'This account has been suspended. Please contact support.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with this email using a different sign-in method.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please try again later.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error. Check your connection and try again.';
  }
  if (code === 'auth/weak-password') {
    return 'New password is too weak. Please choose a stronger one.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Please sign out and sign back in, then try again.';
  }
  return err && err.message ? err.message : 'Sign in failed. Please try again.';
}

/**
 * Forgot Password - resets the password for the account with this phone
 * number, after real SMS or email-link verification (see
 * src/screens/ForgotPasswordScreen.js, which calls
 * phoneVerification.sendPhoneOtp/confirmPhoneOtp or
 * emailVerification.sendEmailLink/confirmEmailLink first to get whichever
 * idToken this passes through). Pass exactly one of phoneIdToken/
 * emailIdToken, matching whichever channel was used. Calls
 * functions/passwordReset.js's resetPassword, which re-verifies
 * server-side and never trusts the client's word alone (same pattern as
 * registerCustomer/confirmDeviceLogin). Does NOT sign the person in - on
 * success they return to LoginScreen to sign in with the new password,
 * same as any other password-change flow.
 */
export async function resetPassword({ phone, phoneE164, dialCode, email, newPassword, phoneIdToken, emailIdToken }) {
  try {
    const fn = httpsCallable(functions, 'resetPassword');
    await fn({ phone, phoneE164, dialCode, email, newPassword, phoneIdToken, emailIdToken });
  } catch (err) {
    throw new Error(friendlyAuthError(err));
  }
}
