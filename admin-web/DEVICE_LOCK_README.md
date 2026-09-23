# MySheba Admin Web — Login Device Lock + OTP

Adds device-lock to the admin web console's own login (separate from the
mobile app's existing single-device enforcement in `superadminService.ts` /
Device Sessions, which is unchanged). A browser signing in for the first
time on an admin account must clear a one-time code before it's trusted;
already-trusted browsers sign in as before with no extra step.

## Model

- **Multi trusted-device**, not single-device: an admin can trust several
  browsers (laptop, home PC, etc.) over time. Each new/unrecognized browser
  triggers OTP once; after that it's remembered.
- Device identity is a random ID persisted in that browser's `localStorage`
  — not real device fingerprinting (not reliable from a web page, and not
  appropriate to build for an internal tool).
- **Email OTP by default**, with an explicit "Use SMS instead" option on
  the verification screen — not an automatic fallback, since not every
  admin account is guaranteed to have a phone number on file.

## Files changed (frontend — `admin-web-src-full/src/`)

- `utils/deviceId.ts` **(new)** — persistent per-browser device ID + label.
- `services/deviceAuthService.ts` **(new)** — trusted-device check, OTP
  request/verify calls.
- `contexts/AuthContext.tsx` **(modified)** — after credentials + role
  check pass, holds the profile back and checks device trust; if untrusted,
  auto-sends an email OTP and exposes `deviceVerificationRequired`,
  `requestOtp`, `verifyOtp`, `cancelDeviceVerification` to the UI. `profile`
  only becomes non-null once the device is verified, so `ProtectedRoute`
  needed no changes — it already redirects to `/login` whenever `profile`
  is null.
- `pages/LoginPage.tsx` **(modified)** — renders the existing form, or a
  new OTP step (code entry, resend, switch email/SMS, cancel) when
  `deviceVerificationRequired` is true.

Drop these four files into the matching paths in your project, replacing
the two existing ones.

## Files provided but NOT verified against your real backend

I only received `admin-web-src-full` (the frontend) — the `functions/`
project and `firestore.rules` weren't in the zip, so these are best-effort
drafts, not drop-in-and-done:

- `functions-to-add/loginDeviceAuth.js` — `requestLoginOtp` and
  `verifyLoginOtp` Cloud Functions. Written against Cloud Functions v2
  (`onCall`) syntax; adjust if your `functions/` project uses v1, and
  re-export both from your `index.js` the way `walletService.js` etc.
  already are.
- `functions-to-add/firestore-rules-snippet.txt` — rules for the two new
  subcollections (`trustedDevices`, `loginOtp`), both server-write-only.

**Prerequisites for the backend piece to actually work:**

1. **Email** — assumes the Firebase "Trigger Email" extension (writes to a
   `mail` collection) since no other email provider showed up in the
   frontend code. If MySheba already sends email another way, swap
   `sendEmailOtp()` to match.
2. **SMS** — no SMS provider exists anywhere in the shared codebase.
   `sendSmsOtp()` is a stub that throws a clear error rather than silently
   doing nothing, until Twilio (or whichever provider) is wired in with
   credentials. Email OTP works fully standalone in the meantime — "Use
   SMS instead" will error until this is done.

## Not built (possible follow-ups, not requested)

- A "manage trusted devices" screen for an admin to see/revoke their own
  trusted browsers (natural pairing with the existing superadmin Device
  Sessions page, but for the admin's *own* account — didn't build it since
  it wasn't asked for).
- Superadmin visibility into *other* admins' trusted devices.

If you want either of those, or want me to adjust `loginDeviceAuth.js` to
match your actual `functions/` conventions, send over that folder (or just
`functions/index.js` + one existing function file like `walletService.js`
for the pattern) and I'll align it.
