const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function isValidPhone(phone) {
  return normalizePhone(phone).length >= 8;
}

async function assertGoogleEmailProof(db, googleEmail, data) {
  const emailIdToken = String(data?.emailIdToken || '').trim();
  const emailVerificationId = String(data?.emailOtpVerificationId || '').trim();
  if (!emailIdToken && !emailVerificationId) {
    throw new HttpsError('failed-precondition', 'Please verify your Google email by link or 6-digit OTP before continuing.');
  }

  if (emailVerificationId) {
    const proofRef = db.collection('emailVerificationProofs').doc(emailVerificationId);
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(proofRef);
      if (!snap.exists) return { status: 'missing' };
      const proof = snap.data() || {};
      if (proof.used || !proof.expiresAt || Date.now() > Number(proof.expiresAt)) return { status: 'expired' };
      if (normalizeEmail(proof.email) !== googleEmail) return { status: 'email-mismatch' };
      tx.update(proofRef, { used: true, consumedAt: FieldValue.serverTimestamp() });
      return { status: 'ok' };
    });
    if (result.status === 'ok') return;
    if (result.status === 'email-mismatch') throw new HttpsError('permission-denied', 'The email verification does not match your Google account.');
    throw new HttpsError('failed-precondition', 'Your email verification has expired. Please verify your Google email again.');
  }

  let verified;
  try {
    verified = await admin.auth().verifyIdToken(emailIdToken);
  } catch {
    throw new HttpsError('failed-precondition', 'Your email verification has expired. Please verify your Google email again.');
  }
  if (!verified.email_verified || normalizeEmail(verified.email) !== googleEmail) {
    throw new HttpsError('permission-denied', 'The email verification does not match your Google account.');
  }
}

async function assertGooglePhoneProof(expectedPhone, data) {
  const phoneIdToken = String(data?.phoneIdToken || '').trim();
  if (!phoneIdToken) {
    throw new HttpsError('failed-precondition', 'Please verify your phone number by SMS before continuing.');
  }
  let verified;
  try {
    verified = await admin.auth().verifyIdToken(phoneIdToken);
  } catch {
    throw new HttpsError('failed-precondition', 'Your SMS verification has expired. Please verify your phone number again.');
  }
  const tokenPhone = normalizePhone(verified.phone_number);
  if (!verified.phone_number || tokenPhone !== normalizePhone(expectedPhone)) {
    throw new HttpsError('permission-denied', 'The SMS verification does not match the phone number you entered.');
  }
}

exports.ensureGoogleProfile = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = getFirestore();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();

  // Existing Google-linked accounts are never changed by onboarding.
  if (snap.exists) return { uid, ...snap.data(), isNew: false };

  const googleEmail = normalizeEmail(token.email);
  if (!googleEmail || !token.email_verified) {
    throw new HttpsError('failed-precondition', 'Your Google email must be verified before creating a MySheba account.');
  }

  const data = request.data || {};
  const rawPhone = normalizePhone(data.phone);
  if (!isValidPhone(rawPhone)) {
    throw new HttpsError('invalid-argument', 'A valid phone number is required to finish creating your MySheba account.');
  }
  await assertGoogleEmailProof(db, googleEmail, data);
  await assertGooglePhoneProof(rawPhone, data);

  const phoneSnap = await db.collection('users').where('phone', '==', rawPhone).limit(1).get();
  if (!phoneSnap.empty) {
    throw new HttpsError('already-exists', 'This phone number is already registered to another MySheba account. Sign in to that account instead.');
  }

  const emailSnap = await db.collection('users').where('email', '==', googleEmail).limit(1).get();
  if (!emailSnap.empty) {
    throw new HttpsError('already-exists', 'This email is already registered to a MySheba account. Sign in to that account and use Settings → Link Google Account to enable Google sign-in.');
  }

  const userId = await assignUniqueUserId(db, uid);
  const profile = {
    uid,
    userId,
    name: token.name || '',
    email: googleEmail,
    phone: rawPhone,
    phoneVerified: true,
    role: 'customer',
    dealerId: null,
    walletBalance: 0,
    notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false },
    authProvider: 'google',
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    await ref.set(profile);
    await logAudit({
      action: 'account_created',
      targetUid: uid,
      performedBy: 'system',
      performedByRole: null,
      details: { role: 'customer', method: 'google', phoneVerified: true },
    });
    return { uid, ...profile, isNew: true };
  } catch (err) {
    await logServerError('ensureGoogleProfile', err, { userId: uid });
    throw new HttpsError('internal', 'Could not create the account.');
  }
});
