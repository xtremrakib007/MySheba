// Self-service customer registration. Dealer/reseller codes are not required.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { assertEmailVerified, assertEmailOtpVerified } = require('./emailVerification');
const { assertPhoneVerified } = require('./phoneVerification');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');
const emailOtpService = require('./emailOtpService');
const { trackTemporaryAuthUser, deleteTrackedTemporaryAuthUser } = require('./temporaryAuthCleanup');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

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

async function registerCustomer(request) {
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
    try { phoneAuthUid = await assertPhoneVerified(phoneIdToken, verifiedPhoneE164, undefined); verifiedBy = 'sms'; }
    catch (_) { phoneAuthUid = null; }
  }
  if (emailIdToken) {
    try { emailAuthUid = await assertEmailVerified(emailIdToken, normalizedEmail); verifiedBy = verifiedBy ? 'sms+email' : 'email_link'; }
    catch (_) { emailAuthUid = null; }
  }
  if (!emailAuthUid && emailOtpVerificationId) {
    try { await assertEmailOtpVerified(emailOtpVerificationId, normalizedEmail); emailOtpUsed = true; verifiedBy = verifiedBy ? 'sms+email_otp' : 'email_otp'; }
    catch (_) {}
  }
  if (!phoneAuthUid && !emailAuthUid && !emailOtpUsed) {
    throw new HttpsError('failed-precondition', 'Please verify your phone number by SMS or verify your email address by link/OTP before registering.');
  }

  const db = admin.firestore();
  const lockKey = crypto.createHash('sha256').update(`${normalizedEmail}|${verifiedPhoneE164}`).digest('hex');
  const lockRef = db.collection('registrationLocks').doc(lockKey);
  let lockAcquired = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      const expiresAtMs = snap.exists ? snap.data()?.expiresAt?.toMillis?.() : 0;
      if (snap.exists && expiresAtMs > Date.now()) throw new HttpsError('resource-exhausted', 'Registration is already being processed. Please wait a few seconds and try again.');
      tx.set(lockRef, { email: normalizedEmail, phoneE164: verifiedPhoneE164, createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + REGISTRATION_LOCK_MS) });
    });
    lockAcquired = true;

    const emailSnap = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
    if (!emailSnap.empty) throw new HttpsError('already-exists', 'This email address is already registered to another account.');
    const phoneSnap = await db.collection('users').where('phoneE164', '==', verifiedPhoneE164).limit(1).get();
    if (!phoneSnap.empty) throw new HttpsError('already-exists', 'This phone number is already registered to another account.');

    const authEmail = phoneToEmail(verifiedPhoneE164);
    let userRecord;
    try { userRecord = await admin.auth().createUser({ email: authEmail, password: pin, displayName: name.trim() }); }
    catch (err) {
      if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'An account with this phone number already exists.');
      await logServerError('registerCustomer', err, { userId: null });
      throw new HttpsError('internal', 'Could not create the account.');
    }

    let reservedUserId = null;
    const profile = {
      uid: userRecord.uid,
      userId: await assignUniqueUserId(db, userRecord.uid),
      name: name.trim(), phone: normalizePhone(phone), phoneE164: verifiedPhoneE164,
      phoneCountryCode: dialCode || '+60', email: normalizedEmail, role: 'customer', walletBalance: 0,
      notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    reservedUserId = profile.userId;
    try { await db.collection('users').doc(userRecord.uid).set(profile); }
    catch (err) {
      await admin.auth().deleteUser(userRecord.uid).catch(() => {});
      if (reservedUserId != null) await db.collection('userIds').doc(String(reservedUserId)).delete().catch(() => {});
      await logServerError('registerCustomer.profile', err, { userId: userRecord.uid });
      throw new HttpsError('internal', 'Could not finish creating the account.');
    }

    await db.collection('otps').doc(normalizedEmail).delete().catch(() => {});
    if (emailAuthUid) {
      await trackTemporaryAuthUser({ uid: emailAuthUid, purpose: 'registration-email-verification', targetUid: userRecord.uid, email: normalizedEmail });
      await deleteTrackedTemporaryAuthUser(emailAuthUid);
    }
    if (phoneAuthUid) {
      await trackTemporaryAuthUser({ uid: phoneAuthUid, purpose: 'registration-phone-verification', targetUid: userRecord.uid, email: normalizedEmail });
      await deleteTrackedTemporaryAuthUser(phoneAuthUid);
    }
    await logAudit({ action: 'account_created', targetUid: userRecord.uid, performedBy: 'system', performedByRole: null, details: { role: 'customer', method: 'phone_pin', verification: verifiedBy, emailVerification: emailOtpUsed ? 'otp' : (emailAuthUid ? 'firebase_link' : null) } });
    return { uid: userRecord.uid, role: 'customer', verification: verifiedBy };
  } finally {
    if (lockAcquired) await lockRef.delete().catch(() => {});
  }
}

// App Check is required because this callable also exposes unauthenticated verification actions.
// Compatibility alias for already-deployed clients. The implementation is now explicitly self-service.
exports.registerCustomer = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, registerCustomer);
exports.registerWithDealerCode = exports.registerCustomer;
