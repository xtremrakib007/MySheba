// Single-device-login enforcement - SERVER side.
// Staff roles use one trusted-device gate: known device = password only;
// new/untrusted device = one verification challenge, then trusted.
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

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}
function requireDeviceId(request) {
  const deviceId = (request.data || {}).deviceId;
  if (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > MAX_DEVICE_ID_LENGTH) {
    throw new HttpsError('invalid-argument', 'Missing or invalid device id.');
  }
  return deviceId.trim();
}
function optionalDeviceLabel(request) {
  const label = (request.data || {}).deviceLabel;
  if (typeof label !== 'string') return null;
  const trimmed = label.trim();
  return trimmed ? trimmed.slice(0, MAX_DEVICE_LABEL_LENGTH) : null;
}
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
function normalizePhone(phone) { return String(phone || '').replace(/[^0-9]/g, ''); }
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function generateEmailOtp() { return String(crypto.randomInt(100000, 1000000)); }
function hashEmailOtp(code) { return crypto.createHash('sha256').update(String(code).trim()).digest('hex'); }
function generateSessionId() { return crypto.randomBytes(24).toString('hex'); }
function userRef(db, uid) { return db.collection('users').doc(uid); }
function isStaffRole(role) {
  return role === 'admin' || role === 'superadmin' || role === 'dealer' || role === 'reseller';
}
function withTrustedDevice(trustedDevices, deviceId, { ip, label }) {
  const now = Timestamp.now();
  const existing = (trustedDevices && trustedDevices[deviceId]) || null;
  const next = { ...(trustedDevices || {}), [deviceId]: {
    label: label || existing?.label || null,
    ip: existing?.ip || ip || null,
    lastIp: ip || existing?.lastIp || null,
    trustedAt: existing?.trustedAt || now,
    lastSeenAt: now,
  }};
  const keys = Object.keys(next);
  if (keys.length > MAX_TRUSTED_DEVICES) {
    const oldest = keys.filter((k) => k !== deviceId).sort((a, b) => {
      const at = next[a].lastSeenAt?.toMillis?.() || 0;
      const bt = next[b].lastSeenAt?.toMillis?.() || 0;
      return at - bt;
    })[0];
    if (oldest) delete next[oldest];
  }
  return next;
}
async function sendExpoPushBestEffort(message) {
  if (!message?.to) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify([{ sound: 'default', ...message }]),
    });
    if (!res.ok) console.error('[deviceSessionService] Expo push HTTP error', res.status, await res.text());
  } catch (e) { console.error('[deviceSessionService] Expo push send failed', e); }
}
function formatAlertTime() {
  try { return new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }); }
  catch (e) { return new Date().toISOString(); }
}
async function sendNewDeviceAlert({ email, pushToken, deviceId, ip }) {
  const when = formatAlertTime();
  const shortDeviceId = deviceId ? deviceId.slice(0, 8) : 'unknown';
  if (email) {
    const text = `Your MySheba account was just signed in on a new device (${when}, device ${shortDeviceId}${ip ? `, from IP ${ip}` : ''}). Your previous device has been signed out.\n\nIf this was you, no action is needed.\n\nIf this WASN'T you, change your password immediately or contact support.`;
    const html = `<p>Your MySheba account was just signed in on a new device.</p><p><b>When:</b> ${when}<br/><b>Device:</b> ${shortDeviceId}${ip ? `<br/><b>IP:</b> ${ip}` : ''}</p><p>Your previous device has been signed out.</p><p>If this was you, no action is needed.</p><p>If this <b>wasn't</b> you, change your password immediately or contact support.</p>`;
    try { await mailerService.sendEmail({ to: email, subject: 'New sign-in to your MySheba account', text, html, context: 'deviceSessionService.newDeviceAlert' }); } catch (e) {}
  }
  if (pushToken) await sendExpoPushBestEffort({ to: pushToken, title: 'New sign-in to your account', body: "Your MySheba account was just signed in on another device. Wasn't you? Secure your account from Settings.", data: { type: 'security_alert', reason: 'new_device' } });
}

