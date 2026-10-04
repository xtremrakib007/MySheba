// Velocity / rate-limit guard for wallet-mutating Cloud Functions - plus a
// second, IP-keyed variant (checkAnonymousVelocity) for pre-auth flows.
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit } = require('./logService');
const crypto = require('crypto');

const DEFAULT_LIMITS = {
  createSelfTopup: { max: 5, windowMinutes: 60 },
  transferPoints: { max: 20, windowMinutes: 10 },
  chargeWallet: { max: 60, windowMinutes: 60 },
  account_merge_start: { max: 5, windowMinutes: 60 },
  account_merge_confirm: { max: 10, windowMinutes: 60 },
  kyc_face: { max: 5, windowMinutes: 60 },
  kyc_submit: { max: 3, windowMinutes: 60 },
  findWalletRecipient: { max: 60, windowMinutes: 60 },
  support_ticket_create: { max: 8, windowMinutes: 60 },
  chargeService: { max: 30, windowMinutes: 10 },
  rechargePin: { max: 10, windowMinutes: 10 },
  reconcileTransaction: { max: 20, windowMinutes: 10 },
  transactionComplete: { max: 5, windowMinutes: 10 },
  testApiProvider: { max: 5, windowMinutes: 15 },
  migrateApiProviderSecrets: { max: 2, windowMinutes: 60 },
  saveApiProvider: { max: 20, windowMinutes: 60 },
  // One outbound provider call per product code, on a screen a customer can
  // reopen as often as they like. Generous enough to re-check a few numbers,
  // low enough that a loop stops being free.
  listProviderDataPlans: { max: 40, windowMinutes: 10 },
  // Reads a bill, changes nothing, and re-runs as the customer corrects an
  // account number - so it is looser than a charge and still bounded.
  getBillPresentment: { max: 60, windowMinutes: 10 },
  deleteApiProvider: { max: 10, windowMinutes: 60 },
};

const DEFAULT_OTP_LIMITS = {
  otp_send: { max: 8, windowMinutes: 60 },
  otp_verify: { max: 20, windowMinutes: 60 },
  password_reset: { max: 5, windowMinutes: 60 },
  password_reset_ip: { max: 20, windowMinutes: 60 },
};

async function getSecuritySettings(db) {
  const snap = await db.collection('settings').doc('security').get();
  const overrides = (snap.exists && snap.data().walletVelocity) || {};
  const merged = {};
  for (const action of Object.keys(DEFAULT_LIMITS)) merged[action] = { ...DEFAULT_LIMITS[action], ...(overrides[action] || {}) };
  return merged;
}

async function getOtpSecuritySettings(db) {
  const snap = await db.collection('settings').doc('security').get();
  const overrides = (snap.exists && snap.data().otpVelocity) || {};
  const merged = {};
  for (const action of Object.keys(DEFAULT_OTP_LIMITS)) merged[action] = { ...DEFAULT_OTP_LIMITS[action], ...(overrides[action] || {}) };
  return merged;
}

async function slidingWindowTripped(db, collectionName, docId, limit) {
  const windowMs = (Number(limit.windowMinutes) || 60) * 60 * 1000;
  const ref = db.collection(collectionName).doc(docId);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const events = ((snap.exists && snap.data().events) || []).filter((ts) => now - ts < windowMs);
    if (events.length >= limit.max) {
      tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return true;
    }
    events.push(now);
    tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return false;
  });
}

async function checkVelocity(db, uid, action, context = {}) {
  const limits = await getSecuritySettings(db);
  const limit = limits[action];
  if (!limit || !limit.max) return;
  const tripped = await slidingWindowTripped(db, 'walletVelocity', `${uid}_${action}`, limit);
  if (tripped) {
    await logAudit({ action: 'wallet_velocity_blocked', targetUid: uid, performedBy: uid, performedByRole: null, details: { blockedAction: action, limit } });
    throw new HttpsError('resource-exhausted', "You're doing that too quickly. Please wait a bit and try again.");
  }
  // Also rate-limit expensive authenticated actions per source IP. The IP is
  // hashed before storage so the velocity collection does not retain raw IPs.
  if (context.ip) {
    const ipHash = crypto.createHash('sha256').update(String(context.ip)).digest('hex').slice(0, 32);
    const ipLimit = { max: Math.max(1, Math.ceil(Number(limit.max) * 3)), windowMinutes: Number(limit.windowMinutes) || 60 };
    const ipTripped = await slidingWindowTripped(db, 'walletVelocityIp', `${ipHash}_${action}`, ipLimit);
    if (ipTripped) {
      await logAudit({ action: 'wallet_ip_velocity_blocked', targetUid: uid, performedBy: uid, performedByRole: null, details: { blockedAction: action, limit: ipLimit } });
      throw new HttpsError('resource-exhausted', "Too many requests from this network. Please wait and try again.");
    }
  }
}

async function checkAnonymousVelocity(db, identifier, action) {
  const limits = await getOtpSecuritySettings(db);
  const limit = limits[action];
  if (!limit || !limit.max) return;
  const key = identifier || 'unknown';
  const tripped = await slidingWindowTripped(db, 'otpVelocity', `${key}_${action}`, limit);
  if (tripped) {
    await logAudit({ action: 'otp_velocity_blocked', targetUid: null, performedBy: 'anonymous', performedByRole: null, details: { blockedAction: action, identifierType: action.startsWith('password_reset') ? 'hashed' : 'ip', limit } });
    throw new HttpsError('resource-exhausted', "You're doing that too quickly. Please wait a bit and try again.");
  }
}

function getClientIp(request) {
  try {
    const raw = request.rawRequest;
    if (!raw) return null;
    return typeof raw.ip === 'string' && raw.ip.trim() ? raw.ip.trim() : null;
  } catch (e) {
    return null;
  }
}

module.exports = { checkVelocity, checkAnonymousVelocity, getClientIp, DEFAULT_LIMITS, DEFAULT_OTP_LIMITS };