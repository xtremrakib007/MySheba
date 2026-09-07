// Single-device-login enforcement - the SERVER half.
//
// Client half: src/firebase/deviceSessionService.js (per-install device id
// + last-confirmed session id, in AsyncStorage) and the "Single-device-login
// enforcement" block in src/context/AppContext.js (live Firestore listener
// that signs a displaced device out the moment it sees a newer
// activeSessionId). This file is what actually makes that real, instead of
// the client-only scaffolding that shipped before it (see the long NOTE
// that used to live in src/firebase/deviceSessionService.js).
//
// Data lives on the users/{uid} doc itself (all fields below are frozen
// against client writes in firestore.rules, same pattern as walletBalance -
// only these Admin SDK callables can ever set them):
//   activeSessionId   - opaque token identifying the currently "logged in"
//                        device's session. Regenerated every time a device
//                        newly becomes active.
//   activeDeviceId    - the deviceId (src/firebase/deviceSessionService.js
//                        getDeviceId()) that session belongs to.
//   pendingDeviceApproval - { deviceId, email, requestedAt } while a
//                        DIFFERENT device is mid email-OTP challenge trying
//                        to take over as the active device. Null otherwise.
//   trustedDevices    - { [deviceId]: { label, ip, lastIp, trustedAt,
//                        lastSeenAt } } - admin/superadmin devices that
//                        have already cleared one email-OTP challenge
//                        (functions/otpService.js), so later logins from
//                        the SAME deviceId skip that challenge - see
//                        checkDeviceSession's own doc comment below, and
//                        listTrustedDevices/revokeTrustedDevice (Settings >
//                        Trusted Devices) for managing the list. Empty/
//                        absent for non-admin roles - nothing ever writes
//                        to it for them.
//
// Flow:
//   1. authService.login()/signInWithGoogle() (client) sign in with
//      Firebase Auth as normal, then call checkDeviceSession({ deviceId }).
//   2. If this deviceId is already the active one (or there's no active
//      device yet - first ever login), it's approved immediately: a fresh
//      activeSessionId is stamped and returned, and the client proceeds to
//      its dashboard as normal.
//   3. If a DIFFERENT deviceId is active, checkDeviceSession does NOT swap
//      it - it stores pendingDeviceApproval and tells the client to
//      challenge this device with the account's email OTP
//      (functions/otpService.js sendOtp/verifyOtp - unchanged, reused as-is).
//      The still-active device is untouched at this point.
//   4. Once the client has verified that OTP, it calls
//      confirmDeviceSwitch({ deviceId }), which re-checks the OTP was
//      actually verified (never trusts the client's word for it - same
//      "assertRecentlyVerified" guard functions/customerRegistration.js
//      uses), then stamps a NEW activeSessionId for this device, clears
//      pendingDeviceApproval, and revokes the account's existing Firebase
//      Auth refresh tokens so the previously-active device can't silently
//      keep working past its current token even if it's offline right now.
//      The previously-active device's own live profile listener
//      (AppContext.js) also notices its saved sessionId no longer matches
//      activeSessionId the moment it's back online and signs itself out
//      immediately, with a "signed in on another device" message - the
//      token revocation above is the backstop for the same thing, not the
//      primary mechanism. confirmDeviceSwitch also fires a "wasn't you?"
//      security alert (sendNewDeviceAlert, below) to the account's email
//      and, best-effort, a push notification to whatever pushToken is on
//      file - see that function's own doc comment for why the push has a
//      real (if not guaranteed) chance of reaching the OLD device
//      specifically, which is the point of the alert.
//   5. authService.logout() (any device, including "Cancel and sign out" on
//      the device-verify screen) calls clearActiveSession({ deviceId }),
//      which only clears the pieces that belong to ITS OWN deviceId - so
//      cancelling a pending challenge on the new device never touches the
//      real active device's session, and a normal logout on the active
//      device correctly frees the account up for the next login anywhere
//      without needing an OTP challenge.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { assertEmailVerified } = require('./emailVerification');
const { assertPhoneVerified } = require('./phoneVerification');
const { logAudit, logServerError } = require('./logService');
const { getClientIp } = require('./rateLimitService');
const { checkIpAnomaly } = require('./anomalyService');
const mailerService = require('./mailerService');

