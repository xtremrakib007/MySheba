// Self-service customer registration. Dealer/reseller codes are no longer required.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { assertEmailVerified, assertEmailOtpVerified } = require('./emailVerification');
const { assertPhoneVerified } = require('./phoneVerification');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');
const emailOtpService = require('./emailOtpService');

const APP_EMAIL_DOMAIN = 'mysheba.app';
const REGISTRATION_LOCK_MS = 120000;
function normalizePhone(phone) { return String(phone || '').replace(/[^0-9]/g, ''); }
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function toE164(phone, dialCode = '+60') {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
  const digits = normalizePhone(phone).replace(/^0+/, '');
  const code = String(dialCode || '+60').replace(/[^0-9+]/g, '');
  return `${code.startsWith('+') ? code : `+${code}`}${digits}`;
}
function phoneToEmail(phoneE164) { return `${String(phoneE164 || '').replace(/[^0-9]/g, '')}@${APP_EMAIL_DOMAIN}`; }
function isValidPhone(phone) { return normalizePhone(phone).length >= 8; }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)); }
function isValidPin(pin) { const value = String(pin || ''); return value.length >= 6 && value.length <= 20; }

exports.registerWithDealerCode = onCall({ enforceAppCheck: false }, async (request) => {
  const data = request.data || {};
  if (data.action === 'sendEmailVerificationOtp') return emailOtpService.sendEmailVerificationOtpInternal(data);
  if (data.action === 'verifyEmailVerificationOtp') return emailOtpService.verifyEmailVerificationOtpInternal(data);
  if (data.action === 'sendEmailVerificationChallenge') return emailOtpService.sendEmailVerificationOtpInternal(data);
  if (data.action === 'verifyEmailOtp') return emailOtpService.verifyEmailVerificationOtpInternal(data);

  const { name, phone, phoneE164, dialCode, email, pin, phoneIdToken, emailIdToken, emailOtpVerificationId } = data;
  if (!name || !name.trim()) throw new HttpsError('invalid-argument', 'Please enter your full name.');
  if (!isValidPhone(phone)) throw new HttpsError('invalid-argument', 'Please enter a valid phone number.');
  if (!isValidEmail(email)) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');

  const normalizedEmail = normalizeEmail(email);
  const verifiedPhoneE164 = toE164(phoneE164 || phone, phoneE164 ? undefined : dialCode);

  let phoneAuthUid = null;
  let emailAuthUid = null;
  let emailOtpUsed = false;
  let verifiedBy = null;

  if (phoneIdToken) {
    try {
      phoneAuthUid = await assertPhoneVerified(phoneIdToken, verifiedPhoneE164, undefined);
      verifiedBy = 'sms';
    } catch (_) { phoneAuthUid = null; }
  }

  if (emailIdToken) {
    try {
      emailAuthUid = await assertEmailVerified(emailIdToken, normalizedEmail);
      verifiedBy = verifiedBy ? 'sms+email' : 'email_link';
    } catch (_) { emailAuthUid = null; }
  }

  if (!emailAuthUid && emailOtpVerificationId) {
    try {
      await assertEmailOtpVerified(emailOtpVerificationId, normalizedEmail);
      emailOtpUsed = true;
      verifiedBy = verifiedBy ? 'sms+email_otp' : 'email_otp';
    } catch (_) {}
  }

  if (!phoneAuthUid && !emailAuthUid && !emailOtpUsed) {
    throw new HttpsError('failed-precondition', 'Please verify your phone number by SMS or verify your email address by link/OTP before registering.');
  }

  const db = admin.firestore();
  // Lock email and phone identities independently. A combined email+phone lock
  // does not prevent two concurrent registrations from reusing the same email
  // with different phone numbers.
  const emailLockRef = db.collection('registrationIdentityLocks').doc('email_' + crypto.createHash('sha256').update(normalizedEmail).digest('hex'));
  const phoneLockRef = db.collection('registrationIdentityLocks').doc('phone_' + crypto.createHash('sha256').update(verifiedPhoneE164).digest('hex'));
  let locksAcquired = false;

  try {
    await db.runTransaction(async (tx) => {
      const [emailLockSnap, phoneLockSnap] = await Promise.all([tx.get(emailLockRef), tx.get(phoneLockRef)]);
      const now = Date.now();
      const emailExpiresAtMs = emailLockSnap.exists ? emailLockSnap.data()?.expiresAt?.toMillis?.() : 0;
      const phoneExpiresAtMs = phoneLockSnap.exists ? phoneLockSnap.data()?.expiresAt?.toMillis?.() : 0;
      if ((emailLockSnap.exists && emailExpiresAtMs > now) || (phoneLockSnap.exists && phoneExpiresAtMs > now)) {
        throw new HttpsError('resource-exhausted', 'Registration is already being processed. Please wait a few seconds.');
      }
      const expiresAt = admin.firestore.Timestamp.fromMillis(now + REGISTRATION_LOCK_MS);
      tx.set(emailLockRef, { type: 'email', createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt });
      tx.set(phoneLockRef, { type: 'phone', createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt });
    });
    locksAcquired = true;
    const emailSnap = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
    if (!emailSnap.empty) throw new HttpsError('already-exists', 'This email address is already registered to another account.');

    const phoneSnap = await db.collection('users').where('phoneE164', '==', verifiedPhoneE164).limit(1).get();
    if (!phoneSnap.empty) throw new HttpsError('already-exists', 'This phone number is already registered to another account.');

    // Never delete an already-established Firebase Auth account merely because its
    // verification credential was supplied during a new registration attempt.
    for (const verifiedUid of [emailAuthUid, phoneAuthUid].filter(Boolean)) {
      try {
        const verifiedProfile = await db.collection('users').doc(verifiedUid).get();
        if (verifiedProfile.exists) {
          throw new HttpsError('already-exists', 'The verified identity is already linked to an existing account.');
        }
      } catch (err) {
        if (err instanceof HttpsError) throw err;
        await logServerError('registerWithDealerCode.identityCheck', err, { userId: verifiedUid });
        throw new HttpsError('internal', 'Could not verify the account identity.');
      }
    }

    const authEmail = phoneToEmail(verifiedPhoneE164);
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({ email: authEmail, password: pin, displayName: name.trim() });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'An account with this phone number already exists.');
      await logServerError('registerWithDealerCode', err, { userId: null });
      throw new HttpsError('internal', 'Could not create the account.');
    }

    const profile = {
      uid: userRecord.uid,
      userId: await assignUniqueUserId(db, userRecord.uid),
      name: name.trim(),
      phone: normalizePhone(phone),
      phoneE164: verifiedPhoneE164,
      phoneCountryCode: dialCode || '+60',
      email: normalizedEmail,
      role: 'customer',
      walletBalance: 0,
      walletCurrency: require('./walletCurrencyService').CURRENCY_BY_DIAL[String(dialCode || '+60').replace(/[^0-9]/g, '')] || 'MYR',
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

    await logAudit({
      action: 'account_created', targetUid: userRecord.uid, performedBy: 'system', performedByRole: null,
      details: { role: 'customer', method: 'phone_pin', verification: verifiedBy, emailVerification: emailOtpUsed ? 'otp' : (emailAuthUid ? 'firebase_link' : null) },
    });
    return { uid: userRecord.uid, role: 'customer', verification: verifiedBy };
  } finally {
    if (locksAcquired) await Promise.all([emailLockRef.delete().catch(() => {}), phoneLockRef.delete().catch(() => {})]);
  }
});
