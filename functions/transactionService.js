const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { checkVelocity, getClientIp } = require('./rateLimitService');

const DEALER_SERVICES = ['Mobile Banking'];
const RESELLER_SERVICES = ['Recharge', 'Internet', 'Remittance'];
const APPROVER_ROLES = ['admin', 'superadmin'];
const OPERATOR_ROLES = ['dealer', 'reseller'];
const ASSIGNABLE_ROLES = ['dealer'];

function requireAuth(request) { if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.'); }
async function getActor(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const p = snap.data();
  if (p.suspended === true || p.inactive === true || p.disabled === true || p.active === false || p.mergedInto) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  return { uid, role: p.role || '', name: p.fullName || p.name || p.displayName || p.phone || uid };
}
function validReceiptUrl(url, txId, role) {
  if (typeof url !== 'string' || url.length > 4096) return false;
  let parsed;
  try { parsed = new URL(url); } catch (_) { return false; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'firebasestorage.googleapis.com') return false;
  const bucket = admin.storage().bucket().name;
  const prefix = `/v0/b/${bucket}/o/`;
  if (!parsed.pathname.startsWith(prefix)) return false;
  let objectPath;
  try { objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length)); } catch (_) { return false; }
  const folder = role === 'dealer' ? 'order-receipts' : 'remittance-receipts';
  const expectedPrefix = `${folder}/${txId}/`;
  return objectPath.startsWith(expectedPrefix) && objectPath.slice(expectedPrefix.length).length > 0
    && !objectPath.slice(expectedPrefix.length).split('/').some((part) => part === '..');
}

function assertOperatorCanHandle(actor, order) {
  if (!OPERATOR_ROLES.includes(actor.role)) throw new HttpsError('permission-denied', 'Only a dealer or reseller can accept an approved order.');
  if (actor.role === 'dealer' && !DEALER_SERVICES.includes(order.service)) throw new HttpsError('permission-denied', 'Your dealer account cannot handle this service.');
  if (actor.role === 'reseller' && !RESELLER_SERVICES.includes(order.service)) throw new HttpsError('permission-denied', 'Your reseller account cannot handle this service.');
  if (actor.role === 'dealer' && order.dealerId && order.dealerId !== actor.uid) throw new HttpsError('permission-denied', 'This order is assigned to another dealer.');
  if (actor.role === 'reseller' && order.resellerId && order.resellerId !== actor.uid) throw new HttpsError('permission-denied', 'This order is assigned to another reseller.');
}

exports.approveTransaction = onCall({ enforceAppCheck: true }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  if (!APPROVER_ROLES.includes(actor.role)) throw new HttpsError('permission-denied', 'Only an admin or superadmin can approve an order.');
  const id = String(request.data?.transactionId || ''); if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  const db = admin.firestore(), ref = db.collection('transactions').doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data(); if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'Only pending orders can be approved.');
    if (order.approved === true) throw new HttpsError('already-exists', 'This order is already approved.');
    tx.update(ref, { approved: true, approvedBy: actor.uid, approvedByName: actor.name, approvedByRole: actor.role, approvedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true, transactionId: id };
});

