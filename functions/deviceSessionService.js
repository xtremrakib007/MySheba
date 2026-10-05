// Server-side single-device sessions and trusted-device verification.
// Policy: staff known device = password only; staff new device = user-requested OTP/link challenge.
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
// A phone and a browser each get their own session slot; two phones share one.
const { platformOf, signInUpdate, signOutEverywhere } = require('./sessionSlots');
const { webTrustDecision, WEB_TRUST_DAYS } = require('./deviceTrust');
const { approvalDecision, responseDecision, newRequest } = require('./webSignInApproval');
const { sendExpoPush } = require('./expoPush');

const MAX_DEVICE_ID_LENGTH = 100;
const MAX_DEVICE_LABEL_LENGTH = 80;
// Five was too few once a person has a phone AND a browser, and a browser is
// not one thing: a second browser profile, a private window that was allowed to
// keep its storage, a laptop at home and one at work are each a separate id.
// Reaching the cap evicts the least recently seen - which, for somebody who
// lives in the web console, is their own phone, and the next app sign-in then
// asks for a code. Ten costs nothing: the map is a handful of fields on one
// document, and each entry still has to have passed the challenge to be there.
const MAX_TRUSTED_DEVICES = 10;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EMAIL_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CHALLENGE_RESEND_MS = 30 * 1000;
const EMAIL_CHALLENGE_MAX_ATTEMPTS = 5;

const requireAuth = (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
};
const requireDeviceId = (request) => {
  const value = request.data?.deviceId;
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_DEVICE_ID_LENGTH) {
    throw new HttpsError('invalid-argument', 'Missing or invalid device id.');
  }
  return value.trim();
};
const deviceLabel = (request) => {
  const value = request.data?.deviceLabel;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_DEVICE_LABEL_LENGTH) : null;
};
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').replace(/[^0-9]/g, '');
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
const otp = () => String(crypto.randomInt(100000, 1000000));
const otpHash = (value) => crypto.createHash('sha256').update(String(value).trim()).digest('hex');
const sessionId = () => crypto.randomBytes(24).toString('hex');
const userRef = (db, uid) => db.collection('users').doc(uid);
const isStaffRole = (role) => ['admin', 'superadmin', 'dealer', 'reseller'].includes(role);

/**
 * Does a staff sign-in still need the new-device email/SMS challenge?
 *
 * Three ways to be past it: not staff at all, this is already the active
 * device, or this device is in trustedDevices - which is the record written
 * once the email/SMS challenge has been passed. Missing the last of those
 * turned the rule into "one device at a time" and re-challenged a verified
 * phone every time its owner had last used their laptop.
 *
 * Pure, and exported, so the decision can be tested without a transaction.
 */
/**
 * Put the question on the account owner's phone.
 *
 * Best effort by design: if there is no push token, or Expo refuses it, the
 * emailed code is still waiting and sign-in is not blocked. Returning whether
 * it went lets the browser say "check your phone" only when something was
 * actually sent.
 */
async function requestAppApproval({ db, ref, uid, profile, deviceId, label, ip }) {
  try {
    // A request already on this phone, for this browser, still unanswered and
    // still inside its window, is the one to leave alone. The browser polls
    // while it waits, and without this every poll would overwrite the request
    // the person is looking at and buzz the phone again - the same reason
    // ensureEmailChallenge leaves a live code in the inbox alone.
    if (approvalDecision(profile && profile.pendingWebApproval, { deviceId, nowMs: Date.now() }).retryable) {
      return true;
    }

    const request = newRequest({
      deviceId,
      label,
      ip,
      approvalId: crypto.randomBytes(16).toString('hex'),
      nowMs: Date.now(),
    });
    await ref.update({ pendingWebApproval: request });

    const token = profile && profile.pushToken;
    if (!token || profile?.notifPrefs?.pushEnabled === false) return false;
    const where = [request.label, request.ip].filter(Boolean).join(' \u00b7 ');
    const push = await sendExpoPush([{
      to: token,
      title: 'Approve web sign-in?',
      body: where ? ('Someone is signing in to the admin site: ' + where) : 'Someone is signing in to the admin site.',
      // The app opens the prompt from this, and the id is what it answers with.
      data: { type: 'web_signin_approval', approvalId: request.approvalId, label: request.label, ip: request.ip },
    }]);
    return push.accepted > 0;
  } catch (error) {
    // Never block a sign-in on this. The emailed code is the path that must
    // always work.
    console.error('Could not ask the phone to approve a web sign-in', error);
    return false;
  }
}

const staffNeedsDeviceChallenge = (profile, deviceId) => (
  isStaffRole(profile && profile.role)
  && (profile && profile.activeDeviceId) !== deviceId
  && !(profile && profile.trustedDevices && profile.trustedDevices[deviceId])
);
const isActiveAccount = (profile) => !!profile
  && profile.mergedInto == null
  && profile.suspended !== true
  && profile.inactive !== true
  && profile.disabled !== true
  && profile.active !== false;

