// The screens you are allowed to be on while signed out.
//
// Being signed out is not an error on these: it is the point of them. Every
// other screen, reached with no Firebase user, means a session ended - so
// AppContext sends you back to the login form.
//
// `forgotPassword` was missing from that list while a second copy in
// BiometricOptInPrompt had it. The copy that mattered was the one without: the
// only moment anybody taps "Forgot Password?" is when they are signed out, so
// the guard fired on arrival and bounced them back to login before the screen
// drew. Tapping the link did nothing at all, which is exactly how it was
// reported.
//
// One list, imported by both, so they cannot drift again. A test asserts every
// screen App.js renders before sign-in is on it.
export const PRE_AUTH_SCREENS = ['login', 'register', 'forgotPassword', 'deviceVerify', 'googlePhone'];

/** True when this screen is one a signed-out person is meant to be on. */
export function isPreAuthScreen(screen) {
  return PRE_AUTH_SCREENS.includes(screen);
}
