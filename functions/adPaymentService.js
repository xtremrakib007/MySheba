// PHASE 10 - MY SHEBA ADVERTISING PACKAGES AND PAYMENTS.
//
// The only writers of ad_payments/{paymentId} - firestore.rules sets
// `allow write: if false` on that collection (see the "PHASE 1 -
// Advertisement System" section there, unchanged since Phase 1), the
// same trust model this app already uses for topups/walletBalance (see
// functions/walletService.js's own header comment). No payment gateway
// is integrated anywhere in this app (Stripe/PayPal/etc. do not appear
// in package.json or anywhere else in this codebase) - per the PHASE 10
// brief's "Do not implement a payment gateway unless the existing
// project already has one" instruction, this is the admin
// manual-payment workflow instead: an admin records what came in
// through an external channel (bank transfer, DuitNow QR, cash,
// cheque), then moves it through Pending -> Paid/Failed -> Refunded.
//
// Client call sites (see src/firebase/adService.js):
//   adService.createAdPayment      -> createAdPayment
//   adService.updateAdPaymentStatus -> updateAdPaymentStatus
//
// Security model: Super Admin ONLY, same posture as
// functions/adControlsService.js - money-moving/financial-record writes
// for the ad system are stricter than the plain-admin-allowed topup
// review flow in walletService.js.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAdAudit, logServerError } = require('./logService');

// Mirrors PAYMENT_STATUS_TRANSITIONS/VALID_PAYMENT_STATUSES in
// src/utils/adPackagePaymentRules.js exactly - functions/ is a separate
// deployable with no import path back into src/ (same reason
// adControlsService.js duplicates VALID_FEATURE_IDS rather than
// importing adFeatures.ts), so this is intentionally duplicated here.
// Keep the two in sync by hand if the state machine ever changes -
// scripts/phase10-ad-packages-payments-tests.js is the source of truth
// for what the src/ copy is supposed to do.
const PAYMENT_STATUS_TRANSITIONS = {
  pending: ['paid', 'failed'],
  paid: ['refunded', 'failed'],
  failed: ['pending', 'paid'],
  refunded: [],
};
const VALID_PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_TRANSITIONS);

