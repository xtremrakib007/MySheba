const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');

function activeAdmin(profile) {
  return profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto && ['admin', 'superadmin'].includes(profile.role);
}

exports.deleteManagedUser = onCall({ enforceAppCheck: true }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const callerSnap = await db.collection('users').doc(callerUid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!activeAdmin(caller)) throw new HttpsError('permission-denied', 'Only an active admin can delete accounts.');

  const targetUid = typeof request.data?.targetUid === 'string' ? request.data.targetUid.trim() : '';
  if (!targetUid || targetUid.length > 128 || targetUid === callerUid) throw new HttpsError('invalid-argument', 'A valid target account is required.');
  const targetRef = db.collection('users').doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
  const target = targetSnap.data() || {};

  if (target.role === 'superadmin' || (target.role === 'admin' && caller.role !== 'superadmin')) throw new HttpsError('permission-denied', 'You cannot delete that staff account.');
  if (target.mergedInto) throw new HttpsError('failed-precondition', 'Merged accounts cannot be deleted from this screen.');
  const balance = Number(target.walletBalance || 0);
  if (!Number.isFinite(balance) || Math.abs(balance) > 0.000001) throw new HttpsError('failed-precondition', 'The account must have a zero wallet balance before deletion.');

  const pendingTx = await db.collection('transactions').where('customerId', '==', targetUid).where('status', 'in', ['pending', 'processing']).limit(1).get();
  if (!pendingTx.empty) throw new HttpsError('failed-precondition', 'The account has an active transaction and cannot be deleted yet.');
  const pendingTopup = await db.collection('topups').where('userId', '==', targetUid).where('status', '==', 'pending').limit(1).get();
  if (!pendingTopup.empty) throw new HttpsError('failed-precondition', 'The account has a pending top-up and cannot be deleted yet.');

  // Disable first so any partial failure leaves the account unusable.
  try {
    await admin.auth().updateUser(targetUid, { disabled: true });
    await targetRef.update({ disabled: true, inactive: true, deletedAt: admin.firestore.FieldValue.serverTimestamp(), deletedBy: callerUid });
  } catch (err) {
    await logServerError('userDeletion.prepare', err, { userId: targetUid, performedBy: callerUid });
    throw new HttpsError('internal', 'Could not prepare the account for deletion.');
  }

  try {
    await Promise.all([
      db.collection('biometricTemplates').doc(targetUid).delete().catch(() => {}),
      db.collection('pendingBiometricTemplates').doc(targetUid).delete().catch(() => {}),
      db.collection('securityPins').doc(targetUid).delete().catch(() => {}),
      db.collection('temporaryAuthCleanup').doc(targetUid).delete().catch(() => {}),
      db.collection('mergeOtps').doc(targetUid).delete().catch(() => {}),
      target.userId != null ? db.collection('userIds').doc(String(target.userId)).delete().catch(() => {}) : Promise.resolve(),
    ]);
    // Delete Auth before removing the profile. If Firestore cleanup fails,
    // the remaining profile is already marked disabled/inactive and can be repaired safely.
    await admin.auth().deleteUser(targetUid);
    await db.recursiveDelete(targetRef);
    await logAudit({ action: 'account_deleted', targetUid, performedBy: callerUid, performedByRole: caller.role, details: { targetRole: target.role } });
    return { ok: true, uid: targetUid };
  } catch (err) {
    await logServerError('userDeletion.cleanup', err, { userId: targetUid, performedBy: callerUid });
    throw new HttpsError('internal', 'The account was disabled but cleanup did not fully complete.');
  }
});
