/**
 * One session on a phone and one in a browser, at the same time, and no more
 * than one of either.
 *
 * The profile used to carry a single pair - activeSessionId and activeDeviceId -
 * so signing in anywhere ended the session everywhere else. That is the right
 * rule for two phones and the wrong one for a phone and a laptop: an admin who
 * opened the web console was signed out of the app on their way back to it,
 * and vice versa, for ever.
 *
 * So the pair becomes two pairs, one per platform, held in `activeSessions`.
 * A mobile sign-in replaces the mobile slot and leaves the web slot alone;
 * a web sign-in does the reverse. Two phones still evict each other, because
 * they share a slot, which is the part that was always wanted.
 *
 * The legacy pair is still accepted as a match. Without that, deploying this
 * would sign out every person currently signed in - their session predates
 * `activeSessions` and would match nothing. It is still written on every
 * sign-in, because firestore.rules and anything not yet updated still read it.
 *
 * Pure: no Firestore, no clock. The predicate below guards every callable that
 * moves money, so it is worth being able to test on its own.
 */

const MOBILE = 'mobile';
const WEB = 'web';
const PLATFORMS = [MOBILE, WEB];

/**
 * Which slot a client belongs in.
 *
 * Anything unrecognised is mobile, because that is what every app build sent
 * before this existed - they send no platform at all, and treating them as a
 * new third thing would give each one its own slot and let any number of
 * phones hold a session at once.
 */
function platformOf(value) {
  return String(value || '').trim().toLowerCase() === WEB ? WEB : MOBILE;
}

function pair(value) {
  const sessionId = typeof value?.sessionId === 'string' ? value.sessionId : '';
  const deviceId = typeof value?.deviceId === 'string' ? value.deviceId : '';
  return sessionId && deviceId ? { sessionId, deviceId } : null;
}

/** The slots a profile holds, with no legacy pair folded in. */
function readSlots(profile) {
  const stored = profile && typeof profile.activeSessions === 'object' && profile.activeSessions
    ? profile.activeSessions
    : {};
  const out = {};
  for (const platform of PLATFORMS) {
    const found = pair(stored[platform]);
    if (found) out[platform] = found;
  }
  return out;
}

/** The single pair written before slots existed, if the profile still has one. */
function legacyPair(profile) {
  return pair({ sessionId: profile?.activeSessionId, deviceId: profile?.activeDeviceId });
}

/**
 * Is this the session of somebody who may still act?
 *
 * Both halves must match in the SAME slot. Checking them separately would let
 * a session id from one slot pass with a device id from the other, which is
 * two half-valid sessions making one whole.
 */
function sessionMatches(profile, candidate) {
  const want = pair(candidate);
  if (!want) return false;
  const slots = readSlots(profile);
  for (const platform of PLATFORMS) {
    const slot = slots[platform];
    if (slot && slot.sessionId === want.sessionId && slot.deviceId === want.deviceId) return true;
  }
  const legacy = legacyPair(profile);
  return !!legacy && legacy.sessionId === want.sessionId && legacy.deviceId === want.deviceId;
}

/** Which platform a matching session sits in, or '' when it matches nothing. */
function platformOfSession(profile, candidate) {
  const want = pair(candidate);
  if (!want) return '';
  const slots = readSlots(profile);
  for (const platform of PLATFORMS) {
    const slot = slots[platform];
    if (slot && slot.sessionId === want.sessionId && slot.deviceId === want.deviceId) return platform;
  }
  return '';
}

/**
 * The fields to write when somebody signs in.
 *
 * Only this platform's slot changes. The other is carried through untouched,
 * which is the whole point, and the legacy pair is mirrored to this sign-in so
 * that anything still reading it sees the most recent session.
 */
function signInUpdate(profile, platform, candidate) {
  const slot = pair(candidate);
  if (!slot) throw new Error('A session needs both a session id and a device id.');
  const where = platformOf(platform);
  const slots = { ...readSlots(profile), [where]: slot };
  return {
    activeSessions: slots,
    activeSessionId: slot.sessionId,
    activeDeviceId: slot.deviceId,
  };
}

module.exports = {
  MOBILE, WEB, PLATFORMS,
  platformOf, readSlots, legacyPair, sessionMatches, platformOfSession, signInUpdate,
};
