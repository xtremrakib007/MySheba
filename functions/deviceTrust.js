/**
 * How long a browser stays remembered after it has been verified.
 *
 * Every sign-in used to be challenged, trusted device or not. On the app that
 * costs nothing: the session survives closing the app, so a real sign-in is
 * rare. A browser is the opposite - it is closed, reopened, and signed in
 * again several times a day - so the same rule produced a code on almost every
 * visit, which is both the cost complained about and the thing that trains
 * somebody to approve a prompt without reading it.
 *
 * So a verified browser is remembered for a fixed window and not asked again
 * inside it. The window runs from the LAST verification, not from the first,
 * and not from the last time the browser was seen: activity alone must not
 * extend it, or a browser somebody else is holding renews itself for ever just
 * by being used.
 *
 * Mobile is deliberately untouched. Nothing here can let a phone skip a
 * challenge, because `platform` has to be web for any of it to apply.
 *
 * Pure: no Firestore, no clock, no I/O. The caller passes the profile and the
 * time, which is what makes the expiry testable without waiting a month.
 */

const WEB_TRUST_DAYS = 30;
const WEB_TRUST_MS = WEB_TRUST_DAYS * 24 * 60 * 60 * 1000;

/**
 * Milliseconds from whatever Firestore handed back, or null.
 *
 * Strict on purpose. A value that cannot be read as a time is not treated as
 * "now" or as zero - it is treated as no verification at all, which asks for a
 * code. Every unreadable case has to fall that way: the alternative is a
 * malformed field that silently skips the challenge.
 */
function millisOf(value) {
  if (value && typeof value.toMillis === 'function') {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

/**
 * May this browser skip the sign-in challenge?
 *
 * Returns { ok: false, reason } rather than a bare boolean so the reason can be
 * logged: "expired" and "unknown_device" look identical to the person signing
 * in and completely different to anybody reading the audit log afterwards.
 */
function webTrustDecision(profile, { deviceId, platform, nowMs } = {}) {
  if (platform !== 'web') return { ok: false, reason: 'not_web' };
  if (typeof deviceId !== 'string' || !deviceId) return { ok: false, reason: 'no_device' };
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return { ok: false, reason: 'no_clock' };

  const devices = profile && profile.trustedDevices;
  const entry = devices && typeof devices === 'object' ? devices[deviceId] : null;
  if (!entry || typeof entry !== 'object') return { ok: false, reason: 'unknown_device' };

  // Browsers trusted before this existed have no verifiedAt. They are asked
  // once more and remembered from then on, which is the safe direction for a
  // field that did not exist when the entry was written.
  const verifiedAt = millisOf(entry.verifiedAt);
  if (verifiedAt === null) return { ok: false, reason: 'never_verified' };

  // A verification in the future is a broken clock somewhere, and the one
  // thing it must not do is grant a window longer than the real one.
  if (nowMs < verifiedAt) return { ok: false, reason: 'clock_skew' };
  if (nowMs - verifiedAt > WEB_TRUST_MS) return { ok: false, reason: 'expired' };

  return { ok: true, verifiedAtMs: verifiedAt, expiresAtMs: verifiedAt + WEB_TRUST_MS };
}

module.exports = { WEB_TRUST_DAYS, WEB_TRUST_MS, millisOf, webTrustDecision };
