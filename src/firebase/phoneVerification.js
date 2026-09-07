// Phone number (SMS) verification for registration - real Firebase Phone
// Auth, via @react-native-firebase/auth rather than the 'firebase' JS SDK.
// The JS SDK's phone auth needs a visible web reCAPTCHA (a WebView) to
// work in React Native, which is exactly the friction this avoids: RNFirebase
// talks to native Firebase Auth directly, so on Android it can silently
// verify via Play Integrity/SafetyNet most of the time and only falls back
// to a reCAPTCHA screen when it can't.
//
// This is a SEPARATE Firebase Auth identity from the one the rest of the
// app uses (see src/firebase/config.js / authService.js, which sign in
// with a phone-derived pseudo email via the JS SDK). We only use this one
// to prove "this device can receive SMS at this number", then throw the
// resulting ID token away server-side once it's been checked (see
// functions/phoneVerification.js's assertPhoneVerified). Two call sites:
//   - RegisterScreen.js, during registration.
//   - DeviceVerifyScreen.js, for the admin_mfa challenge (every admin/
//     superadmin login needs a fresh phone verification - see
//     functions/deviceSessionService.js's checkDeviceSession) - there the
//     resulting idToken is passed to authService.retryDeviceSession
//     instead of a registration call, but it's re-verified the same way.
// Nothing else in the app should import this module or read
// rnfbAuth().currentUser.
//
// Phone verification accepts an international calling code and converts the
// user's national number to E.164 before calling Firebase Phone Auth.
// Malaysia (+60) remains the default for backward compatibility.
import rnfbAuth from '@react-native-firebase/auth';



/** Same digits-only normalization authService.js/otpService.js use. */
function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

/** Malaysian local numbers are typically typed with a leading 0
 * (e.g. 0123456789) that isn't part of the E.164 form (+60123456789). */
function toE164(phone, dialCode) {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
  const digits = normalizePhone(phone).replace(/^0+/, '');
  if (!digits || !dialCode) throw new Error('Please enter a valid phone number.');
  return `${dialCode}${digits}`;
}

export function phoneToE164(phone, dialCode = '+60') { return toE164(phone, dialCode); }

/** Sends a real SMS OTP to `phone` via Firebase Phone Auth. Returns the
 * confirmation object RegisterScreen should hold onto in state and pass
 * back into confirmPhoneOtp below. Throws a user-facing message on
 * invalid numbers, too-many-requests, etc. */
export async function sendPhoneOtp(phone, dialCode = '+60') {
  const e164 = toE164(phone, dialCode);
  try {
    return await rnfbAuth().signInWithPhoneNumber(e164);
  } catch (err) {
    throw new Error(friendlyPhoneAuthError(err));
  }
}

/** Confirms `code` against the confirmation from sendPhoneOtp. On success,
 * returns a fresh ID token proving phone ownership - RegisterScreen passes
 * this straight through to registerCustomer/registerWithDealerCode, which
 * re-verifies it server-side (never trust the client's word alone that
 * verification happened, same pattern as the existing email OTP flow).
 * Signs this temporary phone-auth identity back out immediately after,
 * whether or not grabbing the token succeeded, since it has no further use
 * once we have the token and shouldn't be left signed in alongside the
 * app's real (JS SDK) auth session. */
export async function confirmPhoneOtp(confirmation, code) {
  if (!code || !String(code).trim()) throw new Error('Please enter the code we sent you.');
  let userCredential;
  try {
    userCredential = await confirmation.confirm(String(code).trim());
  } catch (err) {
    throw new Error(friendlyPhoneAuthError(err));
  }
  try {
    const idToken = await userCredential.user.getIdToken();
    return { idToken };
  } finally {
    await rnfbAuth().signOut().catch(() => {});
  }
}

function friendlyPhoneAuthError(err) {
  const code = err && err.code;
  if (code === 'auth/invalid-phone-number') return 'Please enter a valid phone number.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
  if (code === 'auth/invalid-verification-code') return 'Incorrect code. Please try again.';
  if (code === 'auth/code-expired') return 'That code has expired. Please request a new one.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
  if (code === 'auth/quota-exceeded') return 'SMS verification is temporarily unavailable. Please try again later.';
  return (err && err.message) || 'Could not verify your phone number. Please try again.';
}
