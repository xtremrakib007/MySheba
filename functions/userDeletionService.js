const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

function activeAdmin(profile) { return profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto && ['admin', 'superadmin'].includes(profile.role); }

async function deleteStoragePrefix(bucket, prefix) {
  const [files] = await bucket.getFiles({ prefix });
  if (!files.length) return;
  await Promise.all(files.map((file) => file.delete()));
}

exports.deleteManagedUser = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
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

  const [txSnap, topupSnap] = await Promise.all([
    db.collection('transactions').where('customerId', '==', targetUid).get(),
    db.collection('topups').where('userId', '==', targetUid).get(),
  ]);
  if (txSnap.docs.some((d) => ['pending', 'processing'].includes(d.data()?.status))) throw new HttpsError('failed-precondition', 'The account has an active transaction and cannot be deleted yet.');
  if (topupSnap.docs.some((d) => d.data()?.status === 'pending')) throw new HttpsError('failed-precondition', 'The account has a pending top-up and cannot be deleted yet.');

  try {
    await admin.auth().updateUser(targetUid, { disabled: true });
    await targetRef.update({ disabled: true, inactive: true, deletedAt: admin.firestore.FieldValue.serverTimestamp(), deletedBy: callerUid });
  } catch (err) {
    await logServerError('userDeletion.prepare', err, { userId: targetUid, performedBy: callerUid });
    throw new HttpsError('internal', 'Could not prepare the account for deletion.');
  }

  try {
    const bucket = admin.storage().bucket();
    await Promise.all([
      deleteStoragePrefix(bucket, `verification-documents/${targetUid}/`),
      deleteStoragePrefix(bucket, `topup-receipts/${targetUid}/`),
      db.collection('biometricTemplates').doc(targetUid).delete().catch(() => {}),
      db.collection('pendingBiometricTemplates').doc(targetUid).delete().catch(() => {}),
      db.collection('securityPins').doc(targetUid).delete().catch(() => {}),
      db.collection('temporaryAuthCleanup').doc(targetUid).delete().catch(() => {}),
      db.collection('mergeOtps').doc(targetUid).delete().catch(() => {}),
      target.userId != null ? db.collection('userIds').doc(String(target.userId)).delete().catch(() => {}) : Promise.resolve(),
    ]);
    await admin.auth().deleteUser(targetUid);
    await db.recursiveDelete(targetRef);
    await logAudit({ action: 'account_deleted', targetUid, performedBy: callerUid, performedByRole: caller.role, details: { targetRole: target.role } });
    return { ok: true, uid: targetUid };
  } catch (err) {
    await logServerError('userDeletion.cleanup', err, { userId: targetUid, performedBy: callerUid });
    throw new HttpsError('internal', 'The account was disabled but cleanup did not fully complete.');
  }
});