const MAX_DEVICE_ID_LENGTH = 100;
const MAX_DEVICE_LABEL_LENGTH = 80;
// How many devices an admin/superadmin can keep trusted (skip-OTP) at
// once - oldest by lastSeenAt is evicted once a NEW device gets trusted
// past this cap, same "short capped list on the user doc" shape as
// anomalyService.js's knownIps/MAX_KNOWN_IPS.
const MAX_TRUSTED_DEVICES = 5;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

/** Optional human-readable label ("iPhone 14, iOS 17") a client can pass
 * alongside deviceId so Settings > Trusted Devices reads as a device name
 * instead of a bare id - purely cosmetic, never used for any access
 * decision. Missing/oversized/non-string input is just dropped, never an
 * error - this field is optional on every call site. */
function optionalDeviceLabel(request) {
  const label = (request.data || {}).deviceLabel;
  if (typeof label !== 'string') return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_DEVICE_LABEL_LENGTH);
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function isPrivilegedRole(role) {
  return role === 'admin' || role === 'superadmin';
}

function generateSessionId() {
  return crypto.randomBytes(24).toString('hex');
}

function userRef(db, uid) {
  return db.collection('users').doc(uid);
}

/** Returns a new trustedDevices map with `deviceId` added/refreshed and,
 * if that pushes the map past MAX_TRUSTED_DEVICES, the least-recently-seen
 * OTHER device evicted. Pure function - callers write the result
 * themselves so this stays easy to unit-test and keeps the actual
 * Firestore write next to the rest of that call's update. */
function withTrustedDevice(trustedDevices, deviceId, { ip, label }) {
  const now = admin.firestore.Timestamp.now();
  const existing = (trustedDevices && trustedDevices[deviceId]) || null;
  const next = {
    ...(trustedDevices || {}),
    [deviceId]: {
      label: label || (existing && existing.label) || null,
      ip: (existing && existing.ip) || ip || null,
      lastIp: ip || (existing && existing.lastIp) || null,
      trustedAt: (existing && existing.trustedAt) || now,
      lastSeenAt: now,
    },
  };
  const keys = Object.keys(next);
  if (keys.length > MAX_TRUSTED_DEVICES) {
    const oldest = keys
      .filter((k) => k !== deviceId)
      .sort((a, b) => {
        const aTime = next[a].lastSeenAt ? next[a].lastSeenAt.toMillis() : 0;
        const bTime = next[b].lastSeenAt ? next[b].lastSeenAt.toMillis() : 0;
        return aTime - bTime;
      })[0];
    if (oldest) delete next[oldest];
  }
  return next;
}

/** Sends one Expo push (best-effort, swallows its own errors) - same shape
 * as the sendExpoPush copies in index.js/announcements.js, kept as its own
 * tiny local copy here rather than importing index.js, which would create a
 * circular require (index.js is what requires this file to expose its
 * exports.checkDeviceSession/etc in the first place). */
async function sendExpoPushBestEffort(message) {
  if (!message || !message.to) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify([{ sound: 'default', ...message }]),
    });
    if (!res.ok) {
      console.error('[deviceSessionService] Expo push HTTP error', res.status, await res.text());
    }
  } catch (e) {
    console.error('[deviceSessionService] Expo push send failed', e);
  }
}