exports.acceptTransaction = onCall({ enforceAppCheck: true }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  const id = String(request.data?.transactionId || ''); if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  const db = admin.firestore(), ref = db.collection('transactions').doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data();
    if (APPROVER_ROLES.includes(actor.role)) {
      if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'Only pending orders can be approved.');
      if (order.approved === true) throw new HttpsError('already-exists', 'This order is already approved.');
      tx.update(ref, { approved: true, approvedBy: actor.uid, approvedByName: actor.name, approvedByRole: actor.role, approvedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }
    assertOperatorCanHandle(actor, order);
    if (order.status !== 'pending' || order.claimedBy) throw new HttpsError('failed-precondition', 'This order was already accepted by another operator.');
    if (order.approved !== true || !order.approvedBy) throw new HttpsError('failed-precondition', 'This order must be approved by an admin or superadmin first.');
    tx.update(ref, { status: 'processing', claimedBy: actor.uid, claimedByRole: actor.role, claimedByName: actor.name, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true, transactionId: id };
});

exports.completeTransaction = onCall({ enforceAppCheck: true }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  if (!OPERATOR_ROLES.includes(actor.role)) throw new HttpsError('permission-denied', 'Only the dealer/reseller Operator can complete an order.');
  const id = String(request.data?.transactionId || ''), pin = String(request.data?.pin || ''), receiptUrl = String(request.data?.receiptUrl || '');
  if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  if (!/^\d{4}$/.test(pin)) throw new HttpsError('invalid-argument', 'A 4-digit collection PIN is required.');
  if (!receiptUrl) throw new HttpsError('invalid-argument', 'The transfer receipt is required before completion.');
  await checkVelocity(admin.firestore(), actor.uid, 'transactionComplete', { ip: getClientIp(request) });
  if (!validReceiptUrl(receiptUrl, id, actor.role)) throw new HttpsError('invalid-argument', 'The receipt URL must be a valid MySheba receipt upload.');
  const db = admin.firestore(), ref = db.collection('transactions').doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data();
    if (order.status !== 'processing' || order.claimedBy !== actor.uid) throw new HttpsError('failed-precondition', 'Only the operator who accepted this order can complete it.');
    if (order.approved !== true || !order.approvedBy) throw new HttpsError('failed-precondition', 'This order has no valid admin approval.');
    if (typeof order.pin !== 'string' || !/^\d{4}$/.test(order.pin)) throw new HttpsError('failed-precondition', 'This order has no valid collection PIN. Please recreate the order.');
    if (pin !== order.pin) throw new HttpsError('permission-denied', 'Incorrect collection PIN.');
    tx.update(ref, { status: 'completed', pin: admin.firestore.FieldValue.delete(), receiptUrl, completedBy: actor.uid, completedByName: actor.name, completedByRole: actor.role, completedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true, transactionId: id };
});



exports.scrubCompletedTransactionPins = onCall({ enforceAppCheck: true }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  if (actor.role !== 'superadmin') throw new HttpsError('permission-denied', 'Only a superadmin can scrub legacy collection PINs.');
  const db = admin.firestore();
  const snap = await db.collection('transactions').where('status', '==', 'completed').get();
  let batch = db.batch(), count = 0, batches = 0;
  for (const docSnap of snap.docs) {
    if (!Object.prototype.hasOwnProperty.call(docSnap.data(), 'pin')) continue;
    batch.update(docSnap.ref, { pin: admin.firestore.FieldValue.delete() });
    count += 1;
    if (count % 450 === 0) { await batch.commit(); batches += 1; batch = db.batch(); }
  }
  if (count % 450 !== 0) { await batch.commit(); batches += 1; }
  return { ok: true, scrubbed: count, batches };
});

exports.assignDealer = onCall({ enforceAppCheck: true }, async (request) => {
  requireAuth(request);
  const actor = await getActor(request.auth.uid);
  if (!APPROVER_ROLES.includes(actor.role)) throw new HttpsError('permission-denied', 'Only an admin or superadmin can assign a dealer.');
  const id = String(request.data?.transactionId || '').trim();
  const dealerId = String(request.data?.dealerId || '').trim();
  if (!id || !dealerId) throw new HttpsError('invalid-argument', 'Transaction ID and dealer ID are required.');
  if (dealerId === actor.uid) throw new HttpsError('invalid-argument', 'An admin cannot be assigned as the dealer.');
  const db = admin.firestore();
  const txRef = db.collection('transactions').doc(id);
  const dealerRef = db.collection('users').doc(dealerId);
  await db.runTransaction(async (tx) => {
    const [orderSnap, dealerSnap] = await Promise.all([tx.get(txRef), tx.get(dealerRef)]);
    if (!orderSnap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    if (!dealerSnap.exists) throw new HttpsError('not-found', 'The selected dealer was not found.');
    const order = orderSnap.data();
    const dealer = dealerSnap.data();
    if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'Only pending orders can be assigned.');
    if (!ASSIGNABLE_ROLES.includes(dealer.role)) throw new HttpsError('failed-precondition', 'The selected user is not a dealer.');
    if (dealer.suspended === true || dealer.inactive === true || dealer.disabled === true || dealer.active === false || dealer.mergedInto) throw new HttpsError('failed-precondition', 'The selected dealer is not active.');
    if (dealer.role === 'dealer' && !DEALER_SERVICES.includes(order.service)) throw new HttpsError('failed-precondition', 'This dealer cannot handle this service.');
    tx.update(txRef, { dealerId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true, transactionId: id, dealerId };
});