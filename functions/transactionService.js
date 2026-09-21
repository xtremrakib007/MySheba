const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { checkVelocity, getClientIp } = require('./rateLimitService');

const DEALER_SERVICES = ['Mobile Banking'];
const RESELLER_SERVICES = ['Recharge', 'Internet', 'Bill Payment', 'Remittance'];
const APPROVER_ROLES = ['admin', 'superadmin'];
const OPERATOR_ROLES = ['dealer', 'reseller'];
const ASSIGNABLE_ROLES = ['dealer'];
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;

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
async function assertActorStillActive(tx, uid, allowedRoles) {
  const snap = await tx.get(admin.firestore().collection('users').doc(uid));
  if (!snap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const p = snap.data() || {};
  if (!allowedRoles.includes(p.role) || p.suspended === true || p.inactive === true || p.disabled === true || p.active === false || p.mergedInto) {
    throw new HttpsError('permission-denied', 'Your account is no longer authorized for this operation.');
  }
  return { uid, role: p.role, name: p.fullName || p.name || p.displayName || p.phone || uid };
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

async function assertReceiptObject(url, txId, role) {
  if (!validReceiptUrl(url, txId, role)) throw new HttpsError('invalid-argument', 'The receipt URL must be a valid MySheba receipt upload.');
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new HttpsError('invalid-argument', 'Invalid receipt URL.'); }
  let objectPath;
  try {
    const bucket = admin.storage().bucket();
    const prefix = `/v0/b/${bucket.name}/o/`;
    objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length));
    if (!objectPath || objectPath.includes('\\') || objectPath.split('/').some((part) => part === '..')) throw new Error('invalid path');
    const [metadata] = await bucket.file(objectPath).getMetadata();
    const size = Number(metadata?.size);
    const contentType = String(metadata?.contentType || '');
    if (!Number.isFinite(size) || size <= 0 || size >= 10 * 1024 * 1024 || !contentType.startsWith('image/')) {
      throw new Error('invalid metadata');
    }
  } catch (_) {
    throw new HttpsError('failed-precondition', 'The uploaded receipt could not be verified.');
  }
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
    const currentActor = await assertActorStillActive(tx, actor.uid, APPROVER_ROLES);
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data(); if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'Only pending orders can be approved.');
    if (order.approved === true) throw new HttpsError('already-exists', 'This order is already approved.');
    tx.update(ref, { approved: true, approvedBy: currentActor.uid, approvedByName: currentActor.name, approvedByRole: currentActor.role, approvedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true, transactionId: id };
});

exports.generateCollectionPin = onCall({ enforceAppCheck: true }, async (request) => {
  requireAuth(request);
  const uid = request.auth.uid;
  const db = admin.firestore();
  const profileSnap = await db.collection('users').doc(uid).get();
  if (!profileSnap.exists) throw new HttpsError('permission-denied', 'Your account was not found.');
  const profile = profileSnap.data() || {};
  if (profile.role !== 'customer' || profile.suspended === true || profile.inactive === true ||
      profile.disabled === true || profile.active === false || profile.mergedInto) {
    throw new HttpsError('permission-denied', 'Only an active customer can generate a collection PIN.');
  }
  const sessionId = request.data?.sessionId;
  const deviceId = request.data?.deviceId;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId) ||
      typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('failed-precondition', 'Your secure session is missing. Please sign in again.');
  }
  if (profile.activeSessionId !== sessionId || profile.activeDeviceId !== deviceId) {
    throw new HttpsError('permission-denied', 'This device session is no longer active. Please sign in again.');
  }
  const id = String(request.data?.transactionId || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  const ref = db.collection('transactions').doc(id);
  await checkVelocity(db, uid, 'generateCollectionPin', { ip: getClientIp(request) });
  let pin = '';
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data() || {};
    if (order.customerId !== uid) throw new HttpsError('permission-denied', 'You can only manage your own collection PIN.');
    if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'The collection PIN can only be generated while the order is pending.');
    if (order.rejected === true) throw new HttpsError('failed-precondition', 'A rejected order cannot receive a collection PIN.');
    pin = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    tx.update(ref, { pin, pinGeneratedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true, transactionId: id, pin };
});

