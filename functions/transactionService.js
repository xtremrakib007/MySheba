const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { hasCapability } = require('./accessControl');

const DEALER_SERVICES = ['Mobile Banking'];
const RESELLER_SERVICES = ['Recharge', 'Internet', 'Remittance', 'Bill Payment'];
const OPERATOR_ROLES = ['dealer', 'reseller'];
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

function requireAuth(request) { if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.'); }
async function getActor(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const p = snap.data();
  if (p.suspended || p.inactive || p.disabled || p.mergedInto) throw new HttpsError('permission-denied', 'Your staff account is not active.');
  return { uid, role: p.role || '', name: p.fullName || p.name || p.displayName || p.phone || uid, profile: p };
}
function assertOperatorCanHandle(actor, order) {
  if (!OPERATOR_ROLES.includes(actor.role)) throw new HttpsError('permission-denied', 'Only a dealer or reseller can accept an approved order.');
  if (actor.role === 'dealer' && !DEALER_SERVICES.includes(order.service)) throw new HttpsError('permission-denied', 'Your dealer account cannot handle this service.');
  if (actor.role === 'reseller' && !RESELLER_SERVICES.includes(order.service)) throw new HttpsError('permission-denied', 'Your reseller account cannot handle this service.');
  if (actor.role === 'dealer' && order.dealerId && order.dealerId !== actor.uid) throw new HttpsError('permission-denied', 'This order is assigned to another dealer.');
  if (actor.role === 'reseller' && order.resellerId && order.resellerId !== actor.uid) throw new HttpsError('permission-denied', 'This order is assigned to another reseller.');
}

async function validateOrderReceipt(receiptUrl, transactionId) {
  if (typeof receiptUrl !== 'string' || receiptUrl.length < 1 || receiptUrl.length > 2048) {
    throw new HttpsError('invalid-argument', 'A valid transfer receipt is required.');
  }
  let parsed;
  try { parsed = new URL(receiptUrl); } catch (_) { throw new HttpsError('invalid-argument', 'Invalid transfer receipt URL.'); }
  if (parsed.protocol !== 'https:') throw new HttpsError('invalid-argument', 'Invalid transfer receipt URL.');

  const bucket = admin.storage().bucket();
  const bucketName = bucket.name;
  let objectPath = null;

  if (parsed.hostname === 'firebasestorage.googleapis.com') {
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match || decodeURIComponent(match[1]) !== bucketName) throw new HttpsError('invalid-argument', 'Receipt must belong to this storage bucket.');
    objectPath = decodeURIComponent(match[2]);
  } else if (parsed.hostname === 'storage.googleapis.com') {
    const match = parsed.pathname.match(/^\/([^/]+)\/(.+)$/);
    if (!match || decodeURIComponent(match[1]) !== bucketName) throw new HttpsError('invalid-argument', 'Receipt must belong to this storage bucket.');
    objectPath = decodeURIComponent(match[2]);
  } else {
    throw new HttpsError('invalid-argument', 'Receipt must be hosted in Firebase Storage.');
  }

  const expectedPrefix = `order-receipts/${transactionId}/`;
  if (!objectPath.startsWith(expectedPrefix) || objectPath.length <= expectedPrefix.length) {
    throw new HttpsError('permission-denied', 'Receipt does not belong to this order.');
  }
  if (objectPath.includes('..')) throw new HttpsError('invalid-argument', 'Invalid receipt path.');

  const file = bucket.file(objectPath);
  let metadata;
  try { [metadata] = await file.getMetadata(); } catch (_) { throw new HttpsError('failed-precondition', 'The uploaded receipt could not be verified.'); }
  const size = Number(metadata.size || 0);
  const contentType = String(metadata.contentType || '').toLowerCase();
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_RECEIPT_BYTES) throw new HttpsError('invalid-argument', 'Receipt is too large or invalid.');
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) throw new HttpsError('invalid-argument', 'Receipt must be a JPEG, PNG, or WebP image.');
  return receiptUrl;
}

