// Forgot Password - server half.
const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertPhoneVerified } = require('./phoneVerification');
const { assertEmailVerified, assertEmailOtpVerified } = require('./emailVerification');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { logAudit, logServerError } = require('./logService');

const RESET_PROOF_TTL_MS = 15 * 60 * 1000;
function normalizePhone(phone) { return String(phone || '').replace(/[^0-9]/g, ''); }
function toE164(phone, dialCode = '+60') { const raw = String(phone || '').trim(); if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`; const digits = normalizePhone(phone).replace(/^0+/, ''); const code = String(dialCode || '+60').replace(/[^0-9+]/g, ''); return `${code.startsWith('+') ? code : `+${code}`}${digits}`; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function phoneLookupCandidates(phone, phoneE164, dialCode) { const e164 = toE164(phoneE164 || phone, dialCode); const e164Digits = normalizePhone(e164), localDigits = normalizePhone(phone); const countryCode = normalizePhone(dialCode || '+60'); const withoutCountry = e164Digits.startsWith(countryCode) ? e164Digits.slice(countryCode.length) : ''; return { e164Candidates: unique([e164]), phoneCandidates: unique([localDigits, e164Digits, `+${e164Digits}`, withoutCountry, withoutCountry ? `0${withoutCountry}` : '']), authEmailCandidates: unique([`${e164Digits}@mysheba.app`, `${localDigits}@mysheba.app`, `${withoutCountry}@mysheba.app`, `${withoutCountry ? `0${withoutCountry}` : ''}@mysheba.app`]) }; }
async function findUserByPhone(db, phone, phoneE164, dialCode) { const c = phoneLookupCandidates(phone, phoneE164, dialCode); if (c.e164Candidates.length) { const s = await db.collection('users').where('phoneE164', 'in', c.e164Candidates).limit(1).get(); if (!s.empty) return s; } if (c.phoneCandidates.length) { const s = await db.collection('users').where('phone', 'in', c.phoneCandidates).limit(1).get(); if (!s.empty) return s; } for (const email of c.authEmailCandidates) { try { const u = await admin.auth().getUserByEmail(email); const p = await db.collection('users').doc(u.uid).get(); if (p.exists) return { empty: false, docs: [p] }; } catch (err) { if (err?.code !== 'auth/user-not-found') await logServerError('resetPassword.lookupAuthUser', err, { email }); } } return { empty: true, docs: [] }; }
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function isValidPassword(password) { const value = String(password || ''); return value.length >= 6 && value.length <= 20; }
function tokenFingerprint(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }
async function consumeResetProof(db, token, uid, via) { const ref = db.collection('passwordResetProofs').doc(tokenFingerprint(token)); const result = await db.runTransaction(async tx => { const snap = await tx.get(ref); if (snap.exists) return false; tx.create(ref, { uid, via, createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: Date.now() + RESET_PROOF_TTL_MS }); return true; }); if (!result) throw new HttpsError('failed-precondition', 'This verification has already been used. Please verify again.'); }

exports.resetPassword = onCall({ enforceAppCheck: true }, async request => {
  const { phone, phoneE164, dialCode, email, newPassword, phoneIdToken, emailIdToken, emailVerificationId } = request.data || {};
  const normalizedPhone = normalizePhone(phone), normalizedE164 = toE164(phoneE164 || phone, dialCode);
  if (!normalizedPhone) throw new HttpsError('invalid-argument', 'Please enter a valid phone number.');
  if (!isValidPassword(newPassword)) throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');
  const emailProofOnly = Boolean(emailVerificationId) && !emailIdToken && !phoneIdToken;
  if (!phoneIdToken && !emailIdToken && !emailProofOnly) throw new HttpsError('invalid-argument', 'Please verify your phone or email first.');
  if (phoneIdToken && emailIdToken) throw new HttpsError('invalid-argument', 'Use one verification method at a time.');
  const db = admin.firestore();
  let snap; try { snap = await findUserByPhone(db, phone, normalizedE164, dialCode); } catch (err) { await logServerError('resetPassword.findUserByPhone', err, { lookup: 'phone' }); throw new HttpsError('internal', 'Could not find your account right now. Please try again.'); }
  if (snap.empty) throw new HttpsError('not-found', 'No account found with that phone number.');
  const userDoc = snap.docs[0], userData = userDoc.data(), realUid = userDoc.id;
  if (userData.suspended) throw new HttpsError('permission-denied', 'This account has been suspended. Please contact support.');
  const ip = getClientIp(request); await checkVelocity(db, realUid, 'password_reset', { ip });
  let verificationMethod;
  if (phoneIdToken) {
    try { const verifiedUid = await assertPhoneVerified(phoneIdToken, normalizedE164, dialCode || '+60'); if (verifiedUid !== realUid) throw new Error('The verified phone account does not match.'); verificationMethod = 'sms'; } catch (err) { throw new HttpsError('failed-precondition', err.message || 'Please verify your phone number first.'); }
  } else if (emailIdToken) {
    const accountEmail = normalizeEmail(userData.email || ''); if (!accountEmail || normalizeEmail(email) !== accountEmail) throw new HttpsError('failed-precondition', 'That email is not associated with this phone number.');
    try { const verifiedUid = await assertEmailVerified(emailIdToken, accountEmail); if (verifiedUid !== realUid) throw new Error('The verified email account does not match.'); verificationMethod = 'email'; } catch (err) { throw new HttpsError('failed-precondition', err.message || 'Please verify your email address first.'); }
  } else {
    const accountEmail = normalizeEmail(userData.email || ''); if (!accountEmail || normalizeEmail(email) !== accountEmail) throw new HttpsError('failed-precondition', 'We could not verify those account details.');
    const proofRef = db.collection('emailVerificationProofs').doc(String(emailVerificationId));
    const proofSnap = await proofRef.get(); const proof = proofSnap.exists ? proofSnap.data() || {} : null;
    if (!proof || proof.used || proof.uid !== realUid || proof.method !== 'password-reset-email-otp' || normalizeEmail(proof.email) !== accountEmail || !proof.expiresAt || Date.now() > Number(proof.expiresAt)) throw new HttpsError('failed-precondition', 'This verification does not belong to the requested account or has expired.');
    try { await assertEmailOtpVerified(emailVerificationId, accountEmail); verificationMethod = 'password-reset-email-otp'; } catch (err) { throw new HttpsError('failed-precondition', err.message || 'Please verify your email address first.'); }
  }
  await consumeResetProof(db, phoneIdToken || emailIdToken || emailVerificationId, realUid, verificationMethod);
  try { await admin.auth().updateUser(realUid, { password: String(newPassword) }); } catch (err) { await logServerError('resetPassword.updateUser', err, { userId: realUid }); throw new HttpsError('internal', 'Could not reset your password right now. Please try again.'); }
  await admin.auth().revokeRefreshTokens(realUid).catch(() => {});
  await userDoc.ref.update({ activeSessionId: null, activeDeviceId: null, pendingDeviceApproval: null, pendingAdminEmailChallenge: admin.firestore.FieldValue.delete() }).catch(() => {});
  await logAudit({ action: 'password_reset', targetUid: realUid, performedBy: realUid, performedByRole: userData.role, details: { via: verificationMethod, ip } });
  return { success: true };
});
