# MySheba SMS OTP — Firebase Phone Authentication

MySheba uses Firebase Phone Authentication as the definitive SMS OTP provider.

The app normalizes phone numbers to E.164 format, calls React Native Firebase Auth `signInWithPhoneNumber()`, confirms the six-digit code with Firebase, obtains the Firebase ID token as proof of phone ownership, and then signs out the temporary Firebase phone-auth session so the existing MySheba account/session model remains unchanged.

Production requirements:
- Enable Authentication → Sign-in method → Phone.
- Configure the Firebase SMS region policy for the countries MySheba serves.
- Register Android package `com.satulink.mysheba`.
- Register the production/release SHA-1 fingerprint.
- Register the production/release SHA-256 fingerprint for Play Integrity.
- Use the matching `google-services.json`.

Do not add Twilio or another SMS gateway to the MySheba OTP flow. Firebase owns OTP generation, SMS delivery, rate limiting, and verification.
