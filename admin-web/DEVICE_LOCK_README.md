# MySheba Admin Web — Login Device Lock + OTP

The admin web console uses server-controlled device verification. A new or untrusted browser must complete the current device-verification challenge before it is trusted.

## Current model

- Multi trusted-device support is server-controlled.
- Browser/device identity is a random ID persisted locally; it is not device fingerprinting.
- Verification state and trusted-device records are mutated only through the active backend services.
- Client-side Firestore writes to `trustedDevices` and `loginOtp` are denied.
- OTP state is server-only.

## Active frontend files

- `src/utils/deviceId.ts` — persistent per-browser device ID + label.
- `src/services/deviceAuthService.ts` — calls the deployed `requestLoginOtp` / `verifyLoginOtp` functions used by the admin web flow.
- `src/contexts/AuthContext.tsx` — coordinates the device-verification state after authentication and role validation.
- `src/pages/LoginPage.tsx` — renders the device-verification step when required.

## Backend source of truth

The active Cloud Functions live under the repository's `functions/` directory. `functions/package.json` uses `secureIndexV2.js` as its entry point, so backend authentication/device-session logic must be implemented there or in modules imported by that entry point.

The old `admin-web/functions-to-add/` prototypes have been removed. They must not be copied into `functions/` or re-exported from `functions/index.js`.

## Firestore posture

Inside `users/{uid}`:

- `trustedDevices/{deviceId}` — client read only; client create/update/delete are denied.
- `loginOtp/{docId}` — client access is denied; OTP state is server-only.

The Admin SDK used by Cloud Functions bypasses Firestore client rules for the trusted-device mutations.

## Important deployment rule

Do not deploy or reintroduce files from `admin-web/functions-to-add/`. It was a prototype/drop-in area, not a production Functions source directory. New backend functions must be added to the active `functions/` source tree and explicitly wired through the active entry point.