async function resolveUidForVerification(request, db) {
  if (request.auth?.uid) {
    const requestedUid = String(request.data?.uid || '').trim();
    if (requestedUid && requestedUid !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'The verification account does not match the signed-in account.');
    }
    return request.auth.uid;
  }

  const requestedUid = String(request.data?.uid || '').trim();
  const phoneIdToken = String(request.data?.phoneIdToken || '').trim();
  const emailIdToken = String(request.data?.emailIdToken || '').trim();
  if (!requestedUid || (!phoneIdToken && !emailIdToken)) {
    throw new HttpsError('unauthenticated', 'You must be signed in or provide a valid verification token.');
  }

  const snap = await userRef(db, requestedUid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
  const profile = snap.data();
  if (!isActiveAccount(profile)) throw new HttpsError('permission-denied', 'This account is not active.');

  try {
    if (phoneIdToken) {
      const phone = normalizePhone(profile.phone);
      if (!phone) throw new Error('This account has no phone number for SMS verification.');
      await assertPhoneVerified(phoneIdToken, phone);
    } else {
      const email = normalizeEmail(profile.email);
      if (!validEmail(email)) throw new Error('This account has no valid email for verification.');
      await assertEmailVerified(emailIdToken, email);
    }
  } catch (error) {
    throw new HttpsError('failed-precondition', error.message || 'The verification token is invalid.');
  }
  return requestedUid;
}

function trustedMap(current, id, ip, label, { verified = false } = {}) {
  const now = Timestamp.now();
  const old = current?.[id] || {};
  const next = {
    ...(current || {}),
    [id]: {
      label: label || old.label || null,
      ip: old.ip || ip || null,
      lastIp: ip || old.lastIp || null,
      trustedAt: old.trustedAt || now,
      lastSeenAt: now,
      // Moved only by a real second factor. lastSeenAt moves whenever the
      // device is used, so a window measured from it would renew itself for
      // whoever is holding the browser - including somebody who should not be.
      verifiedAt: verified ? now : (old.verifiedAt || null),
    },
  };
  const ids = Object.keys(next);
  while (ids.length > MAX_TRUSTED_DEVICES) {
    const candidates = Object.keys(next).filter((key) => key !== id);
    const oldest = candidates.sort((a, b) =>
      (next[a].lastSeenAt?.toMillis?.() || 0) - (next[b].lastSeenAt?.toMillis?.() || 0)
    )[0];
    if (!oldest) break;
    delete next[oldest];
    ids.splice(ids.indexOf(oldest), 1);
  }
  return next;
}

async function sendPush(message) {
  if (!message?.to) return;
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify([{ sound: 'default', ...message }]),
    });
    if (!response.ok) console.error('[deviceSessionService] push failed', response.status);
  } catch (error) { console.error('[deviceSessionService] push error', error); }
}

async function sendNewDeviceAlert({ email, pushToken, deviceId, ip }) {
  const when = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });
  const shortId = String(deviceId || '').slice(0, 8) || 'unknown';
  if (email) {
    const text = `Your MySheba account was signed in on a new device.\n\nTime: ${when}\nDevice: ${shortId}${ip ? `\nIP: ${ip}` : ''}\n\nIf this was not you, change your password and contact support.`;
    try {
      await mailerService.sendEmail({
        to: email,
        subject: 'New sign-in to your MySheba account',
        text,
        html: `<p>Your MySheba account was signed in on a new device.</p><p><b>Time:</b> ${when}<br><b>Device:</b> ${shortId}${ip ? `<br><b>IP:</b> ${ip}` : ''}</p><p>If this was not you, change your password and contact support.</p>`,
        context: 'deviceSessionService.newDeviceAlert',
      });
    } catch (error) { await logServerError('sendNewDeviceAlert.email', error, {}); }
  }
  await sendPush({ to: pushToken, title: 'New sign-in to your account', body: 'Your MySheba account was signed in on another device.', data: { type: 'security_alert', reason: 'new_device' } });
}

async function sendStaffEmailChallenge({ db, uid, email, deviceId, displayName }) {
  const normalized = normalizeEmail(email);
  if (!validEmail(normalized)) throw new HttpsError('failed-precondition', 'No valid email address is available for new-device verification.');
  const ref = userRef(db, uid);
  const snap = await ref.get();
  const previous = snap.data()?.pendingAdminEmailChallenge;
  const lastSent = previous?.createdAt?.toMillis?.() || 0;
  if (Date.now() - lastSent < EMAIL_CHALLENGE_RESEND_MS) {
    throw new HttpsError('resource-exhausted', 'Please wait before requesting another verification email.');
  }
  const code = otp();
  let link;
  try {
    link = await admin.auth().generateSignInWithEmailLink(normalized, {
      url: 'https://mysheba.top/verifyEmail',
      handleCodeInApp: true,
      android: { packageName: 'com.satulink.mysheba', installApp: true, minimumVersion: '1' },
    });
  } catch (error) {
    // Best-effort. The link is a convenience - tap it instead of typing -
    // but the 6-digit code alone completes the flow. Throwing here meant a
    // link-generation failure sent no email at all, and since this is the
    // challenge a customer needs to sign in on a new phone, that left them
    // with no way through. Send the code without the link instead.
    await logServerError('sendStaffEmailChallenge.generateLink', error, { userId: uid });
    link = null;
  }
  await ref.update({ pendingAdminEmailChallenge: {
    deviceId,
    reason: 'new_device',
    email: normalized,
    codeHash: otpHash(code),
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + EMAIL_CHALLENGE_TTL_MS),
    attempts: 0,
  }});
  const greeting = String(displayName || '').trim() ? `Hello ${String(displayName).trim()},` : 'Hello,';
  await mailerService.sendEmail({
    to: normalized,
    subject: 'MySheba new-device verification',
    // The code is the part that always works; the link is included only
    // when one was generated, so a link failure degrades the mail rather
    // than replacing it with nothing.
    text: `${greeting}\n\nYour MySheba verification code is: ${code}\n\nEnter it in the app to verify this device.${link ? `\n\nOr open this link on that device:\n${link}` : ''}\n\nThe code expires in 10 minutes.`,
    html: `<h2>MySheba new-device verification</h2><p>${greeting}</p><p><b>Your 6-digit code:</b></p><div style="font-size:26px;font-weight:700;letter-spacing:6px">${code}</div>${link ? `<p><a href="${link}">Or verify this device</a></p>` : ''}<p>The code expires in 10 minutes.</p>`,
    context: 'deviceSessionService.staffEmailChallenge',
  });
}