async function sendStaffEmailChallenge({ db, uid, email, deviceId, displayName }) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) throw new HttpsError('failed-precondition', 'No valid email address is available for verification.');
  const ref = userRef(db, uid);
  const snap = await ref.get();
  const current = snap.exists ? snap.data() : {};
  const lastSent = current.pendingAdminEmailChallenge?.createdAt?.toMillis?.() || 0;
  if (Date.now() - lastSent < EMAIL_CHALLENGE_RESEND_MS) throw new HttpsError('resource-exhausted', 'Please wait a few seconds before requesting another verification email.');
  const code = generateEmailOtp();
  let link;
  try {
    link = await admin.auth().generateSignInWithEmailLink(normalizedEmail, {
      url: 'https://mysheba.top/verifyEmail', handleCodeInApp: true,
      android: { packageName: 'com.satulink.mysheba', installApp: true, minimumVersion: '1' },
    });
  } catch (err) {
    await logServerError('sendStaffEmailChallenge.generateLink', err, { userId: uid });
    throw new HttpsError('failed-precondition', 'Could not create the verification link. Please try again.');
  }
  await ref.update({ pendingAdminEmailChallenge: {
    deviceId, reason: 'new_device', email: normalizedEmail, codeHash: hashEmailOtp(code),
    createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + EMAIL_CHALLENGE_TTL_MS), attempts: 0,
  }});
  const greeting = String(displayName || '').trim() ? `Hello ${String(displayName).trim()},` : 'Hello,';
  const text = `${greeting}\n\nWe received a MySheba sign-in verification request.\n\nOpen this verification link:\n${link}\n\nOr enter this 6-digit code in the MySheba app:\n${code}\n\nThe code expires in 10 minutes.`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto"><h2>MySheba sign-in verification</h2><p>${greeting}</p><p><a href="${link}">Verify Sign-In</a></p><p><b>6-digit code:</b></p><div style="font-size:28px;font-weight:700;letter-spacing:8px;padding:14px;background:#f3f4f6;border-radius:8px;text-align:center">${code}</div><p>The code expires in 10 minutes.</p></div>`;
  await mailerService.sendEmail({ to: normalizedEmail, subject: 'MySheba sign-in verification — link + 6-digit code', text, html, context: 'deviceSessionService.staffEmailChallenge' });
}
function verifyEmailOtpChallenge(challenge, code, deviceId, email) {
  if (!challenge || challenge.deviceId !== deviceId) throw new HttpsError('failed-precondition', 'No active email verification challenge. Please request a new email.');
  if (normalizeEmail(challenge.email) !== normalizeEmail(email)) throw new HttpsError('failed-precondition', 'The verification email does not match this account.');
  if (!challenge.expiresAt?.toMillis || challenge.expiresAt.toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'That verification code expired. Request a new email.');
  if ((challenge.attempts || 0) >= EMAIL_CHALLENGE_MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new verification email.');
  if (hashEmailOtp(code) !== challenge.codeHash) throw new HttpsError('invalid-argument', 'Incorrect verification code.');
}

exports.checkDeviceSession = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  const deviceLabel = optionalDeviceLabel(request);
  const db = getFirestore();
  const ref = userRef(db, uid);
  const ip = getClientIp(request);

  try {
    const preSnap = await ref.get();
    if (!preSnap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const preData = preSnap.data();
    if (preData.suspended) throw new HttpsError('permission-denied', 'This account has been suspended. Please contact support.');

    const staff = isStaffRole(preData.role);
    if (staff) {
      const email = normalizeEmail(preData.email || '');
      const phone = normalizePhone(preData.phone || '');
      if (!email && !phone) throw new HttpsError('failed-precondition', 'This staff account has no phone number or email for new-device verification. Please contact support.');

      const trustedDevices = preData.trustedDevices || {};
      const trusted = Boolean(trustedDevices[deviceId]);
      const data = request.data || {};
      const phoneIdToken = data.phoneIdToken;
      const emailIdToken = data.emailIdToken;
      const emailOtp = data.emailOtp;
      const resendEmailChallenge = Boolean(data.resendEmailChallenge);

      if (!trusted) {
        let verified = false;
        let verifiedVia = null;
        if (phoneIdToken) {
          try { await assertPhoneVerified(phoneIdToken, phone); verified = true; verifiedVia = 'sms'; }
          catch (e) { throw new HttpsError('failed-precondition', e.message || 'Please verify your phone number first.'); }
        } else if (emailIdToken) {
          try { await assertEmailVerified(emailIdToken, email); verified = true; verifiedVia = 'email_link'; }
          catch (e) { throw new HttpsError('failed-precondition', e.message || 'Please verify your email address first.'); }
        } else if (emailOtp) {
          verifyEmailOtpChallenge(preData.pendingAdminEmailChallenge, emailOtp, deviceId, email);
          verified = true; verifiedVia = 'email_otp';
        }

        if (!verified) {
          if (email && (resendEmailChallenge || !preData.pendingAdminEmailChallenge)) {
            await sendStaffEmailChallenge({ db, uid, email, deviceId, displayName: preData.name || preData.displayName });
          }
          await logAudit({ action: 'staff_mfa_challenge', targetUid: uid, performedBy: uid, performedByRole: preData.role, details: { deviceId, ip, emailChallenge: Boolean(email) } });
          return { requiresOtp: true, reason: 'new_device', phone, email, availableMfaMethods: [phone && 'sms', email && 'email'].filter(Boolean), emailChallengeSent: Boolean(email) };
        }

        await ref.update({
          trustedDevices: withTrustedDevice(trustedDevices, deviceId, { ip, label: deviceLabel }),
          pendingAdminEmailChallenge: FieldValue.delete(),
        });
        await logAudit({ action: 'staff_device_trusted', targetUid: uid, performedBy: uid, performedByRole: preData.role, details: { deviceId, ip, verifiedVia } });
      } else {
        try { await ref.update({ trustedDevices: withTrustedDevice(trustedDevices, deviceId, { ip, label: deviceLabel }) }); }
        catch (e) { await logServerError('checkDeviceSession.refreshTrustedDevice', e, { userId: uid }); }
      }
    }

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
      const data = snap.data();
      if (data.suspended) throw new HttpsError('permission-denied', 'This account has been suspended. Please contact support.');

      if (!data.activeDeviceId || data.activeDeviceId === deviceId) {
        const sessionId = generateSessionId();
        tx.update(ref, { activeSessionId: sessionId, activeDeviceId: deviceId, pendingDeviceApproval: null, lastLoginAt: FieldValue.serverTimestamp() });
        return { requiresOtp: false, sessionId };
      }

      const email = normalizeEmail(data.email || '');
      if (!isValidEmail(email)) throw new HttpsError('failed-precondition', 'This account has no email on file, so a new device cannot be verified. Please contact support.');

      tx.update(ref, { pendingDeviceApproval: { deviceId, email, requestedAt: FieldValue.serverTimestamp() } });
      return { requiresOtp: true, reason: 'new_device', email };
    });

    if (result.requiresOtp) {
      await logAudit({ action: 'device_switch_requested', targetUid: uid, performedBy: uid, performedByRole: preData.role, details: { deviceId, ip } });
    } else {
      if (staff) await logAudit({ action: 'staff_login', targetUid: uid, performedBy: uid, performedByRole: preData.role, details: { deviceId, ip } });
      await checkIpAnomaly(db, uid, ip, { action: 'login', role: preData.role });
    }
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('checkDeviceSession', err, { userId: uid });
    throw new HttpsError('internal', 'Could not verify this device. Please try again.');
  }
});

