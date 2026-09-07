// Admin approve/reject of identity verification requests - the SERVER half
// of the "Verified" seller badge (Phase 3 of the Marketplace PRD, section
// 12 + the sitemap's Admin Panel > Verification Management).
//
// WHY THIS FILE EXISTS: firestore.rules freezes users/{uid}.verified on
// every client write (see the users/{uid} update rule) and only lets a
// client write status: 'pending' on verificationRequests/{uid} (see that
// collection's rule) - so there is no client-writable path to the badge at
// all. These two callables, using the Admin SDK, are the only way it can
// be granted or a request can be resolved. Mirrors the approveTopup/
// rejectTopup pattern in walletService.js: one transaction that updates
// both the request doc and the user doc together, so they can never end
// up out of sync (e.g. request shows "approved" but the badge never
// actually appeared).
//
// Client call sites (see src/firebase/verificationService.js):
//   verificationService.approveVerification -> approveVerification
//   verificationService.rejectVerification  -> rejectVerification

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function requireAdmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || !['admin', 'superadmin'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Only an admin can review verification requests.');
  }
  return caller;
}

/** Admin approves a pending verification request: marks it approved and
 * sets the requester's users/{uid}.verified = true in one transaction. */
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
      if (reqSnap.data().status !== 'pending') {
        throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      }
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');

      tx.update(reqRef, {
        status: 'approved',
        note: '',
        reviewedBy: callerUid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(userRef, { verified: true });
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('approveVerification', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', 'Could not approve this request.');
  }

  await logAudit({
    action: 'verification_approved',
    targetUid,
    performedBy: callerUid,
    performedByRole: caller.role,
  });

  return { ok: true };
});

/** Admin rejects a pending verification request with a reason. Does not
 * touch users/{uid}.verified - a rejection just leaves the badge ungranted
 * (or revokes nothing, since a rejected request was never approved). The
 * user can resubmit afterward (firestore.rules allows a fresh 'pending'
 * write once status != 'approved'). */
exports.rejectVerification = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);

  const { targetUid, reason } = request.data || {};
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');

  const reqRef = db.collection('verificationRequests').doc(targetUid);

  try {
    await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new HttpsError('not-found', 'That verification request does not exist.');
      if (reqSnap.data().status !== 'pending') {
        throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      }
      tx.update(reqRef, {
        status: 'rejected',
        note: (reason || '').trim(),
        reviewedBy: callerUid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('rejectVerification', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', 'Could not reject this request.');
  }

  await logAudit({
    action: 'verification_rejected',
    targetUid,
    performedBy: callerUid,
    performedByRole: caller.role,
    details: { reason: (reason || '').trim() },
  });

  return { ok: true };
});
