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
function toE164(phone, dialCode = '+60') {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return `+${normalizePhone(raw)}`;
  const localDigits = normalizePhone(raw).replace(/^0+/, '');
  const countryDigits = normalizePhone(dialCode || '+60');
  if (!localDigits || !countryDigits) return '';
  return `+${countryDigits}${localDigits}`;
}
function isValidPhone(phone, dialCode = '+60') {
  const e164 = toE164(phone, dialCode);
  return /^\+[1-9]\d{7,14}$/.test(e164);
}

async function assertGoogleEmailProof(db, googleEmail, data) {
  const emailIdToken = String(data?.emailIdToken || '').trim();
  const emailVerificationId = String(data?.emailOtpVerificationId || '').trim();
  if (!emailIdToken && !emailVerificationId) throw new HttpsError('failed-precondition', 'Please verify your Google email by link or 6-digit OTP before continuing.');
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
  try { verified = await admin.auth().verifyIdToken(emailIdToken); }
  catch { throw new HttpsError('failed-precondition', 'Your email verification has expired. Please verify your Google email again.'); }
  if (!verified.email_verified || normalizeEmail(verified.email) !== googleEmail) throw new HttpsError('permission-denied', 'The email verification does not match your Google account.');
}

async function assertGooglePhoneProof(expectedPhoneE164, data) {
  const phoneIdToken = String(data?.phoneIdToken || '').trim();
  if (!phoneIdToken) throw new HttpsError('failed-precondition', 'Please verify your phone number by SMS before continuing.');
  let verified;
  try { verified = await admin.auth().verifyIdToken(phoneIdToken); }
  catch { throw new HttpsError('failed-precondition', 'Your SMS verification has expired. Please verify your phone number again.'); }
  const tokenPhoneE164 = toE164(verified.phone_number || '', undefined);
  if (!verified.phone_number || tokenPhoneE164 !== expectedPhoneE164) throw new HttpsError('permission-denied', 'The SMS verification does not match the phone number you entered.');
}

// Existing-account resolver: only a freshly authenticated, verified Google
// identity can call this. The server maps that Google email to the existing
// MySheba profile and mints a custom token for the original UID.
exports.signInExistingGoogleAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in with Google.');
  const token = request.auth.token || {};
  const provider = token.firebase?.sign_in_provider || '';
  const googleEmail = normalizeEmail(token.email);
  if (provider !== 'google.com' || !googleEmail || !token.email_verified) throw new HttpsError('permission-denied', 'A verified Google account is required.');
  const db = getFirestore();
  const snap = await db.collection('users').where('email', '==', googleEmail).limit(1).get();
  if (snap.empty) return { found: false };
  const userDoc = snap.docs[0];
  const userData = userDoc.data() || {};
  if (userData.suspended) throw new HttpsError('permission-denied', 'This MySheba account has been suspended. Please contact support.');
  const customToken = await admin.auth().createCustomToken(userDoc.id, { googleSignIn: true });
  return { found: true, customToken, uid: userDoc.id, profile: { uid: userDoc.id, ...userData } };
});

exports.ensureGoogleProfile = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = getFirestore();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (snap.exists) return { uid, ...snap.data(), isNew: false };

  const googleEmail = normalizeEmail(token.email);
  if (!googleEmail || !token.email_verified) throw new HttpsError('failed-precondition', 'Your Google email must be verified before creating a MySheba account.');
  const data = request.data || {};

  // Accept either the visible/local phone field or the already-normalized
  // phoneE164 sent by the app. This prevents a valid number from being
  // rejected merely because one client field was omitted or formatted.
  const phoneInput = String(data.phone || data.phoneE164 || '').trim();
  const dialCode = data.phoneCountryCode || data.dialCode || '+60';
  const expectedPhoneE164 = toE164(data.phoneE164 || phoneInput, dialCode);
  if (!isValidPhone(phoneInput, dialCode) || !/^\+[1-9]\d{7,14}$/.test(expectedPhoneE164)) {
    throw new HttpsError('invalid-argument', 'A valid phone number is required to finish creating your MySheba account.');
  }

  const rawPhone = normalizePhone(data.phone || phoneInput);
  await assertGoogleEmailProof(db, googleEmail, data);
  await assertGooglePhoneProof(expectedPhoneE164, data);

  const phoneCandidates = Array.from(new Set([
    rawPhone,
    normalizePhone(expectedPhoneE164),
  ].filter(Boolean)));
  const phoneE164Snap = await db.collection('users').where('phoneE164', '==', expectedPhoneE164).limit(1).get();
  if (!phoneE164Snap.empty) throw new HttpsError('already-exists', 'This phone number is already registered to another MySheba account. Sign in to that account instead.');
  let phoneSnap = null;
  for (const candidate of phoneCandidates) {
    phoneSnap = await db.collection('users').where('phone', '==', candidate).limit(1).get();
    if (!phoneSnap.empty) break;
  }
  if (phoneSnap && !phoneSnap.empty) throw new HttpsError('already-exists', 'This phone number is already registered to another MySheba account. Sign in to that account instead.');

  const emailSnap = await db.collection('users').where('email', '==', googleEmail).limit(1).get();
  if (!emailSnap.empty) throw new HttpsError('already-exists', 'This email is already registered to a MySheba account. Sign in to that account and use Settings → Link Google Account to enable Google sign-in.');

  const userId = await assignUniqueUserId(db, uid);
  const profile = {
    uid,
    userId,
    name: token.name || '',
    email: googleEmail,
    phone: rawPhone,
    phoneE164: expectedPhoneE164,
    phoneCountryCode: dialCode,
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
    await logAudit({ action: 'account_created', targetUid: uid, performedBy: 'system', performedByRole: null, details: { role: 'customer', method: 'google', phoneVerified: true } });
    return { uid, ...profile, isNew: true };
  } catch (err) {
    await logServerError('ensureGoogleProfile', err, { userId: uid });
    throw new HttpsError('internal', 'Could not create the account.');
  }
});
