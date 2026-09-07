// Email verification for registration and the "new device" re-verification
// challenge - real Firebase Auth email-link (passwordless) sign-in, via
// @react-native-firebase/auth, same as phoneVerification.js does for SMS.
// No SMTP/custom mail provider involved: Firebase sends the email itself.
//
// This is a SEPARATE Firebase Auth identity from the one the rest of the
// app uses (see src/firebase/config.js / authService.js, which sign in
// with a phone-derived pseudo email via the JS SDK) - same reasoning as
// phoneVerification.js. We only use this one to prove "this person can
// open this inbox", then throw the resulting ID token away server-side
// once it's been checked (see functions/emailVerification.js's
// assertEmailVerified). Two call sites, exactly like phoneVerification.js:
//   - RegisterScreen.js, during registration.
//   - DeviceVerifyScreen.js, for the 'new_device' re-verification challenge
//     (functions/deviceSessionService.js's confirmDeviceSwitch) - there the
//     resulting idToken is passed to authService.confirmDeviceLogin instead
//     of a registration call, but it's re-verified the same way.
// Nothing else in the app should import this module or read
// rnfbAuth().currentUser.
//
// Firebase Dynamic Links (which email-link sign-in used to depend on) shut
// down August 25, 2025. This uses the replacement Firebase Hosting-based
// system instead: the link points at our own domain (mysheba.top, already
// an Android App Link target - see app.json's intentFilters), which opens
// directly in the app rather than through a hosted redirect page. See
// CALL_NOTIFICATION_SETUP.md-style setup notes in the PR/README for the
// Firebase Console steps this still requires (enabling the Email Link
// sign-in method, adding mysheba.top as an authorized domain).
import rnfbAuth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EMAIL_LINK_URL = 'https://mysheba.top/verifyEmail';
const EMAIL_FOR_SIGN_IN_KEY = 'mysheba:emailForSignIn';

const actionCodeSettings = {
  url: EMAIL_LINK_URL,
  handleCodeInApp: true,
  android: {
    packageName: 'com.satulink.mysheba',
    installApp: true,
    minimumVersion: '1',
  },
  // iOS isn't built yet (no bundleIdentifier/associatedDomains configured
  // in app.json) - add an `iOS: { bundleId: '...' }` entry here once it is,
  // or email links opened on iOS won't deep-link back into the app.
};

/** Sends a magic link to `email` proving ownership. Resolves once the email
 * is sent - the actual verification happens later, when the person taps the
 * link and the app calls confirmEmailLink below. Stores the email locally
 * so confirmEmailLink can find it again even if the app was killed while
 * waiting (Firebase requires the exact email back to complete the link). */
export async function sendEmailLink(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new Error('Please enter a valid email address.');
  try {
    await rnfbAuth().sendSignInLinkToEmail(normalized, actionCodeSettings);
    await AsyncStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, normalized);
  } catch (err) {
    throw new Error(friendlyEmailLinkError(err));
  }
}

/** Checks whether `url` (from a deep-link event) is a Firebase email
 * sign-in link at all, before bothering to try completing it. */
export function isEmailSignInLink(url) {
  if (!url) return false;
  try {
    return rnfbAuth().isSignInWithEmailLink(url);
  } catch {
    return false;
  }
}

/** Completes sign-in for `url` (the tapped email link), using the email
 * saved by sendEmailLink - falls back to `expectedEmail` (whatever the
 * screen has in state) if storage was cleared for some reason. Returns a
 * fresh ID token proving email ownership - the caller passes this straight
 * through to a server-side check (registerWithDealerCode's emailIdToken or
 * confirmDeviceSwitch's emailIdToken), which re-verifies it (never trust
 * the client's word alone that verification happened, same pattern as
 * phoneVerification.js). Signs this temporary email-auth identity back out
 * immediately after, whether or not grabbing the token succeeded, since it
 * has no further use once we have the token. */
export async function confirmEmailLink(url, expectedEmail) {
  const storedEmail = await AsyncStorage.getItem(EMAIL_FOR_SIGN_IN_KEY).catch(() => null);
  const email = storedEmail || String(expectedEmail || '').trim().toLowerCase();
  if (!email) throw new Error('Please enter your email address again to finish verifying.');
  let userCredential;
  try {
    userCredential = await rnfbAuth().signInWithEmailLink(email, url);
  } catch (err) {
    throw new Error(friendlyEmailLinkError(err));
  }
  try {
    const idToken = await userCredential.user.getIdToken();
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
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
  return (err && err.message) || 'Could not verify your email address. Please try again.';
}
