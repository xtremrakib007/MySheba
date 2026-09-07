// Thin wrapper around @react-native-google-signin/google-signin, kept
// separate from authService.js since it's the one file that needs the
// native module import (authService.js itself stays testable/importable
// on web, where this module never actually gets called).
//
// Requires a custom dev client / EAS build - this native module isn't
// available in plain Expo Go. The app already ships google-services.json
// and expo-dev-client, so it's built that way already (see README/app.json).
//
// SETUP: set the real OAuth "Web client ID" (not the Android client ID) in
// app.json -> expo.extra.googleWebClientId. Get it from the Firebase
// Console -> Authentication -> Sign-in method -> Google -> Web SDK
// configuration, or from Google Cloud Console -> APIs & Services ->
// Credentials -> OAuth 2.0 Client IDs -> "Web client (auto created by
// Google Service)". This is required even for Android/iOS sign-in because
// Firebase needs a webClientId to mint the ID token.
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

let configured = false;

function configure() {
  if (configured) return;
  const webClientId =
    (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.googleWebClientId) || '';
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
  configured = true;
}

/** Runs the native Google account picker and returns both the ID token
 * Firebase needs AND the plain email address from the picked Google
 * profile (v13's signIn() already returns it locally - no extra call).
 * The email is what authService.linkGoogleAccount hands off to the
 * account-merge flow (src/firebase/authService.js:startGoogleAccountMerge)
 * when linkWithCredential finds this Google account already backs a
 * different MySheba account - see functions/accountMergeService.js.
 * Throws a friendly, specific error for every failure mode instead of a raw
 * native error code - a silent user-cancel is the one case that should NOT
 * surface as an error banner (see LoginScreen/AppContext, which just resets
 * authBusy without setting authError on cancel). */
export async function getGoogleIdTokenAndProfile() {
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    // v13's signIn() resolves { type: 'success', data: { idToken, user } } on
    // success, or { type: 'cancelled' } if the user backs out of the picker.
    if (result && result.type === 'cancelled') {
      const cancelErr = new Error('Google sign-in was cancelled.');
      cancelErr.isCancelled = true;
      throw cancelErr;
    }
    const idToken = result && result.data ? result.data.idToken : result.idToken;
    const googleUser = (result && result.data && result.data.user) || result.user || {};
    if (!idToken) throw new Error('Google sign-in did not return a token. Please try again.');
    return { idToken, email: googleUser.email || '' };
  } catch (err) {
    const code = err && err.code;
    if (err && err.isCancelled) throw err;
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      const cancelErr = new Error('Google sign-in was cancelled.');
      cancelErr.isCancelled = true;
      throw cancelErr;
    }
    if (code === statusCodes.IN_PROGRESS) {
      throw new Error('A sign-in is already in progress.');
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play Services is not available or out of date on this device.');
    }
    // DEVELOPER_ERROR (code 10) almost always means the native Google config
    // is missing/mismatched - typically google-services.json not present in
    // the project, or its package name/SHA-1 not matching this build, or
    // app.json's extra.googleWebClientId not set to the "Web client" ID.
    if (code === 'DEVELOPER_ERROR' || code === 10 || code === '10') {
      throw new Error(
        'Google sign-in is not configured correctly for this build (missing/mismatched google-services.json or web client ID). Please contact support.'
      );
    }
    throw new Error((err && err.message) || 'Google sign-in was cancelled.');
  }
}

/** Thin wrapper kept for the existing callers (signInWithGoogle) that only
 * ever needed the token itself - see getGoogleIdTokenAndProfile above for
 * the token+email version linkGoogleAccount uses. */
export async function getGoogleIdToken() {
  const { idToken } = await getGoogleIdTokenAndProfile();
  return idToken;
}

/** Signs the Google account out of the native picker too, so "Logout" fully clears the session rather than silently re-picking the same account next time. */
export async function googleSignOut() {
  try {
    await GoogleSignin.signOut();
  } catch (e) {
    // Not signed in via Google, or module not configured yet - fine to ignore.
  }
}
