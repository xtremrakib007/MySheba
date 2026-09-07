# Fraud-signal / admin-security changes

Covers the 4-item list, in priority order. Nothing here has been run or
tested - no Firebase emulator or `npm install` was available in the
sandbox this was written in. Review and test before merging.

## New files
- `functions/rateLimitService.js` - per-uid/per-action velocity guard for
  wallet-mutating callables. Limits are defaults, overridable at runtime
  via `settings/security.walletVelocity` (no redeploy needed).
- `functions/anomalyService.js` - IP-anomaly signal. Flags (doesn't block)
  when an action comes from an IP not seen before for that account.

## Modified files
- `functions/walletService.js` - velocity check + IP capture wired into
  `createSelfTopup`, `transferPoints`, `boostListing`, `chargeWallet`.
- `functions/deviceSessionService.js` - admin/superadmin accounts now
  require a fresh email OTP on every login (not just device switches),
  reusing the existing `otpService.js` send/verify flow. Also logs
  `admin_login` / `admin_mfa_challenge` / `device_switch_*` with IP, and
  calls the anomaly check on every successful login.
- `src/firebase/authService.js` - new `retryDeviceSession()` for the
  admin-MFA confirm path (deliberately not `confirmDeviceSwitch`, which
  would revoke the very session mid-flow).
- `src/context/AppContext.js` / `src/screens/DeviceVerifyScreen.js` -
  thread the new `reason` (`'new_device'` vs `'admin_mfa'`) through the
  existing device-verify screen and branch the confirm step on it.
- `firestore.rules` - froze `knownIps` on `users/{uid}` (same pattern as
  `activeSessionId`/`walletBalance`) so a compromised account can't erase
  its own IP history.
- `babel.config.js` / `package.json` - strips `console.log/warn/info/debug`
  (keeps `console.error`) from production release bundles only, via
  `babel-plugin-transform-remove-console`.

## Before merging
1. `npm install` (adds `babel-plugin-transform-remove-console`).
2. Deploy `firestore.rules` and Functions to a project you can test
   against - ideally the emulator suite first.
3. Manually walk: admin login (should now prompt for an email code every
   time), a normal customer login (should NOT prompt), and a wallet
   transfer burst past the configured limit (should 429 with
   `resource-exhausted`).
4. Confirm `NODE_ENV=production` is actually set during your EAS release
   builds - the console-stripping only fires if it is. Flagged as an
   assumption in `babel.config.js`'s comments, not verified against an
   actual EAS build in this sandbox.
5. `functions/otpService.js`'s SMTP dev-fallback logs raw OTP codes to
   Cloud Functions logs when SMTP env vars are unset - unrelated to the
   4 items above, but worth checking your production SMTP config is
   actually wired up before this ships, now that admin logins depend on
   OTP delivery working every time, not just on device switches.
