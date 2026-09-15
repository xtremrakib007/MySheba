// Admin approve/reject of identity verification requests - server-side review.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
const { finalizeKycFaceTemplate } = require('./faceVerificationService');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function requireAdmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || !['admin', 'superadmin'].includes(caller.role)) throw new HttpsError('permission-denied', 'Only an admin can review verification requests.');
  return caller;
}

exports.approveVerification = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);
  const { targetUid } = request.data || {};
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
  const reqRef = db.collection('verificationRequests').doc(targetUid);
  const userRef = db.collection('users').doc(targetUid);
  try {
    await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new HttpsError('not-found', 'That verification request does not exist.');
      if (reqSnap.data().status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');
      await finalizeKycFaceTemplate(tx, db, targetUid);
      tx.update(reqRef, { status: 'approved', note: '', rejectionReason: '', reviewedBy: callerUid, reviewedAt: admin.firestore.FieldValue.serverTimestamp(), biometricVerified: true });
      tx.update(userRef, { verified: true, verificationStatus: 'approved' });
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('approveVerification', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', 'Could not approve this request.');
  }
  await logAudit({ action: 'verification_approved', targetUid, performedBy: callerUid, performedByRole: caller.role });
  return { ok: true };
});

exports.rejectVerification = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);
  const { targetUid, reason } = request.data || {};
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
  const reqRef = db.collection('verificationRequests').doc(targetUid);
  const cleanReason = String(reason || '').trim();
  try {
    await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new HttpsError('not-found', 'That verification request does not exist.');
      if (reqSnap.data().status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      tx.update(reqRef, { status: 'rejected', note: cleanReason, rejectionReason: cleanReason, reviewedBy: callerUid, reviewedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.delete(db.collection('pendingBiometricTemplates').doc(targetUid));
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('rejectVerification', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', 'Could not reject this request.');
  }
  await logAudit({ action: 'verification_rejected', targetUid, performedBy: callerUid, performedByRole: caller.role, details: { reason: cleanReason } });
  return { ok: true };
});
