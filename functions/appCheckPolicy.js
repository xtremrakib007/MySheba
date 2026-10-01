/**
 * Central App Check enforcement switch.
 *
 * The mobile client initializes native App Check and bridges its token into
 * the Firebase JS SDK. Android production uses Play Integrity and iOS uses
 * App Attest with DeviceCheck fallback; development/preview builds may use a
 * Firebase-registered debug token.
 *
 * Keep this enabled for callable functions that use this policy. Individual
 * public/pre-auth endpoints can intentionally opt out when App Check cannot
 * be established before authentication.
 */
const ENFORCE_APP_CHECK = true;

module.exports = { ENFORCE_APP_CHECK };
