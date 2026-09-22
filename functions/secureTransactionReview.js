const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const SERVICE_BY_FUNCTION = {
  rejectRechargeTransaction: 'recharge', rejectInternetPackageTransaction: 'internet',
  rejectMobileBankingTransaction: 'mobilebanking', rejectRemittanceTransaction: 'remittance',
};
const ROLE_SERVICES = {
  dealer: ['mobilebanking'], reseller: ['recharge', 'internet', 'remittance'],
  admin: ['recharge', 'internet', 'mobilebanking', 'remittance'], superadmin: ['recharge', 'internet', 'mobilebanking', 'remittance'],
};
async function getActor(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const profile = snap.data();
  if (profile.suspended || profile.inactive || profile.disabled || profile.mergedInto) throw new HttpsError('permission-denied', 'Your staff account is not active.');
  const role = String(profile.role || '');
  if (!ROLE_SERVICES[role]) throw new HttpsError('permission-denied', 'Only authorized staff can reject an order.');
  return { uid, role, dealerId: profile.dealerId || null, resellerId: profile.resellerId || null };
}
function makeRejectCallable(service) {
  return onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
    const db = admin.firestore(); const actor = await getActor(db, request.auth.uid);
    if (!ROLE_SERVICES[actor.role].includes(service)) throw new HttpsError('permission-denied', 'Your role cannot reject this service.');
    const transactionId = String(request.data?.transactionId || '').trim(); const reason = String(request.data?.reason || '').trim();
    if (!transactionId) throw new HttpsError('invalid-argument', 'transactionId is required.');
    if (reason.length > 500) throw new HttpsError('invalid-argument', 'Rejection reason is too long.');
    const ref = db.collection('transactions').doc(transactionId);
    let order;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order does not exist.');
      order = snap.data();
      if (order.chargedServiceKind !== service) throw new HttpsError('failed-precondition', 'Wrong service.');
      if (order.status !== 'pending' || order.claimedBy || order.rejected === true) throw new HttpsError('failed-precondition', 'That order has already been processed.');
      if (actor.role === 'dealer' && order.dealerId && order.dealerId !== actor.uid) throw new HttpsError('permission-denied', 'This order is assigned to another dealer.');
      if (actor.role === 'reseller' && order.resellerId && order.resellerId !== actor.uid) throw new HttpsError('permission-denied', 'This order is assigned to another reseller.');
      tx.update(ref, {
        status: 'completed', approved: false, rejected: true, rejectReason: reason || 'Rejected by staff.',
        rejectedBy: actor.uid, rejectedByRole: actor.role, rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await logAudit({
      action: 'transaction_rejected',
      targetUid: order?.customerId || null,
      performedBy: actor.uid,
      performedByRole: actor.role,
      details: {
        transactionId,
        service,
        amount: Number.isFinite(Number(order?.amount)) ? Number(order.amount) : null,
        reason: reason.slice(0, 500),
      },
    });
    return { rejected: true };
  });
}
exports.rejectRechargeTransaction = makeRejectCallable('recharge');
exports.rejectInternetPackageTransaction = makeRejectCallable('internet');
exports.rejectMobileBankingTransaction = makeRejectCallable('mobilebanking');
exports.rejectRemittanceTransaction = makeRejectCallable('remittance');