function formatAlertTime() {
  // Malaysia-local wall-clock time for the alert copy, since that's where
  // MySheba's users are - not the server's UTC time, which would just be
  // confusing in an email/push someone reads on their phone.
  try {
    return new Date().toLocaleString('en-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch (e) {
    return new Date().toISOString();
  }
}

/**
 * Fires the moment a device switch is CONFIRMED (confirmDeviceSwitch below),
 * not when it's merely requested - so this lands as "this already happened,
 * here's what to do if it wasn't you" rather than a heads-up someone could
 * act on to block their own legitimate switch. Two channels, both
 * best-effort and both independent of each other:
 *   - Email to the account's email (the same address the OTP itself was
 *     just sent to/verified against).
 *   - Push to whatever pushToken is on file - the caller (confirmDeviceSwitch)
 *     passes the value from its `data` snapshot, read BEFORE this switch's
 *     Firestore update, since that's still the previously-active device's
 *     token at the instant the switch completes. The new device typically hasn't
 *     overwritten it yet (see src/context/AppContext.js's push-registration
 *     effect, which only runs once the new device has already landed on
 *     its dashboard) - so there's a real, if not guaranteed, chance this
 *     reaches the OLD device rather than the new one, which is the whole
 *     point of a "was this you?" alert.
 * Every failure here is caught and logged, never re-thrown - a person's
 * device switch must never fail (or even appear to hang) because a
 * notification about it couldn't be delivered.
 */
async function sendNewDeviceAlert({ email, pushToken, deviceId, ip }) {
  const when = formatAlertTime();
  const shortDeviceId = deviceId ? deviceId.slice(0, 8) : 'unknown';
  const whereBits = [ip ? `from IP ${ip}` : null].filter(Boolean).join(', ');

  if (email) {
    const text =
      `Your MySheba account was just signed in on a new device (${when}, device ${shortDeviceId}` +
      `${whereBits ? ', ' + whereBits : ''}). Your previous device has been signed out.\n\n` +
      `If this was you, no action is needed.\n\n` +
      `If this WASN'T you, someone else may have your phone number and password - ` +
      `please change your password immediately from Settings, or contact support if you can't sign in.`;
    const html =
      `<p>Your MySheba account was just signed in on a new device.</p>` +
      `<p><b>When:</b> ${when}<br/><b>Device:</b> ${shortDeviceId}${ip ? `<br/><b>IP:</b> ${ip}` : ''}</p>` +
      `<p>Your previous device has been signed out.</p>` +
      `<p>If this was you, no action is needed.</p>` +
      `<p>If this <b>wasn't</b> you, someone else may have your phone number and password - ` +
      `please change your password immediately from Settings, or contact support if you can't sign in.</p>`;
    try {
      await mailerService.sendEmail({
        to: email,
        subject: 'New sign-in to your MySheba account',
        text,
        html,
        context: 'deviceSessionService.newDeviceAlert',
      });
    } catch (e) {
      // mailerService already logs this via logServerError; nothing more
      // to do here except make sure it can never bubble up.
    }
  }

  if (pushToken) {
    await sendExpoPushBestEffort({
      to: pushToken,
      title: 'New sign-in to your account',
      body: "Your MySheba account was just signed in on another device. Wasn't you? Secure your account from Settings.",
      data: { type: 'security_alert', reason: 'new_device' },
    });
  }
}

/**
 * Called right after a successful Firebase Auth sign-in (phone+PIN or
 * Google - see authService.login/signInWithGoogle). Approves this device
 * immediately if it's already the active one or there's no active device
 * yet; otherwise starts (but does not complete) a device-switch challenge.
 *
 * Admin/superadmin accounts have a second, independent gate ahead of all of
 * that: every login from a device that ISN'T already trusted must prove a
 * fresh Firebase Phone Auth verification for the account's phone number,
 * checked via assertPhoneVerified (functions/phoneVerification.js - the
 * SAME real-SMS mechanism registration uses to confirm a phone number, not
 * the email-OTP flow the device-SWITCH challenge below still uses). The
 * first call (no phoneIdToken yet) returns { requiresOtp: true, reason:
 * 'admin_mfa', phone } so the client (DeviceVerifyScreen.js) can run
 * src/firebase/phoneVerification.js's sendPhoneOtp/confirmPhoneOtp and get
 * back an ID token; it then re-calls this same function (rather than a
 * separate "confirm" endpoint) with that token as `phoneIdToken`, so the
 * normal device-switch check still runs (in the rare case an admin is also
 * switching devices) once MFA is satisfied. Never trusts the client's word
 * that verification happened - assertPhoneVerified independently decodes
 * the token and checks it's recent and for the right phone number. This is
 * checked in a plain read BEFORE the transaction below, since it has no
 * business inside this doc's optimistic-concurrency snapshot, and this path
 * never writes anything on failure - an unverified admin login should leave
 * no trace on the account's session state.
 *
 * Trusted devices (users/{uid}.trustedDevices, keyed by deviceId - see
 * withTrustedDevice above): once an admin/superadmin has verified an OTP
 * challenge from a given deviceId once, that device is remembered and
 * every LATER login from the SAME deviceId skips the OTP challenge
 * entirely - this is what stops "asks for OTP every single time" on a
 * phone/browser the admin already proved is theirs. Each entry also keeps
 * the IP that device last logged in from (`ip`/`lastIp`), which is shown
 * on Settings > Trusted Devices (listTrustedDevices below) purely for the
 * admin's own review - it is NOT part of the trust decision itself
 * (mobile/home IPs change too often to gate on), so an unusually different
 * IP from an already-trusted device still logs straight in, same as
 * before, while checkIpAnomaly (unchanged, below) still raises its own
 * separate anomaly signal for admins to review from Activity Logs. Revoke
 * a device any time from Settings > Trusted Devices (revokeTrustedDevice
 * below) - its next login then goes through the full OTP challenge again.
 */
exports.checkDeviceSession = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  const deviceLabel = optionalDeviceLabel(request);

  const db = admin.firestore();
  const ref = userRef(db, uid);
  const ip = getClientIp(request);

  try {
    const preSnap = await ref.get();
    if (!preSnap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const preData = preSnap.data();
    if (preData.suspended) {
      throw new HttpsError('permission-denied', 'This account has been suspended. Please contact support.');
    }

    const privileged = isPrivilegedRole(preData.role);
    if (privileged) {
      const phone = normalizePhone(preData.phone || '');
      if (!phone) {
        throw new HttpsError(
          'failed-precondition',
          'This admin account has no phone number on file, so sign-in verification can\u2019t be completed. Please contact support.'
        );
      }

      const trustedDevices = preData.trustedDevices || {};
      if (trustedDevices[deviceId]) {
        // Already-trusted device - skip the MFA challenge entirely, just
        // refresh its last-seen time/IP so Settings > Trusted Devices
        // stays accurate. Best-effort: a failure here should never block
        // a login that's otherwise already approved.
        try {
          await ref.update({ trustedDevices: withTrustedDevice(trustedDevices, deviceId, { ip, label: deviceLabel }) });
        } catch (updateErr) {
          await logServerError('checkDeviceSession.refreshTrustedDevice', updateErr, { userId: uid });
        }
        await logAudit({
          action: 'admin_trusted_device_login',
          targetUid: uid,
          performedBy: uid,
          performedByRole: preData.role,
          details: { deviceId, ip },
        });
      } else {
        const phoneIdToken = (request.data || {}).phoneIdToken;
        let verified = false;
        if (phoneIdToken) {
          try {
            await assertPhoneVerified(phoneIdToken, phone);
            verified = true;
          } catch (verifyErr) {
            throw new HttpsError('failed-precondition', verifyErr.message || 'Please verify your phone number first.');
          }
        }

        if (!verified) {
          await logAudit({
            action: 'admin_mfa_challenge',
            targetUid: uid,
            performedBy: uid,
            performedByRole: preData.role,
            details: { deviceId, ip },
          });
          return { requiresOtp: true, reason: 'admin_mfa', phone };
        }

        // Phone was just verified for this not-yet-trusted device (the
        // client's retry after DeviceVerifyScreen) - trust it going
        // forward so this admin isn't asked again on every future login
        // from the SAME device. A different device, or this one again
        // after being revoked from Settings > Trusted Devices, still gets
        // the full challenge.
        try {
          await ref.update({ trustedDevices: withTrustedDevice(trustedDevices, deviceId, { ip, label: deviceLabel }) });
        } catch (updateErr) {
          await logServerError('checkDeviceSession.trustDevice', updateErr, { userId: uid });
        }
        await logAudit({
          action: 'admin_device_trusted',
          targetUid: uid,
          performedBy: uid,
          performedByRole: preData.role,
          details: { deviceId, ip },
        });
      }
    }

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
      const data = snap.data();

      if (data.suspended) {
        throw new HttpsError('permission-denied', 'This account has been suspended. Please contact support.');
      }

      // Same device already active, or no device active yet (first login,
      // or the account was just freed up by a clean logout) - approve
      // straight away and stamp a fresh session for it.
      if (!data.activeDeviceId || data.activeDeviceId === deviceId) {
        const sessionId = generateSessionId();
        tx.update(ref, {
          activeSessionId: sessionId,
          activeDeviceId: deviceId,
          pendingDeviceApproval: null,
          lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { requiresOtp: false, sessionId };
      }

      // A different device is active - don't touch it. The account needs a
      // real email on file to challenge this new device with an OTP.
      const email = (data.email || '').trim();
      if (!isValidEmail(email)) {
        throw new HttpsError(
          'failed-precondition',
          'This account has no email on file, so a new device can\u2019t be verified. Please contact support.'
        );
      }

      tx.update(ref, {
        pendingDeviceApproval: {
          deviceId,
          email,
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
      return { requiresOtp: true, reason: 'new_device', email };
    });

    if (result.requiresOtp) {
      await logAudit({
        action: 'device_switch_requested',
        targetUid: uid,
        performedBy: uid,
        performedByRole: preData.role,
        details: { deviceId, ip },
      });
    } else if (privileged) {
      // Successful privileged-account login only reaches here once MFA
      // (above) has already been satisfied - this is the "landed on a
      // dashboard" event admins want an IP trail for, not the challenge
      // itself (already logged as admin_mfa_challenge above).
      await logAudit({
        action: 'admin_login',
        targetUid: uid,
        performedBy: uid,
        performedByRole: preData.role,
        details: { deviceId, ip },
      });
    }
    if (!result.requiresOtp) {
      // Runs for every successfully-completed login, not just admins -
      // "same actor, new footprint" is a signal worth having account-wide,
      // not just on privileged roles.
      await checkIpAnomaly(db, uid, ip, { action: 'login', role: preData.role });
    }
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('checkDeviceSession', err, { userId: uid });
    throw new HttpsError('internal', 'Could not verify this device. Please try again.');
  }
});

/**
 * Called once the client has verified the email link sent for a pending
 * device switch (functions/emailVerification.js, via
 * src/firebase/emailVerification.js sendEmailLink/confirmEmailLink). Never
 * trusts the client's say-so that it was verified - re-checks server-side
 * via assertEmailVerified, same guard registerWithDealerCode uses. The
 * throwaway email-auth identity behind emailIdToken is cleaned up once the
 * switch is confirmed.
 */
exports.confirmDeviceSwitch = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);
  const ip = getClientIp(request);
  const { emailIdToken } = request.data || {};

  const db = admin.firestore();
  const ref = userRef(db, uid);

  let emailAuthUid;
  try {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const data = snap.data();

    const pending = data.pendingDeviceApproval;
    if (!pending || pending.deviceId !== deviceId) {
      throw new HttpsError('failed-precondition', 'No pending verification for this device. Please sign in again.');
    }

    try {
      emailAuthUid = await assertEmailVerified(emailIdToken, pending.email);
    } catch (err) {
      throw new HttpsError('failed-precondition', err.message || 'Please verify the link sent to your email first.');
    }

    const sessionId = generateSessionId();
    await ref.update({
      activeSessionId: sessionId,
      activeDeviceId: deviceId,
      pendingDeviceApproval: null,
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Backstop for the previously-active device: its live profile listener
    // (AppContext.js) already signs it out the moment it sees
    // activeSessionId change, but that only fires while it's online. This
    // makes sure that even a device that's currently offline/backgrounded
    // can't keep using its existing session once it does reconnect or its
    // token needs refreshing.
    try {
      await admin.auth().revokeRefreshTokens(uid);
    } catch (revokeErr) {
      await logServerError('confirmDeviceSwitch.revokeRefreshTokens', revokeErr, { userId: uid });
      // non-fatal - the live-listener kick-out above still applies
    }

    await logAudit({
      action: 'device_switch_confirmed',
      targetUid: uid,
      performedBy: uid,
      performedByRole: 'self',
      details: { deviceId, ip },
    });
    await checkIpAnomaly(db, uid, ip, { action: 'device_switch', role: data.role });

    // "Wasn't you?" security alert to the account owner - see
    // sendNewDeviceAlert's doc comment above. Wrapped so a notification
    // failure can never turn a successful device switch into an error
    // response; the switch itself (session stamped, token revoked, audit
    // logged) has already fully happened by this point regardless.
    try {
      await sendNewDeviceAlert({
        email: (data.email || '').trim() || null,
        pushToken: data.pushToken || null,
        deviceId,
        ip,
      });
    } catch (alertErr) {
      await logServerError('confirmDeviceSwitch.sendNewDeviceAlert', alertErr, { userId: uid });
    }

    if (emailAuthUid) {
      await admin.auth().deleteUser(emailAuthUid).catch(() => {});
    }

    return { sessionId };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('confirmDeviceSwitch', err, { userId: uid });
    throw new HttpsError('internal', 'Could not verify this device. Please try again.');
  }
});

/**
 * Called from authService.logout() on every sign-out, including "Cancel and
 * sign out" on the device-verify screen. Only clears whichever piece
 * belongs to THIS deviceId, so cancelling a pending challenge on a new
 * device never touches a genuinely active device's session elsewhere, and a
 * normal logout from the active device correctly frees the account up for
 * the next login (anywhere) without requiring an OTP challenge. Best-effort
 * by design - a failure here should never block a user from signing out.
 */
exports.clearActiveSession = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);

  const db = admin.firestore();
  const ref = userRef(db, uid);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data();
      const patch = {};

      if (data.activeDeviceId === deviceId) {
        patch.activeSessionId = null;
        patch.activeDeviceId = null;
      }
      if (data.pendingDeviceApproval && data.pendingDeviceApproval.deviceId === deviceId) {
        patch.pendingDeviceApproval = null;
      }
      if (Object.keys(patch).length > 0) tx.update(ref, patch);
    });
    return { ok: true };
  } catch (err) {
    await logServerError('clearActiveSession', err, { userId: uid });
    return { ok: false };
  }
});

