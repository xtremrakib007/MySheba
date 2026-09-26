// What a person is shown when sign-in fails.
//
// Whatever the cause - a callable returning UNAUTHENTICATED, a Firebase
// auth code, a thrown string - the raw text never reaches the screen. It
// names internals ("Unauthenticated [401]"), it tells the person nothing
// they can act on, and in the App Check case it was not even about their
// credentials. One safe message covers every failure instead.
//
// The exception is losing the network. Telling someone with no connection
// to check their password sends them off changing a password that was
// never wrong, so that one case gets its own copy.

const GENERIC = {
  title: 'Unable to sign in',
  message: 'Please check your phone number and password and try again.',
};

const OFFLINE = {
  title: 'No internet connection',
  message: 'Check your connection and try again.',
};

const OFFLINE_HINTS = [
  'network-request-failed',
  'network error',
  'unavailable',
  'failed to fetch',
  'timeout',
  'timed out',
];

function looksOffline(error) {
  const raw = `${error?.code || ''} ${error?.message || error || ''}`.toLowerCase();
  return OFFLINE_HINTS.some((hint) => raw.includes(hint));
}

// authService tags what it throws with a stable `reason`. Honour it.
//
// Flattening every failure to GENERIC was wrong in a way that misleads:
// friendlyAuthError already distinguishes eight cases, and collapsing them
// meant a rate-limited user was told to check a password that was never
// wrong, and a disabled account looked like a typo. The credential case
// keeps the copy that was asked for; the rest say what actually happened.
// Anything unrecognised still falls through to GENERIC, so an untagged or
// raw error can never reach the screen.
const BY_REASON = {
  credentials: GENERIC,
  network: OFFLINE,
  'rate-limited': {
    title: 'Too many attempts',
    message: 'Please wait a few minutes before trying again.',
  },
  disabled: {
    title: 'Account unavailable',
    message: 'This account is not active. Please contact support.',
  },
  'no-profile': {
    title: 'No account found',
    message: 'This number is not registered yet. Please sign up first.',
  },
  'invalid-phone': {
    title: 'Check your phone number',
    message: 'Please enter a valid phone number.',
  },
  'missing-password': {
    title: 'Password required',
    message: 'Please enter your password.',
  },
};

export function signInErrorCopy(error) {
  if (looksOffline(error)) return OFFLINE;
  const byReason = error?.isUserFacing && BY_REASON[error.reason];
  return byReason || GENERIC;
}

// For the catch blocks that used to read `e.message || 'Could not ...'`.
//
// That `e.message ||` preferred the raw error and only fell back to the
// written copy when the error happened to carry no message - so the good
// sentence sitting right there was the branch that almost never ran, and
// registration and device verification leaked the same internals the login
// screen was fixed to stop leaking. Pass the same fallback and it is now
// what the person actually sees, with the offline case still called out
// so nobody is told to re-check details that were never the problem.
export function friendlyMessage(error, fallback) {
  return looksOffline(error) ? OFFLINE.message : fallback;
}

// For rendering AppContext's `authError`, which stores raw `err.message`.
export function authErrorMessage(error, fallback) {
  if (!error) return '';
  return friendlyMessage(error, fallback);
}

export default signInErrorCopy;
