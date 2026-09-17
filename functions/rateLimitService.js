// Velocity / rate-limit guard for wallet-mutating Cloud Functions and
// account discovery / pre-auth verification/password-reset flows.
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit } = require('./logService');

const DEFAULT_LIMITS = {
  createSelfTopup: { max: 5, windowMinutes: 60 },
  transferPoints: { max: 20, windowMinutes: 10 },
  chargeWallet: { max: 60, windowMinutes: 60 },
  walletTransfer: { max: 20, windowMinutes: 10 },
  findWalletRecipient: { max: 30, windowMinutes: 10 },
  listWalletTransfers: { max: 30, windowMinutes: 10 },
  account_merge_start: { max: 5, windowMinutes: 60 },
  account_merge_confirm: { max: 10, windowMinutes: 60 },
  password_reset: { max: 5, windowMinutes: 60 },
  password_reset_email_send: { max: 5, windowMinutes: 60 },
  search_users: { max: 30, windowMinutes: 10 },
  get_user_by_uid: { max: 60, windowMinutes: 10 },
  match_contacts_by_phone: { max: 10, windowMinutes: 10 },
};

const DEFAULT_OTP_LIMITS = {
  otp_send: { max: 8, windowMinutes: 60 },
  otp_verify: { max: 20, windowMinutes: 60 },
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
  const ref = db.collection(collectionName).doc(docId), now = Date.now();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const events = ((snap.exists && snap.data().events) || []).filter(ts => now - ts < windowMs);
    if (events.length >= limit.max) { tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); return true; }
    events.push(now); tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); return false;
  });
}
async function checkVelocity(db, uid, action, context = {}) {
  const limits = await getSecuritySettings(db), limit = limits[action];
  if (!limit || !limit.max) return;
  const tripped = await slidingWindowTripped(db, 'walletVelocity', `${uid}_${action}`, limit);
  if (tripped) {
    await logAudit({ action: 'wallet_velocity_blocked', targetUid: uid, performedBy: uid, performedByRole: null, details: { blockedAction: action, limit, ip: context.ip || null } });
    throw new HttpsError('resource-exhausted', "You're doing that too quickly. Please wait a bit and try again.");
  }
}
async function checkAnonymousVelocity(db, identifier, action) {
  const limits = await getOtpSecuritySettings(db), limit = limits[action];
  if (!limit || !limit.max) return;
  const key = identifier || 'unknown';
  const tripped = await slidingWindowTripped(db, 'otpVelocity', `${key}_${action}`, limit);
  if (tripped) {
    await logAudit({ action: 'otp_velocity_blocked', targetUid: null, performedBy: 'anonymous', performedByRole: null, details: { blockedAction: action, limit, ip: identifier || null } });
    throw new HttpsError('resource-exhausted', "You're doing that too quickly. Please wait a bit and try again.");
  }
}
function getClientIp(request) {
  try {
    const raw = request.rawRequest; if (!raw) return null;
    const forwarded = raw.headers && raw.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
    return raw.ip || null;
  } catch { return null; }
}
module.exports = { checkVelocity, checkAnonymousVelocity, getClientIp, DEFAULT_LIMITS, DEFAULT_OTP_LIMITS };