/**
 * Send the new-device code unless one is already live for this device.
 *
 * Both callers used to gate this on `data.resendEmailChallenge`, and
 * nothing sets that on a first sign-in: authService.login() does not pass
 * it, and DeviceVerifyScreen only passes it when the person taps Resend.
 * So the first challenge mailed nothing - the app showed "enter the code we
 * emailed you" over an inbox with no email in it, and the only way through
 * was to guess that Resend sent the first one.
 *
 * Returns whether an email actually went out, which is what the client
 * reports on the verification screen.
 */
async function ensureEmailChallenge({ db, uid, email, deviceId, displayName, pending, force }) {
  if (!email) return false;
  const live =
    pending?.deviceId === deviceId && pending?.expiresAt?.toMillis?.() > Date.now();
  // A live code is left alone, so retrying a login does not invalidate the
  // one already sitting in the inbox.
  if (live && !force) return false;
  try {
    await sendStaffEmailChallenge({ db, uid, email, deviceId, displayName });
    return true;
  } catch (error) {
    // resource-exhausted only means one went out moments ago, so the code
    // they need is already on its way and the verification screen should
    // still open. Anything else is a real failure and still throws.
    if (error?.code === 'resource-exhausted') return false;
    throw error;
  }
}

function verifyStaffEmailOtp(challenge, code, deviceId, email) {
  if (!challenge || challenge.deviceId !== deviceId) throw new HttpsError('failed-precondition', 'No active verification challenge. Please request a new email.');
  if (normalizeEmail(challenge.email) !== normalizeEmail(email)) throw new HttpsError('failed-precondition', 'The verification email does not match this account.');
  if (!challenge.expiresAt?.toMillis || challenge.expiresAt.toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'That verification code expired.');
  if ((challenge.attempts || 0) >= EMAIL_CHALLENGE_MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new verification email.');
  if (!/^\d{6}$/.test(String(code || '').trim()) || otpHash(code) !== challenge.codeHash) throw new HttpsError('invalid-argument', 'Incorrect verification code.');
}

exports.checkDeviceSession = onCall({ enforceAppCheck: false }, async (request) => {
  const db = getFirestore();
  const data = request.data || {};
  const hasVerificationToken = Boolean(data.phoneIdToken || data.emailIdToken);
  const uid = hasVerificationToken ? await resolveUidForVerification(request, db) : requireAuth(request);
  const deviceId = requireDeviceId(request);
  // Absent means mobile: every app build shipped before this sends no platform
  // at all, and giving them a slot of their own would let any number of phones
  // hold a session at once.
  const platform = platformOf(request.data?.platform);
  const label = deviceLabel(request);
  const ip = getClientIp(request);
  const ref = userRef(db, uid);
  try {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const profile = snap.data();
    if (!isActiveAccount(profile)) throw new HttpsError('permission-denied', 'This account is not active.');

    // Every sign-in is verified with a one-time code. Every role, every
    // device, trusted or not.
    //
    // This used to run only for staff, and only when trustedDevices had no
    // entry for this device - so a returning phone signed in on the password
    // alone. The rule asked for is the stronger one: once someone has logged
    // out, getting back in takes the password AND a code, wherever they are.
    // Staying signed in is what avoids the code, and that is now reliable
    // enough to lean on - the session survives closing the app, so a code is
    // only ever asked for at a real sign-in, not on every launch.
    //
    // A customer's profile.email is a real, verified inbox: registration
    // requires and verifies one (functions/customerRegistration.js:134). The
    // <digits>@mysheba.app address is only Firebase Auth's internal login
    // handle and is never what is written to the profile, so a code sent here
    // reaches a person for every role.
    //
    // ...with one exception, and only in a browser. trustedDevices stopped
    // deciding whether a code was required; for web it decides again, inside a
    // window: a browser verified in the last WEB_TRUST_DAYS is remembered and
    // not asked again. A phone still cannot skip, whatever it has stored - see
    // deviceTrust.js, where the rule is a pure function and the reason is
    // written down.
    const webTrust = webTrustDecision(profile, { deviceId, platform, nowMs: Date.now() });

    let verifiedNewStaffDevice = false;
    let verificationMethod = null;
    if (webTrust.ok) {
      verifiedNewStaffDevice = true;
      verificationMethod = 'remembered_browser';
      // lastSeenAt moves; verifiedAt does not, so being here does not extend
      // the window - at the end of it a code is asked for again.
      await ref.update({ trustedDevices: trustedMap(profile.trustedDevices, deviceId, ip, label) });
      await logAudit({ action: 'login_remembered_browser', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip, expiresAt: webTrust.expiresAtMs } });
    } else {
      const email = normalizeEmail(profile.email);
      const phone = normalizePhone(profile.phone);
      if (!email && !phone) throw new HttpsError('failed-precondition', 'This account has no email or phone for sign-in verification. Please contact support.');

      {
        if (data.phoneIdToken) {
          try { await assertPhoneVerified(data.phoneIdToken, phone); } catch (error) { throw new HttpsError('failed-precondition', error.message || 'Please verify your phone first.'); }
          verifiedNewStaffDevice = true; verificationMethod = 'sms';
        } else if (data.emailIdToken) {
          try { await assertEmailVerified(data.emailIdToken, email); } catch (error) { throw new HttpsError('failed-precondition', error.message || 'Please verify your email first.'); }
          verifiedNewStaffDevice = true; verificationMethod = 'email_link';
        } else if (data.emailOtp) {
          verifyStaffEmailOtp(profile.pendingAdminEmailChallenge, data.emailOtp, deviceId, email);
          verifiedNewStaffDevice = true; verificationMethod = 'email_otp';
        } else if (approvalDecision(profile.pendingWebApproval, { deviceId, nowMs: Date.now() }).ok) {
          // Somebody tapped Approve on the phone. The same second factor as the
          // emailed code - proof of something the account owner holds - and the
          // decision that it counts lives in webSignInApproval.js, tied to this
          // exact browser and to a five-minute window.
          verifiedNewStaffDevice = true; verificationMethod = 'app_approval';
          await ref.update({ pendingWebApproval: FieldValue.delete() });
        } else {
          // Send the code on the FIRST challenge, not only on a resend.
          //
          // This used to be `if (data.resendEmailChallenge)`, and nothing
          // sets that on a first sign-in - authService.login() does not
          // pass it, and DeviceVerifyScreen only passes it when the person
          // taps Resend. So an admin signing in on a new device was shown a
          // "enter the code we emailed you" screen and no email was ever
          // sent. They had to guess that Resend was what sent the first one.
          //
          // A live challenge for this same device is left alone, so
          // retrying a login does not invalidate the code already sitting
          // in the inbox.
          const emailChallengeSent = await ensureEmailChallenge({
            db,
            uid,
            email,
            deviceId,
            displayName: profile.name || profile.displayName,
            pending: profile.pendingAdminEmailChallenge,
            force: Boolean(data.resendEmailChallenge),
          });
          // And ask the phone. A live request there is both a faster way in and a
          // warning, in the one place the account owner will see it, that
          // somebody is signing in as them right now.
          const askedApp = await requestAppApproval({ db, ref, uid, profile, deviceId, label, ip });
          await logAudit({ action: 'login_mfa_challenge', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip, emailChallengeSent, askedApp } });
          return { requiresOtp: true, reason: 'login_verification', email, phone, availableMfaMethods: [phone && 'sms', email && 'email'].filter(Boolean), emailChallengeSent, appApprovalSent: askedApp };
        }
      }

      if (verifiedNewStaffDevice) {
        const trustedDevices = trustedMap(profile.trustedDevices, deviceId, ip, label, { verified: true });
        await ref.update({ trustedDevices, pendingAdminEmailChallenge: FieldValue.delete() });
        await logAudit({ action: 'device_verified', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip, verificationMethod } });
      }
    }

    const result = await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(ref);
      if (!currentSnap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
      const current = currentSnap.data();
      if (!isActiveAccount(current)) throw new HttpsError('permission-denied', 'This account is not active.');

      if (verifiedNewStaffDevice) {
        const id = sessionId();
        tx.update(ref, { ...signInUpdate(current, platform, { sessionId: id, deviceId }), pendingDeviceApproval: null, lastLoginAt: FieldValue.serverTimestamp() });
        return { requiresOtp: false, sessionId: id, switchedDevice: Boolean(current.activeDeviceId && current.activeDeviceId !== deviceId) };
      }

      // Staff accounts must not get a password-only first/new-browser login merely
      // because no activeDeviceId exists yet. A staff device is trusted only after
      // the email/SMS verification above - which is what trustedDevices records -
      // or when it is already the active device.
      //
      // That trustedDevices check used to be missing here, and activeDeviceId is a
      // single slot, so the rule came out as "one device at a time" rather than "a
      // device you have verified". A staff member with a phone and a laptop was
      // challenged on every single switch: the branch at the top of this function
      // sees the device IS trusted and correctly skips the challenge, which leaves
      // verifiedNewStaffDevice false, and then this line challenged it anyway. The
      // code was sent, entered, and the next switch asked again.
      //
      // Reaching here with verifiedNewStaffDevice false already implies the device
      // is trusted - the branch above returns the challenge otherwise - so reading
      // trustedDevices back is what that branch decided, not a weaker rule. It is
      // re-read inside the transaction rather than taken from the earlier snapshot
      // so a revoked device cannot slip through on a stale read.
      if (staffNeedsDeviceChallenge(current, deviceId)) {
        const email = normalizeEmail(current.email);
        if (!validEmail(email)) throw new HttpsError('failed-precondition', 'This account has no email for new-device verification. Please contact support.');
        tx.update(ref, { pendingDeviceApproval: { deviceId, email, requestedAt: FieldValue.serverTimestamp() } });
        return { requiresOtp: true, reason: 'new_device', email, availableMfaMethods: ['email'] };
      }

      // A device this account has already verified stays verified.
      // confirmDeviceSwitch writes trustedDevices for every role, but only
      // the staff path above reads it back, so for everyone else the entry
      // is dead data and the decision falls to activeDeviceId alone - a
      // single slot. That makes the rule "one device at a time" rather than
      // "a device you have verified": any account whose last sign-in was on
      // another phone is challenged again, every time. The staff branch
      // above still runs first, so this does not weaken staff MFA.
      const deviceTrusted = Boolean(current.trustedDevices?.[deviceId]);
      if (!current.activeDeviceId || current.activeDeviceId === deviceId || deviceTrusted) {
        const id = sessionId();
        const patch = { ...signInUpdate(current, platform, { sessionId: id, deviceId }), pendingDeviceApproval: null, lastLoginAt: FieldValue.serverTimestamp() };
        // Keep lastSeenAt current so the Trusted Devices list stays
        // meaningful and trustedMap evicts the genuinely stale entry at the
        // cap rather than an active one.
        if (deviceTrusted) patch.trustedDevices = trustedMap(current.trustedDevices, deviceId, ip, label);
        tx.update(ref, patch);
        return { requiresOtp: false, sessionId: id, trustedDevice: deviceTrusted };
      }

      const email = normalizeEmail(current.email);
      if (!validEmail(email)) throw new HttpsError('failed-precondition', 'This account has no email for new-device verification. Please contact support.');
      tx.update(ref, { pendingDeviceApproval: { deviceId, email, requestedAt: FieldValue.serverTimestamp() } });
      return { requiresOtp: true, reason: 'new_device', email, availableMfaMethods: ['email'] };
    });

    if (!result.requiresOtp) {
      if (verifiedNewStaffDevice) {
        // No revokeRefreshTokens here. It used to sit on this line, and it
        // ended the session it had just created.
        //
        // revokeRefreshTokens(uid) sets tokensValidAfterTime to now and kills
        // every refresh token issued BEFORE that instant - including the one
        // this device got from signInWithPassword a second or two ago. There
        // is no way to exclude the caller; the API is all or nothing. The ID
        // token already in memory stays good for up to an hour, so the app
        // looked fine, and then the first time the SDK had to refresh - which
        // is what closing and reopening the app forces - the refresh was
        // rejected, Firebase reported no user, and the person was back on the
        // login screen. That is the "closed the app and it logged me out"
        // report, and no client change could have fixed it.
        //
        // Kicking the other devices is still done, by the activeDeviceId and
        // activeSessionId written just above: shouldEndSessionForDevice ends
        // a session whose device is no longer the active one. An admin who
        // wants to force someone out immediately still has adminForceLogout,
        // which revokes deliberately and is not signing anyone in.
        try { await sendNewDeviceAlert({ email: normalizeEmail(profile.email) || null, pushToken: profile.pushToken || null, deviceId, ip }); } catch (error) {}
      }
      if (isStaffRole(profile.role)) await logAudit({ action: 'staff_login', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip, newDevice: verifiedNewStaffDevice } });
      await checkIpAnomaly(db, uid, ip, { action: 'login', role: profile.role });
    } else {
      // Actually send the code - on the first challenge, not only on a
      // resend. sendDeviceVerification - the one other
      // function that mails a device code - is exported from index.js and
      // called from nowhere in the app. So a non-staff account raised a
      // challenge it was never sent: DeviceVerifyScreen reported the mail as
      // sent, none existed, and confirmDeviceSwitch had no challenge to
      // match a code against. There was no path through.
      //
      // sendStaffEmailChallenge is staff-only in its name; it writes
      // pendingAdminEmailChallenge, which confirmDeviceSwitch's emailOtp
      // path already validates for every role.
      if (!isStaffRole(profile.role) && result.email) {
        result.emailChallengeSent = await ensureEmailChallenge({
          db,
          uid,
          email: result.email,
          deviceId,
          displayName: profile.name || profile.displayName,
          pending: profile.pendingAdminEmailChallenge,
          force: Boolean(data.resendEmailChallenge),
        });
      }
      await logAudit({ action: 'device_switch_requested', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip } });
    }
    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('checkDeviceSession', error, { userId: uid });
    throw new HttpsError('internal', 'Could not verify this device. Please try again.');
  }
});

