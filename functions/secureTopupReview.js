const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');

const ADMIN_ROLES = ['admin', 'superadmin'];
const ALLOWED_RECIPIENT_ROLES = ['customer', 'dealer', 'reseller'];
const MAX_AMOUNT = 100000;
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

function requireAdmin(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function activeAccount(profile) {
  return !!profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && profile.active !== false && profile.mergedInto == null;
}

function validMoney(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return null;
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > Number.EPSILON * Math.max(1, Math.abs(value * 100))) return null;
    return value;
  }
  if (typeof value !== 'string' || !MONEY_RE.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? n : null;
}

function validBalance(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) return null;
  return n;
}

exports.approveTopup = onCall({ enforceAppCheck: true }, async request => {
  const uid = requireAdmin(request);
  const db = admin.firestore();
  const callerSnap = await db.collection('users').doc(uid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!caller || !activeAccount(caller) || !ADMIN_ROLES.includes(caller.role)) throw new HttpsError('permission-denied', 'Your account cannot approve top-ups.');
  const topupId = String(request.data?.topupId || request.data?.id || '').trim();
  if (!topupId) throw new HttpsError('invalid-argument', 'topupId is required.');
  const ref = db.collection('topups').doc(topupId);
  try {
    const out = await db.runTransaction(async tx => {
      const [snap, callerTxSnap] = await Promise.all([tx.get(ref), tx.get(db.collection('users').doc(uid))]);
      if (!callerTxSnap.exists || !activeAccount(callerTxSnap.data())) throw new HttpsError('permission-denied', 'Your account is not active.');
      const callerTx = callerTxSnap.data() || {};
      if (!ADMIN_ROLES.includes(callerTx.role)) throw new HttpsError('permission-denied', 'Your account cannot approve top-ups.');
      if (!snap.exists) throw new HttpsError('not-found', 'That top-up request does not exist.');
      const topup = snap.data() || {};
      if (topup.status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      const userId = String(topup.userId || '').trim();
      if (!userId) throw new HttpsError('failed-precondition', 'Top-up has no valid user account.');
      const userRef = db.collection('users').doc(userId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');
      const user = userSnap.data() || {};
      if (!activeAccount(user)) throw new HttpsError('failed-precondition', 'The recipient account is not active.');
      if (!ALLOWED_RECIPIENT_ROLES.includes(user.role)) throw new HttpsError('failed-precondition', 'That account cannot receive wallet top-ups.');
      const points = validMoney(topup.points ?? topup.amount);
      const balance = validBalance(user.walletBalance);
      if (points === null) throw new HttpsError('failed-precondition', 'Top-up amount is invalid.');
      if (balance === null) throw new HttpsError('failed-precondition', 'User wallet balance is invalid.');
      const newBalance = balance + points;
      if (!Number.isSafeInteger(Math.round(newBalance * 100))) throw new HttpsError('failed-precondition', 'Wallet balance is too large.');
      tx.update(userRef, { walletBalance: newBalance });
      tx.update(ref, { status: 'approved', approvedBy: uid, approvedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), creditedPoints: points });
      return { userId, points };
    });
    await logAudit({ action: 'topup_approved', targetUid: out.userId, performedBy: uid, performedByRole: caller.role, details: { topupId, points: out.points } });
    return { approved: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('approveTopup', error, { userId: uid, topupId });
    throw new HttpsError('internal', 'Could not approve this top-up.');
  }
});

exports.rejectTopup = onCall({ enforceAppCheck: true }, async request => {
  const uid = requireAdmin(request);
  const db = admin.firestore();
  const callerSnap = await db.collection('users').doc(uid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!caller || !activeAccount(caller) || !ADMIN_ROLES.includes(caller.role)) throw new HttpsError('permission-denied', 'Your account cannot reject top-ups.');
  const topupId = String(request.data?.topupId || '').trim();
  const reason = String(request.data?.reason || '').trim().slice(0, 500);
  if (!topupId) throw new HttpsError('invalid-argument', 'topupId is required.');
  const ref = db.collection('topups').doc(topupId);
  try {
    let targetUid = null;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'That top-up request does not exist.');
      const topup = snap.data() || {};
      if (topup.status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      targetUid = String(topup.userId || '').trim() || null;
      tx.update(ref, { status: 'rejected', rejectReason: reason || 'Rejected by admin.', rejectedBy: uid, rejectedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    await logAudit({ action: 'topup_rejected', targetUid, performedBy: uid, performedByRole: caller.role, details: { topupId, reason } });
    return { rejected: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('rejectTopup', error, { userId: uid, topupId });
    throw new HttpsError('internal', 'Could not reject this top-up.');
  }
});
