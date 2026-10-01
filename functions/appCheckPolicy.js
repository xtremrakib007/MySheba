/**
 * Single switch for App Check enforcement across every callable.
 *
 * Client App Check is now initialized for Android/iOS. Production uses Play Integrity/App Attest and development/preview builds can use a registered debug token. App Check enforcement was added to all 74
 * callables on 17-18 Sep, but the functions deploy had already been broken
 * by a syntax error in topupSubmissionService.js, so none of it ever
 * reached the project - the callables running in production predate App
 * Check entirely. Meanwhile the app has no way to mint a token: there is
 * no @react-native-firebase/app-check, no firebase/app-check, and no
 * initializeAppCheck call anywhere in the client.
 *
 * Deploying with enforcement on would therefore switch it on for all 74 at
 * once against a client that cannot satisfy it, and every callable would
 * start failing 'unauthenticated' - registration, top-ups, wallet
 * transfers, charges, security PIN, device sessions, account merge and the
 * rest. Turning it off here is not a downgrade: it matches the posture
 * already live in the project, and lets the accumulated fixes deploy.
 *
 * To re-enable, flip this one constant - in the same release that ships
 * client-side App Check (a native package, Play Integrity enabled in the
 * Firebase console, and the app's SHA-256 registered), not before.
 */
const ENFORCE_APP_CHECK = true;

module.exports = { ENFORCE_APP_CHECK };
