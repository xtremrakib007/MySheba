const { onCall, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { assertEmailVerified } = require('./emailVerification');
const { assertPhoneVerified } = require('./phoneVerification');
const mailerService = require('./mailerService');

const TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const RESEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_RESENDS_PER_WINDOW = 5;
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
function code() { return String(crypto.randomInt(100000, 1000000)); }
function ref(db, uid) { return db.collection('users').doc(uid); }

exports.sendDeviceVerification = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const deviceId = String(request.data?.deviceId || '').trim();
  if (!deviceId || deviceId.length > 100) throw new HttpsError('invalid-argument', 'Missing or invalid device id.');
  const db = getFirestore();
  const userRef = ref(db, uid);

  const otp = code();
  let link;
  try {
    const snap = await userRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const data = snap.data();
    const pending = data.pendingDeviceApproval;
    if (!pending || pending.deviceId !== deviceId) {
      throw new HttpsError('failed-precondition', 'No pending verification for this device. Please sign in again.');
    }
    const email = String(pending.email || data.email || '').trim().toLowerCase();
    if (!validEmail(email)) throw new HttpsError('failed-precondition', 'No valid email address is available for verification.');
    link = await admin.auth().generateSignInWithEmailLink(email, LINK_SETTINGS);
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[deviceVerification] generate link failed', err);
    throw new HttpsError('failed-precondition', 'Could not create the verification link. Please try again.');
  }

  const now = Date.now();
  let email;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const data = snap.data();
    const pending = data.pendingDeviceApproval;
    if (!pending || pending.deviceId !== deviceId) {
      throw new HttpsError('failed-precondition', 'No pending verification for this device. Please sign in again.');
    }
    email = String(pending.email || data.email || '').trim().toLowerCase();
    if (!validEmail(email)) throw new HttpsError('failed-precondition', 'No valid email address is available for verification.');

    const rate = data.pendingDeviceEmailRate || {};
    const lastSentAt = Number(rate.lastSentAtMs) || 0;
    if (lastSentAt && now - lastSentAt < RESEND_MS) {
      throw new HttpsError('resource-exhausted', 'Please wait 60 seconds before requesting another verification email.');
    }
    const oldWindowStart = Number(rate.windowStartedAtMs) || 0;
    const windowActive = oldWindowStart > 0 && now - oldWindowStart < RESEND_WINDOW_MS;
    const windowStartedAtMs = windowActive ? oldWindowStart : now;
    const sentCount = windowActive ? Number(rate.sentCount) || 0 : 0;
    if (sentCount >= MAX_RESENDS_PER_WINDOW) {
      throw new HttpsError('resource-exhausted', 'Too many verification emails were requested. Please try again later.');
    }

    tx.update(userRef, {
      pendingDeviceEmailChallenge: {
        deviceId,
        email,
        codeHash: hash(otp),
        createdAt: Timestamp.fromMillis(now),
        expiresAt: Timestamp.fromMillis(now + TTL_MS),
        attempts: 0,
      },
      pendingDeviceEmailRate: {
        windowStartedAtMs,
        sentCount: sentCount + 1,
        lastSentAtMs: now,
      },
    });
  });

  try {
    await mailerService.sendEmail({
      to: email,
      subject: 'MySheba device verification — link + 6-digit code',
      text: `We received a MySheba sign-in request from a new device.\n\nOpen this verification link on that device:\n${link}\n\nOr enter this 6-digit code in the MySheba app:\n${otp}\n\nThe code expires in 10 minutes. If you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto"><h2>MySheba device verification</h2><p>We received a sign-in request from a new device.</p><p><b>Use the verification link:</b></p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#08aaa0;color:#fff;text-decoration:none;border-radius:8px">Verify This Device</a></p><p><b>Or enter this 6-digit code:</b></p><div style="font-size:28px;font-weight:700;letter-spacing:8px;padding:14px 18px;background:#f3f4f6;border-radius:8px;text-align:center">${otp}</div><p>The code expires in 10 minutes.</p></div>`,
      context: 'deviceVerificationService.sendDeviceVerification',
    });
  } catch (err) {
    console.error('[deviceVerification] email send failed', err);
    throw new HttpsError('unavailable', 'Could not send the verification email. Please try again later.');
  }
  return { sent: true, email };
});

exports.confirmDeviceEmailOtp = onCall({ enforceAppCheck: true }, async (request) => {
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
  let sessionId = null;

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

    const result = await db.runTransaction(async (tx) => {
      const current = await tx.get(userRef);
      if (!current.exists) throw new HttpsError('not-found', 'No profile found for this account.');
      const currentData = current.data();
      const currentPending = currentData.pendingDeviceApproval;
      if (!currentPending || currentPending.deviceId !== deviceId) {
        throw new HttpsError('failed-precondition', 'No pending verification for this device. Please sign in again.');
      }

      const challenge = currentData.pendingDeviceEmailChallenge;
      if (!challenge || challenge.deviceId !== deviceId) {
        throw new HttpsError('failed-precondition', 'No active email verification challenge. Please request a new email.');
      }
      if (challenge.expiresAt?.toMillis?.() < Date.now()) {
        throw new HttpsError('deadline-exceeded', 'That verification code expired. Request a new email.');
      }

      const attempts = Number(challenge.attempts) || 0;
      if (attempts >= MAX_ATTEMPTS) {
        throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new verification email.');
      }

      if (hash(otp) !== challenge.codeHash) {
        const nextAttempts = attempts + 1;
        tx.update(userRef, { 'pendingDeviceEmailChallenge.attempts': nextAttempts });
        return { kind: 'wrong', attempts: nextAttempts };
      }

      const newSessionId = crypto.randomBytes(24).toString('hex');
      tx.update(userRef, {
        activeSessionId: newSessionId,
        activeDeviceId: deviceId,
        pendingDeviceApproval: null,
        pendingDeviceEmailChallenge: FieldValue.delete(),
        pendingDeviceEmailRate: FieldValue.delete(),
        lastLoginAt: FieldValue.serverTimestamp(),
      });
      return { kind: 'verified', sessionId: newSessionId };
    });

    if (result.kind === 'wrong') {
      if (result.attempts >= MAX_ATTEMPTS) {
        throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new verification email.');
      }
      throw new HttpsError('invalid-argument', 'Incorrect verification code.');
    }

    sessionId = result.sessionId;
    verified = true;
    verifiedVia = 'email_otp';
  }

  if (!verified) throw new HttpsError('failed-precondition', 'Verification is required.');

  if (!sessionId) {
    sessionId = crypto.randomBytes(24).toString('hex');
    await userRef.update({
      activeSessionId: sessionId,
      activeDeviceId: deviceId,
      pendingDeviceApproval: null,
      pendingDeviceEmailChallenge: FieldValue.delete(),
      pendingDeviceEmailRate: FieldValue.delete(),
      lastLoginAt: FieldValue.serverTimestamp(),
    });
  }

  try { await admin.auth().revokeRefreshTokens(uid); } catch (err) { console.error('[deviceVerification] revoke tokens failed', err); }
  if (emailAuthUid) await admin.auth().deleteUser(emailAuthUid).catch(() => {});
  console.log(`[deviceVerification] device approved via ${verifiedVia}`, { uid, deviceId });
  return { requiresOtp: false, sessionId };
});
