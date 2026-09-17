const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit } = require('./logService');

const SERVICE_ROLES = {
  recharge: ['reseller'],
  internet: ['reseller'],
  mobilebanking: ['dealer'],
  remittance: ['reseller'],
};

async function getActor(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const data = snap.data() || {};
  return { uid, role: data.role || '', name: data.fullName || data.name || data.displayName || data.phone || uid };
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function assertCanReject(actor, order, service) {
  if (!['admin', 'superadmin', 'dealer', 'reseller'].includes(actor.role)) {
    throw new HttpsError('permission-denied', 'Only authorized staff can reject an order.');
  }
  if (['admin', 'superadmin'].includes(actor.role)) return;
  if (!SERVICE_ROLES[service]?.includes(actor.role)) {
    throw new HttpsError('permission-denied', 'Your role cannot reject this service.');
  }
  const assignedUid = actor.role === 'dealer' ? order.dealerId : order.resellerId;
  if (assignedUid && assignedUid !== actor.uid) {
    throw new HttpsError('permission-denied', 'This order is assigned to another operator.');
  }
}

function buildRejectCallable(service) {
  return onCall(async (request) => {
    const uid = requireAuth(request);
    const transactionId = String(request.data?.transactionId || '');
    const reason = String(request.data?.reason || '').trim().slice(0, 500);
    if (!transactionId) throw new HttpsError('invalid-argument', 'transactionId is required.');

    const db = admin.firestore();
    const actor = await getActor(db, uid);
    const ref = db.collection('transactions').doc(transactionId);
    let auditOrder = null;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'That order does not exist.');
      const order = snap.data() || {};
      if (order.chargedServiceKind !== service) throw new HttpsError('failed-precondition', 'Wrong service.');
      if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'That order is no longer pending.');
      if (order.claimedBy) throw new HttpsError('failed-precondition', 'That order has already been accepted.');
      assertCanReject(actor, order, service);

      const rejectedBy = order.rejectedBy && typeof order.rejectedBy === 'object' && !Array.isArray(order.rejectedBy)
        ? { ...order.rejectedBy }
        : {};
      if (rejectedBy[uid]) {
        throw new HttpsError('already-exists', 'You have already rejected this order.');
      }
      rejectedBy[uid] = {
        name: actor.name,
        role: actor.role,
        reason: reason || 'Rejected by staff.',
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      tx.update(ref, {
        rejectedBy,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      auditOrder = { customerId: order.customerId || null, service: order.service || null };
    });

    void logAudit({
      action: 'transaction_rejected_by_operator',
      targetUid: auditOrder?.customerId || null,
      performedBy: actor.uid,
      performedByRole: actor.role,
      details: { transactionId, service: auditOrder?.service || service, reason: reason || 'Rejected by staff.' },
    });

    return { rejected: true, terminal: false, transactionId };
  });
}

exports.rejectRechargeTransaction = buildRejectCallable('recharge');
exports.rejectInternetPackageTransaction = buildRejectCallable('internet');
exports.rejectMobileBankingTransaction = buildRejectCallable('mobilebanking');
exports.rejectRemittanceTransaction = buildRejectCallable('remittance');
