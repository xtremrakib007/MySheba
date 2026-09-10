const crypto = require('crypto');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { sendEmail } = require('./mailerService');

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const VERIFIED_EXPIRY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const EMAIL_LINK_URL = 'https://mysheba.top/verifyEmail';

function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function hashCode(code, salt) { return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex'); }
function timingSafeEqualHex(a, b) {
  try {
    const aa = Buffer.from(String(a), 'hex');
    const bb = Buffer.from(String(b), 'hex');
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch { return false; }
}

async function sendEmailVerificationOtp(data) {
  const email = normalizeEmail(data?.email);
  if (!validEmail(email)) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');

  const db = admin.firestore();
  const ref = db.collection('emailVerificationOtps').doc(email);
  const existing = await ref.get();
  if (existing.exists) {
    const old = existing.data() || {};
    if (old.lastSentAt && Date.now() - Number(old.lastSentAt) < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - Number(old.lastSentAt))) / 1000);
      throw new HttpsError('resource-exhausted', `Please wait ${wait} seconds before requesting another email.`);
    }
  }

  const existingUsers = await admin.auth().getUsers([{ providerUid: email, providerId: 'password' }]).catch(() => ({ users: [] }));
  if (existingUsers.users?.some((u) => normalizeEmail(u.email) === email && u.emailVerified)) {
    throw new HttpsError('already-exists', 'This email address is already registered.');
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString('hex');
  const otpHash = hashCode(code, salt);
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  let link;
  try {
    link = await admin.auth().generateSignInWithEmailLink(email, {
      url: EMAIL_LINK_URL,
      handleCodeInApp: true,
      android: { packageName: 'com.satulink.mysheba', installApp: true, minimumVersion: '1' },
    });
  } catch (err) {
    console.error('generateSignInWithEmailLink failed', err);
    throw new HttpsError('failed-precondition', err.message || 'Could not create the email verification link.');
  }

  await ref.set({ otpHash, salt, expiresAt, attempts: 0, used: false, lastSentAt: Date.now(), createdAt: admin.firestore.FieldValue.serverTimestamp() });

  const subject = 'MySheba email verification';
  const text = [
    'Verify your MySheba email address.',
    '',
    `6-digit verification code: ${code}`,
    '',
    'Or verify instantly with this secure Firebase link:',
    link,
    '',
    'The code expires in 10 minutes. The link can only be used once.',
    'If you did not create a MySheba account, you can ignore this email.',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222"><h2>Verify your MySheba email</h2><p>Use either option below:</p><p><strong>6-digit verification code</strong></p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:12px 0">${code}</div><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:8px">Verify with Firebase Link</a></p><p>This code expires in 10 minutes. The link can only be used once.</p><p>If you did not create a MySheba account, ignore this email.</p></body></html>`;

  try {
    await sendEmail({ to: email, subject, text, html, context: 'emailOtpService' });
  } catch (err) {
    await ref.delete().catch(() => {});
    console.error('sendEmail verification failed', err);
    throw new HttpsError('internal', 'Could not send the verification email.');
  }
  return { expiresAt };
}

async function verifyEmailVerificationOtp(data) {
  const email = normalizeEmail(data?.email);
  const code = String(data?.code || '').trim();
  if (!validEmail(email) || !/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter the 6-digit verification code.');

  const ref = admin.firestore().collection('emailVerificationOtps').doc(email);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'No active email verification. Please request a new code.');
  const item = snap.data() || {};
  if (item.used || !item.expiresAt || Date.now() > Number(item.expiresAt)) throw new HttpsError('failed-precondition', 'That code has expired. Please request a new one.');
  const attempts = Number(item.attempts || 0);
  if (attempts >= MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Please request a new code.');
  const expected = hashCode(code, item.salt);
  if (!timingSafeEqualHex(expected, item.otpHash)) {
    await ref.update({ attempts: attempts + 1 });
    throw new HttpsError('invalid-argument', 'Incorrect verification code.');
  }

  const verificationId = crypto.randomBytes(24).toString('hex');
  await admin.firestore().collection('emailVerificationProofs').doc(verificationId).set({
    email,
    expiresAt: Date.now() + VERIFIED_EXPIRY_MS,
    used: false,
    method: 'otp',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await ref.update({ used: true, verifiedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { verificationId, email };
}

exports.sendEmailVerificationOtp = onCall(async (request) => sendEmailVerificationOtp(request.data));
exports.verifyEmailVerificationOtp = onCall(async (request) => verifyEmailVerificationOtp(request.data));
exports.sendEmailVerificationOtpInternal = sendEmailVerificationOtp;
exports.verifyEmailVerificationOtpInternal = verifyEmailVerificationOtp;
