const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const ALLOWED_SERVICES = ['Recharge', 'Internet', 'Mobile Banking', 'Remittance'];
const SERVICE_ALIASES = {
  recharge: 'Recharge',
  internet: 'Internet',
  mobilebanking: 'Mobile Banking',
  'mobile banking': 'Mobile Banking',
  remittance: 'Remittance'
};
const STAFF_ROLES = ['dealer', 'reseller', 'admin', 'superadmin'];

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
    return ['Recharge', 'Internet', 'Remittance'].includes(tx.service) &&
      (tx.resellerId === actor.uid || tx.assignedTo === actor.uid || tx.claimedBy === actor.uid);
  }
  return false;
}

exports.rejectTransaction = onCall({ enforceAppCheck: true }, async request => {
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
    const actorSnap = await t.get(db.collection('users').doc(uid));
    if (!actorSnap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
    const currentActor = { uid, ...(actorSnap.data() || {}) };
    if (!STAFF_ROLES.includes(currentActor.role) || !activeAccount(currentActor)) {
      throw new HttpsError('permission-denied', 'Your staff account is no longer active.');
    }

    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Transaction not found.');
    const tx = snap.data() || {};
    const service = normalizeService(tx.service || tx.chargedServiceKind);

    if (!ALLOWED_SERVICES.includes(service)) {
      throw new HttpsError('failed-precondition', 'This transaction type cannot be rejected here.');
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

    t.update(ref, {
      status: 'rejected',
      rejected: true,
      rejectReason: reason,
      rejectedBy: uid,
      rejectedByRole: currentActor.role,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    result = { id, rejected: true };
  });

  return result;
});
