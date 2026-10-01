/**
 * The single switch for App Check enforcement across every callable.
 *
 * OFF, deliberately, and it must stay off until a build carrying the native
 * App Check module is widely installed. Flipping it on is a one-line change
 * here and nowhere else - but turning it on early returns `unauthenticated`
 * from every callable for every user, which is what happened between
 * 2026-09-16 and 2026-09-26.
 *
 * Until this branch, "the single switch" was not true: 57 of the 95 enforcing
 * callables hardcoded `enforceAppCheck: true` instead of reading this
 * constant, so setting it to false would have left enforcement hard-on for
 * chargeGuards (every purchase), deviceVerificationService (sign-in),
 * secureTransfer, secureWalletCharge, rechargePinService, adminTopUpService
 * and 51 others. All 95 now read this value, and
 * scripts/test-app-check.js fails the build if any callable goes back to a
 * literal.
 *
 * Before flipping it to true, all of the following must hold:
 *   - a release containing @react-native-firebase/app-check is live and
 *     adopted (check Play's version adoption, not just the rollout);
 *   - Play Integrity is enabled and the app's SHA-256 registered in the
 *     Firebase console, iOS App Attest configured;
 *   - Firebase console > App Check shows verified requests arriving from real
 *     installs, not just debug tokens;
 *   - FIREBASE_APP_CHECK_DEBUG_TOKEN is NOT set on the production EAS profile.
 */
const ENFORCE_APP_CHECK = false;

module.exports = { ENFORCE_APP_CHECK };
