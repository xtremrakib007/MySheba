const crypto = require('crypto');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { sendEmail } = require('./mailerService');

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const ACTION_CODE_SETTINGS = {
  url: 'https://mysheba.top/verifyEmail',
  handleCodeInApp: true,
  linkDomain: 'mysheba.top',
  android: { packageName: 'com.satulink.mysheba', installApp: true, minimumVersion: '1' },
};

function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function hashCode(code, salt) { return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex'); }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

async function sendEmailVerificationChallenge(data) {
  const email = normalizeEmail(data?.email);
  if (!validEmail(email)) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  const db = admin.firestore();
  const challengeRef = db.collection('emailVerificationChallenges').doc(email);
  const oldSnap = await challengeRef.get();
  if (oldSnap.exists) {
    const old = oldSnap.data();
    if (old.lastSentAt && Date.now() - Number(old.lastSentAt) < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - Number(old.lastSentAt))) / 1000);
      throw new HttpsError('resource-exhausted', `Please wait ${wait} seconds before requesting another email.`);
    }
    if (old.uid) await admin.auth().deleteUser(old.uid).catch(() => {});
    await challengeRef.delete().catch(() => {});
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const salt = crypto.randomBytes(16).toString('hex');
  const otpHash = hashCode(code, salt);
  const auth = admin.auth();
  let tempUser;
  try {
    tempUser = await auth.createUser({ email, emailVerified: false });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'This email address is already registered.');
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
  await challengeRef.set({ uid: tempUser.uid, salt, otpHash, expiresAt, attempts: 0, used: false, lastSentAt: Date.now(), createdAt: admin.firestore.FieldValue.serverTimestamp() });
  const subject = 'MySheba email verification';
  const text = ['Verify your MySheba email address.', '', `6-digit verification code: ${code}`, '', 'Or verify instantly with this secure link:', link, '', 'The code expires in 10 minutes. The verification link can only be used once.', 'If you did not create a MySheba account, you can ignore this email.'].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222"><h2>Verify your MySheba email</h2><p>Use either option below:</p><p><strong>6-digit verification code</strong></p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:12px 0">${code}</div><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:8px">Verify with Magic Link</a></p><p>This code expires in 10 minutes. The link can only be used once.</p><p>If you did not create a MySheba account, ignore this email.</p></body></html>`;
  try {
    await sendEmail({ to: email, subject, text, html, context: 'emailOtpService' });
  } catch (err) {
    await challengeRef.delete().catch(() => {});
    await auth.deleteUser(tempUser.uid).catch(() => {});
    throw new HttpsError('internal', 'Could not send the verification email.');
  }
  return { expiresAt };
}

async function verifyEmailOtp(data) {
  const email = normalizeEmail(data?.email);
  const code = String(data?.code || '').trim();
  if (!validEmail(email) || !/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter the 6-digit verification code.');
  const ref = admin.firestore().collection('emailVerificationChallenges').doc(email);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'No active email verification. Please request a new code.');
  const challenge = snap.data();
  if (challenge.used || !challenge.expiresAt || Date.now() > Number(challenge.expiresAt)) throw new HttpsError('failed-precondition', 'That code has expired. Please request a new one.');
  const attempts = Number(challenge.attempts || 0);
  if (attempts >= MAX_OTP_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Please request a new code.');
  if (hashCode(code, challenge.salt) !== challenge.otpHash) {
    await ref.update({ attempts: attempts + 1 });
    throw new HttpsError('invalid-argument', 'Incorrect verification code.');
  }
  await admin.auth().updateUser(challenge.uid, { emailVerified: true });
  await ref.update({ used: true, verifiedAt: admin.firestore.FieldValue.serverTimestamp() });
  const customToken = await admin.auth().createCustomToken(challenge.uid, { emailVerification: true });
  return { customToken, email };
}

exports.sendEmailVerificationChallenge = onCall(async (request) => sendEmailVerificationChallenge(request.data));
exports.verifyEmailOtp = onCall(async (request) => verifyEmailOtp(request.data));
exports.sendEmailVerificationChallengeInternal = sendEmailVerificationChallenge;
exports.verifyEmailOtpInternal = verifyEmailOtp;
