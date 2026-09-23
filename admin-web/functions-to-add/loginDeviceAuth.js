// functions/loginDeviceAuth.js
//
// NEW FILE - drafted without visibility into the rest of the functions/
// project (only admin-web-src-full, the frontend, was shared with me), so
// conventions here (v1 vs v2 SDK, where admin.initializeApp() happens,
// any existing role-check helper) are a best guess and may need adjusting
// to match functions/walletService.js, functions/deviceSessionService.js,
// etc. Re-export both from functions/index.js the way those files are, e.g.:
//   exports.requestLoginOtp = require('./loginDeviceAuth').requestLoginOtp;
//   exports.verifyLoginOtp = require('./loginDeviceAuth').verifyLoginOtp;
//
// Prerequisites this assumes - see DEVICE_LOCK_README.md for details:
//   1. Email: Firebase "Trigger Email" extension (or equivalent) watching
//      a `mail` collection. Swap sendEmailOtp() if MySheba already has a
//      different email provider elsewhere.
//   2. SMS: NOT configured anywhere in the shared codebase. sendSmsOtp()
//      below is a stub that throws until a provider (e.g. Twilio) is
//      wired in - email OTP works standalone in the meantime.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.firestore();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function maskEmail(email) {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

function maskPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  return `${'*'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}

async function requireAdmin(uid) {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data();
  if (!data || !['admin', 'superadmin'].includes(data.role)) {
    throw new HttpsError('permission-denied', 'Not an admin account.');
  }
  return data;
}

async function sendEmailOtp(email, code) {
  await db.collection('mail').add({
    to: email,
    message: {
      subject: 'Your MySheba Admin verification code',
      text: `Your verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    },
  });
}

async function sendSmsOtp(_phone, _code) {
  // TODO: plug in an SMS provider (Twilio, etc.). Fails loudly rather
  // than silently no-op until this is implemented.
  throw new HttpsError(
    'failed-precondition',
    "SMS verification isn't set up yet. Use email verification instead."
  );
}

exports.requestLoginOtp = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = request.auth.uid;
  const userData = await requireAdmin(uid);

  const method = request.data?.method === 'sms' ? 'sms' : 'email';
  const otpRef = db.collection('users').doc(uid).collection('loginOtp').doc('current');

  const existing = await otpRef.get();
  if (existing.exists) {
    const createdAtMs = existing.data().createdAt?.toMillis?.() ?? 0;
    if (Date.now() - createdAtMs < RESEND_COOLDOWN_MS) {
      throw new HttpsError(
        'resource-exhausted',
        'Please wait a few seconds before requesting another code.'
      );
    }
  }

  let destination;
  if (method === 'sms') {
    destination = userData.phone ?? userData.phoneNumber;
    if (!destination) {
      throw new HttpsError('failed-precondition', 'No phone number on file for this account.');
    }
  } else {
    destination = userData.email;
    if (!destination) {
      throw new HttpsError('failed-precondition', 'No email on file for this account.');
    }
  }

  const code = generateCode();
  await otpRef.set({
    codeHash: hashCode(code),
    method,
    attempts: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
  });

  if (method === 'sms') {
    await sendSmsOtp(destination, code);
  } else {
    await sendEmailOtp(destination, code);
  }

  return {
    method,
    maskedDestination: method === 'sms' ? maskPhone(destination) : maskEmail(destination),
  };
});

exports.verifyLoginOtp = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = request.auth.uid;
  await requireAdmin(uid);

  const { code, deviceId, deviceLabel } = request.data || {};
  if (!code || !deviceId) {
    throw new HttpsError('invalid-argument', 'Missing code or device id.');
  }

  const otpRef = db.collection('users').doc(uid).collection('loginOtp').doc('current');
  const snap = await otpRef.get();
  if (!snap.exists) {
    throw new HttpsError(
      'failed-precondition',
      'No verification code was requested. Request a new one.'
    );
  }

  const data = snap.data();

  if (data.expiresAt.toMillis() < Date.now()) {
    await otpRef.delete();
    throw new HttpsError('deadline-exceeded', 'That code expired. Request a new one.');
  }

  if (data.attempts >= MAX_ATTEMPTS) {
    await otpRef.delete();
    throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new code.');
  }

  if (hashCode(String(code).trim()) !== data.codeHash) {
    await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
    throw new HttpsError('invalid-argument', 'Incorrect code.');
  }

  await db
    .collection('users')
    .doc(uid)
    .collection('trustedDevices')
    .doc(deviceId)
    .set({
      label: deviceLabel || 'Unknown device',
      trustedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  await otpRef.delete();

  return { success: true };
});
