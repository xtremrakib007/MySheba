// Self-service registration is server-side so dealer/reseller lookup and
// account creation are performed with Admin SDK privileges.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertEmailVerified, assertEmailOtpVerified } = require('./emailVerification');
const { assertPhoneVerified } = require('./phoneVerification');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');
const emailOtpService = require('./emailOtpService');

const APP_EMAIL_DOMAIN = 'mysheba.app';
function normalizePhone(phone) { return String(phone || '').replace(/[^0-9]/g, ''); }
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function phoneToEmail(phone) { return `${normalizePhone(phone)}@${APP_EMAIL_DOMAIN}`; }
function isValidPhone(phone) { return normalizePhone(phone).length >= 8; }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)); }
function isValidPin(pin) { const value = String(pin || ''); return value.length >= 6 && value.length <= 20; }

exports.registerWithDealerCode = onCall(async (request) => {
  const data = request.data || {};

  // Public pre-registration email challenge. No customer account is created here.
  if (data.action === 'sendEmailVerificationOtp') return emailOtpService.sendEmailVerificationOtpInternal(data);
  if (data.action === 'verifyEmailVerificationOtp') return emailOtpService.verifyEmailVerificationOtpInternal(data);
  // Backward-compatible aliases for older clients; they use the same new proof flow.
  if (data.action === 'sendEmailVerificationChallenge') return emailOtpService.sendEmailVerificationOtpInternal(data);
  if (data.action === 'verifyEmailOtp') return emailOtpService.verifyEmailVerificationOtpInternal(data);

  const { name, phone, phoneE164, dialCode, email, pin, dealerCode, resellerCode, phoneIdToken, emailIdToken, emailOtpVerificationId } = data;
  if (!name || !name.trim()) throw new HttpsError('invalid-argument', 'Please enter your full name.');
  if (!isValidPhone(phone)) throw new HttpsError('invalid-argument', 'Please enter a valid phone number.');
  if (!isValidEmail(email)) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');

  let phoneAuthUid;
  try {
    phoneAuthUid = await assertPhoneVerified(phoneIdToken, phoneE164 || phone, phoneE164 ? undefined : dialCode);
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message || 'Please verify your phone number first.');
  }

  // Email can be proven by either the real Firebase email link or the
  // server-issued one-time OTP proof. If both are supplied, prefer the link
  // but fall back to OTP when the link token is invalid/expired.
  let emailAuthUid = null;
  let emailOtpUsed = false;
  if (emailIdToken) {
    try {
      emailAuthUid = await assertEmailVerified(emailIdToken, email);
    } catch (linkErr) {
      if (!emailOtpVerificationId) {
        throw new HttpsError('failed-precondition', linkErr.message || 'Please verify your email address first.');
      }
    }
  }
  if (!emailAuthUid && emailOtpVerificationId) {
    try {
      await assertEmailOtpVerified(emailOtpVerificationId, email);
      emailOtpUsed = true;
    } catch (err) {
      throw new HttpsError('failed-precondition', err.message || 'Please verify your email address first.');
    }
  }
  if (!emailAuthUid && !emailOtpUsed) throw new HttpsError('failed-precondition', 'Please verify your email address first.');

  const db = admin.firestore();
  const emailSnap = await db.collection('users').where('email', '==', normalizeEmail(email)).limit(1).get();
  if (!emailSnap.empty) throw new HttpsError('already-exists', 'This email address is already registered to another account.');
  const phoneSnap = await db.collection('users').where('phone', '==', normalizePhone(phone)).limit(1).get();
  if (!phoneSnap.empty) throw new HttpsError('already-exists', 'This phone number is already registered to another account.');

  let resolvedDealerId = null;
  if (dealerCode && normalizePhone(dealerCode)) {
    const dealerSnap = await db.collection('users')
      .where('phone', '==', normalizePhone(dealerCode))
      .where('role', 'in', ['dealer']).limit(1).get();
    if (dealerSnap.empty) throw new HttpsError('not-found', 'That dealer code was not recognized.');
    const dealerDoc = dealerSnap.docs[0];
    const dealerData = dealerDoc.data();
    resolvedDealerId = dealerData.role === 'dealer' ? dealerData.dealerId : dealerDoc.id;
    if (!resolvedDealerId) throw new HttpsError('failed-precondition', 'That dealer code is not fully set up yet.');
  }

  let resolvedResellerId = null;
  if (resellerCode && normalizePhone(resellerCode)) {
    const resellerSnap = await db.collection('users')
      .where('phone', '==', normalizePhone(resellerCode))
      .where('role', '==', 'reseller').limit(1).get();
    if (resellerSnap.empty) throw new HttpsError('not-found', 'That reseller code was not recognized.');
    resolvedResellerId = resellerSnap.docs[0].id;
  }

  const authEmail = phoneToEmail(phoneE164 || phone);
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
    phoneE164: phoneE164 || `+60${normalizePhone(phone).replace(/^0+/, '')}`,
    phoneCountryCode: dialCode || '+60',
    email: normalizeEmail(email),
    role: 'customer',
    dealerId: resolvedDealerId,
    walletBalance: 0,
    notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (resolvedResellerId) profile.resellerId = resolvedResellerId;
  try {
    await db.collection('users').doc(userRecord.uid).set(profile);
  } catch (err) {
    await admin.auth().deleteUser(userRecord.uid).catch(() => {});
    await logServerError('registerWithDealerCode.profile', err, { userId: userRecord.uid });
    throw new HttpsError('internal', 'Could not finish creating the account.');
  }

  await db.collection('otps').doc(normalizeEmail(email)).delete().catch(() => {});
  if (emailAuthUid) await admin.auth().deleteUser(emailAuthUid).catch(() => {});
  if (phoneAuthUid) await admin.auth().deleteUser(phoneAuthUid).catch(() => {});
  await logAudit({ action: 'account_created', targetUid: userRecord.uid, performedBy: 'system', performedByRole: null, details: { role: 'customer', dealerId: resolvedDealerId, resellerId: resolvedResellerId, method: 'phone_pin', emailVerification: emailOtpUsed ? 'otp' : 'firebase_link' } });
  return { uid: userRecord.uid, dealerId: resolvedDealerId, resellerId: resolvedResellerId };
});
