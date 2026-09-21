const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Bill Payment', 'Mobile Banking', 'Remittance'];
const SERVICE_ALIASES = {
  recharge: 'Recharge',
  internet: 'Internet',
  mobilebanking: 'Mobile Banking',
  'mobile banking': 'Mobile Banking',
  remittance: 'Remittance'
};
const STAFF_ROLES = ['dealer', 'reseller', 'admin', 'superadmin'];
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;

function requireSessionMatch(request, account) {
  const sessionId = request.data?.sessionId;
  const deviceId = request.data?.deviceId;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId) ||
      typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('failed-precondition', 'Your secure session is missing. Please sign in again.');
  }
  if (account.activeSessionId !== sessionId || account.activeDeviceId !== deviceId) {
    throw new HttpsError('permission-denied', 'This device session is no longer active. Please sign in again.');
  }
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function normalizeService(value) {
  const raw = String(value || '').trim();
  return SERVICE_ALIASES[raw.toLowerCase()] || raw;
}

function activeAccount(account) {
  return !!account &&
    account.mergedInto == null &&
    account.suspended !== true &&
    account.inactive !== true &&
    account.disabled !== true &&
    account.active !== false;
}

async function getActor(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const actor = snap.data() || {};
  if (!STAFF_ROLES.includes(actor.role) || !activeAccount(actor)) {
    throw new HttpsError('permission-denied', 'Your staff account is not active.');
  }
  return { uid, ...actor };
}

function canReject(actor, tx) {
  if (actor.role === 'admin' || actor.role === 'superadmin') return true;
  if (actor.role === 'dealer') {
    return tx.service === 'Mobile Banking' &&
      (tx.dealerId === actor.uid || tx.assignedTo === actor.uid || tx.claimedBy === actor.uid);
  }
  if (actor.role === 'reseller') {
    return ['Recharge', 'Internet', 'Bill Payment', 'Remittance'].includes(tx.service) &&
      (tx.resellerId === actor.uid || tx.assignedTo === actor.uid || tx.claimedBy === actor.uid);
  }
  return false;
}

exports.rejectTransaction = onCall({ enforceAppCheck: true }, async request => {
  const uid = requireAuth(request);
  const actor = await getActor(uid);
  requireSessionMatch(request, actor);
  const id = String(request.data?.transactionId || '').trim();
  const reason = String(request.data?.reason || '').trim().slice(0, 500);
  if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  if (!reason) throw new HttpsError('invalid-argument', 'A rejection reason is required.');

  const db = admin.firestore();
  const ref = db.collection('transactions').doc(id);
  let result;

  await db.runTransaction(async t => {
    const actorSnap = await t.get(db.collection('users').doc(uid));
    if (!actorSnap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
    const currentActor = { uid, ...(actorSnap.data() || {}) };
    if (!STAFF_ROLES.includes(currentActor.role) || !activeAccount(currentActor)) {
      throw new HttpsError('permission-denied', 'Your staff account is no longer active.');
    }
    requireSessionMatch(request, currentActor);

    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Transaction not found.');
    const tx = snap.data() || {};
    const service = normalizeService(tx.service || tx.chargedServiceKind);

    if (!ALLOWED_SERVICES.includes(service)) {
      throw new HttpsError('failed-precondition', 'This transaction type cannot be rejected here.');
    }

    if (!canReject(currentActor, { ...tx, service })) {
      throw new HttpsError('permission-denied', 'You are not authorized to reject this transaction.');
    }

    if (tx.rejected === true || tx.status === 'rejected') {
      result = { id, rejected: true, alreadyRejected: true };
      return;
    }

    if (!canReject(currentActor, { ...tx, service })) {
      throw new HttpsError('permission-denied', 'You are not authorized to reject this transaction.');
    }

    if (!['pending', 'approved'].includes(tx.status)) {
      throw new HttpsError('failed-precondition', 'Only pending or approved transactions can be rejected.');
    }

    // Every service order has already reserved/deducted the customer's
    // wallet before it reaches the staff queue. Rejection must therefore
    // refund that exact charge atomically with the rejection. Never refund
    // a completed/unknown order, and never allow a second refund.
    const customerId = typeof tx.customerId === 'string' ? tx.customerId : '';
    const refund = Number(tx.pointsCharged ?? tx.cost);
    if (!customerId || !Number.isFinite(refund) || refund < 0 ||
        !Number.isSafeInteger(Math.round(refund * 100))) {
      throw new HttpsError('failed-precondition', 'This transaction has an invalid wallet charge and requires reconciliation.');
    }
    if (tx.rejectionRefunded === true) {
      throw new HttpsError('failed-precondition', 'This rejected transaction has already been refunded and requires reconciliation.');
    }

    const customerRef = db.collection('users').doc(customerId);
    const customerSnap = await t.get(customerRef);
    if (!customerSnap.exists) {
      throw new HttpsError('failed-precondition', 'The customer account could not be found. Reconciliation is required.');
    }
    const customer = customerSnap.data() || {};
    const balance = Number(customer.walletBalance);
    const nextBalance = balance + refund;
    if (!Number.isFinite(balance) || balance < 0 ||
        !Number.isSafeInteger(Math.round(nextBalance * 100))) {
      throw new HttpsError('failed-precondition', 'The customer wallet balance is invalid. Reconciliation is required.');
    }

    t.update(customerRef, { walletBalance: nextBalance });
    t.update(ref, {
      status: 'rejected',
      rejected: true,
      rejectReason: reason,
      rejectedBy: uid,
      rejectedByRole: currentActor.role,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectionRefunded: true,
      rejectionRefundAmount: refund,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    result = { id, rejected: true, refunded: refund };
  });

  return result;
});
