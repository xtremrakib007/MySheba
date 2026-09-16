const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Mobile Banking', 'Remittance'];
const STAFF_ROLES = ['dealer', 'reseller', 'admin', 'superadmin'];

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function getActor(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const actor = snap.data() || {};
  if (!STAFF_ROLES.includes(actor.role)) throw new HttpsError('permission-denied', 'Staff access is required.');
  return actor;
}

function canReject(actor, tx) {
  if (actor.role === 'admin' || actor.role === 'superadmin') return true;
  if (actor.role === 'dealer') return tx.service === 'Mobile Banking' && tx.dealerId === actor.uid;
  if (actor.role === 'reseller') {
    return ['Recharge', 'Internet', 'Remittance'].includes(tx.service) &&
      (tx.resellerId === actor.uid || tx.dealerId === actor.uid || tx.assignedTo === actor.uid || tx.claimedBy === actor.uid);
  }
  return false;
}

exports.rejectTransaction = onCall(async request => {
  const uid = requireAuth(request);
  const actor = await getActor(uid);
  const id = String(request.data?.transactionId || '').trim();
  const reason = String(request.data?.reason || '').trim().slice(0, 500);
  if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  if (!reason) throw new HttpsError('invalid-argument', 'A rejection reason is required.');

  const db = admin.firestore();
  const ref = db.collection('transactions').doc(id);
  let result;

  await db.runTransaction(async t => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Transaction not found.');
    const tx = snap.data() || {};
    if (!ALLOWED_SERVICES.includes(tx.service)) throw new HttpsError('failed-precondition', 'This transaction type cannot be rejected here.');
    if (!canReject(actor, { ...tx, dealerId: tx.dealerId, resellerId: tx.resellerId })) {
      throw new HttpsError('permission-denied', 'You are not authorized to reject this transaction.');
    }
    if (!['pending', 'approved', 'processing'].includes(tx.status)) {
      throw new HttpsError('failed-precondition', 'Only active transactions can be rejected.');
    }
    if (tx.rejected === true) {
      result = { id, rejected: true, alreadyRejected: true };
      return;
    }

    t.update(ref, {
      status: 'rejected',
      rejected: true,
      rejectReason: reason,
      rejectedBy: uid,
      rejectedByRole: actor.role,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    result = { id, rejected: true };
  });

  return result;
});
