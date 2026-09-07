// PHASE 10 - MY SHEBA ADVERTISING PACKAGES AND PAYMENTS.
//
// Zero-dependency validation/transition logic for ad_packages and
// ad_payments, kept out of any component/Cloud-Function file so
// scripts/phase10-ad-packages-payments-tests.js can require() it
// directly - same "CommonJS module a test script can require() without
// pulling in firebase/expo" pattern as adScheduleUtils.js/
// adFrequencyRules.js/adAnalyticsRules.js from earlier phases.
//
// Both AdPackageFormModal.js and functions/adPaymentService.js import
// from here, so the same rule is enforced client-side (fast feedback in
// the form) AND server-side (the only place that actually matters,
// since a client-side check can always be bypassed) - never duplicated
// by hand in two places that could drift apart.

/** PENDING is always the natural starting point for a manually-recorded
 * payment; every other status is a possible destination from it. Once a
 * payment is 'paid' it can still be corrected to 'refunded' (money sent
 * back) or 'failed' (the paid marking was itself a mistake) - but never
 * silently back to 'pending', which would misrepresent history. A
 * 'failed' payment can be retried by moving it back to 'pending' (the
 * advertiser tries again with the same record) or straight to 'paid' if
 * it turns out the failure was reported in error. 'refunded' is
 * terminal - nothing reopens a refund from here; an admin who needs to
 * charge again should record a new payment instead of resurrecting one
 * that was already refunded. Same "state machine so a bad request fails
 * loudly instead of silently corrupting history" posture the ad system
 * has used since Phase 1's AD_STATUSES.
 */
const PAYMENT_STATUS_TRANSITIONS = {
  pending: ['paid', 'failed'],
  paid: ['refunded', 'failed'],
  failed: ['pending', 'paid'],
  refunded: [],
};

const VALID_PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_TRANSITIONS);

/** @returns {boolean} whether `from` -> `to` is an allowed transition. A
 * status "changing" to itself is never valid - callers should treat a
 * same-status request as a no-op error, not silently accept it. */
function isValidPaymentStatusTransition(from, to) {
  if (!VALID_PAYMENT_STATUSES.includes(from) || !VALID_PAYMENT_STATUSES.includes(to)) return false;
  if (from === to) return false;
  return PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Validates a Package Create/Edit form before it's submitted. Mirrors
 * the brief's PACKAGE field list exactly - packageId is the Firestore
 * doc id (never user-entered), so it's not checked here.
 * @param {{name?:string, price?:string|number, currency?:string, durationDays?:string|number, maxImpressions?:string|number, priority?:string|number}} form
 * @returns {string|null} an error message, or null if the form is valid.
 */
function validatePackagePayload(form) {
  const f = form || {};
  if (!String(f.name || '').trim()) return 'Enter a package name.';
  const price = Number(f.price);
  if (!Number.isFinite(price) || price <= 0) return 'Enter a price greater than 0.';
  if (!String(f.currency || '').trim()) return 'Enter a currency, e.g. MYR.';
  const durationDays = Number(f.durationDays);
  if (!Number.isFinite(durationDays) || durationDays <= 0) return 'Enter a duration of at least 1 day.';
  // maxImpressions is optional (blank = unlimited) - only checked when given.
  if (f.maxImpressions !== '' && f.maxImpressions != null) {
    const maxImpressions = Number(f.maxImpressions);
    if (!Number.isFinite(maxImpressions) || maxImpressions < 0) return 'Max Impressions must be 0 or greater (leave blank for unlimited).';
  }
  if (f.priority !== '' && f.priority != null) {
    const priority = Number(f.priority);
    if (!Number.isFinite(priority)) return 'Priority must be a number.';
  }
  return null;
}

/**
 * Validates a manual Payment record before it's submitted. Mirrors the
 * brief's PAYMENT field list - paymentId is the Firestore doc id,
 * createdAt/updatedAt are server-stamped, neither is checked here.
 * @param {{advertiserId?:string, amount?:string|number, currency?:string, paymentMethod?:string, paymentStatus?:string}} form
 * @returns {string|null}
 */
function validatePaymentPayload(form) {
  const f = form || {};
  if (!String(f.advertiserId || '').trim()) return 'Choose an advertiser.';
  const amount = Number(f.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter an amount greater than 0.';
  if (!String(f.currency || '').trim()) return 'Enter a currency, e.g. MYR.';
  if (!String(f.paymentMethod || '').trim()) return 'Choose a payment method.';
  if (f.paymentStatus && !VALID_PAYMENT_STATUSES.includes(f.paymentStatus)) {
    return 'Unrecognized payment status.';
  }
  return null;
}

module.exports = {
  PAYMENT_STATUS_TRANSITIONS,
  VALID_PAYMENT_STATUSES,
  isValidPaymentStatusTransition,
  validatePackagePayload,
  validatePaymentPayload,
};
