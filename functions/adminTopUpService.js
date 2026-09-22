const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { hasCapability } = require('./accessControl');

const MAX_AMOUNT = 100000;
const STAFF_ROLES = ['admin', 'superadmin', 'support', 'finance'];
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;

function activeAccount(user) {
  return user && user.suspended !== true && user.inactive !== true && user.disabled !== true && !user.mergedInto;
}

exports.adminTopUpPoints = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const db = admin.firestore();
  const callerUid = request.auth.uid;
  const callerRef = db.collection('users').doc(callerUid);
  const callerSnap = await callerRef.get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!caller || !activeAccount(caller)) throw new HttpsError('permission-denied', 'This account is not active.');
  if (!(await hasCapability(db, callerUid, caller, 'finance'))) {
    throw new HttpsError('permission-denied', 'Your account does not handle payments.');
  }

  const data = request.data || {};
  const targetUid = String(data.targetUid || '').trim();
  const amount = Number(data.amount);
  const note = String(data.note || '').trim().slice(0, 500);
  const requestId = String(data.requestId || '').trim();

  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw new HttpsError('invalid-argument', 'Enter a valid top-up amount.');
  }
  if (!REQUEST_ID_RE.test(requestId)) {
    throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  }

  const targetRef = db.collection('users').doc(targetUid);
  const operationRef = db.collection('pointTopUpOperations').doc(`${callerUid}_${requestId}`);

  try {
    const result = await db.runTransaction(async tx => {
      const opSnap = await tx.get(operationRef);
      if (opSnap.exists) {
        const op = opSnap.data() || {};
        if (op.targetUid !== targetUid || Number(op.amount) !== amount) {
          throw new HttpsError('already-exists', 'That request ID is already used for another top-up.');
        }
        return { id: op.auditId, credited: false, replay: true };
      }

      const [latestCallerSnap, targetSnap] = await Promise.all([tx.get(callerRef), tx.get(targetRef)]);
      if (!latestCallerSnap.exists || !activeAccount(latestCallerSnap.data() || {})) {
        throw new HttpsError('permission-denied', 'This admin account is not active.');
      }
      const latestCaller = latestCallerSnap.data() || {};
      if (!STAFF_ROLES.includes(latestCaller.role)) {
        throw new HttpsError('permission-denied', 'Your account does not handle payments.');
      }
      if (!targetSnap.exists) throw new HttpsError('not-found', 'Target user does not exist.');

      const target = targetSnap.data() || {};
      if (!['dealer', 'reseller'].includes(target.role)) {
        throw new HttpsError('failed-precondition', 'Only dealer/reseller accounts can receive admin point top-ups.');
      }
      if (!activeAccount(target)) throw new HttpsError('failed-precondition', 'Target account is not active.');

      const currentBalance = Number(target.walletBalance || 0);
      if (!Number.isFinite(currentBalance) || currentBalance < 0 || !Number.isSafeInteger(Math.round(currentBalance * 100))) {
        throw new HttpsError('failed-precondition', 'Target wallet balance is invalid.');
      }

      const newBalance = currentBalance + amount;
      if (!Number.isSafeInteger(Math.round(newBalance * 100))) {
        throw new HttpsError('failed-precondition', 'Wallet balance is too large.');
      }

      const auditRef = db.collection('pointTopUps').doc();
      tx.update(targetRef, { walletBalance: newBalance });
      tx.set(auditRef, {
        userId: targetUid,
        userName: String(target.name || target.displayName || '').slice(0, 160),
        userRole: String(target.role || ''),
        amount,
        note,
        adminUid: callerUid,
        adminName: String(latestCaller.name || latestCaller.displayName || '').slice(0, 160),
        adminRole: String(latestCaller.role),
        requestId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.create(operationRef, {
        callerUid,
        targetUid,
        amount,
        requestId,
        auditId: auditRef.id,
        status: 'completed',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { id: auditRef.id, credited: true, replay: false };
    });

    if (!result.replay) {
      await logAudit({
        action: 'admin_point_topup',
        targetUid,
        performedBy: callerUid,
        performedByRole: caller.role,
        details: { amount, note, auditId: result.id, requestId },
      });
    }

    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('adminTopUpPoints', error, { userId: callerUid, targetUid, requestId });
    throw new HttpsError('internal', 'Could not complete the point top-up.');
  }
});
