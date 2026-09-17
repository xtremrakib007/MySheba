const { onCall, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { assertEmailVerified } = require('./emailVerification');
const { assertPhoneVerified } = require('./phoneVerification');
const mailerService = require('./mailerService');
const { trackTemporaryAuthUser, deleteTrackedTemporaryAuthUser } = require('./temporaryAuthCleanup');

const TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const LINK_SETTINGS = {
  url: 'https://mysheba.top/verifyEmail',
  handleCodeInApp: true,
  android: { packageName: 'com.satulink.mysheba', installApp: true, minimumVersion: '1' },
};

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}
function validEmail(email) { return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()); }
function hash(code) { return crypto.createHash('sha256').update(String(code).trim()).digest('hex'); }
function safeEqualHash(leftHex, rightHex) {
  try {
    const left = Buffer.from(String(leftHex || ''), 'hex');
    const right = Buffer.from(String(rightHex || ''), 'hex');
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
  } catch { return false; }
}
function code() { return String(crypto.randomInt(100000, 1000000)); }
function ref(db, uid) { return db.collection('users').doc(uid); }

exports.sendDeviceVerification = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = String(request.data?.deviceId || '').trim();
  if (!deviceId || deviceId.length > 100) throw new HttpsError('invalid-argument', 'Missing or invalid device id.');
  const db = getFirestore();
  const userRef = ref(db, uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
  const data = snap.data();
  const pending = data.pendingDeviceApproval;
  if (!pending || pending.deviceId !== deviceId) {
    throw new HttpsError('failed-precondition', 'No pending verification for this device. Please sign in again.');
  }
  const email = String(pending.email || data.email || '').trim().toLowerCase();
  if (!validEmail(email)) throw new HttpsError('failed-precondition', 'No valid email address is available for verification.');
  const previous = data.pendingDeviceEmailChallenge;
  const previousSent = previous?.createdAt?.toMillis?.() || 0;
  if (Date.now() - previousSent < RESEND_MS) throw new HttpsError('resource-exhausted', 'Please wait a few seconds before requesting another verification email.');

  const otp = code();
  let link;
  try {
    link = await admin.auth().generateSignInWithEmailLink(email, LINK_SETTINGS);
  } catch (err) {
    console.error('[deviceVerification] generate link failed', err);
    throw new HttpsError('failed-precondition', 'Could not create the verification link. Please try again.');
  }

  await userRef.update({
    pendingDeviceEmailChallenge: {
      deviceId,
      email,
      codeHash: hash(otp),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + TTL_MS),
      attempts: 0,
    },
  });

  await mailerService.sendEmail({
    to: email,
    subject: 'MySheba device verification — link + 6-digit code',
    text: `We received a MySheba sign-in request from a new device.\n\nOpen this verification link on that device:\n${link}\n\nOr enter this 6-digit code in the MySheba app:\n${otp}\n\nThe code expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto"><h2>MySheba device verification</h2><p>We received a sign-in request from a new device.</p><p><b>Use the verification link:</b></p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#08aaa0;color:#fff;text-decoration:none;border-radius:8px">Verify This Device</a></p><p><b>Or enter this 6-digit code:</b></p><div style="font-size:28px;font-weight:700;letter-spacing:8px;padding:14px 18px;background:#f3f4f6;border-radius:8px;text-align:center">${otp}</div><p>The code expires in 10 minutes.</p></div>`,
    context: 'deviceVerificationService.sendDeviceVerification',
  });
  return { sent: true, email };
});

exports.confirmDeviceEmailOtp = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = String(request.data?.deviceId || '').trim();
  const otp = String(request.data?.code || '').trim();
  const emailIdToken = typeof request.data?.emailIdToken === 'string' ? request.data.emailIdToken : '';
  const phoneIdToken = typeof request.data?.phoneIdToken === 'string' ? request.data.phoneIdToken : '';
  if (!deviceId || deviceId.length > 100) throw new HttpsError('invalid-argument', 'Missing or invalid device id.');

  const db = getFirestore();
  const userRef = ref(db, uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
  const data = snap.data();
  const pending = data.pendingDeviceApproval;
  if (!pending || pending.deviceId !== deviceId) {
    throw new HttpsError('failed-precondition', 'No pending verification for this device. Please sign in again.');
  }

  let verified = false;
  let emailAuthUid = null;
  let verifiedVia = null;

  if (phoneIdToken) {
    try {
      const expectedPhone = data.phoneE164 || pending.phoneE164 || data.phone || pending.phone || '';
      const expectedDialCode = data.phoneCountryCode || pending.dialCode || '+60';
      await assertPhoneVerified(phoneIdToken, expectedPhone, expectedDialCode);
      verified = true;
      verifiedVia = 'sms';
    } catch (err) {
      throw new HttpsError('failed-precondition', err.message || 'Please verify your phone number first.');
    }
  } else if (emailIdToken) {
    try {
      emailAuthUid = await assertEmailVerified(emailIdToken, pending.email || data.email || '');
      verified = true;
      verifiedVia = 'email_link';
    } catch (err) {
      throw new HttpsError('failed-precondition', err.message || 'Please verify your email address first.');
    }
  } else {
    if (!/^\d{6}$/.test(otp)) throw new HttpsError('invalid-argument', 'Please enter the 6-digit verification code.');
    const challenge = data.pendingDeviceEmailChallenge;
    if (!challenge || challenge.deviceId !== deviceId) {
      throw new HttpsError('failed-precondition', 'No active email verification challenge. Please request a new email.');
    }
    if (challenge.expiresAt?.toMillis?.() < Date.now()) throw new HttpsError('deadline-exceeded', 'That verification code expired. Request a new email.');
    if ((challenge.attempts || 0) >= MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new verification email.');
    if (!safeEqualHash(hash(otp), challenge.codeHash)) {
      await userRef.update({ 'pendingDeviceEmailChallenge.attempts': FieldValue.increment(1) });
      throw new HttpsError('invalid-argument', 'Incorrect verification code.');
    }
    verified = true;
    verifiedVia = 'email_otp';
  }

  if (!verified) throw new HttpsError('failed-precondition', 'Verification is required.');

  const sessionId = crypto.randomBytes(24).toString('hex');
  await userRef.update({
    activeSessionId: sessionId,
    activeDeviceId: deviceId,
    pendingDeviceApproval: null,
    pendingDeviceEmailChallenge: FieldValue.delete(),
    lastLoginAt: FieldValue.serverTimestamp(),
  });
  try { await admin.auth().revokeRefreshTokens(uid); } catch (err) { console.error('[deviceVerification] revoke tokens failed', err); }
  if (emailAuthUid) {
    await trackTemporaryAuthUser({ uid: emailAuthUid, purpose: 'device-email-verification', targetUid: uid, email: pending.email || data.email || null });
    await deleteTrackedTemporaryAuthUser(emailAuthUid);
  }
  console.log(`[deviceVerification] device approved via ${verifiedVia}`, { uid, deviceId });
  return { requiresOtp: false, sessionId };
});