exports.confirmDeviceSwitch = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  const ip = getClientIp(request);
  const { emailIdToken, emailOtp } = request.data || {};
  const db = getFirestore();
  const ref = userRef(db, uid);
  try {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const data = snap.data();
    const pending = data.pendingDeviceApproval;
    if (!pending || pending.deviceId !== deviceId) throw new HttpsError('failed-precondition', 'No pending verification for this device. Please sign in again.');

    let emailAuthUid;
    if (emailOtp) {
      verifyEmailOtpChallenge(data.pendingAdminEmailChallenge, emailOtp, deviceId, pending.email);
    } else {
      try { emailAuthUid = await assertEmailVerified(emailIdToken, pending.email); }
      catch (e) { throw new HttpsError('failed-precondition', e.message || 'Please verify the link sent to your email first.'); }
    }

    const sessionId = generateSessionId();
    const trustedDevices = data.trustedDevices || {};
    await ref.update({
      activeSessionId: sessionId,
      activeDeviceId: deviceId,
      pendingDeviceApproval: null,
      pendingAdminEmailChallenge: FieldValue.delete(),
      trustedDevices: withTrustedDevice(trustedDevices, deviceId, { ip, label: null }),
      lastLoginAt: FieldValue.serverTimestamp(),
    });
    try { await admin.auth().revokeRefreshTokens(uid); }
    catch (e) { await logServerError('confirmDeviceSwitch.revokeRefreshTokens', e, { userId: uid }); }
    await logAudit({ action: 'device_switch_confirmed', targetUid: uid, performedBy: uid, performedByRole: data.role, details: { deviceId, ip } });
    await checkIpAnomaly(db, uid, ip, { action: 'device_switch', role: data.role });
    try { await sendNewDeviceAlert({ email: normalizeEmail(data.email || '') || null, pushToken: data.pushToken || null, deviceId, ip }); }
    catch (e) { await logServerError('confirmDeviceSwitch.sendNewDeviceAlert', e, { userId: uid }); }
    if (emailAuthUid) await admin.auth().deleteUser(emailAuthUid).catch(() => {});
    return { sessionId };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('confirmDeviceSwitch', err, { userId: uid });
    throw new HttpsError('internal', 'Could not verify this device. Please try again.');
  }
});

