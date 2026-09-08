// Self-service registration, moved server-side for one reason: every
// customer must be assigned to a dealer (dealerId), and resolving a
// "dealer code" (a dealer's own phone number) to that dealer's uid means
// reading another user's profile - which a brand-new, not-yet-staff
// customer account can never do under firestore.rules (users/{uid} read
// requires isStaff() or being that exact uid). The Admin SDK here bypasses
// that, same pattern as manageUser.js.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertEmailVerified } = require('./emailVerification');
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
function phoneToEmail(phone) {
  return `${normalizePhone(phone)}@${APP_EMAIL_DOMAIN}`;
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

  // The same callable is deliberately used for the pre-registration email
  // challenge so no new public callable endpoint is required in index.js.
  // These actions do not create a customer account and do not require auth.
  if (data.action === 'sendEmailVerificationChallenge') {
    return emailOtpService.sendEmailVerificationChallengeInternal(data);
  }
  if (data.action === 'verifyEmailOtp') {
    return emailOtpService.verifyEmailOtpInternal(data);
  }

  const { name, phone, phoneE164, dialCode, email, pin, dealerCode, resellerCode, phoneIdToken, emailIdToken } = data;
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

  let emailAuthUid;
  try {
    emailAuthUid = await assertEmailVerified(emailIdToken, email);
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message || 'Please verify your email address first.');
  }

  const db = admin.firestore();
  const emailSnap = await db.collection('users').where('email', '==', normalizeEmail(email)).limit(1).get();
  if (!emailSnap.empty) {
    throw new HttpsError('already-exists', 'This email address is already registered to another account.');
  }
  const phoneSnap = await db.collection('users').where('phone', '==', normalizePhone(phone)).limit(1).get();
  if (!phoneSnap.empty) {
    throw new HttpsError('already-exists', 'This phone number is already registered to another account.');
  }

  let resolvedDealerId = null;
  if (dealerCode && normalizePhone(dealerCode)) {
    const dealerSnap = await db
      .collection('users')
      .where('phone', '==', normalizePhone(dealerCode))
      .where('role', 'in', ['dealer'])
      .limit(1).get();
    if (dealerSnap.empty) throw new HttpsError('not-found', 'That dealer code was not recognized.');
    const dealerDoc = dealerSnap.docs[0];
    const dealerData = dealerDoc.data();
    resolvedDealerId = dealerData.role === 'dealer' ? dealerData.dealerId : dealerDoc.id;
    if (!resolvedDealerId) throw new HttpsError('failed-precondition', 'That dealer code is not fully set up yet.');
  }

  let resolvedResellerId = null;
  if (resellerCode && normalizePhone(resellerCode)) {
    const resellerSnap = await db
      .collection('users')
      .where('phone', '==', normalizePhone(resellerCode))
      .where('role', '==', 'reseller')
      .limit(1).get();
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
  await db.collection('users').doc(userRecord.uid).set(profile);
  await db.collection('otps').doc(normalizeEmail(email)).delete().catch(() => {});
  await db.collection('emailVerificationChallenges').doc(normalizeEmail(email)).delete().catch(() => {});
  if (phoneAuthUid) await admin.auth().deleteUser(phoneAuthUid).catch(() => {});
  if (emailAuthUid) await admin.auth().deleteUser(emailAuthUid).catch(() => {});
  await logAudit({
    action: 'account_created',
    targetUid: userRecord.uid,
    performedBy: 'system',
    performedByRole: null,
    details: { role: 'customer', dealerId: resolvedDealerId, resellerId: resolvedResellerId, method: 'phone_pin' },
  });
  return { uid: userRecord.uid, dealerId: resolvedDealerId, resellerId: resolvedResellerId };
});