exports.confirmDeviceSwitch = onCall({ enforceAppCheck: false }, async (request) => {
  const db = getFirestore();
  const data = request.data || {};
  const hasVerificationToken = Boolean(data.phoneIdToken || data.emailIdToken);
  const uid = hasVerificationToken ? await resolveUidForVerification(request, db) : requireAuth(request);
  const deviceId = requireDeviceId(request);
  // Absent means mobile: every app build shipped before this sends no platform
  // at all, and giving them a slot of their own would let any number of phones
  // hold a session at once.
  const platform = platformOf(request.data?.platform);
  const ip = getClientIp(request);
  const { emailIdToken, emailOtp, phoneIdToken } = data;
  const ref = userRef(db, uid);
  try {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const profile = snap.data();
    if (!isActiveAccount(profile)) throw new HttpsError('permission-denied', 'This account is not active.');
    const pending = profile.pendingDeviceApproval;
    if (!pending || pending.deviceId !== deviceId) throw new HttpsError('failed-precondition', 'No pending verification for this device. Please sign in again.');

    if (phoneIdToken) {
      try { await assertPhoneVerified(phoneIdToken, normalizePhone(profile.phone)); }
      catch (error) { throw new HttpsError('failed-precondition', error.message || 'Please verify your phone first.'); }
    } else if (emailOtp) {
      verifyStaffEmailOtp(profile.pendingAdminEmailChallenge, emailOtp, deviceId, pending.email);
    } else {
      try { await assertEmailVerified(emailIdToken, pending.email); }
      catch (error) { throw new HttpsError('failed-precondition', error.message || 'Please verify the link sent to your email first.'); }
    }

    const id = sessionId();
    await ref.update({
      ...signInUpdate(profile, platform, { sessionId: id, deviceId }),
      pendingDeviceApproval: null,
      pendingAdminEmailChallenge: FieldValue.delete(),
      trustedDevices: trustedMap(profile.trustedDevices, deviceId, ip, null, { verified: true }),
      lastLoginAt: FieldValue.serverTimestamp(),
    });
    // Same reason as checkDeviceSession above: revoking here would kill the
    // refresh token this device was issued moments ago, and the sign-in it
    // just confirmed would not survive the next app restart.
    await logAudit({ action: 'device_switch_confirmed', targetUid: uid, performedBy: uid, performedByRole: profile.role, details: { deviceId, ip, method: phoneIdToken ? 'sms' : 'email' } });
    await checkIpAnomaly(db, uid, ip, { action: 'device_switch', role: profile.role });
    try { await sendNewDeviceAlert({ email: normalizeEmail(profile.email) || null, pushToken: profile.pushToken || null, deviceId, ip }); } catch (error) {}
    return { sessionId: id };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('confirmDeviceSwitch', error, { userId: uid });
    throw new HttpsError('internal', 'Could not verify this device. Please try again.');
  }
});

