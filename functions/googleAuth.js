const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');

const VERIFIED_WINDOW_MS = 15 * 60 * 1000;

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
function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(String(phone || ''));
}
function isFreshAuthToken(decoded) {
  const authTimeMs = Number(decoded?.auth_time || 0) * 1000;
  return Boolean(authTimeMs) && Date.now() - authTimeMs <= VERIFIED_WINDOW_MS;
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
  if (!verified.email_verified || normalizeEmail(verified.email) !== googleEmail || !isFreshAuthToken(verified)) {
    throw new HttpsError('permission-denied', 'The email verification does not match or has expired. Please verify your Google email again.');
  }
}

async function assertGooglePhoneProof(data) {
  const phoneIdToken = String(data?.phoneIdToken || '').trim();
  if (!phoneIdToken) throw new HttpsError('failed-precondition', 'Please verify your phone number by SMS before continuing.');
  let verified;
  try { verified = await admin.auth().verifyIdToken(phoneIdToken); }
  catch { throw new HttpsError('failed-precondition', 'Your SMS verification has expired. Please verify your phone number again.'); }
  if (!isFreshAuthToken(verified)) throw new HttpsError('failed-precondition', 'Your SMS verification has expired. Please verify your phone number again.');
  const tokenPhoneE164 = toE164(verified.phone_number || '', undefined);
  if (!isValidE164(tokenPhoneE164)) throw new HttpsError('failed-precondition', 'Your SMS verification did not contain a valid phone number. Please verify your phone number again.');
  return tokenPhoneE164;
}

exports.signInExistingGoogleAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in with Google.');
  const token = request.auth.token || {};
  const provider = token.firebase?.sign_in_provider || '';
  const googleEmail = normalizeEmail(token.email);
  const callerUid = request.auth.uid;
  if (provider !== 'google.com' || !googleEmail || !token.email_verified) throw new HttpsError('permission-denied', 'A verified Google account is required.');

  let callerAuthUser;
  try {
    callerAuthUser = await admin.auth().getUser(callerUid);
  } catch {
    throw new HttpsError('permission-denied', 'The Google account could not be verified. Please sign in with Google again.');
  }
  const callerGoogleProvider = (callerAuthUser.providerData || []).find((p) => p.providerId === 'google.com');
  if (!callerGoogleProvider || normalizeEmail(callerGoogleProvider.email) !== googleEmail) {
    throw new HttpsError('permission-denied', 'The Google account identity could not be verified. Please sign in with Google again.');
  }

  const db = getFirestore();
  const snap = await db.collection('users').where('email', '==', googleEmail).limit(2).get();
  if (snap.empty) return { found: false };
  if (snap.size > 1) throw new HttpsError('failed-precondition', 'Multiple MySheba accounts use this email. Please contact support.');

  const userDoc = snap.docs[0];
  const targetUid = userDoc.id;
  const userData = userDoc.data() || {};
  if (targetUid === callerUid) {
    return { found: true, alreadySignedIn: true, uid: targetUid, profile: { uid: targetUid, ...userData } };
  }
  if (userData.suspended || userData.active === false || userData.mergedInto) {
    throw new HttpsError('permission-denied', 'This MySheba account is unavailable. Please contact support.');
  }

  let targetAuthUser;
  try {
    targetAuthUser = await admin.auth().getUser(targetUid);
  } catch {
    throw new HttpsError('failed-precondition', 'The MySheba account could not be verified. Please contact support.');
  }
  if (targetAuthUser.disabled) throw new HttpsError('permission-denied', 'This MySheba account has been disabled. Please contact support.');
  const targetGoogleProvider = (targetAuthUser.providerData || []).find((p) => p.providerId === 'google.com');
  if (!targetGoogleProvider || normalizeEmail(targetGoogleProvider.email) !== googleEmail) {
    throw new HttpsError('permission-denied', 'The Google account is not linked to this MySheba account. Please use Settings → Link Google Account.');
  }
  if (targetGoogleProvider.uid && callerGoogleProvider.uid && targetGoogleProvider.uid !== callerGoogleProvider.uid) {
    throw new HttpsError('permission-denied', 'The Google account identity does not match this MySheba account. Please use Settings → Link Google Account.');
  }

  const customToken = await admin.auth().createCustomToken(targetUid, { googleSignIn: true });

  // The caller is the temporary Firebase Auth user created by the client's
  // signInWithCredential() call. Once the custom token is minted, this UID is
  // no longer needed. Delete it server-side because the client immediately
  // switches to targetUid and therefore cannot reliably delete the old user.
  try {
    await admin.auth().deleteUser(callerUid);
  } catch (err) {
    // Cleanup failure must not invalidate an otherwise verified sign-in. The
    // temporary UID has no MySheba profile and cannot be used to access the
    // target account. Log it for operational cleanup/retry.
    await logServerError('signInExistingGoogleAccount.cleanupTemporaryUser', err, { callerUid, targetUid });
  }

  return { found: true, customToken, uid: targetUid, profile: { uid: targetUid, ...userData } };
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
  const verifiedPhoneE164 = await assertGooglePhoneProof(data);

  const phoneInput = String(data.phone || '').trim();
  const phoneE164Input = String(data.phoneE164 || '').trim();
  const dialCode = data.phoneCountryCode || data.dialCode || '+60';
  const suppliedPhoneE164 = toE164(phoneE164Input || phoneInput, dialCode);
  if ((phoneInput || phoneE164Input) && !isValidE164(suppliedPhoneE164)) {
    throw new HttpsError('invalid-argument', 'The phone number format is invalid. Please verify your phone number again.');
  }
  if (suppliedPhoneE164 && suppliedPhoneE164 !== verifiedPhoneE164) {
    throw new HttpsError('permission-denied', 'The SMS verification does not match the phone number entered. Please verify that same number again.');
  }

  await assertGoogleEmailProof(db, googleEmail, data);

  const expectedPhoneE164 = verifiedPhoneE164;
  const rawPhone = normalizePhone(phoneInput || expectedPhoneE164);
  const phoneCandidates = Array.from(new Set([rawPhone, normalizePhone(expectedPhoneE164)].filter(Boolean)));

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
    uid, userId, name: token.name || '', email: googleEmail, phone: rawPhone,
    phoneE164: expectedPhoneE164, phoneCountryCode: dialCode, phoneVerified: true,
    role: 'customer', dealerId: null, walletBalance: 0,
    notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false },
    authProvider: 'google', createdAt: FieldValue.serverTimestamp(),
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