# MySheba SMS OTP — Firebase Phone Authentication

MySheba uses **Firebase Phone Authentication** as the definitive SMS OTP provider.

## Runtime flow

1. The app normalizes the user's number to E.164 format.
2. `src/firebase/phoneVerification.js` calls React Native Firebase Auth `signInWithPhoneNumber()`.
3. Firebase performs Android app verification (Play Integrity or reCAPTCHA as applicable) and sends the SMS OTP.
4. The user enters the six-digit code.
5. `confirmation.confirm(code)` verifies the OTP with Firebase.
6. MySheba obtains a Firebase ID token as proof of phone ownership and immediately signs the temporary Firebase Auth session out. The existing MySheba account/session model remains unchanged.

## Firebase Console requirements

For production SMS to work, the Firebase project must have:

- Authentication → Sign-in method → **Phone** enabled.
- SMS region policy configured to allow the countries MySheba serves (including Malaysia if applicable).
- The Android app registered with package `com.satulink.mysheba`.
- The production/release **SHA-1** fingerprint registered.
- The production/release **SHA-256** fingerprint registered for Play Integrity.
- An up-to-date `google-services.json` matching that Firebase Android app.

Firebase documents that Android Phone Auth requires SHA-1 and recommends SHA-256 for Play Integrity app verification. citeturn0search2turn0search9

## Testing

Firebase provides test phone numbers/codes in the Authentication console. Use those for development instead of repeatedly sending real SMS messages.

## Important

Do not add Twilio or another SMS gateway for the MySheba OTP flow. Do not generate or store the OTP in a MySheba Cloud Function. Firebase owns OTP generation, SMS delivery, rate limiting, and verification.