exports.clearActiveSession = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  // Absent means mobile: every app build shipped before this sends no platform
  // at all, and giving them a slot of their own would let any number of phones
  // hold a session at once.
  const platform = platformOf(request.data?.platform);
  const db = getFirestore();
  try {
    await db.runTransaction(async (tx) => {
      const ref = userRef(db, uid);
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      const patch = {};
      if (data.activeDeviceId === deviceId) { patch.activeSessionId = null; patch.activeDeviceId = null; }
      if (data.pendingDeviceApproval?.deviceId === deviceId) patch.pendingDeviceApproval = null;
      if (Object.keys(patch).length) tx.update(ref, patch);
    });
    return { ok: true };
  } catch (error) { await logServerError('clearActiveSession', error, { userId: uid }); return { ok: false }; }
});

exports.listTrustedDevices = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const currentDeviceId = request.data?.currentDeviceId || null;
  const db = getFirestore();
  try {
    const snap = await userRef(db, uid).get();
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    if (!isActiveAccount(snap.data())) throw new HttpsError('permission-denied', 'This account is not active.');
    const trusted = snap.data().trustedDevices || {};
    const devices = Object.keys(trusted).map((id) => ({
      deviceId: id,
      label: trusted[id]?.label || null,
      ip: trusted[id]?.ip || null,
      lastIp: trusted[id]?.lastIp || trusted[id]?.ip || null,
      trustedAt: trusted[id]?.trustedAt?.toMillis?.() || null,
      lastSeenAt: trusted[id]?.lastSeenAt?.toMillis?.() || null,
      isCurrent: id === currentDeviceId,
    })).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    return { devices };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('listTrustedDevices', error, { userId: uid });
    throw new HttpsError('internal', 'Could not load trusted devices. Please try again.');
  }
});

