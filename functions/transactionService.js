const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const DEALER_SERVICES = ['Mobile Banking'];
const RESELLER_SERVICES = ['Recharge', 'Internet', 'Remittance'];
const APPROVER_ROLES = ['admin', 'superadmin'];
const OPERATOR_ROLES = ['dealer', 'reseller'];

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
}

async function getActor(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const profile = snap.data();
  return {
    uid,
    role: profile.role || '',
    name: profile.fullName || profile.name || profile.displayName || profile.phone || uid,
  };
}

function assertOperatorCanHandle(actor, order) {
  if (!OPERATOR_ROLES.includes(actor.role)) {
    throw new HttpsError('permission-denied', 'Only a dealer or reseller can accept an approved order.');
  }
  if (actor.role === 'dealer' && !DEALER_SERVICES.includes(order.service)) {
    throw new HttpsError('permission-denied', 'Your dealer account cannot handle this service.');
  }
  if (actor.role === 'reseller' && !RESELLER_SERVICES.includes(order.service)) {
    throw new HttpsError('permission-denied', 'Your reseller account cannot handle this service.');
  }
  if (actor.role === 'dealer' && order.dealerId && order.dealerId !== actor.uid) {
    throw new HttpsError('permission-denied', 'This order is assigned to another dealer.');
  }
  if (actor.role === 'reseller' && order.resellerId && order.resellerId !== actor.uid) {
    throw new HttpsError('permission-denied', 'This order is assigned to another reseller.');
  }
}

// Admin/superadmin approval is deliberately separate from claiming the order.
// Approval never changes status or claimedBy, so the eventual dealer/reseller
// remains the Operator on the receipt.
exports.approveTransaction = onCall(async (request) => {
  requireAuth(request);
  const actor = await getActor(request.auth.uid);
  if (!APPROVER_ROLES.includes(actor.role)) {
    throw new HttpsError('permission-denied', 'Only an admin or superadmin can approve an order.');
  }

  const id = String(request.data?.transactionId || '');
  if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');

  const db = admin.firestore();
  const ref = db.collection('transactions').doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data();
    if (order.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Only pending orders can be approved.');
    }
    if (order.approved === true) {
      throw new HttpsError('already-exists', 'This order is already approved.');
    }
    tx.update(ref, {
      approved: true,
      approvedBy: actor.uid,
      approvedByName: actor.name,
      approvedByRole: actor.role,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, transactionId: id };
});

// Dealer/reseller acceptance is the Operator assignment step. It is only
// available after an admin/superadmin approval and is race-safe: the first
// operator to claim the pending order wins.
exports.acceptTransaction = onCall(async (request) => {
  requireAuth(request);
  const actor = await getActor(request.auth.uid);
  assertOperatorCanHandle(actor, { service: request.data?.service || '' });

  const id = String(request.data?.transactionId || '');
  if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');

  const db = admin.firestore();
  const ref = db.collection('transactions').doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data();
    assertOperatorCanHandle(actor, order);
    if (order.status !== 'pending' || order.claimedBy) {
      throw new HttpsError('failed-precondition', 'This order was already accepted by another operator.');
    }
    if (order.approved !== true || !order.approvedBy) {
      throw new HttpsError('failed-precondition', 'This order must be approved by an admin or superadmin first.');
    }
    tx.update(ref, {
      status: 'processing',
      claimedBy: actor.uid,
      claimedByRole: actor.role,
      claimedByName: actor.name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, transactionId: id };
});

// Completion is still performed by the Operator who claimed the order.
// Approval is never overwritten here, keeping Approved By and Operator
// permanently distinct in the transaction record and receipt.
exports.completeTransaction = onCall(async (request) => {
  requireAuth(request);
  const actor = await getActor(request.auth.uid);
  if (!OPERATOR_ROLES.includes(actor.role)) {
    throw new HttpsError('permission-denied', 'Only the dealer/reseller Operator can complete an order.');
  }

  const id = String(request.data?.transactionId || '');
  const pin = String(request.data?.pin || '');
  const receiptUrl = String(request.data?.receiptUrl || '');
  if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new HttpsError('invalid-argument', 'A 4-digit collection PIN is required.');
  }
  if (!receiptUrl) throw new HttpsError('invalid-argument', 'The transfer receipt is required before completion.');

  const db = admin.firestore();
  const ref = db.collection('transactions').doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data();
    if (order.status !== 'processing' || order.claimedBy !== actor.uid) {
      throw new HttpsError('failed-precondition', 'Only the operator who accepted this order can complete it.');
    }
    if (order.approved !== true || !order.approvedBy) {
      throw new HttpsError('failed-precondition', 'This order has no valid admin approval.');
    }

    tx.update(ref, {
      status: 'completed',
      pin,
      receiptUrl,
      completedBy: actor.uid,
      completedByName: actor.name,
      completedByRole: actor.role,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, transactionId: id };
});
