// Self-service customer registration. Dealer/reseller codes are no longer required.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertEmailVerified, assertEmailOtpVerified } = require('./emailVerification');
const { assertPhoneVerified } = require('./phoneVerification');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');
const emailOtpService = require('./emailOtpService');

const APP_EMAIL_DOMAIN = 'mysheba.app';

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function toE164(phone, dialCode = '+60') {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
  const digits = normalizePhone(phone).replace(/^0+/, '');
  const code = String(dialCode || '+60').replace(/[^0-9+]/g, '');
  return `${code.startsWith('+') ? code : `+${code}`}${digits}`;
}

function phoneToEmail(phoneE164) {
  return `${String(phoneE164 || '').replace(/[^0-9]/g, '')}@${APP_EMAIL_DOMAIN}`;
}

function isValidPhone(phone) {
  return normalizePhone(phone).length >= 8;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function isValidPin(pin) {
  const value = String(pin || '');
  return value.length >= 6 && value.length <= 20;
}

exports.registerWithDealerCode = onCall(async (request) => {
  const data = request.data || {};

  // Public pre-registration email challenge. No customer account is created here.
  if (data.action === 'sendEmailVerificationOtp') return emailOtpService.sendEmailVerificationOtpInternal(data);
  if (data.action === 'verifyEmailVerificationOtp') return emailOtpService.verifyEmailVerificationOtpInternal(data);
  // Backward-compatible aliases for older clients.
  if (data.action === 'sendEmailVerificationChallenge') return emailOtpService.sendEmailVerificationOtpInternal(data);
  if (data.action === 'verifyEmailOtp') return emailOtpService.verifyEmailVerificationOtpInternal(data);

  const {
    name,
    phone,
    phoneE164,
    dialCode,
    email,
    pin,
    phoneIdToken,
    emailIdToken,
    emailOtpVerificationId,
  } = data;

  if (!name || !name.trim()) throw new HttpsError('invalid-argument', 'Please enter your full name.');
  if (!isValidPhone(phone)) throw new HttpsError('invalid-argument', 'Please enter a valid phone number.');
  if (!isValidEmail(email)) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');

  const normalizedEmail = normalizeEmail(email);
  const verifiedPhoneE164 = toE164(phoneE164 || phone, phoneE164 ? undefined : dialCode);

  // Registration deliberately supports either verification method:
  //   1) Firebase SMS phone verification, OR
  //   2) Firebase email link / server-issued email OTP verification.
  // At least one proof must be valid. If both are supplied, validate both.
  let phoneAuthUid = null;
  let emailAuthUid = null;
  let emailOtpUsed = false;
  let verifiedBy = null;

  if (phoneIdToken) {
    try {
      phoneAuthUid = await assertPhoneVerified(phoneIdToken, verifiedPhoneE164, undefined);
      verifiedBy = 'sms';
    } catch (err) {
      // Do not immediately fail: an email proof may still be valid.
      phoneAuthUid = null;
    }
  }

  if (emailIdToken) {
    try {
      emailAuthUid = await assertEmailVerified(emailIdToken, normalizedEmail);
      verifiedBy = verifiedBy ? 'sms+email' : 'email_link';
    } catch (linkErr) {
      emailAuthUid = null;
    }
  }

  if (!emailAuthUid && emailOtpVerificationId) {
    try {
      await assertEmailOtpVerified(emailOtpVerificationId, normalizedEmail);
      emailOtpUsed = true;
      verifiedBy = verifiedBy ? 'sms+email_otp' : 'email_otp';
    } catch (err) {
      // Ignore an invalid email proof if SMS proof is valid; otherwise fail below.
    }
  }

  if (!phoneAuthUid && !emailAuthUid && !emailOtpUsed) {
    throw new HttpsError(
      'failed-precondition',
      'Please verify your phone number by SMS or verify your email address by link/OTP before registering.'
    );
  }

  const db = admin.firestore();

  const emailSnap = await db.collection('users')
    .where('email', '==', normalizedEmail)
    .limit(1)
    .get();
  if (!emailSnap.empty) {
    throw new HttpsError('already-exists', 'This email address is already registered to another account.');
  }

  // Global phone uniqueness is based on E.164, not the local number alone.
  const phoneSnap = await db.collection('users')
    .where('phoneE164', '==', verifiedPhoneE164)
    .limit(1)
    .get();
  if (!phoneSnap.empty) {
    throw new HttpsError('already-exists', 'This phone number is already registered to another account.');
  }

  const authEmail = phoneToEmail(verifiedPhoneE164);
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email: authEmail,
      password: pin,
      displayName: name.trim(),
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'An account with this phone number already exists.');
    }
    await logServerError('registerWithDealerCode', err, { userId: null });
    throw new HttpsError('internal', 'Could not create the account.');
  }

  const profile = {
    uid: userRecord.uid,
    userId: await assignUniqueUserId(db, userRecord.uid),
    name: name.trim(),
    phone: normalizePhone(phone),
    phoneE164: verifiedPhoneE164,
    phoneCountryCode: dialCode || (verifiedPhoneE164.match(/^\+(\d{1,4})/) || [])[1] || '+60',
    email: normalizedEmail,
    role: 'customer',
    walletBalance: 0,
    notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    await db.collection('users').doc(userRecord.uid).set(profile);
  } catch (err) {
    await admin.auth().deleteUser(userRecord.uid).catch(() => {});
    await logServerError('registerWithDealerCode.profile', err, { userId: userRecord.uid });
    throw new HttpsError('internal', 'Could not finish creating the account.');
  }

  await db.collection('otps').doc(normalizedEmail).delete().catch(() => {});
  if (emailAuthUid) await admin.auth().deleteUser(emailAuthUid).catch(() => {});
  if (phoneAuthUid) await admin.auth().deleteUser(phoneAuthUid).catch(() => {});

  await logAudit({
    action: 'account_created',
    targetUid: userRecord.uid,
    performedBy: 'system',
    performedByRole: null,
    details: {
      role: 'customer',
      method: 'phone_pin',
      verification: verifiedBy,
      emailVerification: emailOtpUsed ? 'otp' : (emailAuthUid ? 'firebase_link' : null),
    },
  });

  return { uid: userRecord.uid, role: 'customer', verification: verifiedBy };
});