exports.revokeTrustedDevice = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  // Absent means mobile: every app build shipped before this sends no platform
  // at all, and giving them a slot of their own would let any number of phones
  // hold a session at once.
  const platform = platformOf(request.data?.platform);
  const db = getFirestore();
  try {
    let wasActive = false;
    await db.runTransaction(async (tx) => {
      const ref = userRef(db, uid);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
      const data = snap.data();
      if (!isActiveAccount(data)) throw new HttpsError('permission-denied', 'This account is not active.');
      wasActive = data.activeDeviceId === deviceId;
      const patch = { [`trustedDevices.${deviceId}`]: FieldValue.delete() };
      if (wasActive) {
        patch.activeSessionId = null;
        patch.activeDeviceId = null;
      }
      if (data.pendingDeviceApproval?.deviceId === deviceId) patch.pendingDeviceApproval = null;
      tx.update(ref, patch);
    });
    if (wasActive) {
      try { await admin.auth().revokeRefreshTokens(uid); }
      catch (error) { await logServerError('revokeTrustedDevice.revokeRefreshTokens', error, { userId: uid }); }
    }
    await logAudit({ action: 'staff_trusted_device_revoked', targetUid: uid, performedBy: uid, performedByRole: null, details: { deviceId, wasActive } });
    return { ok: true, wasActive };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('revokeTrustedDevice', error, { userId: uid });
    throw new HttpsError('internal', 'Could not remove this device. Please try again.');
  }
});

