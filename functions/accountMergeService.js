const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const mailerService = require('./mailerService');

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)); }
function generateCode() { let code = ''; for (let i = 0; i < OTP_LENGTH; i += 1) code += Math.floor(Math.random() * 10); return code; }
function maskEmail(email) { const at = email.indexOf('@'); if (at <= 0) return email; const local = email.slice(0, at); const shown = local.slice(0, Math.min(2, local.length)); return `${shown}${'*'.repeat(Math.max(3, local.length - shown.length))}${email.slice(at)}`; }
function requireAuth(request) { if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.'); return request.auth.uid; }
async function getProfile(db, uid) { const snap = await db.collection('users').doc(uid).get(); return snap.exists ? { id: snap.id, ...snap.data() } : null; }
function walletBalance(profile) {
  const value = Number(profile?.walletBalance || 0);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) {
    throw new HttpsError('failed-precondition', 'One of the account wallet balances is invalid.');
  }
  return value;
}

exports.startAccountMerge = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await getProfile(db, callerUid);
  if (!caller) throw new HttpsError('not-found', 'Your account could not be found.');
  if (caller.role !== 'customer') throw new HttpsError('permission-denied', 'Account merging is not available for this account type yet. Please contact support.');
  const email = normalizeEmail(request.data?.email);
  if (!isValidEmail(email)) throw new HttpsError('invalid-argument', 'That does not look like a valid email address.');
  if (caller.email && normalizeEmail(caller.email) === email) throw new HttpsError('invalid-argument', 'That is already your account email address.');
  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'account_merge_start', { ip });
  let targetAuthUser;
  try {
    targetAuthUser = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') throw new HttpsError('not-found', 'No MySheba account uses that Google account yet - try linking again.');
    await logServerError('startAccountMerge.getUserByEmail', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not look up that account. Please try again.');
  }
  if (targetAuthUser.uid === callerUid) throw new HttpsError('invalid-argument', 'That is already your account.');
  if (!(targetAuthUser.providerData || []).some((p) => p.providerId === 'google.com')) throw new HttpsError('failed-precondition', 'That account is not signed in with Google.');
  const target = await getProfile(db, targetAuthUser.uid);
  if (!target) throw new HttpsError('not-found', 'That account could not be found.');
  if (target.mergedInto) throw new HttpsError('failed-precondition', 'That account has already been merged into another one.');
  if (target.role !== 'customer') throw new HttpsError('permission-denied', 'That account cannot be merged automatically. Please contact support.');
  const otpRef = db.collection('mergeOtps').doc(callerUid);
  const existing = await otpRef.get();
  const lastSentMs = existing.exists && existing.data().lastSentAt?.toMillis ? existing.data().lastSentAt.toMillis() : 0;
  if (Date.now() - lastSentMs < RESEND_COOLDOWN_MS) throw new HttpsError('resource-exhausted', 'Please wait a minute before requesting another code.');
  const code = generateCode();
  await otpRef.set({ callerUid, targetUid: targetAuthUser.uid, targetEmail: email, code, expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS), lastSentAt: admin.firestore.FieldValue.serverTimestamp(), attempts: 0, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  try {
    await mailerService.sendEmail({ to: email, subject: 'Confirm merging your MySheba accounts', text: `A MySheba account is requesting to link this Google account. Your confirmation code is ${code}. It expires in 5 minutes. If you did not request this, you can ignore this email.`, html: `<p>A MySheba account is requesting to link this Google account.</p><p>Your confirmation code is <b>${code}</b>. It expires in 5 minutes.</p><p>If you did not request this, you can ignore this email.</p>`, context: 'accountMergeService' });
  } catch (err) {
    await logServerError('startAccountMerge.sendEmail', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not send the confirmation code. Please try again.');
  }
  await logAudit({ action: 'account_merge_started', targetUid: targetAuthUser.uid, performedBy: callerUid, performedByRole: caller.role, details: { targetEmailMasked: maskEmail(email), ip } });
  const yourWalletBalance = walletBalance(caller);
  const targetWalletBalance = walletBalance(target);
  return { sent: true, emailMasked: maskEmail(email), yourWalletBalance, targetWalletBalance, combinedWalletBalance: yourWalletBalance + targetWalletBalance };
});

exports.confirmAccountMerge = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const code = String(request.data?.code || '').trim();
  if (!/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Please enter the 6-digit code we sent.');
  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'account_merge_confirm', { ip });
  const otpRef = db.collection('mergeOtps').doc(callerUid);
  const callerRef = db.collection('users').doc(callerUid);
  let targetUid = null;
  let mergedWalletBalance = 0;

  try {
    await db.runTransaction(async (tx) => {
      const otpSnap = await tx.get(otpRef);
      if (!otpSnap.exists) throw new HttpsError('not-found', 'Please start the merge again from Settings.');
      const otp = otpSnap.data();
      const attempts = Number(otp.attempts || 0);
      if (!Number.isInteger(attempts) || attempts < 0) throw new HttpsError('failed-precondition', 'The merge verification record is invalid.');
      if (attempts >= MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Please start the merge again.');
      const expiresMs = otp.expiresAt?.toMillis ? otp.expiresAt.toMillis() : 0;
      if (!expiresMs || Date.now() > expiresMs) throw new HttpsError('deadline-exceeded', 'That code has expired. Please start the merge again.');

      if (code !== String(otp.code || '')) {
        tx.update(otpRef, { attempts: attempts + 1 });
        throw new HttpsError('invalid-argument', 'Incorrect code. Please try again.');
      }

      targetUid = String(otp.targetUid || '');
      if (!targetUid || targetUid === callerUid) throw new HttpsError('failed-precondition', 'The merge target is invalid. Please start again.');
      const targetRef = db.collection('users').doc(targetUid);
      const callerSnap = await tx.get(callerRef);
      const targetSnap = await tx.get(targetRef);
      if (!callerSnap.exists) throw new HttpsError('not-found', 'Your account could not be found.');
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That account no longer exists.');
      const callerData = callerSnap.data();
      const targetData = targetSnap.data();
      if (targetData.mergedInto) throw new HttpsError('failed-precondition', 'That account has already been merged into another one.');
      if (callerData.role !== 'customer' || targetData.role !== 'customer') throw new HttpsError('permission-denied', 'This account cannot be merged automatically. Please contact support.');
      const callerBalance = walletBalance(callerData);
      const targetBalance = walletBalance(targetData);
      mergedWalletBalance = callerBalance + targetBalance;
      if (!Number.isSafeInteger(Math.round(mergedWalletBalance * 100))) throw new HttpsError('failed-precondition', 'The combined wallet balance is too large.');

      tx.update(callerRef, { walletBalance: mergedWalletBalance, googleLinked: true });
      tx.update(targetRef, { walletBalance: 0, mergedInto: callerUid, active: false, mergedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.delete(otpRef);
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('confirmAccountMerge.transaction', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not complete the merge. Please try again.');
  }

  let providerLinkFailed = false;
  try {
    const targetAuthUser = await admin.auth().getUser(targetUid);
    const googleProvider = (targetAuthUser.providerData || []).find((p) => p.providerId === 'google.com');
    if (googleProvider) {
      await admin.auth().updateUser(targetUid, { providersToUnlink: ['google.com'] });
      await admin.auth().updateUser(callerUid, { providerToLink: { providerId: 'google.com', uid: googleProvider.uid, email: googleProvider.email || '' } });
    } else providerLinkFailed = true;
  } catch (err) {
    providerLinkFailed = true;
    await logServerError('confirmAccountMerge.providerTransfer', err, { userId: callerUid });
  }
  await admin.auth().updateUser(targetUid, { disabled: true }).catch(() => {});
  await logAudit({ action: 'account_merged', targetUid, performedBy: callerUid, performedByRole: 'customer', details: { mergedWalletBalance, providerLinkFailed, ip } });
  return { merged: true, walletBalance: mergedWalletBalance, googleLinked: !providerLinkFailed, providerLinkFailed };
});
