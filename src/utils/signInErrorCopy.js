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

export function signInErrorCopy(error) {
  const raw = `${error?.code || ''} ${error?.message || error || ''}`.toLowerCase();
  if (OFFLINE_HINTS.some((hint) => raw.includes(hint))) return OFFLINE;
  return GENERIC;
}

export default signInErrorCopy;