/**
 * Self-service list of this admin/superadmin's own trusted devices (see
 * withTrustedDevice above) - powers Settings > Trusted Devices
 * (src/screens/TrustedDevicesScreen.js). Every account can call this (not
 * just privileged roles) since a non-admin's trustedDevices map is simply
 * always empty - nothing ever gets written to it for a plain customer/
 * dealer/reseller account, since checkDeviceSession only reads/writes
 * trustedDevices inside the `privileged` branch. `currentDeviceId`, if
 * passed, just flags which row is "this device" in the response - it does
 * not change what's returned.
 */
exports.listTrustedDevices = onCall(async (request) => {
  const uid = requireAuth(request);
  const currentDeviceId = (request.data || {}).currentDeviceId || null;

  const db = admin.firestore();
  const ref = userRef(db, uid);

  try {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
    const trustedDevices = snap.data().trustedDevices || {};

    const devices = Object.keys(trustedDevices).map((deviceId) => {
      const d = trustedDevices[deviceId] || {};
      return {
        deviceId,
        label: d.label || null,
        ip: d.ip || null,
        lastIp: d.lastIp || d.ip || null,
        trustedAt: d.trustedAt ? d.trustedAt.toMillis() : null,
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toMillis() : null,
        isCurrent: deviceId === currentDeviceId,
      };
    });
    devices.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));

    return { devices };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('listTrustedDevices', err, { userId: uid });
    throw new HttpsError('internal', 'Could not load trusted devices. Please try again.');
  }
});

/**
 * Revokes one trusted device from Settings > Trusted Devices - that
 * deviceId's next login goes through the full email-OTP challenge again
 * (checkDeviceSession above only skips it while trustedDevices[deviceId]
 * exists). Deliberately does NOT touch activeSessionId/activeDeviceId or
 * revoke Auth refresh tokens - revoking trust is "make this device prove
 * itself again next time", not "sign it out right now"; someone revoking a
 * device they still recognize (e.g. tidying up an old browser) shouldn't
 * be kicked out of the session they're using to do it, in the rare case
 * that happens to be the same device.
 */
exports.revokeTrustedDevice = onCall(async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireDeviceId(request);

  const db = admin.firestore();
  const ref = userRef(db, uid);

  try {
    await ref.update({ [`trustedDevices.${deviceId}`]: admin.firestore.FieldValue.delete() });
    await logAudit({
      action: 'admin_trusted_device_revoked',
      targetUid: uid,
      performedBy: uid,
      performedByRole: null,
      details: { deviceId },
    });
    return { ok: true };
  } catch (err) {
    await logServerError('revokeTrustedDevice', err, { userId: uid });
    throw new HttpsError('internal', 'Could not remove this device. Please try again.');
  }
});
