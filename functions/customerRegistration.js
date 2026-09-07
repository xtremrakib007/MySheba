// Self-service registration, moved server-side for one reason: every
// customer must be assigned to a dealer (dealerId), and resolving a
// "dealer code" (a dealer's own phone number) to that dealer's uid means
// reading another user's profile - which a brand-new, not-yet-staff
// customer account can never do under firestore.rules (users/{uid} read
// requires isStaff() or being that exact uid). The Admin SDK here bypasses
// that, same pattern as manageUser.js.
//
// Client call (see src/firebase/authService.js registerCustomer):
//   const fn = httpsCallable(functions, 'registerWithDealerCode');
//   const { data } = await fn({ name, phone, email, pin, dealerCode });
//   // then sign in client-side with signInWithEmailAndPassword, same as
//   // any other phone+PIN login - this function only creates the account.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertEmailVerified } = require('./emailVerification');
const { assertPhoneVerified } = require('./phoneVerification');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');

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
  const { name, phone, phoneE164, dialCode, email, pin, dealerCode, resellerCode, phoneIdToken, emailIdToken } = request.data || {};
  if (!name || !name.trim()) throw new HttpsError('invalid-argument', 'Please enter your full name.');
  if (!isValidPhone(phone)) throw new HttpsError('invalid-argument', 'Please enter a valid phone number.');
  if (!isValidEmail(email)) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');
  // Re-check server-side that this phone number actually passed real SMS
  // (Firebase Phone Auth) verification recently (src/screens/RegisterScreen.js
  // calls sendPhoneOtp/confirmPhoneOtp before ever calling this function) -
  // never trust the client's word alone that it happened. phoneAuthUid is
  // the throwaway phone-auth identity's uid, cleaned up below once the real
  // account exists.
  let phoneAuthUid;
  try {
    phoneAuthUid = await assertPhoneVerified(phoneIdToken, phoneE164 || phone, phoneE164 ? undefined : dialCode);
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message || 'Please verify your phone number first.');
  }
  // Re-check server-side that this email actually passed real Firebase
  // email-link verification recently (src/screens/RegisterScreen.js calls
  // sendEmailLink/confirmEmailLink before ever calling this function) -
  // never trust the client's word alone that it happened. emailAuthUid is
  // the throwaway email-auth identity's uid, cleaned up below once the real
  // account exists.
  let emailAuthUid;
  try {
    emailAuthUid = await assertEmailVerified(emailIdToken, email);
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message || 'Please verify your email address first.');
  }

  const db = admin.firestore();
  // Authoritative check, right before the account is actually created -
  // one email and one phone per account. The sendOtp step (functions/otpService.js)
  // already rejects an obvious duplicate early for a better UX, but that's
  // a point-in-time check; someone else could register the same phone or
  // email in the gap between OTP verification and this call, so it's
  // re-checked here regardless.
  const emailSnap = await db.collection('users').where('email', '==', normalizeEmail(email)).limit(1).get();
  if (!emailSnap.empty) {
    throw new HttpsError('already-exists', 'This email address is already registered to another account.');
  }
  const phoneSnap = await db.collection('users').where('phone', '==', normalizePhone(phone)).limit(1).get();
  if (!phoneSnap.empty) {
    throw new HttpsError('already-exists', 'This phone number is already registered to another account.');
  }

  // A dealer code is optional - a customer registering without one has no
  // dealer yet (dealerId: null). Their orders still reach Admin: the Admin
  // dashboard's transaction query (subscribeTransactions) has no dealerId
  // filter and sees everything, while a dealer's queue (subscribeDealerTransactions)
  // only ever matches an exact dealerId, so a null dealerId simply never
  // shows up for any dealer. An admin can assign a dealer later via
  // User Management (manageUser's 'setDealer' action).
  let resolvedDealerId = null;
  if (dealerCode && normalizePhone(dealerCode)) {
    const dealerSnap = await db
      .collection('users')
      .where('phone', '==', normalizePhone(dealerCode))
      .where('role', 'in', ['dealer'])
      .limit(1)
      .get();
    if (dealerSnap.empty) {
      throw new HttpsError('not-found', 'That dealer code was not recognized.');
    }
    const dealerDoc = dealerSnap.docs[0];
    const dealerData = dealerDoc.data();
    // A dealer's own customers roll up to the same dealer they work
    // under, so every "dealerId" always points to a top-level dealer.
    resolvedDealerId = dealerData.role === 'dealer' ? dealerData.dealerId : dealerDoc.id;
    if (!resolvedDealerId) {
      throw new HttpsError('failed-precondition', 'That dealer code is not fully set up yet.');
    }
  }

  // A reseller code is optional, same as dealerCode above - it's a
  // separate relationship (which reseller a customer's Mobile Banking/
  // Recharge/Internet/Remittance orders route to first, before the
  // reseller forwards each one on to a dealer) from which dealer the
  // customer belongs to. Unlike dealerCode, there's no dealer-style
  // rollup - a reseller code only ever resolves to a top-level reseller.
  let resolvedResellerId = null;
  if (resellerCode && normalizePhone(resellerCode)) {
    const resellerSnap = await db
      .collection('users')
      .where('phone', '==', normalizePhone(resellerCode))
      .where('role', '==', 'reseller')
      .limit(1)
      .get();
    if (resellerSnap.empty) {
      throw new HttpsError('not-found', 'That reseller code was not recognized.');
    }
    resolvedResellerId = resellerSnap.docs[0].id;
  }

  // The pseudo email used as the actual Firebase Auth identity (sign-in
  // stays phone+PIN - see authService.js) is still derived from the phone
  // number, not the address the person just verified. The verified address
  // itself is stored as `email` on the profile below.
  const authEmail = phoneToEmail(phoneE164 || phone);
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email: authEmail, password: pin, displayName: name.trim() });
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
  // One-time use - clear the verification so it can't be replayed for a
  // second registration attempt with the same email.
  await db.collection('otps').doc(normalizeEmail(email)).delete().catch(() => {});
  // The phone-auth identity from assertPhoneVerified above was only ever a
  // throwaway proof-of-SMS-ownership (see functions/phoneVerification.js
  // and src/firebase/phoneVerification.js) - the real account's uid is
  // userRecord.uid above, so this one has no further purpose. Best-effort:
  // an orphaned phone-auth user is harmless clutter, not worth failing
  // registration over.
  if (phoneAuthUid) {
    await admin.auth().deleteUser(phoneAuthUid).catch(() => {});
  }
  if (emailAuthUid) {
    await admin.auth().deleteUser(emailAuthUid).catch(() => {});
  }
  await logAudit({
    action: 'account_created',
    targetUid: userRecord.uid,
    performedBy: 'system',
    performedByRole: null,
    details: { role: 'customer', dealerId: resolvedDealerId, resellerId: resolvedResellerId, method: 'phone_pin' },
  });
  return { uid: userRecord.uid, dealerId: resolvedDealerId, resellerId: resolvedResellerId };
});