exports.approveTransaction = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  if (!(await hasCapability(admin.firestore(), actor.uid, actor.profile, 'orders'))) {
    throw new HttpsError('permission-denied', 'Your account does not manage orders.');
  }
  const id = String(request.data?.transactionId || ''); if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  const db = admin.firestore(), ref = db.collection('transactions').doc(id);
  let order;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    order = snap.data(); if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'Only pending orders can be approved.');
    if (order.approved === true) throw new HttpsError('already-exists', 'This order is already approved.');
    tx.update(ref, { approved: true, approvedBy: actor.uid, approvedByName: actor.name, approvedByRole: actor.role, approvedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  await logAudit({ action: 'transaction_approved', targetUid: order?.customerId || null, performedBy: actor.uid, performedByRole: actor.role, details: { transactionId: id, service: order?.service || null, amount: Number.isFinite(Number(order?.amount)) ? Number(order.amount) : null } });
  return { ok: true, transactionId: id };
});

exports.acceptTransaction = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  const id = String(request.data?.transactionId || ''); if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  const db = admin.firestore(), ref = db.collection('transactions').doc(id);
  let order;
  let action = 'transaction_claimed';
  const approvesOrders = !OPERATOR_ROLES.includes(actor.role) && await hasCapability(db, actor.uid, actor.profile, 'orders');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    order = snap.data();
    if (approvesOrders) {
      if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'Only pending orders can be approved.');
      if (order.approved === true) throw new HttpsError('already-exists', 'This order is already approved.');
      tx.update(ref, { approved: true, approvedBy: actor.uid, approvedByName: actor.name, approvedByRole: actor.role, approvedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      action = 'transaction_approved';
      return;
    }
    assertOperatorCanHandle(actor, order);
    if (order.status !== 'pending' || order.claimedBy) throw new HttpsError('failed-precondition', 'This order was already accepted by another operator.');
    if (order.approved !== true || !order.approvedBy) throw new HttpsError('failed-precondition', 'This order must be approved by an admin or superadmin first.');
    tx.update(ref, { status: 'processing', claimedBy: actor.uid, claimedByRole: actor.role, claimedByName: actor.name, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  await logAudit({ action, targetUid: order?.customerId || null, performedBy: actor.uid, performedByRole: actor.role, details: { transactionId: id, service: order?.service || null, amount: Number.isFinite(Number(order?.amount)) ? Number(order.amount) : null } });
  return { ok: true, transactionId: id };
});

exports.completeTransaction = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  if (!OPERATOR_ROLES.includes(actor.role)) throw new HttpsError('permission-denied', 'Only the dealer/reseller Operator can complete an order.');
  const id = String(request.data?.transactionId || ''), pin = String(request.data?.pin || ''), receiptUrl = String(request.data?.receiptUrl || '');
  if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  if (!/^\d{4}$/.test(pin)) throw new HttpsError('invalid-argument', 'A 4-digit collection PIN is required.');
  const db = admin.firestore(), ref = db.collection('transactions').doc(id);
  const verifiedReceiptUrl = await validateOrderReceipt(receiptUrl, id);
  let order;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    order = snap.data();
    if (order.status !== 'processing' || order.claimedBy !== actor.uid) throw new HttpsError('failed-precondition', 'Only the operator who accepted this order can complete it.');
    if (order.approved !== true || !order.approvedBy) throw new HttpsError('failed-precondition', 'This order has no valid admin approval.');
    assertOperatorCanHandle(actor, order);
    tx.update(ref, { status: 'completed', pin: admin.firestore.FieldValue.delete(), receiptUrl: verifiedReceiptUrl, completedBy: actor.uid, completedByName: actor.name, completedByRole: actor.role, completedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  await logAudit({ action: 'transaction_completed', targetUid: order?.customerId || null, performedBy: actor.uid, performedByRole: actor.role, details: { transactionId: id, service: order?.service || null, amount: Number.isFinite(Number(order?.amount)) ? Number(order.amount) : null } });
  return { ok: true, transactionId: id };
});
