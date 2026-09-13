// Google Sign-In is intentionally disabled in the finance customer app.
// Keep these exports as compatibility stubs for legacy/admin code so the
// application can build without the native @react-native-google-signin package.

function disabledError() {
  return new Error('Google sign-in is disabled. Please use your phone number and PIN.');
}

export async function getGoogleIdTokenAndProfile() {
  throw disabledError();
}

export async function getGoogleIdToken() {
  throw disabledError();
}

export async function googleSignOut() {
  return undefined;
}
