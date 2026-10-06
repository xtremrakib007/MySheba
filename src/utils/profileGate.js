// When a profile read is allowed to end a session.
//
// The rule the app now follows: a failure to READ the profile is never a
// decision to sign anyone out. Exactly three things end a session -
//
//   1. the person taps Log Out,
//   2. Firebase Auth itself reports no user (token revoked, password
//      changed, account deleted),
//   3. the server gives a definite "this account may not use the app".
//
// Everything else - no network, a dropped listener, a cold start before
// Firestore answers - keeps the person signed in on the profile the device
// already has.
//
// These are pure so the decisions can be tested directly rather than
// inferred from the shape of the code around them.

/**
 * What to do about a failed users/{uid} listener.
 *
 * permission-denied is the one code that can mean the account is blocked:
 * firestore.rules requires activeProfile(), which is false for a profile
 * that is suspended, inactive, disabled, active:false or merged into
 * another account. It is still retried once, because a listener that
 * attaches a moment before the auth token propagates is denied for reasons
 * that have nothing to do with the account - and signing someone out over
 * that race is exactly the bug this file exists to prevent.
 *
 * @returns {'retry'|'fatal'|'transient'}
 */
export function classifyProfileError(error, { isRetry = false } = {}) {
  const code = String(error?.code || '');
  if (code === 'permission-denied') return isRetry ? 'fatal' : 'retry';
  return 'transient';
}

/**
 * What a snapshot means when the document is not there.
 *
 * Firestore serves listeners from the local cache first. A document missing
 * from that cache means "not cached yet", not "deleted" - only a server
 * answer can say a profile is gone. Treating the two the same is what
 * logged people out when the app opened without a network.
 *
 * @returns {'ok'|'ignore'|'gone'}
 */
export function classifyProfileSnapshot(profile, meta) {
  if (profile) return 'ok';
  return meta?.fromCache ? 'ignore' : 'gone';
}

/**
 * Whether a changed active session should sign this device out.
 *
 * This is the single-device rule and it is deliberate: signing in elsewhere
 * signs this device out. It must not misfire, so it stays quiet when -
 *
 *   - the app is still doing its first route after launch. Firebase Auth
 *     persistence is the source of truth for a restart; a mismatch there is
 *     handled on a later update rather than destroying a restored login.
 *   - this device never got an authoritative session id. A login that went
 *     through while checkDeviceSession was unreachable is recorded as
 *     deferred and leaves the local id stale, so a mismatch says nothing
 *     about another device taking over - only that we never asked.
 *   - either id is missing, which is the same "nothing to compare" case.
 *   - the account's active device is still THIS device. A changed session id
 *     on the same phone is not another device taking over, and it happens
 *     routinely: the server mints a new activeSessionId on every sign-in,
 *     so a re-login here moves it without anyone else being involved. Ending
 *     the session on that alone is how a device signed itself out. The rule
 *     is "someone else signed in", so it is the DEVICE that has to differ.
 */
export function shouldEndSessionForDevice({
  localSessionId,
  activeSessionId,
  activeDeviceId,
  activeSessions,
  deviceId,
  initialRouteDone,
  deviceCheckDeferred,
} = {}) {
  if (!initialRouteDone) return false;
  if (deviceCheckDeferred) return false;
  // New accounts use independent mobile/web slots. The legacy pair is still
  // mirrored for old clients, but it points at whichever platform signed in
  // last and therefore must NEVER be used by the mobile client to judge a
  // web sign-in.
  const mobile = activeSessions && typeof activeSessions === 'object' ? activeSessions.mobile : null;
  if (mobile && typeof mobile === 'object') {
    if (!localSessionId || !mobile.sessionId || !deviceId || !mobile.deviceId) return false;
    return localSessionId !== mobile.sessionId && deviceId !== mobile.deviceId;
  }

  if (!localSessionId || !activeSessionId) return false;
  if (localSessionId === activeSessionId) return false;
  if (!activeDeviceId || !deviceId) return false;
  if (activeDeviceId === deviceId) return false;
  return true;
}