// The original OTP verifier checks an attempt ceiling, but the legacy flow did
// not increment the stored counter. Wrap the callable so every email-OTP
// attempt is counted atomically before the verifier runs. This keeps the
// existing verification/link flow intact while making the five-attempt limit
// effective against repeated guesses.
// These three layers wrap checkDeviceSession/confirmDeviceSwitch by capturing
// the previous export and delegating to it. The delegation must use .run().
//
// onCall() does not return the handler - it returns an Express-style request
// handler with the handler attached as .run(). Calling it directly passes a
// CallableRequest where it expects (req, res), so it throws
// `TypeError: Cannot read properties of undefined (reading 'on')` before the
// inner handler ever executes. Every call to checkDeviceSession failed this
// way: the outer layer logged "Callable request verification passed" and then
// died on the very next line.
// These layers wrap checkDeviceSession/confirmDeviceSwitch by capturing the
// previous export and delegating to it. The delegation must use .run().
//
// onCall() does not return the handler - it returns an Express-style request
// handler with the handler attached as .run(). Calling it directly passes a
// CallableRequest where (req, res) is expected, so it throws
// "TypeError: Cannot read properties of undefined (reading 'on')" before the
// inner handler ever runs. Every call to checkDeviceSession died this way:
// the outer layer logged "Callable request verification passed" and then
// failed on the very next line.
const originalCheckDeviceSession = exports.checkDeviceSession;
exports.checkDeviceSession = onCall({ enforceAppCheck: false }, async (request) => {
  const data = request.data || {};
  if (!data.emailOtp) return originalCheckDeviceSession.run(request);

  const db = getFirestore();
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  // Absent means mobile: every app build shipped before this sends no platform
  // at all, and giving them a slot of their own would let any number of phones
  // hold a session at once.
  const platform = platformOf(request.data?.platform);
  const ref = userRef(db, uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    if (!isActiveAccount(snap.data())) throw new HttpsError('permission-denied', 'This account is not active.');
    const challenge = snap.data().pendingAdminEmailChallenge;
    if (!challenge || challenge.deviceId !== deviceId) {
      throw new HttpsError('failed-precondition', 'No active verification challenge. Please request a new email.');
    }
    const attempts = Number(challenge.attempts || 0);
    if (attempts >= EMAIL_CHALLENGE_MAX_ATTEMPTS) {
      throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new verification email.');
    }
    tx.update(ref, { 'pendingAdminEmailChallenge.attempts': attempts + 1 });
  });
  return originalCheckDeviceSession.run(request);
});

// confirmDeviceSwitch uses the same email challenge verifier but is a separate
// callable, so the checkDeviceSession wrapper above cannot count its guesses.
// Count every email-OTP attempt atomically before verification, with the same
// five-attempt ceiling and challenge/device binding.
const originalConfirmDeviceSwitch = exports.confirmDeviceSwitch;
exports.confirmDeviceSwitch = onCall({ enforceAppCheck: false }, async (request) => {
  const data = request.data || {};
  if (!data.emailOtp) return originalConfirmDeviceSwitch.run(request);

  const db = getFirestore();
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  // Absent means mobile: every app build shipped before this sends no platform
  // at all, and giving them a slot of their own would let any number of phones
  // hold a session at once.
  const platform = platformOf(request.data?.platform);
  const ref = userRef(db, uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    if (!isActiveAccount(snap.data())) throw new HttpsError('permission-denied', 'This account is not active.');
    const profile = snap.data();
    const pending = profile.pendingDeviceApproval;
    const challenge = profile.pendingAdminEmailChallenge;
    if (!pending || pending.deviceId !== deviceId || !challenge || challenge.deviceId !== deviceId) {
      throw new HttpsError('failed-precondition', 'No active verification challenge. Please sign in again.');
    }
    const attempts = Number(challenge.attempts || 0);
    if (attempts >= EMAIL_CHALLENGE_MAX_ATTEMPTS) {
      throw new HttpsError('resource-exhausted', 'Too many attempts. Please request a new verification email.');
    }
    tx.update(ref, { 'pendingAdminEmailChallenge.attempts': attempts + 1 });
  });
  return originalConfirmDeviceSwitch.run(request);
});

// Reconcile trusted-device state after the legacy checkDeviceSession path.
// The reconciliation is transactional, preventing two concurrent successful
// device logins from losing each other through stale trustedDevices snapshots.
const originalCheckDeviceSessionWithMfa = exports.checkDeviceSession;
exports.checkDeviceSession = onCall({ enforceAppCheck: false }, async (request) => {
  const result = await originalCheckDeviceSessionWithMfa.run(request);
  if (result?.requiresOtp) return result;
  const data = request.data || {};
  const deviceId = requireDeviceId(request);
  // Absent means mobile: every app build shipped before this sends no platform
  // at all, and giving them a slot of their own would let any number of phones
  // hold a session at once.
  const platform = platformOf(request.data?.platform);
  const db = getFirestore();
  const uid = data.uid && !request.auth?.uid ? String(data.uid).trim() : requireAuth(request);
  const snap = await userRef(db, uid).get();
  if (!snap.exists) return result;
  const profile = snap.data();
  if (!isActiveAccount(profile) || !isStaffRole(profile.role)) return result;
  const ip = getClientIp(request);
  const label = deviceLabel(request);
  await db.runTransaction(async (tx) => {
    const ref = userRef(db, uid);
    const currentSnap = await tx.get(ref);
    if (!currentSnap.exists) return;
    const current = currentSnap.data();
    if (!isActiveAccount(current)) throw new HttpsError('permission-denied', 'This account is not active.');
    const trusted = current.trustedDevices || {};
    if (!trusted[deviceId] || trusted[deviceId]?.lastIp !== ip || (label && trusted[deviceId]?.label !== label)) {
      tx.update(ref, { trustedDevices: trustedMap(trusted, deviceId, ip, label) });
    }
  });
  return result;
});

