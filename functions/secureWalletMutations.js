const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { logAudit, logServerError } = require('./logService');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const ADMIN_ROLES = ['admin', 'superadmin'];
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;
function requireSessionMatch(request, user) {
  const sessionId=request.data?.sessionId, deviceId=request.data?.deviceId;
  if(typeof sessionId!=='string'||!SESSION_ID_RE.test(sessionId)||typeof deviceId!=='string'||!DEVICE_ID_RE.test(deviceId)) throw new HttpsError('failed-precondition','Your secure session is missing. Please sign in again.');
  if(user.activeSessionId!==sessionId||user.activeDeviceId!==deviceId) throw new HttpsError('permission-denied','This device session is no longer active. Please sign in again.');
}
const MAX_AMOUNT = 100000;

function requireRequest(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const requestId = request.data?.requestId;
  if (typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId)) throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  return { uid: request.auth.uid, requestId };
}
function safeText(value, max) { return String(value ?? '').trim().slice(0, max); }
function validMoney(value) { const n = Number(value); return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT && Number.isSafeInteger(Math.round(n * 100)) ? n : null; }
function validBalance(value) { const n = Number(value ?? 0); return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? n : null; }
function active(account) { return !!account && account.suspended !== true && account.inactive !== true && account.disabled !== true && account.active !== false && account.mergedInto == null; }

exports.createSelfTopup = onCall({ enforceAppCheck: true }, async (request) => {
  const { uid, requestId } = requireRequest(request);
  const db = admin.firestore();
  const data = request.data || {};
  const amount = validMoney(data.amount);
  const method = safeText(data.method || 'transfer', 40);
  const bankName = safeText(data.bankName, 120);
  const refNo = safeText(data.refNo, 120);
  const receiptUrl = safeText(data.receiptUrl, 2048);
  if (amount === null) throw new HttpsError('invalid-argument', 'Enter a valid amount.');
  await checkVelocity(db, uid, 'createSelfTopup', { ip: getClientIp(request) });

  const callerRef = db.collection('users').doc(uid);
  const opRef = db.collection('walletOperations').doc(`${uid}_createSelfTopup_${requestId}`);
  const topupRef = db.collection('selfTopups').doc();
  let callerRole = '';

  try {
    const result = await db.runTransaction(async (tx) => {
      // Revalidate the live caller before returning an idempotent replay.
      const callerSnap = await tx.get(callerRef);
      if (!callerSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const caller = callerSnap.data() || {};
      requireSessionMatch(request, caller);
      callerRole = caller.role;
      if (!active(caller) || !ADMIN_ROLES.includes(caller.role)) throw new HttpsError('permission-denied', 'Only active admin/superadmin accounts can self top-up.');

      const opSnap = await tx.get(opRef);
      if (opSnap.exists) {
        const op = opSnap.data() || {};
        if (op.uid !== uid || op.type !== 'createSelfTopup' || op.requestId !== requestId) throw new HttpsError('already-exists', 'This request ID is already in use.');
        if (Number(op.amount) !== amount) throw new HttpsError('failed-precondition', 'That request ID does not match this top-up.');
        return { id: op.topupId, replay: true };
      }

      const currentBalance = validBalance(caller.walletBalance);
      if (currentBalance === null) throw new HttpsError('failed-precondition', 'Wallet balance is invalid.');
      const currentBalanceCents = Math.round(currentBalance * 100);
      const amountCents = Math.round(amount * 100);
      const newBalanceCents = currentBalanceCents + amountCents;
      if (!Number.isSafeInteger(newBalanceCents)) throw new HttpsError('failed-precondition', 'Wallet balance is too large.');
      const newBalance = newBalanceCents / 100;

      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.update(callerRef, { walletBalance: newBalance });
      tx.set(topupRef, { userId: uid, userPhone: safeText(caller.phone, 40), userName: safeText(caller.name || caller.displayName, 160), userRole: caller.role, amount, points: amount, method, bankName, refNo, receiptUrl, status: 'approved', requestId, createdAt: now, updatedAt: now });
      tx.set(opRef, { uid, type: 'createSelfTopup', requestId, amount, topupId: topupRef.id, status: 'completed', createdAt: now, updatedAt: now });
      return { id: topupRef.id, replay: false };
    });
    if (!result.replay) {
      await logAudit({
        action: 'self_topup_created',
        targetUid: uid,
        performedBy: uid,
        performedByRole: callerRole,
        details: { amount, requestId, topupId: result.id },
      });
    }
    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('createSelfTopup', error, { userId: uid, requestId });
    throw new HttpsError('internal', 'Could not complete the self top-up.');
  }
});