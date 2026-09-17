// Server-side single-device sessions and trusted-device verification.
// This service is security-sensitive: verification challenges are single-use and failed OTP attempts are counted server-side.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { assertEmailVerified } = require('./emailVerification');
const { assertPhoneVerified } = require('./phoneVerification');
const { logAudit, logServerError } = require('./logService');
const { getClientIp } = require('./rateLimitService');
const { checkIpAnomaly } = require('./anomalyService');
const mailerService = require('./mailerService');

const MAX_DEVICE_ID_LENGTH = 100;
const MAX_DEVICE_LABEL_LENGTH = 80;
const MAX_TRUSTED_DEVICES = 5;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EMAIL_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CHALLENGE_RESEND_MS = 30 * 1000;
const EMAIL_CHALLENGE_MAX_ATTEMPTS = 5;

const requireAuth = (request) => { if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.'); return request.auth.uid; };
const requireStaff = async (request, db) => { const uid = requireAuth(request); const snap = await userRef(db, uid).get(); if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.'); const role = snap.data()?.role; if (!isStaffRole(role)) throw new HttpsError('permission-denied', 'This feature is only available to staff accounts.'); return { uid, profile: snap.data() }; };
const requireDeviceId = (request) => { const value = request.data?.deviceId; if (typeof value !== 'string' || !value.trim() || value.length > MAX_DEVICE_ID_LENGTH) throw new HttpsError('invalid-argument', 'Missing or invalid device id.'); return value.trim(); };
const deviceLabel = (request) => { const value = request.data?.deviceLabel; return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_DEVICE_LABEL_LENGTH) : null; };
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').replace(/[^0-9]/g, '');
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
const otp = () => String(crypto.randomInt(100000, 1000000));
const otpHash = (value) => crypto.createHash('sha256').update(String(value).trim()).digest('hex');
const safeEqualHash = (leftHex, rightHex) => { try { const left = Buffer.from(String(leftHex || ''), 'hex'); const right = Buffer.from(String(rightHex || ''), 'hex'); return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right); } catch { return false; } };
const sessionId = () => crypto.randomBytes(24).toString('hex');
const userRef = (db, uid) => db.collection('users').doc(uid);
const isStaffRole = (role) => ['admin', 'superadmin', 'dealer', 'reseller'].includes(role);

async function resolveUidForVerification(request, db) {
  if (request.auth?.uid) { const requestedUid = String(request.data?.uid || '').trim(); if (requestedUid && requestedUid !== request.auth.uid) throw new HttpsError('permission-denied', 'The verification account does not match the signed-in account.'); return request.auth.uid; }
  const requestedUid = String(request.data?.uid || '').trim(); const phoneIdToken = String(request.data?.phoneIdToken || '').trim(); const emailIdToken = String(request.data?.emailIdToken || '').trim();
  if (!requestedUid || (!phoneIdToken && !emailIdToken)) throw new HttpsError('unauthenticated', 'You must be signed in or provide a valid verification token.');
  const snap = await userRef(db, requestedUid).get(); if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.'); const profile = snap.data();
  try { if (phoneIdToken) { const phone = normalizePhone(profile.phone); if (!phone) throw new Error('This account has no phone number for SMS verification.'); await assertPhoneVerified(phoneIdToken, phone); } else { const email = normalizeEmail(profile.email); if (!validEmail(email)) throw new Error('This account has no valid email for verification.'); await assertEmailVerified(emailIdToken, email); } }
  catch (error) { throw new HttpsError('failed-precondition', error.message || 'The verification token is invalid.'); }
  return requestedUid;
}

function trustedMap(current, id, ip, label) {
  const now = Timestamp.now(); const old = current?.[id] || {};
  const next = { ...(current || {}), [id]: { label: label || old.label || null, ip: old.ip || ip || null, lastIp: ip || old.lastIp || null, trustedAt: old.trustedAt || now, lastSeenAt: now } };
  const ids = Object.keys(next); while (ids.length > MAX_TRUSTED_DEVICES) { const candidates = Object.keys(next).filter((key) => key !== id); const oldest = candidates.sort((a, b) => (next[a].lastSeenAt?.toMillis?.() || 0) - (next[b].lastSeenAt?.toMillis?.() || 0))[0]; if (!oldest) break; delete next[oldest]; ids.splice(ids.indexOf(oldest), 1); }
  return next;
}

async function sendPush(message) { if (!message?.to) return; try { const response = await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify([{ sound: 'default', ...message }]) }); if (!response.ok) console.error('[deviceSessionService] push failed', response.status); } catch (error) { console.error('[deviceSessionService] push error', error); } }

