
## Base
`mysheba-phase10-backup` (your device's working copy, v5.4.0.5, uncommitted
changes included) — this already contained everything the `mysheba-combined.zip`
lineage had, EXCEPT the biometric re-login opt-in feature.

## Verified identical between phase10 and mysheba-combined (no merge needed)
functions/walletService.js, src/screens/ResellerHomeScreen.js,
src/screens/AdminHomeScreen.js, functions/index.js, src/firebase/authService.js,
src/screens/LoginScreen.js, src/components/AnimatedSplash.js,
src/screens/DeviceVerifyScreen.js, src/firebase/phoneVerification.js,
functions/deviceSessionService.js, eas.json, storage.rules,
src/firebase/progressionService.js, functions/progressionService.js,
src/firebase/biometricAuth.js — all byte-identical. Confirms the Tier/Level
system, admin phone MFA, and login/splash polish were already fully present
in phase10 before this merge.

## Merged in from mysheba-combined (biometric re-login opt-in)
- New file: `src/components/BiometricOptInPrompt.js`
- `src/firebase/appLockPrefs.js`: added `BIOMETRIC_KEY` pref + get/set/clear
  functions (purely additive, phase10's App Lock functions untouched)
- `src/components/AppLockScreen.js`: biometric auto-try now gated on the
  person's own opt-in (`biometricEnabled === true`) instead of just device
  capability
- `src/context/AppContext.js`: added biometric opt-in state, one-time prompt
  logic after fresh sign-in, reset-on-logout, and a background/foreground
  grace period (`APP_LOCK_GRACE_MS`) so App Lock doesn't re-prompt on quick
  app-switches. All additions — nothing from phase10's version was removed.
- `App.js`: added `<BiometricOptInPrompt />` render + import (2 lines)
- `app.json`: added Android App Links `intentFilters` for `mysheba.top`
  (from the combined lineage's deep-link work). Kept phase10's own version
  number (5.4.0.5), versionCode (24), and runtimeVersion policy
  ("sdkVersion") rather than combined's older values.
- `package.json`: kept phase10's version (5.4.0.5) — combined had no other
  differences here.
- `firestore.rules`: kept phase10's version as-is — the only difference was
  a cosmetic variable rename (`txnservice` vs `service`) and phase10's
  `canHandleTransaction` check used a defensive `resource.data.get('service', null)`
  instead of direct field access, which is equivalent but slightly safer.

## Not touched
(`homepageConfigService.js`, `CountryModal.js`), Game Point Gifting
(`GamePointsGiftScreen.js`), and Tier/Level (`TierPromotionsScreen.js`,
`progressionService.js`) — is untouched and carried through as-is.

## Verification performed
- `app.json` and `package.json` validated as well-formed JSON.
- All 343 `.js`/`.jsx` files in `src/`, `functions/`, `functions-gamebot/`,
  `App.js`, and `index.js` parse cleanly with `@babel/parser`
  (`sourceType: module`, JSX plugin). Zero failures.
- **Not run** (no `npm install`, no emulator, no device in this
  environment): actual bundling, Firebase Emulator Suite, or on-device
  testing. Recommend testing the login → biometric opt-in/"Not Now" →
  logout → login-again cycle, plus a full Firestore rules deploy dry-run,
  before shipping.