function isValidPaymentStatusTransition(from, to) {
  if (!VALID_PAYMENT_STATUSES.includes(from) || !VALID_PAYMENT_STATUSES.includes(to)) return false;
  if (from === to) return false;
  return PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function requireSuperadmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || caller.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Only a Super Admin can manage advertisement payments.');
  }
  return caller;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Records a new manually-taken payment. Validates the advertiserId
 * always, and campaignId/packageId whenever provided (a payment can be
 * logged against an advertiser before a specific campaign/package is
 * finalized, but a provided id must point at a real doc - never a typo
 * silently accepted). Denormalizes advertiserName/campaignName/packageName
 * onto the payment doc from the docs it just read, so
 * AdPaymentsManagementScreen's cross-advertiser list never needs a
 * per-row lookup (see AdPayment's own header comment in src/types/ads.ts).
 *
 * request.data: {
 *   advertiserId: string, campaignId?: string, packageId?: string,
 *   amount: number, currency: string, paymentMethod: string,
 *   transactionReference?: string, paymentStatus?: 'pending'|'paid'|'failed'|'refunded',
 * }
 */
exports.createAdPayment = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireSuperadmin(db, callerUid);

  const {
    advertiserId, campaignId, packageId, amount, currency, paymentMethod, transactionReference, paymentStatus,
  } = request.data || {};

  if (!isNonEmptyString(advertiserId)) throw new HttpsError('invalid-argument', 'advertiserId is required.');
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new HttpsError('invalid-argument', 'amount must be greater than 0.');
  }
  if (!isNonEmptyString(currency)) throw new HttpsError('invalid-argument', 'currency is required.');
  if (!isNonEmptyString(paymentMethod)) throw new HttpsError('invalid-argument', 'paymentMethod is required.');
  const status = paymentStatus || 'pending';
  if (!VALID_PAYMENT_STATUSES.includes(status)) {
    throw new HttpsError('invalid-argument', `Unrecognized paymentStatus: ${status}`);
  }

  const advertiserRef = db.collection('ad_advertisers').doc(advertiserId);
  const advertiserSnap = await advertiserRef.get();
  if (!advertiserSnap.exists) throw new HttpsError('not-found', 'That advertiser does not exist.');

  let campaignSnap = null;
  if (campaignId) {
    campaignSnap = await db.collection('ad_campaigns').doc(campaignId).get();
    if (!campaignSnap.exists) throw new HttpsError('not-found', 'That campaign does not exist.');
    if (campaignSnap.data().advertiserId !== advertiserId) {
      throw new HttpsError('invalid-argument', 'That campaign does not belong to this advertiser.');
    }
  }

  let packageSnap = null;
  if (packageId) {
    packageSnap = await db.collection('ad_packages').doc(packageId).get();
    if (!packageSnap.exists) throw new HttpsError('not-found', 'That package does not exist.');
  }

  const paymentData = {
    advertiserId,
    campaignId: campaignId || '',
    packageId: packageId || '',
    amount: numericAmount,
    currency: currency.trim().toUpperCase(),
    paymentStatus: status,
    paymentMethod,
    transactionReference: transactionReference || '',
    advertiserName: advertiserSnap.data().companyName || '',
    campaignName: campaignSnap ? campaignSnap.data().name || '' : '',
    packageName: packageSnap ? packageSnap.data().name || '' : '',
    recordedBy: callerUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  let paymentRef;
  try {
    paymentRef = await db.collection('ad_payments').add(paymentData);
  } catch (err) {
    await logServerError('createAdPayment', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not record this payment.');
  }

  await logAdAudit({
    action: 'create',
    targetType: 'ad_payment',
    targetId: paymentRef.id,
    performedBy: callerUid,
    details: { advertiserId, campaignId: campaignId || null, packageId: packageId || null, amount: numericAmount, currency: paymentData.currency, paymentStatus: status, performedByRole: caller.role },
  });

  return { ok: true, paymentId: paymentRef.id };
});

/**
 * Moves an existing payment to a new paymentStatus, per
 * PAYMENT_STATUS_TRANSITIONS (src/utils/adPackagePaymentRules.js) -
 * backs the Pending -> Paid/Failed -> Refunded workflow on
 * AdPaymentsManagementScreen. Rejects same-status "changes" and any
 * transition not on that list (e.g. Refunded -> anything), so a bad
 * request fails loudly instead of quietly corrupting the payment's
 * history.
 * request.data: { paymentId: string, paymentStatus: 'pending'|'paid'|'failed'|'refunded', note?: string }
 */
exports.updateAdPaymentStatus = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireSuperadmin(db, callerUid);

  const { paymentId, paymentStatus, note } = request.data || {};
  if (!isNonEmptyString(paymentId)) throw new HttpsError('invalid-argument', 'paymentId is required.');
  if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new HttpsError('invalid-argument', `Unrecognized paymentStatus: ${paymentStatus}`);
  }

  const paymentRef = db.collection('ad_payments').doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new HttpsError('not-found', 'That payment record does not exist.');
  const current = paymentSnap.data();

  if (!isValidPaymentStatusTransition(current.paymentStatus, paymentStatus)) {
    throw new HttpsError(
      'failed-precondition',
      `Cannot move a payment from "${current.paymentStatus}" to "${paymentStatus}".`
    );
  }

  try {
    await paymentRef.update({
      paymentStatus,
      recordedBy: callerUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    await logServerError('updateAdPaymentStatus', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not update this payment\'s status.');
  }

  await logAdAudit({
    action: 'edit',
    targetType: 'ad_payment',
    targetId: paymentId,
    performedBy: callerUid,
    details: { from: current.paymentStatus, to: paymentStatus, note: note || '', performedByRole: caller.role },
  });

  return { ok: true };
});
