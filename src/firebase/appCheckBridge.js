import Constants from 'expo-constants';

// The two details that make the native -> JS App Check bridge actually work,
// kept out of config.js so they can be tested without a Firebase app.

/**
 * Normalise what @react-native-firebase/app-check's getToken() returns into
 * what the Firebase JS SDK's CustomProvider needs.
 *
 * getToken() resolves to AppCheckTokenResult, which declares ONLY `token`.
 * `expireTimeMillis` lives on a different interface (AppCheckToken), and the
 * native module populates it only on the onTokenChanged event - never on
 * getToken. So `result.expireTimeMillis` is undefined.
 *
 * That matters because @firebase/app-check caches by it:
 *
 *   function isValid(token) { return token.expireTimeMillis - Date.now() > 0; }
 *
 * `undefined - Date.now()` is NaN and `NaN > 0` is false, so the cached token
 * is NEVER valid and every single callable invocation triggers a fresh native
 * Play Integrity attestation. That is hundreds of milliseconds to seconds per
 * call, against Play Integrity's quota - it passes a manual test and then
 * throttles under real traffic.
 *
 * So derive the expiry from the JWT's own `exp` claim, which is the
 * authoritative value, and fall back to a conservative TTL when the token
 * cannot be parsed. Never return undefined.
 */
const FALLBACK_TTL_MS = 30 * 60 * 1000; // App Check tokens last ~60 min; half is safe.

export function expiryFromJwt(token, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    // base64url -> JSON, without depending on a Buffer polyfill.
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    if (typeof globalThis.atob !== 'function') return null;
    const claims = JSON.parse(globalThis.atob(padded));
    const exp = Number(claims?.exp);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    const millis = exp * 1000;
    // An exp already in the past, or absurdly far out, is not usable.
    if (millis <= now || millis - now > 24 * 60 * 60 * 1000) return null;
    return millis;
  } catch (e) {
    return null;
  }
}

export function toAppCheckToken(result, now = Date.now()) {
  const token = String(result?.token || '');
  if (!token) throw new Error('Native App Check returned no token.');
  const declared = Number(result?.expireTimeMillis);
  const expireTimeMillis = Number.isFinite(declared) && declared > now
    ? declared
    : (expiryFromJwt(token, now) ?? now + FALLBACK_TTL_MS);
  return { token, expireTimeMillis };
}

/**
 * Whether to use the debug attestation provider.
 *
 * The condition used to be `__DEV__ || debugToken`, which meant that setting
 * FIREBASE_APP_CHECK_DEBUG_TOKEN on the production EAS profile would silently
 * put a PRODUCTION build on the debug provider - App Check then verifies
 * anything holding that one registered token, which is the whole protection
 * gone. A debug token is only honoured outside production now.
 */
export function shouldUseDebugProvider({ isDev, debugToken, profile }) {
  if (isDev) return true;
  if (!debugToken) return false;
  return String(profile || '').toLowerCase() !== 'production';
}

/** The EAS build profile, when the build recorded one. */
export function appCheckBuildProfile() {
  return (
    Constants.expoConfig?.extra?.easBuildProfile
    || Constants.expoConfig?.extra?.buildProfile
    || process.env.EAS_BUILD_PROFILE
    || ''
  );
}
