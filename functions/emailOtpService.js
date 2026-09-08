// Email verification challenge service.
// Sends ONE custom email containing both the Firebase magic link and a 6-digit OTP.
// Either method produces a fresh Firebase ID token proving ownership of the email.

const crypto = require('crypto');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { sendEmail } = require('./mailerService');

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const ACTION_CODE_SETTINGS = {
  url: 'https://mysheba.top/verifyEmail',
  handleCodeInApp: true,
  android: {
    packageName: 'com.satulink.mysheba',
    installApp: true,
    minimumVersion: '1',
  },
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashCode(code, salt) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.sendEmailVerificationChallenge = onCall(async (request) => {
  const email = normalizeEmail(request.data?.email);
  if (!validEmail(email)) {
    throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const salt = crypto.randomBytes(16).toString('hex');
  const otpHash = hashCode(code, salt);

  const auth = admin.auth();
  let tempUser;
  try {
    tempUser = await auth.createUser({ email, emailVerified: false });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      // A registration email must remain unique in the real customer profile.
      // Existing Firebase auth records used by the app are not reused for this
      // proof flow, so do not expose account existence details here.
      throw new HttpsError('already-exists', 'This email address is already registered.');
    }
    throw new HttpsError('internal', 'Could not start email verification.');
  }

  let link;
  try {
    link = await auth.generateSignInWithEmailLink(email, ACTION_CODE_SETTINGS);
  } catch (err) {
    await auth.deleteUser(tempUser.uid).catch(() => {});
    throw new HttpsError('failed-precondition', err.message || 'Could not create the email verification link.');
  }

  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const db = admin.firestore();
  await db.collection('emailVerificationChallenges').doc(email).set({
    uid: tempUser.uid,
    salt,
    otpHash,
    expiresAt,
    used: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const subject = 'MySheba email verification';
  const text = [
    'Verify your MySheba email address.',
    '',
    `6-digit verification code: ${code}`,
    '',
    'Or verify instantly with this secure link:',
    link,
    '',
    'The code expires in 10 minutes. The verification link can only be used once.',
    'If you did not create a MySheba account, you can ignore this email.',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222"><h2>Verify your MySheba email</h2><p>Use either option below:</p><p><strong>6-digit verification code</strong></p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:12px 0">${code}</div><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:8px">Verify with Magic Link</a></p><p>This code expires in 10 minutes. The link can only be used once.</p><p>If you did not create a MySheba account, ignore this email.</p></body></html>`;

  try {
    await sendEmail({ to: email, subject, text, html, context: 'emailOtpService' });
  } catch (err) {
    await db.collection('emailVerificationChallenges').doc(email).delete().catch(() => {});
    await auth.deleteUser(tempUser.uid).catch(() => {});
    throw new HttpsError('internal', 'Could not send the verification email.');
  }

  return { expiresAt };
});

exports.verifyEmailOtp = onCall(async (request) => {
  const email = normalizeEmail(request.data?.email);
  const code = String(request.data?.code || '').trim();
  if (!validEmail(email) || !/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Enter the 6-digit verification code.');
  }

  const ref = admin.firestore().collection('emailVerificationChallenges').doc(email);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'No active email verification. Please request a new code.');
  const challenge = snap.data();
  if (challenge.used || !challenge.expiresAt || Date.now() > Number(challenge.expiresAt)) {
    throw new HttpsError('failed-precondition', 'That code has expired. Please request a new one.');
  }
  if (hashCode(code, challenge.salt) !== challenge.otpHash) {
    throw new HttpsError('invalid-argument', 'Incorrect verification code.');
  }

  await admin.auth().updateUser(challenge.uid, { emailVerified: true });
  await ref.update({ used: true, verifiedAt: admin.firestore.FieldValue.serverTimestamp() });
  const customToken = await admin.auth().createCustomToken(challenge.uid, { emailVerification: true });
  return { customToken, email };
});
