// Velocity / rate-limit guard for wallet-mutating Cloud Functions - plus a
// second, IP-keyed variant (checkAnonymousVelocity) for the pre-auth OTP
// flow in otpService.js, where there's no uid yet to key off.
//
// WHY THIS FILE EXISTS: walletService.js enforces *correctness* (balances
// can't go negative, roles can't transfer where they shouldn't) but had no
// defense against a compromised or scripted account hammering a legitimate
// endpoint - e.g. draining a stolen session via rapid-fire transferPoints
// calls, or a bot spamming createSelfTopup. This is the first fraud-signal
// primitive: a simple per-uid, per-action sliding-window counter, checked
// BEFORE the wallet mutation's own transaction runs.
//
// Defaults live here but can be tuned without a redeploy via
// settings/security (same override pattern as settings/pricing in
// walletService.js - see getSecuritySettings below). Counters live in
// walletVelocity/{uid}_{action} and self-prune old events on every check, so
// there's no separate cleanup job.
//
// This is deliberately NOT a distributed rate limiter (no Redis, no
// cross-region coordination) - it's one Firestore transaction per check,
// which is enough to stop the failure mode we actually care about (one uid,
// bursting one action) without adding new infra. It also does not
// coordinate across actions - a uid at the transferPoints limit can still
// call chargeWallet - each action has its own independent budget.

const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit } = require('./logService');

// NOTE: these defaults are a starting point, not calibrated against real
// traffic. Tune via settings/security.walletVelocity once there's volume
// data to look at - see getSecuritySettings.
const DEFAULT_LIMITS = {
  createSelfTopup: { max: 5, windowMinutes: 60 },
  transferPoints: { max: 20, windowMinutes: 10 },
  chargeWallet: { max: 60, windowMinutes: 60 },
  boostListing: { max: 10, windowMinutes: 60 },
  // withdraw_gamepoints turns play money into real walletBalance (unlike
  // charge_gamepoints, which only ever moves points the other way) - the
  // one game-points action actually worth capping here.
  withdraw_gamepoints: { max: 10, windowMinutes: 60 },
  transfer_gamepoints: { max: 20, windowMinutes: 10 },
  // Google-account merge (functions/accountMergeService.js) - starting a
  // merge sends an email to an account the caller doesn't control yet, and
  // confirming one moves wallet/game-point balances, so both get their own
  // (generous but non-zero) caps rather than being left unconfigured.
  account_merge_start: { max: 5, windowMinutes: 60 },
  account_merge_confirm: { max: 10, windowMinutes: 60 },
};

// Same idea, for the pre-authentication OTP flow (functions/otpService.js).
// Kept as a separate table/collection/settings-path from DEFAULT_LIMITS
// above rather than folded in, since these are keyed by IP, not uid - see
// checkAnonymousVelocity. otp_send's existing per-email 60s resend cooldown
// (in otpService.js itself) stops one email address being spammed; this
// catches the gap that cooldown can't: one script rotating through many
// different email addresses. 8/hour is generous for a real person retrying
// a typo'd email or switching the SMS/email delivery toggle a few times,
// but well below what a spam script needs to be worth running.
const DEFAULT_OTP_LIMITS = {
  otp_send: { max: 8, windowMinutes: 60 },
  otp_verify: { max: 20, windowMinutes: 60 },
};

async function getSecuritySettings(db) {
  const snap = await db.collection('settings').doc('security').get();
  const overrides = (snap.exists && snap.data().walletVelocity) || {};
  const merged = {};
  for (const action of Object.keys(DEFAULT_LIMITS)) {
    merged[action] = { ...DEFAULT_LIMITS[action], ...(overrides[action] || {}) };
  }
  return merged;
}

// Mirrors getSecuritySettings above but reads settings/security.otpVelocity
// instead, so tuning wallet limits and tuning OTP limits can never
// accidentally collide on the same override key.
async function getOtpSecuritySettings(db) {
  const snap = await db.collection('settings').doc('security').get();
  const overrides = (snap.exists && snap.data().otpVelocity) || {};
  const merged = {};
  for (const action of Object.keys(DEFAULT_OTP_LIMITS)) {
    merged[action] = { ...DEFAULT_OTP_LIMITS[action], ...(overrides[action] || {}) };
  }
  return merged;
}

