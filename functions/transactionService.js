const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { hasCapability } = require('./accessControl');
const crypto = require('crypto');
const { checkVelocity, getClientIp } = require('./rateLimitService');

const DEALER_SERVICES = ['Mobile Banking'];
const RESELLER_SERVICES = ['Recharge', 'Internet', 'Bill Payment', 'Remittance'];
// Staff who may hold the 'orders' capability (functions/accessControl.js).
const APPROVER_ROLES = ['admin', 'superadmin', 'support', 'finance'];
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
  return { uid, role: p.role || '', name: p.fullName || p.name || p.displayName || p.phone || uid, profile: p };
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

exports.approveTransaction = onCall({ enforceAppCheck: false }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  if (!(await hasCapability(admin.firestore(), actor.uid, actor.profile, 'orders'))) throw new HttpsError('permission-denied', 'Your account does not manage orders.');
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

exports.generateCollectionPin = onCall({ enforceAppCheck: false }, async (request) => {
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
    // One backslash. This read /^\\d{4}$/, which in a regex literal is an
    // escaped backslash followed by "dddd" - it matches the string \dddd and
    // never a PIN. The same test is written correctly twice in
    // completeTransaction below, so only this copy was wrong.
    //
    // It is the idempotency guard, so a dead one meant every call minted a new
    // PIN and overwrote the stored one. Tapping Generate a second time
    // silently invalidated the PIN the customer had already been shown, and
    // any receipt printed with it, and the operator's entry of that PIN then
    // failed as "Incorrect collection PIN".
    if (typeof order.pin === 'string' && /^\d{4}$/.test(order.pin)) {
      pin = order.pin;
      return;
    }
    pin = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    tx.update(ref, { pin, pinGeneratedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true, transactionId: id, pin };
});

exports.acceptTransaction = onCall({ enforceAppCheck: false }, async (request) => {
  requireAuth(request); const actor = await getActor(request.auth.uid);
  const id = String(request.data?.transactionId || ''); if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  const db = admin.firestore(), ref = db.collection('transactions').doc(id);
  const approvesOrders = !OPERATOR_ROLES.includes(actor.role) && await hasCapability(db, actor.uid, actor.profile, 'orders');
  if (!approvesOrders && !OPERATOR_ROLES.includes(actor.role)) throw new HttpsError('permission-denied', 'Your account does not manage orders.');
  await db.runTransaction(async (tx) => {
    const currentActor = await assertActorStillActive(tx, actor.uid, [...APPROVER_ROLES, ...OPERATOR_ROLES]);
    const snap = await tx.get(ref); if (!snap.exists) throw new HttpsError('not-found', 'That order no longer exists.');
    const order = snap.data();
    if (approvesOrders) {
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

exports.completeTransaction = onCall({ enforceAppCheck: false }, async (request) => {
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
    // pin is deleted; collectionPin keeps the spent value as a record.
    //
    // The receipt is supposed to show the code the order was collected with,
    // and it could not: deleting pin left the customer's own receipt printing
    // "-" for the one field that proves how the handover was authorised.
    //
    // Keeping it does not weaken anything. pin is the LIVE secret and stays
    // deleted, and completion already requires status === 'processing', so a
    // completed order cannot be completed again whatever value is stored.
    // firestore.rules:89 lets only the customer themselves and staff holding
    // 'orders' or 'finance' read a transaction, which is the same audience
    // that could read the PIN while the order was still open.
    tx.update(ref, { status: 'completed', pin: admin.firestore.FieldValue.delete(), collectionPin: pin, receiptUrl, completedBy: currentActor.uid, completedByName: currentActor.name, completedByRole: currentActor.role, completedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true, transactionId: id };
});



exports.reconcileUnknownTransaction = onCall({ enforceAppCheck: false }, async (request) => {
  requireAuth(request);
  const uid = request.auth.uid;
  const db = admin.firestore();
  const actorSnap = await db.collection('users').doc(uid).get();
  if (!actorSnap.exists) throw new HttpsError('permission-denied', 'Your staff profile was not found.');
  const actorProfile = actorSnap.data() || {};
  if (!['admin', 'superadmin'].includes(actorProfile.role) ||
      actorProfile.suspended === true || actorProfile.inactive === true ||
      actorProfile.disabled === true || actorProfile.active === false || actorProfile.mergedInto) {
    throw new HttpsError('permission-denied', 'Only an active admin can reconcile an uncertain transaction.');
  }
  const id = String(request.data?.transactionId || '').trim();
  const outcome = String(request.data?.outcome || '').trim().toLowerCase();
  const providerReference = String(request.data?.providerReference || '').trim().slice(0, 200);
  const sessionId = request.data?.sessionId;
  const deviceId = request.data?.deviceId;
  if (!id) throw new HttpsError('invalid-argument', 'Transaction ID is required.');
  if (!['completed', 'failed'].includes(outcome)) throw new HttpsError('invalid-argument', 'Outcome must be completed or failed.');
  if (!providerReference) throw new HttpsError('invalid-argument', 'Provider confirmation/reference is required.');
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId) ||
      typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('failed-precondition', 'Your secure admin session is missing. Please sign in again.');
  }
  if (actorProfile.activeSessionId !== sessionId || actorProfile.activeDeviceId !== deviceId) {
    throw new HttpsError('permission-denied', 'This admin device session is no longer active. Please sign in again.');
  }
  await checkVelocity(db, uid, 'reconcileTransaction', { ip: getClientIp(request) });
  const ref = db.collection('transactions').doc(id);
  let result;
  await db.runTransaction(async (tx) => {
    const currentActor = await assertActorStillActive(tx, uid, ['admin', 'superadmin']);
    if (currentActor.activeSessionId !== sessionId || currentActor.activeDeviceId !== deviceId) {
      throw new HttpsError('permission-denied', 'This admin device session is no longer active. Please sign in again.');
    }
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That transaction no longer exists.');
    const order = snap.data() || {};
    if (order.status !== 'unknown') {
      if (order.status === outcome && order.providerReference === providerReference) {
        result = { ok: true, transactionId: id, outcome, alreadyReconciled: true };
        return;
      }
      throw new HttpsError('failed-precondition', 'Only unknown transactions can be reconciled.');
    }
    const service = String(order.service || order.chargedServiceKind || '').trim();
    if (!['Recharge', 'Internet', 'Bill Payment', 'Mobile Banking', 'Remittance'].includes(service)) {
      throw new HttpsError('failed-precondition', 'This transaction type cannot be reconciled here.');
    }
    const customerId = typeof order.customerId === 'string' ? order.customerId : '';
    if (!customerId) throw new HttpsError('failed-precondition', 'Customer information is missing. Reconciliation is required.');
    if (outcome === 'completed') {
      tx.update(ref, {
        status: 'completed',
        providerReference,
        reconciled: true,
        reconciledBy: currentActor.uid,
        reconciledByRole: currentActor.role,
        reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      result = { ok: true, transactionId: id, outcome };
      return;
    }
    const refund = Number(order.pointsCharged ?? order.cost);
    if (!Number.isFinite(refund) || refund < 0 || !Number.isSafeInteger(Math.round(refund * 100))) {
      throw new HttpsError('failed-precondition', 'The wallet charge is invalid. Manual reconciliation is required.');
    }
    if (order.rejectionRefunded === true || order.apiRefunded === true) {
      throw new HttpsError('failed-precondition', 'This transaction already has refund metadata. Manual reconciliation is required.');
    }
    const customerRef = db.collection('users').doc(customerId);
    const customerSnap = await tx.get(customerRef);
    if (!customerSnap.exists) throw new HttpsError('failed-precondition', 'The customer account could not be found.');
    const customer = customerSnap.data() || {};
    const balance = Number(customer.walletBalance);
    const nextBalance = balance + refund;
    if (!Number.isFinite(balance) || balance < 0 || !Number.isSafeInteger(Math.round(nextBalance * 100))) {
      throw new HttpsError('failed-precondition', 'The customer wallet balance is invalid.');
    }
    tx.update(customerRef, { walletBalance: nextBalance });
    tx.update(ref, {
      status: 'failed',
      providerReference,
      reconciled: true,
      reconciledBy: currentActor.uid,
      reconciledByRole: currentActor.role,
      reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
      apiRefunded: true,
      apiRefundAmount: refund,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    result = { ok: true, transactionId: id, outcome, refunded: refund };
  });
  await require('./logService').logAudit({
    action: 'transaction_reconciled',
    targetUid: null,
    performedBy: uid,
    performedByRole: actorProfile.role,
    details: { transactionId: id, outcome, providerReference },
  });
  return result;
});

exports.scrubCompletedTransactionPins = onCall({ enforceAppCheck: false }, async (request) => {
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

exports.assignDealer = onCall({ enforceAppCheck: false }, async (request) => {
  requireAuth(request);
  const actor = await getActor(request.auth.uid);
  if (!(await hasCapability(admin.firestore(), actor.uid, actor.profile, 'orders'))) throw new HttpsError('permission-denied', 'Your account does not manage orders.');
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