async function sendNewDeviceAlert({ email, pushToken, deviceId, ip }) {
  const when = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }); const shortId = String(deviceId || '').slice(0, 8) || 'unknown';
  if (email) { const text = `Your MySheba account was signed in on a new device.\n\nTime: ${when}\nDevice: ${shortId}${ip ? `\nIP: ${ip}` : ''}\n\nIf this was not you, change your password and contact support.`; try { await mailerService.sendEmail({ to: email, subject: 'New sign-in to your MySheba account', text, html: `<p>Your MySheba account was signed in on a new device.</p><p><b>Time:</b> ${when}<br><b>Device:</b> ${shortId}${ip ? `<br><b>IP:</b> ${ip}` : ''}</p><p>If this was not you, change your password and contact support.</p>`, context: 'deviceSessionService.newDeviceAlert' }); } catch (error) { await logServerError('sendNewDeviceAlert.email', error, {}); } }
  await sendPush({ to: pushToken, title: 'New sign-in to your account', body: 'Your MySheba account was signed in on another device.', data: { type: 'security_alert', reason: 'new_device' } });
}

async function sendStaffEmailChallenge({ db, uid, email, deviceId, displayName }) {
  const normalized = normalizeEmail(email); if (!validEmail(normalized)) throw new HttpsError('failed-precondition', 'No valid email address is available for new-device verification.'); const ref = userRef(db, uid); const snap = await ref.get(); const previous = snap.data()?.pendingAdminEmailChallenge; const lastSent = previous?.createdAt?.toMillis?.() || 0; if (Date.now() - lastSent < EMAIL_CHALLENGE_RESEND_MS) throw new HttpsError('resource-exhausted', 'Please wait before requesting another verification email.');
  const code = otp(); let link; try { link = await admin.auth().generateSignInWithEmailLink(normalized, { url: 'https://mysheba.top/verifyEmail', handleCodeInApp: true, android: { packageName: 'com.satulink.mysheba', installApp: true, minimumVersion: '1' } }); } catch (error) { await logServerError('sendStaffEmailChallenge.generateLink', error, { userId: uid }); throw new HttpsError('failed-precondition', 'Could not create the verification link. Please try again.'); }
  await ref.update({ pendingAdminEmailChallenge: { deviceId, reason: 'new_device', email: normalized, codeHash: otpHash(code), createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + EMAIL_CHALLENGE_TTL_MS), attempts: 0 } });
  const greeting = String(displayName || '').trim() ? `Hello ${String(displayName).trim()},` : 'Hello,'; try { await mailerService.sendEmail({ to: normalized, subject: 'MySheba new-device verification', text: `${greeting}\n\nVerify your new MySheba device:\n${link}\n\nOr enter this 6-digit code in the app:\n${code}\n\nThe code expires in 10 minutes.`, html: `<h2>MySheba new-device verification</h2><p>${greeting}</p><p><a href="${link}">Verify this device</a></p><p><b>6-digit code:</b> ${code}</p><p>The code expires in 10 minutes.</p>`, context: 'deviceSessionService.staffEmailChallenge' }); } catch (error) { await ref.update({ pendingAdminEmailChallenge: FieldValue.delete() }).catch(() => {}); await logServerError('sendStaffEmailChallenge.sendEmail', error, { userId: uid }); throw new HttpsError('internal', 'Could not send the verification email. Please try again.'); }
}

