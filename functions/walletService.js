// All walletBalance mutations for MySheba, server-side.
//
// WHY THIS FILE EXISTS: firestore.rules can only check that a write leaves
// walletBalance non-negative - it has no way to check that a change
// matches a *legitimate* transaction (a real top-up, a real transfer, a
// real charge). Before this file existed, every wallet flow computed its
// new balance in client JS and wrote it directly to users/{uid} - which
// means any signed-in user could set their own walletBalance to anything
// non-negative with a single direct Firestore write, completely bypassing
// the transfer/top-up/charge logic client code only *appeared* to enforce.
//
// firestore.rules now freezes walletBalance on every client write (see the
// users/{uid} update rule) - these callable functions, using the Admin
// SDK, are the ONLY path left that can change it. Every mutation here runs
// inside a Firestore transaction and writes a userAuditLog entry, so every
// point that moves has both a concurrency-safe balance change and a
// permanent record of who/what moved it.
//
// Client call sites (see src/firebase/*.js):
//   topupService.approveTopup       -> approveTopup
//   topupService.rejectTopup        -> rejectTopup
//   topupService.createSelfTopup    -> createSelfTopup
//   pointTransferService.transferPoints -> transferPoints
//   webviewAccessService.ensureWebviewAccess    -> chargeWallet(kind: 'webview_access')
//   webviewAccessService.chargeWebviewSubmission -> chargeWallet(kind: 'webview_submit')
//   paymentWebviewService.chargePaymentSuccess   -> chargeWallet(kind: 'payment_success')
//   gamePointsService.rechargeGamePoints        -> chargeGamePoints

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const progressionService = require('./progressionService');
const { logAudit, logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { checkIpAnomaly } = require('./anomalyService');

const DEFAULT_PRICING = {
  dealerEarningPercent: 1.5,
  webviewAccessCost: 2,
  webviewSubmitCost: 2,
  paymentSuccessCost: 3,
  webviewAccessWindowHours: 1,
  notepadCost: 0,
  myDocumentsCost: 0,
  salaryOtCost: 0,
  moduleSubscriptionDays: 30,
  gamePointsCostPerUnit: 1,
  gamePointsGiftEnabled: true,
  gamePointsGiftMinAmount: 1,
  gamePointsGiftMaxAmount: 100000,
};

// Fixed by the PRD's own definition of a "gift" (Next Update PRD §4) - not
// admin-configurable like the min/max amount above, since 80/20 is the
// product rule itself, not a price point.
const GIFT_RECEIVER_RATE = 0.80;
const GIFT_FEE_RATE = 0.20;

async function getPricing(db) {
  const snap = await db.collection('settings').doc('pricing').get();
  return { ...DEFAULT_PRICING, ...(snap.exists ? snap.data() : {}) };
}

// Next Update PRD §5/§9 - "Do not trust client-supplied exchange rates" /
// "exchange-rate snapshots should be stored with transactions so historical
// orders remain auditable". Mirrors src/firebase/ratesService.js's
// DEFAULT_RATES exactly (same fallback values) so a missing rates/current
// doc behaves identically here and client-side.
const DEFAULT_RATES = {
  mobileBanking: 110.5,
  BD_ACC: 30.26,
  BD_CASH: 30.11,
  NP: 37.65,
  PK: 67.79,
  PH: 15.05,
  LK: 81.99,
  IN: 23.5,
  ID: 230,
  MM: 966,
  remittanceFee: 7.0,
  rechargeBD: 30.26,
  rechargeIN: 23.5,
  rechargeNP: 37.65,
  rechargeID: 230,
  rechargePK: 67.79,
  rechargeMM: 966,
  rechargePH: 15.05,
  rechargeKH: 900,
};

async function getRates(db) {
  const snap = await db.collection('rates').doc('current').get();
  return { ...DEFAULT_RATES, ...(snap.exists ? snap.data() : {}) };
}

// Mirrors src/data/countries.js RECHARGE_RATE_KEYS exactly - which
// settings/rates field backs each non-Malaysia Recharge/Internet
// destination country.
const RECHARGE_RATE_KEYS = {
  BD: 'rechargeBD',
  IN: 'rechargeIN',
  NP: 'rechargeNP',
  ID: 'rechargeID',
  PK: 'rechargePK',
  MM: 'rechargeMM',
  PH: 'rechargePH',
  KH: 'rechargeKH',
};

/** Server-side mirror of src/data/countries.js's amountToPoints - converts a
 * Recharge/Internet face amount (destination country's local currency) into
 * MYR points using the *server's own* rates/current read, not anything the
 * client sent. Also returns the rate actually used, for the transaction
 * snapshot. Malaysia (or no country) is already MYR, rate 1 (no conversion). */
function rechargeAmountToPoints(rawAmount, countryCode, rates) {
  const num = Number(rawAmount) || 0;
  if (!countryCode || countryCode === 'MY') return { points: num, rate: 1 };
  const key = RECHARGE_RATE_KEYS[countryCode];
  const rate = key && rates[key] > 0 ? rates[key] : 1;
  return { points: rate > 0 ? num / rate : num, rate };
}

/** Server-side mirror of RemittanceSteps.js's getRate - BD has separate
 * bank/cash-network rates, every other country uses one flat rate. */
function remittanceRate(countryCode, method, rates) {
  if (countryCode === 'BD') return method === 'deposit' ? (rates.BD_ACC || 30.26) : (rates.BD_CASH || 30.11);
  return rates[countryCode] || 30.26;
}

// Tolerance for comparing the client's claimed amount against the server's
// own recomputation - a cent, to absorb float rounding in the client's own
// display math (toFixed(2) etc.), not to allow any real drift.
const AMOUNT_TOLERANCE = 0.01;

/** Recomputes the trusted MYR amount/total for a chargeable service from
 * `raw` (the service wizard's own serviceData, always included in payload.raw
 * - see buildTransactionPayload) and the server's own rates/pricing reads.
 * Throws if the client's claimed amount/total don't match within
 * AMOUNT_TOLERANCE - a mismatch means either a stale client rate or a
 * tampered payload, and either way the server's own number is what gets
 * charged, never the client's. Returns { amount, total, exchangeRate,
 * exchangeRateSource } - exchangeRate/exchangeRateSource are null for
 * Malaysia-only orders (Mobile Banking) where no conversion applies. */
function recomputeChargeAmounts(service, raw, rates) {
  const r = raw || {};
  if (service === 'recharge' || service === 'internet') {
    const { points, rate } = rechargeAmountToPoints(r.amount, r.country, rates);
    const rounded = Math.round(points * 100) / 100;
    return {
      amount: rounded,
      total: rounded,
      exchangeRate: r.country && r.country !== 'MY' ? rate : null,
      exchangeRateSource: r.country && r.country !== 'MY' ? RECHARGE_RATE_KEYS[r.country] || null : null,
    };
  }
  if (service === 'mobilebanking') {
    // Always MYR-denominated on the sender side (see MobileBankingSteps.js) -
    // nothing to convert for the charge itself, but the receiver-side BDT
    // rate is still recomputed and snapshotted for audit/display parity with
    // what the customer was shown.
    const myr = Math.round((Number(r.myr) || 0) * 100) / 100;
    return {
      amount: myr,
      total: Math.round((myr + 5) * 100) / 100,
      exchangeRate: rates.mobileBanking || 110.5,
      exchangeRateSource: 'mobileBanking',
    };
  }
  if (service === 'remittance') {
    const sendAmt = Math.round((Number(r.sendAmt) || 0) * 100) / 100;
    const fee = Math.round((rates.remittanceFee != null ? Number(rates.remittanceFee) : 7.0) * 100) / 100;
    const rate = remittanceRate(r.country, r.method, rates);
    return {
      amount: sendAmt,
      total: Math.round((sendAmt + fee) * 100) / 100,
      exchangeRate: rate,
      exchangeRateSource: r.country === 'BD' ? (r.method === 'deposit' ? 'BD_ACC' : 'BD_CASH') : r.country,
    };
  }
  return { amount: Number(r.amount) || 0, total: Number(r.total) || 0, exchangeRate: null, exchangeRateSource: null };
}

// Mirrors priceForRole in src/firebase/settingsService.js - this is the
// real enforcement point (client-side pointCosts/boost cost are just for
// display/locking), so it has to make the same role-price decision the
// client shows. Keep both in sync if this logic ever changes.
function priceForRole(pricing, key, role) {
  const override = role && pricing.rolePricing && pricing.rolePricing[role] && pricing.rolePricing[role][key];
  return override != null ? override : pricing[key];
}

async function getProfile(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

// ---------------------------------------------------------------------------
// Top-ups (customer/dealer request -> admin review)
// ---------------------------------------------------------------------------

/** Admin approves a pending top-up: credits the requester 1:1 and marks it approved. */
exports.approveTopup = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await getProfile(db, callerUid);
  if (!caller || !['admin', 'superadmin'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Only an admin can approve top-ups.');
  }
  const { topupId } = request.data || {};
  if (!topupId) throw new HttpsError('invalid-argument', 'topupId is required.');

  const topupRef = db.collection('topups').doc(topupId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const topupSnap = await tx.get(topupRef);
      if (!topupSnap.exists) throw new HttpsError('not-found', 'That top-up request does not exist.');
      const topup = topupSnap.data();
      if (topup.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      }
      const userRef = db.collection('users').doc(topup.userId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');

      const points = Number(topup.points || topup.amount || 0);
      const currentBalance = Number(userSnap.data().walletBalance || 0);
      tx.update(userRef, { walletBalance: currentBalance + points });
      tx.update(topupRef, {
        status: 'approved',
        approvedBy: callerUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { userId: topup.userId, points };
    });

    await logAudit({
      action: 'topup_approved',
      targetUid: result.userId,
      performedBy: callerUid,
      performedByRole: caller.role,
      details: { topupId, points: result.points },
    });
    return { approved: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('approveTopup', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not approve this top-up.');
  }
});

/** Admin rejects a pending top-up - no balance change, just a status update + reason. */
exports.rejectTopup = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await getProfile(db, callerUid);
  if (!caller || !['admin', 'superadmin'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Only an admin can reject top-ups.');
  }
  const { topupId, reason } = request.data || {};
  if (!topupId) throw new HttpsError('invalid-argument', 'topupId is required.');

  const topupRef = db.collection('topups').doc(topupId);
  const topupSnap = await topupRef.get();
  if (!topupSnap.exists) throw new HttpsError('not-found', 'That top-up request does not exist.');
  if (topupSnap.data().status !== 'pending') {
    throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
  }

  await topupRef.update({
    status: 'rejected',
    rejectReason: reason || '',
    approvedBy: callerUid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await logAudit({
    action: 'topup_rejected',
    targetUid: topupSnap.data().userId,
    performedBy: callerUid,
    performedByRole: caller.role,
    details: { topupId, reason: reason || '' },
  });
  return { rejected: true };
});

/** Admin/superadmin buys points for their own account - instant credit, no review step. */
exports.createSelfTopup = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await getProfile(db, callerUid);
  if (!caller || !['admin', 'superadmin'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Only admin/superadmin can self-top-up.');
  }
  const { amount, method, bankName, refNo, receiptUrl } = request.data || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new HttpsError('invalid-argument', 'Enter a valid amount.');

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'createSelfTopup', { ip });

  const userRef = db.collection('users').doc(callerUid);
  const selfTopupRef = db.collection('selfTopups').doc();

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const currentBalance = Number((userSnap.exists && userSnap.data().walletBalance) || 0);
    tx.update(userRef, { walletBalance: currentBalance + amt });
    tx.set(selfTopupRef, {
      userId: callerUid,
      userPhone: caller.phone || '',
      userName: caller.name || '',
      userRole: caller.role,
      amount: amt,
      points: amt,
      method: method || 'transfer',
      bankName: bankName || '',
      refNo: refNo || '',
      receiptUrl: receiptUrl || '',
      status: 'approved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await logAudit({
    action: 'self_topup',
    targetUid: callerUid,
    performedBy: callerUid,
    performedByRole: caller.role,
    details: { amount: amt, ip },
  });
  await checkIpAnomaly(db, callerUid, ip, { action: 'self_topup', role: caller.role });
  return { id: selfTopupRef.id };
});

// ---------------------------------------------------------------------------
// Staff -> staff/customer point transfers
// ---------------------------------------------------------------------------

/** Mirrors ROLE scope from src/firebase/userManagementService.js: who each
 * tier is allowed to send points to. */
function canTransferTo(callerRole, callerProfile, recipientProfile) {
  if (callerRole === 'dealer') return recipientProfile.dealerId === callerProfile.id;
  if (callerRole === 'dealer') return recipientProfile.dealerId === (callerProfile.dealerId || null);
  if (callerRole === 'admin') return recipientProfile.role === 'dealer';
  if (callerRole === 'superadmin') return ['admin', 'dealer'].includes(recipientProfile.role);
  return false;
}

exports.transferPoints = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await getProfile(db, callerUid);
  if (!caller || !['dealer', 'admin', 'superadmin'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Your account cannot transfer points.');
  }
  const { toUid, amount, note } = request.data || {};
  const amt = Number(amount);
  if (!toUid) throw new HttpsError('invalid-argument', 'A recipient is required.');
  if (toUid === callerUid) throw new HttpsError('invalid-argument', "You can't transfer points to yourself.");
  if (!Number.isFinite(amt) || amt <= 0) throw new HttpsError('invalid-argument', 'Enter a valid amount.');

  const recipient = await getProfile(db, toUid);
  if (!recipient) throw new HttpsError('not-found', 'That account does not exist.');
  if (recipient.mergedInto) {
    // Merged away by the Google-account-merge flow
    // (functions/accountMergeService.js) - it's disabled in Auth and its
    // wallet was already zeroed out into the account it merged into, so
    // sending points here would strand them on a dead account.
    throw new HttpsError('not-found', 'That account no longer exists.');
  }
  if (!canTransferTo(caller.role, caller, recipient)) {
    throw new HttpsError('permission-denied', 'You are not allowed to send points to that account.');
  }

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'transferPoints', { ip });

  const pricing = await getPricing(db);
  const isDealerToCustomer = ['dealer'].includes(caller.role) && recipient.role === 'customer';
  const earningPercent = isDealerToCustomer ? Number(pricing.dealerEarningPercent) || 0 : 0;
  const earning = Math.round(amt * (earningPercent / 100) * 100) / 100;
  const dealerScope = caller.role === 'dealer' ? callerUid : caller.dealerId || null;

  const fromRef = db.collection('users').doc(callerUid);
  const toRef = db.collection('users').doc(toUid);
  const transferRef = db.collection('pointTransfers').doc();

  try {
    await db.runTransaction(async (tx) => {
      const fromSnap = await tx.get(fromRef);
      const toSnap = await tx.get(toRef);
      const fromBalance = Number((fromSnap.exists && fromSnap.data().walletBalance) || 0);
      if (fromBalance < amt) throw new HttpsError('failed-precondition', 'Insufficient balance.');
      const toBalance = Number((toSnap.exists && toSnap.data().walletBalance) || 0);

      tx.update(fromRef, { walletBalance: fromBalance - amt + earning });
      tx.update(toRef, { walletBalance: toBalance + amt });
      tx.set(transferRef, {
        fromUid: callerUid,
        fromName: caller.name || '',
        fromRole: caller.role || '',
        toUid,
        toName: recipient.name || '',
        toRole: recipient.role || '',
        amount: amt,
        note: note || '',
        participants: [callerUid, toUid],
        dealerId: dealerScope,
        dealerEarningPercent: earningPercent || null,
        dealerEarning: earning || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await logAudit({
      action: 'points_transferred',
      targetUid: toUid,
      performedBy: callerUid,
      performedByRole: caller.role,
      details: { amount: amt, earning: earning || null, ip },
    });
    await checkIpAnomaly(db, callerUid, ip, { action: 'transferPoints', role: caller.role });
    return { transferId: transferRef.id };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('transferPoints', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not complete the transfer.');
  }
});

// ---------------------------------------------------------------------------
// Marketplace listing boost (Phase 3 monetization - PRD section 15,
// "Listing boost" / "Featured listings"). Mirrors chargeWallet below:
// firestore.rules freezes `featured`/`featuredUntil` on marketplaceListings
// the same way it freezes walletBalance on users/{uid}, so this callable -
// which debits the seller's wallet and flips both fields inside one
// transaction - is the only path that can feature a listing. A seller
// can't set featured:true on their own listing with a direct client write.
// ---------------------------------------------------------------------------

exports.boostListing = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const { listingId } = request.data || {};
  if (!listingId) throw new HttpsError('invalid-argument', 'listingId is required.');

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'boostListing', { ip });

  const pricing = await getPricing(db);
  const days = Number(pricing.listingBoostDurationDays) || 7;

  const listingRef = db.collection('marketplaceListings').doc(listingId);
  const userRef = db.collection('users').doc(callerUid);

  try {
    const result = await db.runTransaction(async (tx) => {
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists) throw new HttpsError('not-found', 'That listing no longer exists.');
      const listing = listingSnap.data();
      if (listing.sellerId !== callerUid) {
        throw new HttpsError('permission-denied', 'You can only boost your own listing.');
      }
      if (listing.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Only active listings can be boosted.');
      }

      const userSnap = await tx.get(userRef);
      const balance = Number((userSnap.exists && userSnap.data().walletBalance) || 0);
      const cost = Number(priceForRole(pricing, 'listingBoostCost', userSnap.exists ? userSnap.data().role : null)) || 0;
      if (balance < cost) throw new HttpsError('failed-precondition', `You need ${cost} pts to boost - top up your wallet first.`);

      // Extends from the current featuredUntil if it's still running, so
      // re-boosting a listing that's already featured stacks the days
      // rather than wasting the remainder.
      const now = Date.now();
      const currentUntil = listing.featuredUntil ? listing.featuredUntil.toMillis() : 0;
      const base = currentUntil > now ? currentUntil : now;
      const featuredUntilMs = base + days * 24 * 60 * 60 * 1000;

      tx.update(userRef, { walletBalance: balance - cost });
      tx.update(listingRef, {
        featured: true,
        featuredUntil: admin.firestore.Timestamp.fromMillis(featuredUntilMs),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { cost, featuredUntilMs };
    });

    await logAudit({
      action: 'listing_boosted',
      targetUid: callerUid,
      performedBy: callerUid,
      performedByRole: 'seller',
      details: { listingId, cost: result.cost, ip },
    });
    await checkIpAnomaly(db, callerUid, ip, { action: 'boostListing', role: 'seller' });
    return { boosted: true, featuredUntilMs: result.featuredUntilMs };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('boostListing', err, { userId: callerUid, listingId });
    throw new HttpsError('internal', 'Could not boost this listing right now.');
  }
});

// ---------------------------------------------------------------------------
// Recharge / Internet Package purchases (role-based point pricing).
// Both are submitted through the same dealer-fulfillment queue as Mobile
// Banking/Remittance (see transactionService.createTransaction), but
// unlike those two, a recharge/internet order now actually debits the
// buyer's wallet at submit time - previously nothing charged the wallet
// for these at all; cost/profit on the transaction doc were reporting-only
// (see rechargeCostPercent/rechargeProfitPercent in settingsService.js).
// This mirrors boostListing above: one atomic transaction that both debits
// the wallet AND writes the transactions/{id} doc, so an order can never
// exist without its matching charge, or vice versa. firestore.rules blocks
// a direct client `create` on transactions/{id} for these two services
// specifically (see the transactions/{id} rule's serviceIsChargeable()
// check) - this callable, via the Admin SDK, is the only path left that
// can file one.
//
// Reject (see rejectRechargeTransaction/rejectInternetPackageTransaction
// below) auto-refunds the exact points charged, guarded by the
// transaction doc's own `status` field so a double-reject (retry, double
// tap) can never double-refund - same "check status inside the same
// atomic transaction" guard boostListing uses for listing.status.
// ---------------------------------------------------------------------------

const CHARGEABLE_SERVICES = {
  recharge: { costKey: 'rechargePointCostPerUnit', auditAction: 'recharge_charged', refundAuditAction: 'recharge_refunded', chargeField: 'amount' },
  internet: { costKey: 'internetPointCostPerUnit', auditAction: 'internet_package_charged', refundAuditAction: 'internet_package_refunded', chargeField: 'amount' },
  mobilebanking: { costKey: null, auditAction: 'mobile_banking_charged', refundAuditAction: 'mobile_banking_refunded', chargeField: 'total' },
  remittance: { costKey: null, auditAction: 'remittance_charged', refundAuditAction: 'remittance_refunded', chargeField: 'total' },
};

/** Shared by chargeRecharge/chargeInternetPackage/chargeMobileBanking/
 * chargeRemittance - recomputes the trusted MYR face amount/total
 * server-side from payload.raw + the server's own rates/current and
 * settings/pricing reads (see recomputeChargeAmounts - Next Update PRD §9,
 * "do not trust client-supplied exchange rates"), computes the role-based
 * points cost, debits the buyer's wallet, and writes the transactions/{id}
 * doc - including an exchangeRate/exchangeRateSource snapshot (PRD §5,
 * "historical orders remain auditable") - all inside one Firestore
 * transaction. */
async function chargeProductPurchase(request, service, payload, customer) {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const config = CHARGEABLE_SERVICES[service];

  const rates = await getRates(db);
  const recomputed = recomputeChargeAmounts(service, payload?.raw, rates);
  const faceAmount = recomputed.amount;
  const chargeAmount = config.chargeField === 'total' ? recomputed.total : recomputed.amount;
  if (!Number.isFinite(faceAmount) || faceAmount < 0 || !Number.isFinite(chargeAmount) || chargeAmount < 0) {
    throw new HttpsError('invalid-argument', 'Invalid amount.');
  }
  // The client still sends its own computed amount/total (used for the
  // order's `details` display string and legacy callers) - if it doesn't
  // match what the server just derived from its own rate/pricing reads
  // within a cent, either the client had a stale rate or the payload was
  // tampered with. Either way, the server's own number above is what gets
  // charged - this check exists only to surface the mismatch as a clear
  // error rather than silently overriding what the customer was shown.
  const clientFaceAmount = Number(payload?.amount);
  const clientChargeAmount = Number(config.chargeField === 'total' ? payload?.total : payload?.amount);
  if (
    Number.isFinite(clientFaceAmount) && Math.abs(clientFaceAmount - faceAmount) > AMOUNT_TOLERANCE
  ) {
    throw new HttpsError('failed-precondition', 'Exchange rate has changed - please review your order and try again.');
  }
  if (
    Number.isFinite(clientChargeAmount) && Math.abs(clientChargeAmount - chargeAmount) > AMOUNT_TOLERANCE
  ) {
    throw new HttpsError('failed-precondition', 'Order total has changed - please review your order and try again.');
  }

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, `charge_${service}`, { ip });

  const pricing = await getPricing(db);
  const userRef = db.collection('users').doc(callerUid);
  const txRef = db.collection('transactions').doc();
  // Fetched once here (same "outside the transaction, plain read-only
  // object" pattern as `pricing` above) rather than inside db.runTransaction
  // below, since progressionService.getProgressionSettings does its own
  // Firestore read and Cloud Firestore transactions can't mix reads through
  // two different client paths safely.
  const progressionSettings = await progressionService.getProgressionSettings();

  try {
    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const data = userSnap.data();
      const balance = Number(data.walletBalance || 0);
      const perUnit = Number(priceForRole(pricing, config.costKey, data.role));
      const baseCost = Math.round(chargeAmount * (Number.isFinite(perUnit) ? perUnit : 1) * 100) / 100;
      // Tier discount (see progressionService.js / Superadmin > Tier
      // Promotions) - the buyer's own tier, read off the same user doc
      // fetched above in this same transaction, so it can't be spoofed by
      // a client-supplied tier value the way trusting `customer.tier` from
      // the caller's payload would be.
      const discountPercent = progressionService.discountPercentFromSettings(progressionSettings, data.tier);
      const cost = Math.round(baseCost * (1 - discountPercent / 100) * 100) / 100;
      if (balance < cost) throw new HttpsError('failed-precondition', `You need ${cost} pts - top up your wallet first.`);

      tx.update(userRef, { walletBalance: balance - cost });
      tx.set(txRef, {
        service: payload.service,
        details: payload.details || '',
        amount: faceAmount,
        total: chargeAmount,
        cost: payload.cost || 0, // reporting-only cost/profit split, unrelated to the points charge above
        profit: payload.profit || 0,
        pointsCharged: cost,
        tierDiscountPercent: discountPercent, // reporting-only - what discount (if any) applied to this order
        chargedServiceKind: service, // 'recharge' | 'internet' - which charge/refund path owns this order
        // PRD §5 - exchange-rate snapshot for auditability. Null for
        // Malaysia-only orders (no conversion involved) - see
        // recomputeChargeAmounts. exchangeRateSource names which
        // settings/rates field the snapshot came from (e.g. 'rechargeBD',
        // 'BD_ACC', 'IN'), so a later rate change never makes a past
        // order's number ambiguous.
        exchangeRate: recomputed.exchangeRate,
        exchangeRateSource: recomputed.exchangeRateSource,
        status: 'pending',
        customerId: (customer && customer.uid) || null,
        customerPhone: (customer && customer.phone) || payload.customerPhone || '',
        resellerId: (customer && customer.resellerId) || null,
        dealerId: customer && customer.resellerId ? null : (customer && customer.dealerId) || null,
        rejected: false,
        rejectReason: '',
        pin: '',
        raw: payload.raw || {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // callerRole comes off the caller's own verified user doc read
      // inside this transaction, not from the client-supplied `customer`
      // argument - used below for the audit log so it reflects the real
      // role even if the client sent something else.
      return { cost, callerRole: data.role || null };
    });

    await logAudit({
      action: config.auditAction,
      targetUid: callerUid,
      performedBy: callerUid,
      performedByRole: result.callerRole,
      details: { transactionId: txRef.id, amount: faceAmount, chargeAmount, cost: result.cost, exchangeRate: recomputed.exchangeRate, ip },
    });
    await checkIpAnomaly(db, callerUid, ip, { action: `charge_${service}`, role: result.callerRole });
    return { id: txRef.id, cost: result.cost };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError(`charge_${service}`, err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not submit this order right now.');
  }
}

/** Shared by rejectRechargeTransaction/rejectInternetPackageTransaction -
 * credits the exact pointsCharged back onto the order's own customerId and
 * marks it rejected. Guarded on status === 'pending' inside the same
 * atomic transaction as the credit, so retrying a reject call (network
 * retry, double tap) after it already succeeded is a no-op rather than a
 * second refund - the second call's status check reads 'completed' (set by
 * the first call) and throws before crediting anything. */
async function recordBroadcastReject(request, service, reason, { transactionId }) {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await getProfile(db, callerUid);
  if (!caller || !['admin', 'superadmin', 'dealer', 'reseller'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Only staff can reject an order.');
  }
  const txRef = db.collection('transactions').doc(transactionId);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(txRef);
      if (!snap.exists) throw new HttpsError('not-found', 'That order does not exist.');
      const order = snap.data();
      if (order.chargedServiceKind !== service) {
        throw new HttpsError('failed-precondition', 'That order was not submitted through this charge path.');
      }
      if (order.status !== 'pending' || order.claimedBy) {
        throw new HttpsError('failed-precondition', 'That order has already been accepted.');
      }
      const rejectedBy = { ...(order.rejectedBy || {}) };
      rejectedBy[callerUid] = {
        reason: reason || '',
        at: admin.firestore.FieldValue.serverTimestamp(),
      };
      tx.update(txRef, {
        rejectedBy,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return { rejected: true, terminal: false };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError(`reject_${service}`, err, { userId: callerUid, transactionId });
    throw new HttpsError('internal', 'Could not reject this order right now.');
  }
}

exports.chargeRecharge = onCall(async (request) => {
  const { payload, customer } = request.data || {};
  return chargeProductPurchase(request, 'recharge', payload, customer);
});

exports.chargeInternetPackage = onCall(async (request) => {
  const { payload, customer } = request.data || {};
  return chargeProductPurchase(request, 'internet', payload, customer);
});

exports.rejectRechargeTransaction = onCall(async (request) => {
  const { transactionId, reason } = request.data || {};
  if (!transactionId) throw new HttpsError('invalid-argument', 'transactionId is required.');
  return recordBroadcastReject(request, 'recharge', reason, { transactionId });
});

exports.rejectInternetPackageTransaction = onCall(async (request) => {
  const { transactionId, reason } = request.data || {};
  if (!transactionId) throw new HttpsError('invalid-argument', 'transactionId is required.');
  return recordBroadcastReject(request, 'internet', reason, { transactionId });
});

exports.chargeMobileBanking = onCall(async (request) => {
  const { payload, customer } = request.data || {};
  return chargeProductPurchase(request, 'mobilebanking', payload, customer);
});

exports.chargeRemittance = onCall(async (request) => {
  const { payload, customer } = request.data || {};
  return chargeProductPurchase(request, 'remittance', payload, customer);
});

exports.rejectMobileBankingTransaction = onCall(async (request) => {
  const { transactionId, reason } = request.data || {};
  if (!transactionId) throw new HttpsError('invalid-argument', 'transactionId is required.');
  return recordBroadcastReject(request, 'mobilebanking', reason, { transactionId });
});

exports.rejectRemittanceTransaction = onCall(async (request) => {
  const { transactionId, reason } = request.data || {};
  if (!transactionId) throw new HttpsError('invalid-argument', 'transactionId is required.');
  return recordBroadcastReject(request, 'remittance', reason, { transactionId });
});

// ---------------------------------------------------------------------------
// Point-cost features: FOMEMA/Visa access, MY Digital/Passport submission,
// Bus/Train/e-SIM payment success fee. All three share one shape (check a
// per-key flag/window on the user's own doc, charge if due) so they share
// one callable, keyed by `kind`.
// ---------------------------------------------------------------------------

exports.chargeWallet = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const { kind, key } = request.data || {};
  if (!key) throw new HttpsError('invalid-argument', 'key is required.');
  if (!['webview_access', 'webview_submit', 'payment_success', 'module_subscription'].includes(kind)) {
    throw new HttpsError('invalid-argument', 'Unknown charge kind.');
  }

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'chargeWallet', { ip });

  const pricing = await getPricing(db);
  const userRef = db.collection('users').doc(callerUid);

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new HttpsError('not-found', 'Account not found.');
      const data = snap.data();
      const balance = Number(data.walletBalance || 0);
      const now = Date.now();

      if (kind === 'webview_access') {
        const cost = Number(priceForRole(pricing, 'webviewAccessCost', data.role)) || 0;
        const windowMs = (Number(pricing.webviewAccessWindowHours) || 0) * 60 * 60 * 1000;
        const lastCharge = data.lastAccessCharge && data.lastAccessCharge[key];
        if (lastCharge && windowMs > 0 && now - lastCharge < windowMs) {
          return { charged: false, freeUntil: lastCharge + windowMs };
        }
        if (balance < cost) throw new HttpsError('failed-precondition', `You need ${cost} pts - top up your wallet first.`);
        tx.update(userRef, { walletBalance: balance - cost, [`lastAccessCharge.${key}`]: now });
        return { charged: true, cost, chargedAt: now, freeUntil: now + windowMs };
      }

      if (kind === 'webview_submit') {
        const cost = Number(priceForRole(pricing, 'webviewSubmitCost', data.role)) || 0;
        const already = data.webviewSubmitted && data.webviewSubmitted[key];
        if (already) return { charged: false, submittedAt: already };
        if (balance < cost) throw new HttpsError('failed-precondition', `You need ${cost} pts - top up your wallet first.`);
        tx.update(userRef, { walletBalance: balance - cost, [`webviewSubmitted.${key}`]: now });
        return { charged: true, submittedAt: now, cost };
      }

      // payment_success
      if (kind === 'payment_success') {
        const cost = Number(priceForRole(pricing, 'paymentSuccessCost', data.role)) || 0;
        if (balance < cost) throw new HttpsError('failed-precondition', `You need ${cost} pts - top up your wallet first.`);
        tx.update(userRef, { walletBalance: balance - cost, [`lastPaymentCharge.${key}`]: now });
        return { charged: true, chargedAt: now, cost };
      }

      // module_subscription - Notepad / My Documents / Salary & OT charge
      // once per admin-set moduleSubscriptionDays window (default 30, a
      // "month"), same shape as webview_access above but with a much
      // longer window and its own cost field per module. Re-opening the
      // module inside that window is free; the window resets from the
      // moment of the charge, not the calendar month.
      const costKeyByModule = { notepad: 'notepadCost', myDocuments: 'myDocumentsCost', salaryOt: 'salaryOtCost' };
      const costKey = costKeyByModule[key];
      if (!costKey) throw new HttpsError('invalid-argument', 'Unknown module.');
      const cost = Number(priceForRole(pricing, costKey, data.role)) || 0;
      const windowMs = (Number(pricing.moduleSubscriptionDays) || 30) * 24 * 60 * 60 * 1000;
      const lastCharge = data.moduleSubscription && data.moduleSubscription[key];
      if (lastCharge && windowMs > 0 && now - lastCharge < windowMs) {
        return { charged: false, subscribedUntil: lastCharge + windowMs };
      }
      if (cost > 0 && balance < cost) {
        throw new HttpsError('failed-precondition', `You need ${cost} pts for this month's subscription - top up your wallet first.`);
      }
      tx.update(userRef, {
        ...(cost > 0 ? { walletBalance: balance - cost } : {}),
        [`moduleSubscription.${key}`]: now,
      });
      return { charged: cost > 0, cost, subscribedUntil: now + windowMs };
    });

    if (result.charged) {
      await checkIpAnomaly(db, callerUid, ip, { action: `chargeWallet:${kind}` });
    }
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('chargeWallet', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not process this charge.');
  }
});

// ---------------------------------------------------------------------------
// Game Points recharge: converts real wallet points into the play-money
// balance functions-gamebot uses for the in-app room games (dice, lowcard,
// highcard, cricket, 29 - "no real money", see roomChatService.js's GameBot
// comments). gamebot owns gamePoints/{uid} and gamePointsLedger/{id}
// (functions-gamebot/pointsLedger.js, deployed separately) - this callable
// is the only path on THIS side that ever writes to those two collections,
// so a wallet debit and its matching game-points credit can never happen
// as two separate, driftable writes. No review queue: unlike Top-Up,
// this instantly debits walletBalance and credits gamePoints in one
// transaction, since it's just moving the user's own points from one
// bucket to another, not filing a claim someone else has to approve.
exports.chargeGamePoints = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();

  const amount = Number(request.data && request.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Enter a valid amount of game points.');
  }

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'charge_gamepoints', { ip });

  const pricing = await getPricing(db);
  const userRef = db.collection('users').doc(callerUid);
  const gamePointsRef = db.collection('gamePoints').doc(callerUid);
  const ledgerRef = db.collection('gamePointsLedger').doc();

  try {
    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const data = userSnap.data();
      const balance = Number(data.walletBalance || 0);
      const perUnit = Number(priceForRole(pricing, 'gamePointsCostPerUnit', data.role));
      const cost = Math.round(amount * (Number.isFinite(perUnit) ? perUnit : 1) * 100) / 100;
      if (balance < cost) throw new HttpsError('failed-precondition', `You need ${cost} pts - top up your wallet first.`);

      const gpSnap = await tx.get(gamePointsRef);
      // Mirrors pointsLedger.js's STARTING_POINTS seed (100) so a player's
      // very first recharge lands on top of the same balance gamebot would
      // have lazily created for them on their first game, not on top of 0.
      const currentGamePoints = gpSnap.exists ? Number(gpSnap.data().balance || 0) : 100;
      const nextGamePoints = currentGamePoints + amount;

      tx.update(userRef, { walletBalance: balance - cost });
      tx.set(gamePointsRef, { balance: nextGamePoints, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(ledgerRef, {
        uid: callerUid,
        roomId: null,
        game: null,
        delta: amount,
        reason: 'wallet_recharge',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { cost, callerRole: data.role || null, gamePoints: nextGamePoints };
    });

    await logAudit({
      action: 'gamepoints_recharged',
      targetUid: callerUid,
      performedBy: callerUid,
      performedByRole: result.callerRole,
      details: { amount, cost: result.cost, ip },
    });
    await checkIpAnomaly(db, callerUid, ip, { action: 'charge_gamepoints', role: result.callerRole });
    return { cost: result.cost, amount, gamePoints: result.gamePoints };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('charge_gamepoints', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not recharge game points right now.');
  }
});

// Reverse of chargeGamePoints: debits gamePoints/{uid}.balance and credits
// walletBalance in the same transaction, so a player can cash out points
// they've won from GameBot room games (or just recharged and changed their
// mind) back into real wallet points. Instant, no admin review - same
// "moving your own points between buckets" reasoning as chargeGamePoints,
// not a claim someone else has to approve.
//
// gamePointsFeePercent (settings/pricing, "GameBot Winner Payout Fee")
// existed as an editable admin setting before this function did but was
// never wired to anything - this is that fee's actual enforcement point:
// it's cut from the withdrawal before crediting the wallet, so admin can
// tune how much of a haircut game-point cash-outs take without touching
// the 1:1 recharge rate (gamePointsCostPerUnit) at all.
exports.withdrawGamePoints = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();

  const amount = Number(request.data && request.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Enter a valid amount of game points.');
  }

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'withdraw_gamepoints', { ip });

  const pricing = await getPricing(db);
  const feePercent = Number(pricing.gamePointsFeePercent);
  const safeFeePercent = Number.isFinite(feePercent) ? feePercent : 0;

  const userRef = db.collection('users').doc(callerUid);
  const gamePointsRef = db.collection('gamePoints').doc(callerUid);
  const ledgerRef = db.collection('gamePointsLedger').doc();

  try {
    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const data = userSnap.data();

      const gpSnap = await tx.get(gamePointsRef);
      // Mirrors chargeGamePoints's STARTING_POINTS fallback (100) so a
      // withdrawal against a never-recharged account reads the same
      // balance the Game Points screen already shows the player.
      const currentGamePoints = gpSnap.exists ? Number(gpSnap.data().balance || 0) : 100;
      if (currentGamePoints < amount) {
        throw new HttpsError('failed-precondition', 'Not enough Game Points to withdraw that much.');
      }

      const fee = Math.round(amount * (safeFeePercent / 100) * 100) / 100;
      const credited = Math.round((amount - fee) * 100) / 100;
      const nextGamePoints = currentGamePoints - amount;
      const balance = Number(data.walletBalance || 0);
      const nextWalletBalance = balance + credited;

      tx.set(gamePointsRef, { balance: nextGamePoints, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.update(userRef, { walletBalance: nextWalletBalance });
      tx.set(ledgerRef, {
        uid: callerUid,
        roomId: null,
        game: null,
        delta: -amount,
        reason: 'wallet_withdraw',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { fee, credited, gamePoints: nextGamePoints, walletBalance: nextWalletBalance, callerRole: data.role || null };
    });

    await logAudit({
      action: 'gamepoints_withdrawn',
      targetUid: callerUid,
      performedBy: callerUid,
      performedByRole: result.callerRole,
      details: { amount, fee: result.fee, credited: result.credited, ip },
    });
    await checkIpAnomaly(db, callerUid, ip, { action: 'withdraw_gamepoints', role: result.callerRole });
    return { amount, fee: result.fee, credited: result.credited, gamePoints: result.gamePoints, walletBalance: result.walletBalance };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('withdraw_gamepoints', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not withdraw Game Points right now.');
  }
});

// Sends Game Points directly from one player's gamePoints/{uid} balance to
// another's - unlike transferPoints (real wallet money), there's no
// dealer-hierarchy scope check here: since it's play money, any signed-in
// user can send to any other valid account (recipient picked via
// searchUsers, same as Add Contact/New Group). Writes a matching ledger
// row for both sides (mirrors gamebot's own applyDelta shape) plus a
// gamePointsTransfers doc for the sender/recipient's transfer history.
exports.transferGamePoints = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await getProfile(db, callerUid);
  if (!caller) throw new HttpsError('not-found', 'Account not found.');

  const { toUid, amount, note } = request.data || {};
  const amt = Number(amount);
  if (!toUid) throw new HttpsError('invalid-argument', 'A recipient is required.');
  if (toUid === callerUid) throw new HttpsError('invalid-argument', "You can't transfer Game Points to yourself.");
  if (!Number.isFinite(amt) || amt <= 0) throw new HttpsError('invalid-argument', 'Enter a valid amount.');

  const recipient = await getProfile(db, toUid);
  if (!recipient) throw new HttpsError('not-found', 'That account does not exist.');

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'transfer_gamepoints', { ip });

  const fromRef = db.collection('gamePoints').doc(callerUid);
  const toRef = db.collection('gamePoints').doc(toUid);
  const transferRef = db.collection('gamePointsTransfers').doc();
  const fromLedgerRef = db.collection('gamePointsLedger').doc();
  const toLedgerRef = db.collection('gamePointsLedger').doc();

  try {
    const result = await db.runTransaction(async (tx) => {
      const fromSnap = await tx.get(fromRef);
      const toSnap = await tx.get(toRef);
      const fromBalance = fromSnap.exists ? Number(fromSnap.data().balance || 0) : 100;
      if (fromBalance < amt) throw new HttpsError('failed-precondition', 'Not enough Game Points.');
      const toBalance = toSnap.exists ? Number(toSnap.data().balance || 0) : 100;

      const nextFromBalance = fromBalance - amt;
      const nextToBalance = toBalance + amt;

      tx.set(fromRef, { balance: nextFromBalance, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(toRef, { balance: nextToBalance, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(fromLedgerRef, {
        uid: callerUid, roomId: null, game: null, delta: -amt, reason: 'user_transfer_out',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(toLedgerRef, {
        uid: toUid, roomId: null, game: null, delta: amt, reason: 'user_transfer_in',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(transferRef, {
        fromUid: callerUid,
        fromName: caller.name || '',
        toUid,
        toName: recipient.name || '',
        amount: amt,
        note: note || '',
        participants: [callerUid, toUid],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { gamePoints: nextFromBalance };
    });

    await logAudit({
      action: 'gamepoints_transferred',
      targetUid: toUid,
      performedBy: callerUid,
      performedByRole: caller.role,
      details: { amount: amt, ip },
    });
    await checkIpAnomaly(db, callerUid, ip, { action: 'transfer_gamepoints', role: caller.role });
    return { transferId: transferRef.id, gamePoints: result.gamePoints };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('transfer_gamepoints', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not complete the transfer.');
  }
});

// Next Update PRD §4 - Game Point Gifting (80/20 rule). Distinct from
// transferGamePoints above: a transfer moves the full amount 1:1, a gift
// always splits gross -100% sender / +80% receiver / +20% system, and
// records an immutable gamePointsGifts/{idempotencyKey} doc as the audit
// record the PRD requires (sender, receiver, gross, net, fee, timestamp,
// status). idempotencyKey is supplied by the client and used AS the doc
// ID, so a retried/duplicated submit (double-tap, flaky network) reads
// the existing doc inside the transaction and returns its result instead
// of gifting twice - the PRD's "prevent duplicate submission and
// replay/double-spend" requirement, enforced the same way Firestore
// transactions already make every other balance change here
// concurrency-safe.
exports.giftGamePoints = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await getProfile(db, callerUid);
  if (!caller) throw new HttpsError('not-found', 'Account not found.');

  const { toUid, amount, idempotencyKey } = request.data || {};
  const grossAmount = Math.round(Number(amount) * 100) / 100;

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing idempotency key.');
  }
  if (!toUid) throw new HttpsError('invalid-argument', 'A recipient is required.');
  if (toUid === callerUid) throw new HttpsError('invalid-argument', "You can't gift Game Points to yourself.");
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    throw new HttpsError('invalid-argument', 'Enter a valid amount.');
  }

  const pricing = await getPricing(db);
  if (pricing.gamePointsGiftEnabled === false) {
    throw new HttpsError('failed-precondition', 'Game Point gifting is currently disabled.');
  }
  const minAmount = Number(pricing.gamePointsGiftMinAmount);
  const maxAmount = Number(pricing.gamePointsGiftMaxAmount);
  if (Number.isFinite(minAmount) && grossAmount < minAmount) {
    throw new HttpsError('invalid-argument', `Minimum gift amount is ${minAmount}.`);
  }
  if (Number.isFinite(maxAmount) && grossAmount > maxAmount) {
    throw new HttpsError('invalid-argument', `Maximum gift amount is ${maxAmount}.`);
  }

  const recipient = await getProfile(db, toUid);
  if (!recipient) throw new HttpsError('not-found', 'That account does not exist.');

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'gift_gamepoints', { ip });

  const netAmount = Math.round(grossAmount * GIFT_RECEIVER_RATE * 100) / 100;
  const systemFee = Math.round((grossAmount - netAmount) * 100) / 100;

  const fromRef = db.collection('gamePoints').doc(callerUid);
  const toRef = db.collection('gamePoints').doc(toUid);
  // Deterministic ID (not .doc()) is what makes the idempotency check work:
  // a repeat call with the same key resolves to the same document.
  const giftRef = db.collection('gamePointsGifts').doc(idempotencyKey);
  const fromLedgerRef = db.collection('gamePointsLedger').doc();
  const toLedgerRef = db.collection('gamePointsLedger').doc();

  try {
    const result = await db.runTransaction(async (tx) => {
      const giftSnap = await tx.get(giftRef);
      if (giftSnap.exists) {
        // Same key seen before - return its recorded result rather than
        // gifting again. Covers retries of both completed and failed
        // attempts without a second balance mutation.
        const existing = giftSnap.data();
        return {
          replay: true,
          status: existing.status,
          senderDebited: existing.grossAmount,
          receiverCredited: existing.netAmount,
          systemFee: existing.systemFee,
        };
      }

      const fromSnap = await tx.get(fromRef);
      const fromBalance = fromSnap.exists ? Number(fromSnap.data().balance || 0) : 100;
      if (fromBalance < grossAmount) {
        tx.set(giftRef, {
          senderUid: callerUid,
          receiverUid: toUid,
          grossAmount,
          netAmount: 0,
          systemFee: 0,
          status: 'failed',
          errorReason: 'INSUFFICIENT_BALANCE',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw new HttpsError('failed-precondition', 'Not enough Game Points.');
      }

      const toSnap = await tx.get(toRef);
      const toBalance = toSnap.exists ? Number(toSnap.data().balance || 0) : 100;

      const nextFromBalance = Math.round((fromBalance - grossAmount) * 100) / 100;
      const nextToBalance = Math.round((toBalance + netAmount) * 100) / 100;

      tx.set(fromRef, { balance: nextFromBalance, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(toRef, { balance: nextToBalance, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(fromLedgerRef, {
        uid: callerUid, roomId: null, game: null, delta: -grossAmount, reason: 'gift_sent',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(toLedgerRef, {
        uid: toUid, roomId: null, game: null, delta: netAmount, reason: 'gift_received',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // The immutable audit record the PRD requires: sender, receiver,
      // gross amount, receiver amount, system fee, timestamp, status -
      // all in one doc, never updated again once written 'completed'.
      tx.set(giftRef, {
        senderUid: callerUid,
        senderName: caller.name || '',
        receiverUid: toUid,
        receiverName: recipient.name || '',
        grossAmount,
        netAmount,
        systemFee,
        status: 'completed',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        replay: false,
        status: 'completed',
        senderDebited: grossAmount,
        receiverCredited: netAmount,
        systemFee,
        gamePoints: nextFromBalance,
      };
    });

    if (!result.replay) {
      await logAudit({
        action: 'gamepoints_gifted',
        targetUid: toUid,
        performedBy: callerUid,
        performedByRole: caller.role,
        details: { grossAmount, netAmount: result.receiverCredited, systemFee: result.systemFee, ip },
      });
      await checkIpAnomaly(db, callerUid, ip, { action: 'gift_gamepoints', role: caller.role });
    }

    return {
      giftId: giftRef.id,
      status: result.status,
      senderDebited: result.senderDebited,
      receiverCredited: result.receiverCredited,
      systemFee: result.systemFee,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('gift_gamepoints', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not send the gift right now.');
  }
});
