const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');

const MAX_AMOUNT = 100000;
const ADMIN_ROLES = ['admin', 'superadmin'];

exports.adminTopUpPoints = onCall(async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');

  const db = admin.firestore();
  const callerUid = request.auth.uid;
  const callerSnap = await db.collection('users').doc(callerUid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!caller || !ADMIN_ROLES.includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Only admin/superadmin can top up points.');
  }

  const data = request.data || {};
  const targetUid = String(data.targetUid || '').trim();
  const amount = Number(data.amount);
  const note = String(data.note || '').trim().slice(0, 500);

  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new HttpsError('invalid-argument', 'Enter a valid top-up amount.');
  }

  const targetRef = db.collection('users').doc(targetUid);
  const auditRef = db.collection('pointTopUps').doc();

  try {
    await db.runTransaction(async tx => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) throw new HttpsError('not-found', 'Target user does not exist.');

      const target = targetSnap.data();
      if (!['dealer', 'reseller'].includes(target.role)) {
        throw new HttpsError('failed-precondition', 'Only dealer/reseller accounts can receive admin point top-ups.');
      }

      const currentBalance = Number(target.walletBalance || 0);
      if (!Number.isFinite(currentBalance) || currentBalance < 0) {
        throw new HttpsError('failed-precondition', 'Target wallet balance is invalid.');
      }

      const newBalance = currentBalance + amount;
      if (!Number.isSafeInteger(Math.round(newBalance * 100))) {
        throw new HttpsError('failed-precondition', 'Wallet balance is too large.');
      }

      tx.update(targetRef, { walletBalance: newBalance });
      tx.set(auditRef, {
        userId: targetUid,
        userName: String(target.name || target.displayName || ''),
        userRole: String(target.role || ''),
        amount,
        note,
        adminUid: callerUid,
        adminName: String(caller.name || caller.displayName || ''),
        adminRole: String(caller.role),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await logAudit({
      action: 'admin_point_topup',
      targetUid,
      performedBy: callerUid,
      performedByRole: caller.role,
      details: { amount, note, auditId: auditRef.id },
    });

    return { id: auditRef.id, credited: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('adminTopUpPoints', error, { userId: callerUid, targetUid });
    throw new HttpsError('internal', 'Could not complete the point top-up.');
  }
});