exports.acceptTransaction = onCall({ enforceAppCheck: true }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  const id = String(request.data?.transactionId || ''); if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  const db = admin.firestore(), ref = db.collection('transactions').doc(id);
  await db.runTransaction(async (tx) => {
    const currentActor = await assertActorStillActive(tx, actor.uid, [...APPROVER_ROLES, ...OPERATOR_ROLES]);
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data();
    if (APPROVER_ROLES.includes(currentActor.role)) {
      if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'Only pending orders can be approved.');
      if (order.approved === true) throw new HttpsError('already-exists', 'This order is already approved.');
      tx.update(ref, { approved: true, approvedBy: currentActor.uid, approvedByName: currentActor.name, approvedByRole: currentActor.role, approvedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }
    assertOperatorCanHandle(currentActor, order);
    if (order.status !== 'pending' || order.claimedBy) throw new HttpsError('failed-precondition', 'This order was already accepted by another operator.');
    if (order.approved !== true || !order.approvedBy) throw new HttpsError('failed-precondition', 'This order must be approved by an admin or superadmin first.');
    tx.update(ref, { status: 'processing', claimedBy: currentActor.uid, claimedByRole: currentActor.role, claimedByName: currentActor.name, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
  await assertReceiptObject(receiptUrl, id, actor.role);
  const db = admin.firestore(), ref = db.collection('transactions').doc(id);
  await db.runTransaction(async (tx) => {
    const currentActor = await assertActorStillActive(tx, actor.uid, OPERATOR_ROLES);
    if (!validReceiptUrl(receiptUrl, id, currentActor.role)) throw new HttpsError('invalid-argument', 'The receipt URL must be a valid MySheba receipt upload.');
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data();
    if (order.status !== 'processing' || order.claimedBy !== currentActor.uid) throw new HttpsError('failed-precondition', 'Only the operator who accepted this order can complete it.');
    if (order.approved !== true || !order.approvedBy) throw new HttpsError('failed-precondition', 'This order has no valid admin approval.');
    if (typeof order.pin !== 'string' || !/^\d{4}$/.test(order.pin)) throw new HttpsError('failed-precondition', 'This order has no valid collection PIN. Please recreate the order.');
    if (pin !== order.pin) throw new HttpsError('permission-denied', 'Incorrect collection PIN.');
    tx.update(ref, { status: 'completed', pin: admin.firestore.FieldValue.delete(), receiptUrl, completedBy: currentActor.uid, completedByName: currentActor.name, completedByRole: currentActor.role, completedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true, transactionId: id };
});



exports.scrubCompletedTransactionPins = onCall({ enforceAppCheck: true }, async (request) => {
  requireAuth(request);
  const uid = request.auth.uid;
  const db = admin.firestore();
  // Authorize before the collection-wide read so unauthorized callers cannot trigger
  // an expensive scan of completed transactions.
  const actorSnap = await db.collection('users').doc(uid).get();
  if (!actorSnap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const actorProfile = actorSnap.data() || {};
  if (actorProfile.role !== 'superadmin' || actorProfile.suspended === true || actorProfile.inactive === true || actorProfile.disabled === true || actorProfile.active === false || actorProfile.mergedInto) {
    throw new HttpsError('permission-denied', 'Only an active superadmin can scrub completed transaction PINs.');
  }
  const snap = await db.collection('transactions').where('status', '==', 'completed').get();
  const docs = snap.docs.filter((docSnap) => Object.prototype.hasOwnProperty.call(docSnap.data(), 'pin'));
  let scrubbed = 0, batches = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const chunk = docs.slice(i, i + 400);
    const chunkScrubbed = await db.runTransaction(async (tx) => {
      await assertActorStillActive(tx, uid, ['superadmin']);
      let count = 0;
      for (const docSnap of chunk) {
        const current = await tx.get(docSnap.ref);
        const data = current.exists ? (current.data() || {}) : {};
        if (data.status !== 'completed' || !Object.prototype.hasOwnProperty.call(data, 'pin')) continue;
        tx.update(docSnap.ref, { pin: admin.firestore.FieldValue.delete() });
        count += 1;
      }
      return count;
    });
    scrubbed += chunkScrubbed;
    batches += 1;
  }
  return { ok: true, scrubbed, batches };
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
    const currentActor = await assertActorStillActive(tx, actor.uid, APPROVER_ROLES);
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