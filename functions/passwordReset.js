// Forgot Password - server half.
//
// The app's login is phone+password against a deterministic pseudo email
// (see src/firebase/authService.js's phoneToEmail/APP_EMAIL_DOMAIN), so
// there's no real inbox Firebase's built-in sendPasswordResetEmail could
// reach. Instead, exactly like registration (customerRegistration.js) and
// the device-switch challenge (deviceSessionService.js), we require a
// FRESH real verification - either real Firebase Phone Auth SMS
// (phoneVerification.js) or real Firebase email-link (emailVerification.js)
// - proving the person owns the phone or email already on file for this
// account, then use the Admin SDK to set a new password directly.
//
// Client call (src/firebase/authService.js resetPassword):
//   const fn = httpsCallable(functions, 'resetPassword');
//   await fn({ phone, email, newPassword, phoneIdToken, emailIdToken });
//   // pass exactly ONE of phoneIdToken/emailIdToken, matching whichever
//   // channel src/screens/ForgotPasswordScreen.js sent the code/link on.
//
// Security notes:
//   - The email path requires the email to match the ACCOUNT's own email
//     on file (not just any verified email) - otherwise someone could
//     verify ownership of their own unrelated email and reset a stranger's
//     phone-based account.
//   - Every other device is signed out afterward (revokeRefreshTokens),
//     same as a device switch - a password reset is exactly the kind of
//     event that should end existing sessions.
//   - activeSessionId/activeDeviceId/pendingDeviceApproval are cleared so
//     the next login is treated as fresh rather than as a device switch
//     needing its own OTP - the reset itself was already a strong
//     re-verification of identity.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertPhoneVerified } = require('./phoneVerification');
const { assertEmailVerified } = require('./emailVerification');
const { logAudit, logServerError } = require('./logService');

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

// Always produce the same E.164 representation used by registration and
// Firebase Phone Auth. A local Malaysian number such as 0123456789 becomes
// +60123456789; an already-international number is preserved.
function toE164(phone, dialCode = '+60') {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) {
    return `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
  }
  const digits = normalizePhone(phone).replace(/^0+/, '');
  const code = String(dialCode || '+60').replace(/[^0-9+]/g, '');
  return `${code.startsWith('+') ? code : `+${code}`}${digits}`;
}

// Existing accounts may have been created by older versions of the app and
// may store `phone` as local digits, country-code digits, or even an E.164
// string. New registrations store both `phone` (local digits) and
// `phoneE164`. Search all safe exact representations so password recovery
// does not depend on the format used when the account was originally made.
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function phoneLookupCandidates(phone, phoneE164, dialCode) {
  const e164 = toE164(phoneE164 || phone, dialCode);
  const e164Digits = normalizePhone(e164);
  const localDigits = normalizePhone(phone);
  const countryCode = normalizePhone(dialCode || '+60');
  const withoutCountry = e164Digits.startsWith(countryCode)
    ? e164Digits.slice(countryCode.length)
    : '';

  return {
    e164Candidates: unique([e164, `+${e164Digits}`]),
    phoneCandidates: unique([
      localDigits,
      e164Digits,
      `+${e164Digits}`,
      withoutCountry,
    ]),
  };
}

async function findUserByPhone(db, phone, phoneE164, dialCode) {
  const { e164Candidates, phoneCandidates } = phoneLookupCandidates(phone, phoneE164, dialCode);

  // Prefer the canonical field used by current registrations.
  if (e164Candidates.length) {
    const snap = await db.collection('users')
      .where('phoneE164', 'in', e164Candidates)
      .limit(1)
      .get();
    if (!snap.empty) return snap;
  }

  // Fall back to legacy `phone` representations. The `in` query is exact,
  // so this does not perform a broad/unsafe substring search.
  if (phoneCandidates.length) {
    const snap = await db.collection('users')
      .where('phone', 'in', phoneCandidates)
      .limit(1)
      .get();
    if (!snap.empty) return snap;
  }

  return { empty: true, docs: [] };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function isValidPassword(pin) {
  const value = String(pin || '');
  return value.length >= 6 && value.length <= 20;
}

exports.resetPassword = onCall(async (request) => {
  const { phone, phoneE164, dialCode, email, newPassword, phoneIdToken, emailIdToken } = request.data || {};

  const normalizedPhone = normalizePhone(phone);
  const normalizedE164 = toE164(phoneE164 || phone, dialCode);
  if (!normalizedPhone) throw new HttpsError('invalid-argument', 'Please enter a valid phone number.');
  if (!isValidPassword(newPassword)) throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');
  if (!phoneIdToken && !emailIdToken) {
    throw new HttpsError('invalid-argument', 'Please verify your phone or email first.');
  }

  const db = admin.firestore();
  const snap = await findUserByPhone(db, phone, normalizedE164, dialCode);
  if (snap.empty) {
    throw new HttpsError('not-found', 'No account found with that phone number.');
  }
  const userDoc = snap.docs[0];
  const userData = userDoc.data();
  const realUid = userDoc.id;

  if (userData.suspended) {
    throw new HttpsError('permission-denied', 'This account has been suspended. Please contact support.');
  }

  // Verify via whichever channel the client actually sent a code/link on -
  // never trust the client's word alone that it happened (same pattern as
  // customerRegistration.js/deviceSessionService.js).
  let tempAuthUid;
  if (phoneIdToken) {
    try {
      tempAuthUid = await assertPhoneVerified(phoneIdToken, normalizedE164, undefined);
    } catch (err) {
      throw new HttpsError('failed-precondition', err.message || 'Please verify your phone number first.');
    }
  } else {
    const accountEmail = normalizeEmail(userData.email || '');
    if (!accountEmail) {
      throw new HttpsError(
        'failed-precondition',
        'This account has no email on file - please reset via SMS instead.'
      );
    }
    if (normalizeEmail(email) !== accountEmail) {
      throw new HttpsError('failed-precondition', 'That email is not associated with this phone number.');
    }
    try {
      tempAuthUid = await assertEmailVerified(emailIdToken, accountEmail);
    } catch (err) {
      throw new HttpsError('failed-precondition', err.message || 'Please verify your email address first.');
    }
  }

  try {
    await admin.auth().updateUser(realUid, { password: String(newPassword) });
  } catch (err) {
    await logServerError('resetPassword.updateUser', err, { userId: realUid });
    throw new HttpsError('internal', 'Could not reset your password right now. Please try again.');
  }

  // End every existing session (same rationale as a device switch) and
  // clear device-session state so the next login is treated as fresh.
  await admin.auth().revokeRefreshTokens(realUid).catch(() => {});
  await userDoc.ref.update({
    activeSessionId: null,
    activeDeviceId: null,
    pendingDeviceApproval: null,
  }).catch(() => {});

  // Clean up the throwaway phone/email-auth identity - it has no further
  // use once we have the verification result.
  if (tempAuthUid) {
    await admin.auth().deleteUser(tempAuthUid).catch(() => {});
  }

  await logAudit({
    action: 'password_reset',
    targetUid: realUid,
    performedBy: realUid,
    performedByRole: userData.role,
    details: { via: phoneIdToken ? 'sms' : 'email' },
  });

  return { success: true };
});
