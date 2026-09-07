# Email Verification Setup (Firebase Auth email link)

Email verification (registration's step 3, and the "new device"
re-verification challenge on login) now uses real Firebase Auth email-link
sign-in - see `src/firebase/emailVerification.js` /
`functions/emailVerification.js`. Firebase sends the email itself; no SMTP
or custom mail provider is involved in this flow. (`functions/mailerService.js`
still uses SMTP, but only for the unrelated "new device" security-alert
email - that wasn't touched.)

This needs a few one-time setup steps that can't be done from code:

## 1. Firebase Console

- **Authentication → Sign-in method** → enable **Email link (passwordless
  sign-in)** under the Email/Password provider.
- **Authentication → Settings → Authorized domains** → add `mysheba.top`
  (it needs to be authorized before Firebase will generate email-action
  links pointing at it).

## 2. Android - Digital Asset Links

`app.json`'s `android.intentFilters` already targets `https://mysheba.top`
with `autoVerify: true`, so no app.json change was needed for Android. But
Android only trusts that intent filter once it can verify
`https://mysheba.top/.well-known/assetlinks.json` matches your app's real
signing certificate.

`public/.well-known/assetlinks.json` has been added with a placeholder -
replace `REPLACE_WITH_YOUR_APP_SIGNING_SHA256_FINGERPRINT` with your app's
actual SHA-256 signing certificate fingerprint before deploying hosting.
Get it from:

- EAS-managed builds: `eas credentials` → Android → your build profile →
  "Keystore" → SHA-256 fingerprint, or
- `keytool -list -v -keystore your.keystore -alias your-alias`

Then deploy hosting: `firebase deploy --only hosting`. You can confirm it's
live at `https://mysheba.top/.well-known/assetlinks.json` (should NOT
404 - `firebase.json`'s hosting `ignore` list was updated with
`!.well-known/**` so this directory isn't silently excluded from deploys,
which is the default Firebase Hosting behavior for any dot-prefixed path).

## 3. iOS - not set up yet

There's no iOS build configured in this project yet (no `bundleIdentifier`
in `app.json`, no `ios` profile in `eas.json`). When one exists:

- Add `"bundleIdentifier"` and `"associatedDomains": ["applinks:mysheba.top"]`
  under `app.json`'s `expo.ios`.
- Add an `apple-app-site-association` file at
  `public/.well-known/apple-app-site-association` (no `.json` extension,
  served with `Content-Type: application/json`) referencing your Team ID +
  bundle ID.
- Add an `iOS: { bundleId: '<your bundle id>' }` entry to
  `src/firebase/emailVerification.js`'s `actionCodeSettings`.

Until then, tapping an email verification link on iOS won't deep-link back
into the app.

## 4. Testing

Once (1) and (2) are done and hosting is deployed: register a new account,
watch the phone-OTP step work as before, then check that the email arrives
and tapping it (on the same device the app is running on) resumes
`RegisterScreen` and completes the account. The same applies to the "new
device" challenge on `DeviceVerifyScreen`.

## Forgot Password: Email Verification

Forgot Password now offers **Email Verification alongside SMS OTP**.

Flow:
1. User enters the phone number belonging to the MySheba account.
2. User selects **Send Email Link** and enters the account email.
3. Firebase Authentication sends an email sign-in link.
4. Opening the link launches MySheba (including a cold-start launch).
5. The app exchanges the link for a short-lived Firebase ID token.
6. The server verifies that token and that the email matches the account's stored email.
7. The user sets a new password; the server updates it and revokes existing sessions.

Production requirements:
- Enable **Email link (passwordless sign-in)** in Firebase Authentication > Sign-in method.
- Add `mysheba.top` as an authorized Firebase Auth domain.
- Configure the `https://mysheba.top/verifyEmail` hosting/App-Link route and Android App Links for `com.satulink.mysheba`.
- Deploy the `resetPassword` Cloud Function and the existing email verification helper.