// The actual sliding-window counter, shared by checkVelocity (uid-keyed,
// walletVelocity collection) and checkAnonymousVelocity (IP-keyed,
// otpVelocity collection) below - same self-pruning single-transaction
// approach either way, just parameterized on which collection/doc it reads.
async function slidingWindowTripped(db, collectionName, docId, limit) {
  const windowMs = (Number(limit.windowMinutes) || 60) * 60 * 1000;
  const ref = db.collection(collectionName).doc(docId);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const events = ((snap.exists && snap.data().events) || []).filter((ts) => now - ts < windowMs);

    if (events.length >= limit.max) {
      // Don't record this attempt as a new event - a blocked call
      // shouldn't extend how long the account stays blocked.
      tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return true;
    }

    events.push(now);
    tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return false;
  });
}

/**
 * Throws HttpsError('resource-exhausted', ...) if `uid` has made too many
 * `action` calls in the configured window; otherwise records this call and
 * returns normally. Call this BEFORE the mutation's own transaction, right
 * after the existing auth/role checks in each callable.
 *   db      admin.firestore() instance
 *   uid     the acting user's uid (not the recipient/target)
 *   action  key into DEFAULT_LIMITS / settings/security.walletVelocity
 *   context optional { ip } - logged on the audit trail when a limit trips,
 *           so admins can see what was blocked and from where
 */
async function checkVelocity(db, uid, action, context = {}) {
  const limits = await getSecuritySettings(db);
  const limit = limits[action];
  if (!limit || !limit.max) return; // unconfigured actions are not limited

  const tripped = await slidingWindowTripped(db, 'walletVelocity', `${uid}_${action}`, limit);

  if (tripped) {
    await logAudit({
      action: 'wallet_velocity_blocked',
      targetUid: uid,
      performedBy: uid,
      performedByRole: null,
      details: { blockedAction: action, limit, ip: context.ip || null },
    });
    throw new HttpsError(
      'resource-exhausted',
      "You're doing that too quickly. Please wait a bit and try again."
    );
  }
}

/**
 * Same idea as checkVelocity, for the OTP send/verify flow
 * (functions/otpService.js) which runs before the caller has an account or
 * a uid to key off. Keyed by client IP instead - in its own `otpVelocity`
 * collection, so it never shares a counter with the wallet limits above.
 * `identifier` is normally getClientIp(request); calls with no IP available
 * (e.g. local emulator) fall back to a fixed shared key rather than
 * bypassing the limit entirely.
 *   db        admin.firestore() instance
 *   identifier  the caller's IP (or other pre-auth identifier)
 *   action    key into DEFAULT_OTP_LIMITS / settings/security.otpVelocity
 */
async function checkAnonymousVelocity(db, identifier, action) {
  const limits = await getOtpSecuritySettings(db);
  const limit = limits[action];
  if (!limit || !limit.max) return; // unconfigured actions are not limited

  const key = identifier || 'unknown';
  const tripped = await slidingWindowTripped(db, 'otpVelocity', `${key}_${action}`, limit);

  if (tripped) {
    await logAudit({
      action: 'otp_velocity_blocked',
      targetUid: null,
      performedBy: 'anonymous',
      performedByRole: null,
      details: { blockedAction: action, limit, ip: identifier || null },
    });
    throw new HttpsError(
      'resource-exhausted',
      "You're doing that too quickly. Please wait a bit and try again."
    );
  }
}

/** Best-effort client IP from an onCall v2 request, for audit trails and
 * (later) IP-based anomaly signals. Cloud Functions/Run sits behind a
 * proxy, so the first entry in x-forwarded-for is the real client -
 * req.ip alone would just be the proxy. Never throws; returns null if
 * nothing is available (e.g. local emulator). */
function getClientIp(request) {
  try {
    const raw = request.rawRequest;
    if (!raw) return null;
    const forwarded = raw.headers && raw.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    return raw.ip || null;
  } catch (e) {
    return null;
  }
}

module.exports = { checkVelocity, checkAnonymousVelocity, getClientIp, DEFAULT_LIMITS, DEFAULT_OTP_LIMITS };
