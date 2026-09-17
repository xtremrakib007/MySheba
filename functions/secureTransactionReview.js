const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const SERVICE_BY_FUNCTION = {
  rejectRechargeTransaction: 'recharge',
  rejectInternetPackageTransaction: 'internet',
  rejectMobileBankingTransaction: 'mobilebanking',
  rejectRemittanceTransaction: 'remittance',
};

const ROLE_SERVICES = {
  dealer: ['mobilebanking'],
  reseller: ['recharge', 'internet', 'remittance'],
  admin: ['recharge', 'internet', 'mobilebanking', 'remittance'],
  superadmin: ['recharge', 'internet', 'mobilebanking', 'remittance'],
};

async function getActor(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const profile = snap.data();
  const role = String(profile.role || '');
  if (!ROLE_SERVICES[role]) throw new HttpsError('permission-denied', 'Only authorized staff can reject an order.');
  return { uid, role, dealerId: profile.dealerId || null };
}

function makeRejectCallable(service) {
  return onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const db = admin.firestore();
    const actor = await getActor(db, request.auth.uid);
    if (!ROLE_SERVICES[actor.role].includes(service)) {
      throw new HttpsError('permission-denied', 'Your role cannot reject this service.');
    }

    const transactionId = String(request.data?.transactionId || '').trim();
    const reason = String(request.data?.reason || '').trim();
    if (!transactionId) throw new HttpsError('invalid-argument', 'transactionId is required.');
    if (reason.length > 500) throw new HttpsError('invalid-argument', 'Rejection reason is too long.');

    const ref = db.collection('transactions').doc(transactionId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'That order does not exist.');
      const order = snap.data();
      if (order.chargedServiceKind !== service) throw new HttpsError('failed-precondition', 'Wrong service.');
      if (order.status !== 'pending' || order.claimedBy) {
        throw new HttpsError('failed-precondition', 'That order has already been accepted.');
      }
      if (actor.role === 'dealer' && order.dealerId && order.dealerId !== actor.uid) {
        throw new HttpsError('permission-denied', 'This order is assigned to another dealer.');
      }
      if (actor.role === 'reseller' && order.resellerId && order.resellerId !== actor.uid) {
        throw new HttpsError('permission-denied', 'This order is assigned to another reseller.');
      }
      tx.update(ref, {
        rejected: true,
        rejectReason: reason || 'Rejected by staff.',
        rejectedBy: actor.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return { rejected: true };
  });
}

exports.rejectRechargeTransaction = makeRejectCallable('recharge');
exports.rejectInternetPackageTransaction = makeRejectCallable('internet');
exports.rejectMobileBankingTransaction = makeRejectCallable('mobilebanking');
exports.rejectRemittanceTransaction = makeRejectCallable('remittance');