async function consumeStaffEmailOtp(db, uid, code, deviceId, email) {
  if (!/^\d{6}$/.test(String(code || '').trim())) throw new HttpsError('invalid-argument', 'Incorrect verification code.');
  const ref = userRef(db, uid);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const challenge = snap.data().pendingAdminEmailChallenge;
    if (!challenge || challenge.deviceId !== deviceId) throw new HttpsError('failed-precondition', 'No active verification challenge. Please request a new email.');
    if (normalizeEmail(challenge.email) !== normalizeEmail(email)) throw new HttpsError('failed-precondition', 'The verification email does not match this account.');
    if (!challenge.expiresAt?.toMillis || challenge.expiresAt.toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'That verification code expired.');
    const attempts = Number(challenge.attempts || 0); if (attempts >= EMAIL_CHALLENGE_MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new verification email.');
    const valid = safeEqualHash(otpHash(code), challenge.codeHash);
    if (!valid) { tx.update(ref, { 'pendingAdminEmailChallenge.attempts': attempts + 1 }); return { ok: false, attempts: attempts + 1 }; }
    tx.update(ref, { pendingAdminEmailChallenge: FieldValue.delete() }); return { ok: true, attempts };
  });
  if (!result.ok) { if (result.attempts >= EMAIL_CHALLENGE_MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new verification email.'); throw new HttpsError('invalid-argument', 'Incorrect verification code.'); }
  return true;
}

exports.checkDeviceSession = onCall({ enforceAppCheck: true }, async (request) => {
  const db = getFirestore(); const data = request.data || {}; const hasVerificationToken = Boolean(data.phoneIdToken || data.emailIdToken); const uid = hasVerificationToken ? await resolveUidForVerification(request, db) : requireAuth(request); const deviceId = requireDeviceId(request); const label = deviceLabel(request); const ip = getClientIp(request); const ref = userRef(db, uid);
  try {
    const snap = await ref.get(); if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.'); const profile = snap.data(); if (profile.suspended) throw new HttpsError('permission-denied', 'This account has been suspended. Please contact support.');
    let verifiedNewStaffDevice = false; let verificationMethod = null;
    if (isStaffRole(profile.role)) {
      const email = normalizeEmail(profile.email); const phone = normalizePhone(profile.phone); if (!email && !phone) throw new HttpsError('failed-precondition', 'This staff account has no verification contact.'); const trusted = Boolean(profile.trustedDevices?.[deviceId]);
      if (!trusted) {
        if (data.phoneIdToken) { try { await assertPhoneVerified(data.phoneIdToken, phone); } catch (error) { throw new HttpsError('failed-precondition', error.message || 'Please verify your phone first.'); } verifiedNewStaffDevice = true; verificationMethod = 'sms'; }
        else if (data.emailIdToken) { try { await assertEmailVerified(data.emailIdToken, email); } catch (error) { throw new HttpsError('failed-precondition', error.message || 'Please verify your email first.'); } verifiedNewStaffDevice = true; verificationMethod = 'email_link'; }
        else if (data.emailOtp) { await consumeStaffEmailOtp(db, uid, data.emailOtp, deviceId, email); verifiedNewStaffDevice = true; verificationMethod = 'email_otp'; }
        else { if (data.resendEmailChallenge) await sendStaffEmailChallenge({ db, uid, email, deviceId, displayName: profile.name || profile.displayName }); await logAudit({ action: 'staff_mfa_challenge', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip } }); return { requiresOtp: true, reason: 'new_device', email, phone, availableMfaMethods: [phone && 'sms', email && 'email'].filter(Boolean), emailChallengeSent: Boolean(data.resendEmailChallenge && email) }; }
      }
      if (verifiedNewStaffDevice) { await ref.update({ trustedDevices: trustedMap(profile.trustedDevices, deviceId, ip, label), pendingAdminEmailChallenge: FieldValue.delete() }); await logAudit({ action: 'staff_device_trusted', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip, verificationMethod } }); }
      else if (trusted) { try { await ref.update({ trustedDevices: trustedMap(profile.trustedDevices, deviceId, ip, label) }); } catch (error) {} }
    }
    const result = await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(ref); if (!currentSnap.exists) throw new HttpsError('not-found', 'No profile found for this account.'); const current = currentSnap.data(); if (current.suspended) throw new HttpsError('permission-denied', 'Your account has been suspended.');
      if (verifiedNewStaffDevice) { const id = sessionId(); tx.update(ref, { activeSessionId: id, activeDeviceId: deviceId, pendingDeviceApproval: null, lastLoginAt: FieldValue.serverTimestamp() }); return { requiresOtp: false, sessionId: id, switchedDevice: Boolean(current.activeDeviceId && current.activeDeviceId !== deviceId) }; }
      if (!current.activeDeviceId || current.activeDeviceId === deviceId) { const id = sessionId(); tx.update(ref, { activeSessionId: id, activeDeviceId: deviceId, pendingDeviceApproval: null, lastLoginAt: FieldValue.serverTimestamp() }); return { requiresOtp: false, sessionId: id }; }
      const email = normalizeEmail(current.email); if (!validEmail(email)) throw new HttpsError('failed-precondition', 'This account has no email for new-device verification. Please contact support.'); tx.update(ref, { pendingDeviceApproval: { deviceId, email, requestedAt: FieldValue.serverTimestamp() } }); return { requiresOtp: true, reason: 'new_device', email, availableMfaMethods: ['email'] };
    });
    if (!result.requiresOtp) { if (verifiedNewStaffDevice) { try { await admin.auth().revokeRefreshTokens(uid); } catch (error) { await logServerError('checkDeviceSession.revokeRefreshTokens', error, { userId: uid }); } try { await sendNewDeviceAlert({ email: normalizeEmail(profile.email) || null, pushToken: profile.pushToken || null, deviceId, ip }); } catch (error) {} } if (isStaffRole(profile.role)) await logAudit({ action: 'staff_login', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip, newDevice: verifiedNewStaffDevice } }); await checkIpAnomaly(db, uid, ip, { action: 'login', role: profile.role }); } else await logAudit({ action: 'device_switch_requested', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip } });
    return result;
  } catch (error) { if (error instanceof HttpsError) throw error; await logServerError('checkDeviceSession', error, { userId: uid }); throw new HttpsError('internal', 'Could not verify this device. Please try again.'); }
});

