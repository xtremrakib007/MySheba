# MySheba SMS OTP — Firebase Phone Authentication

MySheba uses Firebase Phone Authentication as the definitive SMS OTP provider.

## Runtime flow

1. The app normalizes the phone number to E.164 format.
2. `src/firebase/phoneVerification.js` calls React Native Firebase Auth `signInWithPhoneNumber()`.
3. Firebase performs Android app verification and sends the SMS OTP.
4. The user enters the six-digit code.
5. `confirmation.confirm(code)` verifies the OTP with Firebase.
6. MySheba obtains a Firebase ID token as proof of phone ownership and signs out the temporary Firebase phone-auth session. The existing MySheba account/session model remains unchanged.

## Firebase Console requirements

For production SMS to work:

- Enable Authentication → Sign-in method → Phone.
- Configure the Firebase SMS region policy for the countries MySheba serves.
- Register Android package `com.satulink.mysheba`.
- Register the production/release SHA-1 fingerprint.
- Register the production/release SHA-256 fingerprint for Play Integrity.
- Use the matching `google-services.json`.

## Testing

Use Firebase Authentication's test phone numbers/codes during development to avoid unnecessary real SMS attempts.

## Important

Do not add Twilio or another SMS gateway to the MySheba OTP flow. Do not generate or store the OTP in a MySheba Cloud Function. Firebase owns OTP generation, SMS delivery, rate limiting, and verification.
