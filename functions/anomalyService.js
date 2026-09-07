// Basic IP-anomaly signal - the first fraud-signal primitive beyond wallet
// velocity (rateLimitService.js) and admin MFA (deviceSessionService.js).
// Deliberately minimal: it does not block anything or score risk - it just
// notices "this uid's action just came from an IP we've never seen for
// them" and writes ONE audit-log entry so admins have something to look
// at. Wallet velocity handles "too fast"; this is step one toward "same
// actor, different footprint" - the harder fraud signal neither velocity
// nor MFA can see on their own.
//
// Known-IP list lives on users/{uid}.knownIps - a short (last N) capped
// array, not a full history. Deliberately kept on the user doc rather than
// a subcollection: reads/writes for a handful of IP strings are cheap and
// keep this a single-document transaction, with no separate collection to
// manage retention on.

const admin = require('firebase-admin');
const { logAudit } = require('./logService');

const MAX_KNOWN_IPS = 10;

/**
 * Checks `ip` against uid's known-IP list; if it's new, records it and
 * fires an `anomaly_new_ip` audit entry. Never throws and never blocks the
 * caller - this is a signal, not a gate (unlike rateLimitService's
 * checkVelocity). Call this AFTER the action it's describing has already
 * been decided to proceed - a failure or slow read here should never be
 * able to turn into a false block on something legitimate.
 *   db      admin.firestore() instance
 *   uid     the acting user's uid
 *   ip      result of rateLimitService.getClientIp - may be null, in which
 *           case this is a no-op (nothing to compare)
 *   context { action, role } - included on the audit entry so it reads as
 *           "new IP seen doing X" rather than a bare uid
 */
async function checkIpAnomaly(db, uid, ip, context = {}) {
  if (!ip) return;
  const ref = db.collection('users').doc(uid);

  try {
    const isNew = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const known = snap.data().knownIps || [];
      if (known.includes(ip)) return false;

      const updated = [...known, ip].slice(-MAX_KNOWN_IPS);
      tx.update(ref, { knownIps: updated });
      // Don't flag the very first IP ever recorded for an account - that's
      // just "we started tracking", not an anomaly.
      return known.length > 0;
    });

    if (isNew) {
      await logAudit({
        action: 'anomaly_new_ip',
        targetUid: uid,
        performedBy: uid,
        performedByRole: context.role || null,
        details: { ip, context: context.action || null },
      });
    }
  } catch (e) {
    // Best-effort signal only - never let anomaly detection break the
    // action it's attached to.
    console.error('checkIpAnomaly failed', uid, e);
  }
}

module.exports = { checkIpAnomaly, MAX_KNOWN_IPS };