exports.confirmDeviceSwitch = onCall({ enforceAppCheck: true }, async (request) => {
  const db = getFirestore(); const data = request.data || {}; const hasVerificationToken = Boolean(data.phoneIdToken || data.emailIdToken); const uid = hasVerificationToken ? await resolveUidForVerification(request, db) : requireAuth(request); const deviceId = requireDeviceId(request); const ip = getClientIp(request); const { emailIdToken, emailOtp, phoneIdToken } = data; const ref = userRef(db, uid);
  try {
    const snap = await ref.get(); if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.'); const profile = snap.data(); const pending = profile.pendingDeviceApproval; if (!pending || pending.deviceId !== deviceId) throw new HttpsError('failed-precondition', 'No pending verification for this device. Please sign in again.');
    if (phoneIdToken) { try { await assertPhoneVerified(phoneIdToken, normalizePhone(profile.phone)); } catch (error) { throw new HttpsError('failed-precondition', error.message || 'Please verify your phone first.'); } }
    else if (emailOtp) await consumeStaffEmailOtp(db, uid, emailOtp, deviceId, pending.email);
    else { try { await assertEmailVerified(emailIdToken, pending.email); } catch (error) { throw new HttpsError('failed-precondition', error.message || 'Please verify the link sent to your email first.'); } }
    const id = sessionId(); await ref.update({ activeSessionId: id, activeDeviceId: deviceId, pendingDeviceApproval: null, pendingAdminEmailChallenge: FieldValue.delete(), trustedDevices: trustedMap(profile.trustedDevices, deviceId, ip, null), lastLoginAt: FieldValue.serverTimestamp() });
    try { await admin.auth().revokeRefreshTokens(uid); } catch (error) { await logServerError('confirmDeviceSwitch.revokeRefreshTokens', error, { userId: uid }); }
    await logAudit({ action: 'device_switch_confirmed', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip, method: phoneIdToken ? 'sms' : emailOtp ? 'email_otp' : 'email' } }); await checkIpAnomaly(db, uid, ip, { action: 'device_switch', role: profile.role }); try { await sendNewDeviceAlert({ email: normalizeEmail(profile.email) || null, pushToken: profile.pushToken || null, deviceId, ip }); } catch (error) {}
    return { sessionId: id };
  } catch (error) { if (error instanceof HttpsError) throw error; await logServerError('confirmDeviceSwitch', error, { userId: uid }); throw new HttpsError('internal', 'Could not verify this device. Please try again.'); }
});

exports.clearActiveSession = onCall({ enforceAppCheck: true }, async (request) => { const uid = requireAuth(request); const deviceId = requireDeviceId(request); const db = getFirestore(); try { await db.runTransaction(async (tx) => { const ref = userRef(db, uid); const snap = await tx.get(ref); if (!snap.exists) return; const data = snap.data(); const patch = {}; if (data.activeDeviceId === deviceId) { patch.activeSessionId = null; patch.activeDeviceId = null; } if (data.pendingDeviceApproval?.deviceId === deviceId) patch.pendingDeviceApproval = null; if (Object.keys(patch).length) tx.update(ref, patch); }); return { ok: true }; } catch (error) { await logServerError('clearActiveSession', error, { userId: uid }); return { ok: false }; } });

exports.listTrustedDevices = onCall({ enforceAppCheck: true }, async (request) => { const db = getFirestore(); const { uid, profile } = await requireStaff(request, db); const currentDeviceId = typeof request.data?.currentDeviceId === 'string' ? request.data.currentDeviceId.trim().slice(0, MAX_DEVICE_ID_LENGTH) : null; try { const trusted = profile.trustedDevices || {}; const devices = Object.keys(trusted).map((id) => ({ deviceId: id, label: trusted[id]?.label || null, ip: trusted[id]?.ip || null, lastIp: trusted[id]?.lastIp || trusted[id]?.ip || null, trustedAt: trusted[id]?.trustedAt?.toMillis?.() || null, lastSeenAt: trusted[id]?.lastSeenAt?.toMillis?.() || null, isCurrent: id === currentDeviceId })).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0)); return { devices }; } catch (error) { await logServerError('listTrustedDevices', error, { userId: uid }); throw new HttpsError('internal', 'Could not load trusted devices. Please try again.'); } });

exports.revokeTrustedDevice = onCall({ enforceAppCheck: true }, async (request) => { const db = getFirestore(); const { uid, profile } = await requireStaff(request, db); const deviceId = requireDeviceId(request); if (!profile.trustedDevices?.[deviceId]) return { ok: true }; try { await userRef(db, uid).update({ [`trustedDevices.${deviceId}`]: FieldValue.delete() }); await logAudit({ action: 'staff_trusted_device_revoked', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId } }); return { ok: true }; } catch (error) { await logServerError('revokeTrustedDevice', error, { userId: uid }); throw new HttpsError('internal', 'Could not remove this device. Please try again.'); } });
