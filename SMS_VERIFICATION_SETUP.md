# Firebase Phone SMS OTP setup for MySheba

MySheba uses native `@react-native-firebase/auth` Phone Authentication for SMS OTP. The SMS request is user-triggered; opening the verification screen does **not** send an OTP automatically.

## Production Firebase configuration

In Firebase Console:

1. **Authentication -> Sign-in method -> Phone**: enable Phone.
2. **Authentication -> Settings -> SMS region policy**: allow **Malaysia (MY)**. If MySheba will serve only selected countries, allow only those countries.
3. Make sure the Firebase project has a **Cloud Billing / Blaze** billing account. Production verification SMS requires billing.
4. **Project settings -> Your apps -> Android (`com.satulink.mysheba`)**: add the Android **SHA-1 and SHA-256** fingerprints for every build variant that will use Phone Auth, especially the EAS production/release build.
5. Build a fresh native Android binary after changing native Firebase configuration. An Expo OTA update cannot add missing native Firebase Auth configuration.

Firebase's Android Phone Auth documentation states that SHA-256 is used for Play Integrity and SHA-1 is required for the reCAPTCHA fallback. Firebase also recommends an SMS region policy to reduce SMS abuse. citeturn0search1

## MySheba OTP behavior

- Existing/trusted device: phone + password -> dashboard; no OTP.
- New device: phone + password -> Verify This Device -> user presses **Send SMS Code** -> 6-digit code -> device becomes trusted.
- No SMS is sent merely by opening the verification screen.
- The app enforces a **60-second resend cooldown per phone number** and persists that cooldown across app restarts, reducing accidental repeated Firebase requests.
- Firebase still applies its own anti-abuse throttling. The app cannot bypass Firebase's per-phone limit.

## Firebase limits

On the standard Firebase Authentication SMS service, verification SMS is a pay-as-you-go feature with limits including 3,000 sent SMS/day, 900/minute project-wide, 50/minute per IP and 500/hour per IP. Firebase also applies an additional per-phone-number limit that is not published; exceeding it can temporarily throttle verification. Firebase recommends fictional test numbers for development because they do not consume real SMS quota. citeturn0search0turn0search1

If Firebase returns error 39 / temporary rate limiting, **do not keep pressing Send SMS Code**. Wait for the Firebase limit to clear and then make one new request. For development, configure Firebase fictional phone numbers and fixed test codes instead of repeatedly using a real Malaysian number. citeturn0search1

## Test numbers

Firebase Console -> Authentication -> Sign-in method -> Phone -> **Phone numbers for testing**.

Add a fictional number and a fixed 6-digit code. Firebase supports up to 10 test numbers. Test numbers do not send real SMS and are intended to avoid throttling during development. citeturn0search1

## Native build requirement

`@react-native-firebase/auth` is a native dependency. After installing/updating dependencies, use a fresh EAS development/preview/production build rather than relying on Expo Go:

```bash
npm install
eas build --profile development --platform android
```

For the production APK/AAB, use the project's normal production EAS profile.

## Source implementation

`src/firebase/phoneVerification.js`:

- normalizes phone numbers to E.164 (Malaysia defaults to `+60`);
- sends SMS only from the explicit `sendPhoneOtp()` call;
- persists a 60-second per-phone resend guard using AsyncStorage;
- times out stuck Firebase requests after 30 seconds;
- confirms the 6-digit OTP;
- obtains the temporary Firebase phone ID token;
- signs out the temporary phone-auth identity after confirmation;
- maps Firebase rate-limit, quota, SHA/app-verification, invalid-code and network errors to readable MySheba messages.

The server-side device-session callable verifies the temporary phone ID token against the user's stored MySheba phone number before trusting the new device.
