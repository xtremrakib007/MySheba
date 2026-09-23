const crypto = require('crypto');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { sendEmail } = require('./mailerService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { logServerError } = require('./logService');
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const PROOF_EXPIRY_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_LINK_URL = 'https://mysheba.top/verifyEmail';
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizePhone = value => String(value || '').replace(/[^0-9]/g, '');
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const hashCode = (code, salt) => crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
function safeEqual(a, b) { try { const x = Buffer.from(String(a), 'hex'); const y = Buffer.from(String(b), 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); } catch { return false; } }
async function findAccount(db, phone) { const digits = normalizePhone(phone); if (!digits) return null; const snap = await db.collection('users').where('phone', 'in', [digits, `+${digits}`]).limit(1).get(); return snap.empty ? null : snap.docs[0]; }
async function sendPasswordResetEmailVerification(data, request) {
  const phone = normalizePhone(data?.phone), email = normalizeEmail(data?.email);
  if (!phone || !validEmail(email)) throw new HttpsError('invalid-argument', 'Please enter your phone number and email address.');
  const db = admin.firestore(), userDoc = await findAccount(db, phone);
  if (!userDoc) throw new HttpsError('failed-precondition', 'We could not verify those account details.');
  const userData = userDoc.data() || {};
  if (userData.suspended || userData.inactive) throw new HttpsError('permission-denied', 'This account is not available.');
  if (normalizeEmail(userData.email) !== email) throw new HttpsError('failed-precondition', 'We could not verify those account details.');
  const uid = userDoc.id; await checkVelocity(db, uid, 'password_reset_email_send', { ip: getClientIp(request) });
  const ref = db.collection('passwordResetEmailOtps').doc(uid), existing = await ref.get();
  if (existing.exists) { const old = existing.data() || {}; if (old.lastSentAt && Date.now() - Number(old.lastSentAt) < RESEND_COOLDOWN_MS) throw new HttpsError('resource-exhausted', 'Please wait before requesting another email.'); }
  const code = String(crypto.randomInt(100000, 1000000)), salt = crypto.randomBytes(16).toString('hex'), expiresAt = Date.now() + OTP_EXPIRY_MS;
  let link; try { link = await admin.auth().generateSignInWithEmailLink(email, { url: EMAIL_LINK_URL, handleCodeInApp: true, android: { packageName: 'com.satulink.mysheba', installApp: true, minimumVersion: '1' } }); } catch (err) { await logServerError('passwordResetEmail.generateLink', err, { uid }); throw new HttpsError('failed-precondition', 'Could not create the password-reset verification link.'); }
  await ref.set({ uid, email, otpHash: hashCode(code, salt), salt, expiresAt, attempts: 0, used: false, lastSentAt: Date.now(), createdAt: admin.firestore.FieldValue.serverTimestamp() });
  const subject = 'MySheba password reset verification';
  const text = ['Verify your MySheba password reset request.', '', `6-digit verification code: ${code}`, '', 'Or use this secure Firebase verification link:', link, '', 'The code expires in 10 minutes.', 'If you did not request a password reset, ignore this email.'].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222"><h2>MySheba password reset</h2><p>Use either option below to verify your identity.</p><p><strong>6-digit verification code</strong></p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:12px 0">${code}</div><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1a73e8;color:#fff;text-decoration:none;border-radius:8px">Verify with Firebase Link</a></p><p>This code expires in 10 minutes.</p><p>If you did not request this, ignore this email.</p></body></html>`;
  try { await sendEmail({ to: email, subject, text, html, context: 'passwordResetEmail' }); } catch (err) { await ref.delete().catch(() => {}); await logServerError('passwordResetEmail.sendEmail', err, { uid }); throw new HttpsError('internal', 'Could not send the verification email.'); }
  return { success: true, expiresAt };
}
async function verifyPasswordResetEmailOtp(data) {
  const phone = normalizePhone(data?.phone), email = normalizeEmail(data?.email), code = String(data?.code || '').trim();
  if (!phone || !validEmail(email) || !/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter the 6-digit verification code.');
  const db = admin.firestore(), userDoc = await findAccount(db, phone);
  if (!userDoc) throw new HttpsError('failed-precondition', 'We could not verify that request.');
  const user = userDoc.data() || {};
  if (user.suspended || user.inactive || normalizeEmail(user.email) !== email) throw new HttpsError('failed-precondition', 'We could not verify that request.');
  const uid = userDoc.id, ref = db.collection('passwordResetEmailOtps').doc(uid), proofRef = db.collection('emailVerificationProofs').doc(crypto.randomBytes(24).toString('hex')), now = Date.now();
  const result = await db.runTransaction(async tx => {
    const otpSnap = await tx.get(ref); if (!otpSnap.exists) return { status: 'missing' };
    const item = otpSnap.data() || {}; if (item.used || !item.expiresAt || now > Number(item.expiresAt)) return { status: 'expired' };
    const attempts = Number(item.attempts || 0); if (attempts >= MAX_ATTEMPTS) return { status: 'locked' };
    if (!safeEqual(hashCode(code, item.salt), item.otpHash)) { tx.update(ref, { attempts: attempts + 1 }); return { status: 'invalid' }; }
    tx.set(proofRef, { uid, email, expiresAt: now + PROOF_EXPIRY_MS, used: false, method: 'password-reset-email-otp', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(ref, { used: true, verifiedAt: admin.firestore.FieldValue.serverTimestamp() }); return { status: 'ok', verificationId: proofRef.id };
  });
  if (result.status === 'missing') throw new HttpsError('failed-precondition', 'We could not verify that request.');
  if (result.status === 'expired') throw new HttpsError('failed-precondition', 'That code has expired. Please request a new one.');
  if (result.status === 'locked') throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Please request a new code.');
  if (result.status === 'invalid') throw new HttpsError('invalid-argument', 'Incorrect verification code.');
  return { verificationId: result.verificationId, uid, email };
}
exports.sendPasswordResetEmailVerification = onCall({ enforceAppCheck: true }, async request => sendPasswordResetEmailVerification(request.data, request));
exports.verifyPasswordResetEmailOtp = onCall({ enforceAppCheck: true }, async request => verifyPasswordResetEmailOtp(request.data));