// Superadmin-only remote session termination used by Admin Web.
// This clears the server-side active session/device binding and revokes
// Firebase refresh tokens so a forced logout cannot be bypassed by reusing
// an existing refresh token.
exports.adminForceLogout = onCall({ enforceAppCheck: false }, async (request) => {
  const callerUid = requireAuth(request);
  const targetUid = String(request.data?.targetUid || '').trim();
  if (!targetUid || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'A valid target user ID is required.');
  }

  const db = getFirestore();
  const callerSnap = await userRef(db, callerUid).get();
  if (!callerSnap.exists || callerSnap.data()?.role !== 'superadmin' || !isActiveAccount(callerSnap.data())) {
    throw new HttpsError('permission-denied', 'Only an active superadmin can force logout another account.');
  }
  if (targetUid === callerUid) {
    throw new HttpsError('invalid-argument', 'Use the normal logout option for your own account.');
  }

  const targetRef = userRef(db, targetUid);
  let changed = false;
  let previousDeviceId = null;
  try {
    await db.runTransaction(async (tx) => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) throw new HttpsError('not-found', 'The target account was not found.');
      const target = targetSnap.data() || {};
      if (!isActiveAccount(target)) {
        throw new HttpsError('failed-precondition', 'The target account is not active.');
      }
      previousDeviceId = target.activeDeviceId || null;
      changed = Boolean(target.activeSessionId || target.activeDeviceId || target.pendingDeviceApproval);
      tx.update(targetRef, {
        // Every slot, not just the legacy pair - otherwise the phone or the
        // browser keeps matching its own slot and is not logged out at all.
        ...signOutEverywhere(),
        pendingDeviceApproval: null,
        pendingAdminEmailChallenge: FieldValue.delete(),
      });
    });

    try {
      await admin.auth().revokeRefreshTokens(targetUid);
    } catch (error) {
      await logServerError('adminForceLogout.revokeRefreshTokens', error, { userId: targetUid });
      throw new HttpsError('internal', 'The account session could not be fully revoked. Please try again.');
    }

    await logAudit({
      action: 'admin_force_logout',
      targetUid,
      performedBy: callerUid,
      performedByRole: 'superadmin',
      details: { changed, previousDeviceId },
    });
    return { ok: true, changed };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('adminForceLogout', error, { targetUid, performedBy: callerUid });
    throw new HttpsError('internal', 'Could not force logout this account. Please try again.');
  }
});

/**
 * The phone's answer: Approve or Reject.
 *
 * Deliberately NOT guarded by the session proof every money callable requires.
 * The person answering is signed in on their phone, and the thing they are
 * approving is a sign-in elsewhere - requiring an unexpired session here would
 * mean the one device that can answer is sometimes the one that cannot.
 *
 * Rejecting is recorded rather than just discarded. "Somebody tried to sign in
 * as me and I said no" is the single most useful thing in an audit log, and it
 * is the reason this prompt is worth showing at all.
 */
// enforceAppCheck: false, like every other callable in this file. App Check
// enforcement here once locked every user out for ten days, and this is a
// sign-in path: availability wins, and auth plus the one-time approval id is
// what actually guards it.
exports.respondToWebSignIn = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const approvalId = String(request.data?.approvalId || '').trim().slice(0, 64);
  const approve = request.data?.approve === true;
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid);

  const snap = await ref.get();
  const profile = snap.exists ? snap.data() : null;
  if (!profile || !isActiveAccount(profile)) throw new HttpsError('permission-denied', 'This account is not active.');

  const allowed = responseDecision(profile.pendingWebApproval, { approvalId, nowMs: Date.now() });
  if (!allowed.ok) throw new HttpsError('failed-precondition', allowed.reason);

  // Only the status changes. Rewriting the whole request would let a second
  // answer move the device or the deadline it was agreed against.
  await ref.update({
    'pendingWebApproval.status': approve ? 'approved' : 'rejected',
    'pendingWebApproval.answeredAt': FieldValue.serverTimestamp(),
  });

  await logAudit({
    action: approve ? 'web_signin_approved' : 'web_signin_rejected',
    targetUid: uid,
    performedBy: uid,
    performedByRole: profile.role || '',
    details: {
      deviceId: String(profile.pendingWebApproval?.deviceId || ''),
      label: String(profile.pendingWebApproval?.label || ''),
      ip: String(profile.pendingWebApproval?.ip || ''),
    },
  });

  return { ok: true, approved: approve };
});
