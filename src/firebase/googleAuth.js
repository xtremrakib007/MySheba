// Google Sign-In has been retired from the MySheba mobile app.
// Keep this module temporarily as a compatibility boundary for older callers
// while the remaining auth UI/backend references are removed.  It deliberately
// has no native Google dependency, so the production Android build cannot pull
// Google Sign-In code into the APK.

function retiredGoogleError() {
  const err = new Error('Google sign-in is no longer available. Please use phone/password or email verification.');
  err.code = 'google-signin-retired';
  return err;
}

export async function getGoogleIdTokenAndProfile() {
  throw retiredGoogleError();
}

export async function getGoogleIdToken() {
  throw retiredGoogleError();
}

export async function googleSignOut() {
  // No native Google session exists after Google Sign-In retirement.
}
