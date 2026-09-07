# Firebase Phone (SMS) verification setup

Registration now verifies the phone number with a real SMS code via
Firebase Phone Auth, using `@react-native-firebase/auth` (not the `firebase`
JS SDK — that one needs a web reCAPTCHA/WebView to work in React Native;
RNFirebase talks to native Firebase Auth directly and can usually verify
silently on Android via Play Integrity).

## 1. Enable Phone sign-in
Firebase console -> Authentication -> Sign-in method -> enable **Phone**.

## 2. Play Integrity (Android, recommended)
Firebase console -> Authentication -> Sign-in method -> Phone -> the
"Play Integrity" section should show your app's SHA-256 automatically
picked up once you've built with EAS at least once. This is what lets
verification happen silently most of the time instead of falling back to
a visible reCAPTCHA screen. No extra permissions were needed for this —
Phone Auth reuses the same google-services.json already set up for push
(see CALL_NOTIFICATION_SETUP.md).

## 3. Install the new native dep
```
npm install
npx expo prebuild --clean
```
`@react-native-firebase/auth` is a native module (like `messaging` already
was) — this needs a new custom dev/EAS build, same as the call-push setup:
```
eas build --profile development --platform android
```

## 4. Test numbers (optional, for development)
Firebase console -> Authentication -> Sign-in method -> Phone -> "Phone
numbers for testing" lets you add a fake +60 number + fixed code, so you
can go through the whole registration flow in a simulator/emulator without
burning real SMS.

## What changed
- `src/firebase/phoneVerification.js` (new) — client-side send/confirm
  using `@react-native-firebase/auth`'s `signInWithPhoneNumber`. This is a
  separate Firebase Auth identity from the app's real sign-in (still
  phone+PIN via the JS SDK, see `authService.js`) — used only to prove SMS
  ownership during registration, then discarded.
- `functions/phoneVerification.js` (new) — server-side `assertPhoneVerified`,
  checks the ID token from the client step is real, recent, and for the
  right phone number, mirroring `otpService.js`'s `assertRecentlyVerified`
  for email.
- `functions/customerRegistration.js` — `registerWithDealerCode` now
  requires `phoneIdToken` and re-verifies it server-side before creating
  the account; deletes the throwaway phone-auth identity afterward.
- `src/firebase/authService.js` / `src/context/AppContext.js` —
  `registerCustomer`/`doRegister` now require and forward `phoneIdToken`.
- `src/screens/RegisterScreen.js` — registration is now 3 steps: details ->
  verify phone (SMS) -> verify email (unchanged) -> create account.
- `package.json` — added `@react-native-firebase/auth`.
