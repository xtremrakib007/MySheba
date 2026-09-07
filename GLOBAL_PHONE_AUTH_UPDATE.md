# Global Phone Authentication Update

- Added an international country selector and calling-code list for Login, Registration and Forgot Password.
- SMS numbers are converted to E.164 before Firebase Phone Auth.
- New accounts store `phoneE164` and `phoneCountryCode` alongside the legacy `phone` field.
- New accounts use the E.164-derived Firebase pseudo-email, while existing Malaysian accounts retain legacy-login fallback.
- Forgot Password passes the E.164 number to the server for phone verification and account lookup.
- Firebase remains responsible for SMS delivery, OTP generation and anti-abuse/app verification.
- Email Verification remains available as the alternative recovery method.

## Firebase production configuration

Enable Phone Number sign-in and configure the Firebase Authentication SMS region policy for the countries MySheba intends to serve. Firebase supports phone verification globally, but delivery reliability can vary by country/carrier.
