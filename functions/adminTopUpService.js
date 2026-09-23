const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { hasCapability } = require('./accessControl');
const { logAudit, logServerError } = require('./logService');

const MAX_AMOUNT = 100000;
// Staff who may hold the 'finance' capability (functions/accessControl.js).
const ADMIN_ROLES = ['admin', 'superadmin', 'support', 'finance'];
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;
function requireSessionMatch(request, user) {
  const sessionId=request.data?.sessionId, deviceId=request.data?.deviceId;
  if(typeof sessionId!=='string'||!SESSION_ID_RE.test(sessionId)||typeof deviceId!=='string'||!DEVICE_ID_RE.test(deviceId)) throw new HttpsError('failed-precondition','Your secure session is missing. Please sign in again.');
  if(user.activeSessionId!==sessionId||user.activeDeviceId!==deviceId) throw new HttpsError('permission-denied','This device session is no longer active. Please sign in again.');
}

function activeAccount(profile) {
  return !!profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && profile.active !== false && profile.mergedInto == null;
}

exports.adminTopUpPoints = onCall({ enforceAppCheck: false }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const db = admin.firestore();
  const callerUid = request.auth.uid;
  const callerSnap = await db.collection('users').doc(callerUid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!caller || !ADMIN_ROLES.includes(caller.role) || !(await hasCapability(db, callerUid, caller, 'finance'))) {
    throw new HttpsError('permission-denied', 'Your account does not handle payments.');
  }
  if (!activeAccount(caller)) {
    throw new HttpsError('permission-denied', 'This account is not active.');
  }

  const data = request.data || {};
  const targetUid = String(data.targetUid || '').trim();
  const amount = Number(data.amount);
  const note = String(data.note || '').trim().slice(0, 500);
  const requestId = String(data.requestId || '').trim();

  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT || !Number.isSafeInteger(amountCents) || Math.abs(amount * 100 - amountCents) > 1e-9) {
    throw new HttpsError('invalid-argument', 'Enter a valid top-up amount with at most 2 decimal places.');
  }
  if (!REQUEST_ID_RE.test(requestId)) {
    throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  }

  const targetRef = db.collection('users').doc(targetUid);
  const operationRef = db.collection('pointTopUpOperations').doc(`${callerUid}_${requestId}`);

  try {
    const result = await db.runTransaction(async tx => {
      // Revalidate the caller's live role/session before exposing even an idempotent replay.
      const callerTxSnap = await tx.get(db.collection('users').doc(callerUid));
      if (!callerTxSnap.exists) {
        throw new HttpsError('permission-denied', 'Your admin privileges are no longer active.');
      }
      const callerTx = callerTxSnap.data() || {};
      requireSessionMatch(request, callerTx);
      if (!activeAccount(callerTx) || !ADMIN_ROLES.includes(callerTx.role)) {
        throw new HttpsError('permission-denied', 'Your admin privileges are no longer active.');
      }

      const opSnap = await tx.get(operationRef);
      if (opSnap.exists) {
        const op = opSnap.data() || {};
        if (op.targetUid !== targetUid || Number(op.amount) !== amount) {
          throw new HttpsError('already-exists', 'That request ID is already used for another top-up.');
        }
        return { id: op.auditId, credited: false, replay: true };
      }

      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) throw new HttpsError('not-found', 'Target user does not exist.');

      const target = targetSnap.data();
      if (!['dealer', 'reseller'].includes(target.role)) {
        throw new HttpsError('failed-precondition', 'Only dealer/reseller accounts can receive admin point top-ups.');
      }
      if (!activeAccount(target)) {
        throw new HttpsError('failed-precondition', 'The target account is not active.');
      }

      const currentBalance = target.walletBalance == null ? 0 : Number(target.walletBalance);
      const currentBalanceCents = Math.round(currentBalance * 100);
      if (!Number.isFinite(currentBalance) || currentBalance < 0 || !Number.isSafeInteger(currentBalanceCents) || Math.abs(currentBalance * 100 - currentBalanceCents) > 1e-9) {
        throw new HttpsError('failed-precondition', 'Target wallet balance is invalid.');
      }

      const newBalanceCents = currentBalanceCents + amountCents;
      if (!Number.isSafeInteger(newBalanceCents)) {
        throw new HttpsError('failed-precondition', 'Wallet balance is too large.');
      }
      const newBalance = newBalanceCents / 100;

      const auditRef = db.collection('pointTopUps').doc();
      tx.update(targetRef, { walletBalance: newBalance });
      tx.set(auditRef, {
        userId: targetUid,
        userName: String(target.name || target.displayName || ''),
        userRole: String(target.role || ''),
        amount,
        note,
        adminUid: callerUid,
        adminName: String(caller.name || caller.displayName || ''),
        adminRole: String(callerTxSnap.data().role),
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