exports.clearActiveSession = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  const db = getFirestore();
  const ref = userRef(db, uid);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      const patch = {};
      if (data.activeDeviceId === deviceId) { patch.activeSessionId = null; patch.activeDeviceId = null; }
      if (data.pendingDeviceApproval?.deviceId === deviceId) patch.pendingDeviceApproval = null;
      if (Object.keys(patch).length) tx.update(ref, patch);
    });
    return { ok: true };
  } catch (err) { await logServerError('clearActiveSession', err, { userId: uid }); return { ok: false }; }
});

exports.listTrustedDevices = onCall(async (request) => {
  const uid = requireAuth(request);
  const currentDeviceId = (request.data || {}).currentDeviceId || null;
  const db = getFirestore();
  try {
    const snap = await userRef(db, uid).get();
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const trustedDevices = snap.data().trustedDevices || {};
    const devices = Object.keys(trustedDevices).map((deviceId) => {
      const d = trustedDevices[deviceId] || {};
      return { deviceId, label: d.label || null, ip: d.ip || null, lastIp: d.lastIp || d.ip || null, trustedAt: d.trustedAt?.toMillis?.() || null, lastSeenAt: d.lastSeenAt?.toMillis?.() || null, isCurrent: deviceId === currentDeviceId };
    }).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    return { devices };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('listTrustedDevices', err, { userId: uid });
    throw new HttpsError('internal', 'Could not load trusted devices. Please try again.');
  }
});

exports.revokeTrustedDevice = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  const db = getFirestore();
  try {
    await userRef(db, uid).update({ [`trustedDevices.${deviceId}`]: FieldValue.delete() });
    await logAudit({ action: 'staff_trusted_device_revoked', targetUid: uid, performedBy: uid, performedByRole: null, details: { deviceId } });
    return { ok: true };
  } catch (err) {
    await logServerError('revokeTrustedDevice', err, { userId: uid });
    throw new HttpsError('internal', 'Could not remove this device. Please try again.');
  }
});
