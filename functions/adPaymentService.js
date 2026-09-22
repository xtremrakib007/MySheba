// PHASE 10 - MySheba advertisement packages and manual payments.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAdAudit, logServerError } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const PAYMENT_STATUS_TRANSITIONS = {
  pending: ['paid', 'failed'],
  paid: ['refunded', 'failed'],
  failed: ['pending', 'paid'],
  refunded: [],
};
const VALID_PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_TRANSITIONS);
const MAX_TEXT = 200;

function isValidPaymentStatusTransition(from, to) {
  return VALID_PAYMENT_STATUSES.includes(from) && VALID_PAYMENT_STATUSES.includes(to) && from !== to && PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}
function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}
function activeAccount(user) {
  return user && user.suspended !== true && user.inactive !== true && user.disabled !== true && !user.mergedInto;
}
async function requireSuperadmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || caller.role !== 'superadmin' || !activeAccount(caller)) {
    throw new HttpsError('permission-denied', 'Only an active Super Admin can manage advertisement payments.');
  }
  return caller;
}
function text(v, field, max = MAX_TEXT, required = false) {
  if (v == null) { if (required) throw new HttpsError('invalid-argument', `${field} is required.`); return ''; }
  if (typeof v !== 'string') throw new HttpsError('invalid-argument', `${field} must be text.`);
  const value = v.trim();
  if (required && !value) throw new HttpsError('invalid-argument', `${field} is required.`);
  if (value.length > max) throw new HttpsError('invalid-argument', `${field} is too long.`);
  return value;
}

exports.createAdPayment = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireSuperadmin(db, callerUid);
  const data = request.data || {};
  const advertiserId = text(data.advertiserId, 'advertiserId', 128, true);
  const campaignId = text(data.campaignId, 'campaignId', 128);
  const packageId = text(data.packageId, 'packageId', 128);
  const currency = text(data.currency, 'currency', 10, true).toUpperCase();
  const paymentMethod = text(data.paymentMethod, 'paymentMethod', 80, true);
  const transactionReference = text(data.transactionReference, 'transactionReference', 160);
  const numericAmount = Number(data.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 100000000) throw new HttpsError('invalid-argument', 'amount is outside the allowed range.');
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpsError('invalid-argument', 'currency must be a 3-letter code.');
  const status = data.paymentStatus || 'pending';
  if (!VALID_PAYMENT_STATUSES.includes(status)) throw new HttpsError('invalid-argument', `Unrecognized paymentStatus: ${status}`);

  const paymentRef = db.collection('ad_payments').doc();
  try {
    await db.runTransaction(async tx => {
      const callerRef = db.collection('users').doc(callerUid);
      const advertiserRef = db.collection('ad_advertisers').doc(advertiserId);
      const campaignRef = campaignId ? db.collection('ad_campaigns').doc(campaignId) : null;
      const packageRef = packageId ? db.collection('ad_packages').doc(packageId) : null;
      const reads = [callerRef, advertiserRef];
      if (campaignRef) reads.push(campaignRef);
      if (packageRef) reads.push(packageRef);
      const snaps = await tx.getAll(...reads);
      const callerSnap = snaps[0];
      const advertiserSnap = snaps[1];
      const campaignSnap = campaignRef ? snaps[2] : null;
      const packageSnap = packageRef ? snaps[campaignRef ? 3 : 2] : null;
      const latestCaller = callerSnap.exists ? callerSnap.data() : null;
      if (!latestCaller || latestCaller.role !== 'superadmin' || !activeAccount(latestCaller)) throw new HttpsError('permission-denied', 'This Super Admin account is not active.');
      if (!advertiserSnap.exists) throw new HttpsError('not-found', 'That advertiser does not exist.');
      if (campaignRef) {
        if (!campaignSnap.exists) throw new HttpsError('not-found', 'That campaign does not exist.');
        if (campaignSnap.data().advertiserId !== advertiserId) throw new HttpsError('invalid-argument', 'That campaign does not belong to this advertiser.');
      }
      if (packageRef && !packageSnap.exists) throw new HttpsError('not-found', 'That package does not exist.');
      if (packageSnap && packageSnap.exists && packageSnap.data().advertiserId && packageSnap.data().advertiserId !== advertiserId) throw new HttpsError('invalid-argument', 'That package does not belong to this advertiser.');
      tx.create(paymentRef, {
        advertiserId, campaignId, packageId, amount: numericAmount, currency, paymentStatus: status, paymentMethod,
        transactionReference, advertiserName: text(advertiserSnap.data().companyName || '', 'companyName'),
        campaignName: campaignSnap && campaignSnap.exists ? text(campaignSnap.data().name || '', 'campaignName') : '',
        packageName: packageSnap && packageSnap.exists ? text(packageSnap.data().name || '', 'packageName') : '',
        recordedBy: callerUid, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('createAdPayment', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not record this payment.');
  }
  await logAdAudit({ action: 'create', targetType: 'ad_payment', targetId: paymentRef.id, performedBy: callerUid, details: { advertiserId, campaignId: campaignId || null, packageId: packageId || null, amount: numericAmount, currency, paymentStatus: status, performedByRole: caller.role } });
  return { ok: true, paymentId: paymentRef.id };
});

exports.updateAdPaymentStatus = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireSuperadmin(db, callerUid);
  const data = request.data || {};
  const paymentId = text(data.paymentId, 'paymentId', 128, true);
  const paymentStatus = data.paymentStatus;
  const note = text(data.note, 'note', 500);
  if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) throw new HttpsError('invalid-argument', `Unrecognized paymentStatus: ${paymentStatus}`);
  const paymentRef = db.collection('ad_payments').doc(paymentId);
  let fromStatus = null;
  try {
    await db.runTransaction(async tx => {
      const callerRef = db.collection('users').doc(callerUid);
      const paymentSnap = await tx.get(paymentRef);
      const callerSnap = await tx.get(callerRef);
      const latestCaller = callerSnap.exists ? callerSnap.data() : null;
      if (!latestCaller || latestCaller.role !== 'superadmin' || !activeAccount(latestCaller)) throw new HttpsError('permission-denied', 'This Super Admin account is not active.');
      if (!paymentSnap.exists) throw new HttpsError('not-found', 'That payment record does not exist.');
      const current = paymentSnap.data() || {};
      fromStatus = current.paymentStatus;
      if (!isValidPaymentStatusTransition(fromStatus, paymentStatus)) throw new HttpsError('failed-precondition', `Cannot move a payment from "${fromStatus}" to "${paymentStatus}".`);
      tx.update(paymentRef, { paymentStatus, recordedBy: callerUid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('updateAdPaymentStatus', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not update this payment status.');
  }
  await logAdAudit({ action: 'edit', targetType: 'ad_payment', targetId: paymentId, performedBy: callerUid, details: { from: fromStatus, to: paymentStatus, note, performedByRole: caller.role } });
  return { ok: true };
});
