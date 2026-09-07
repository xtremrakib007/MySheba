// Dealer-queue transactions use a broadcast, first-accept-wins workflow.
//
// Mobile Banking specifically splits accept/reject and complete across the
// two dealer-tier roles: the parent Dealer accepts/rejects, then only the
// Sub Dealer can complete + collect the PIN (enforced in DealerHomeScreen.js
// and firestore.rules' mobileBankingRoleOk()). Every other service keeps
// the shared queue where either role can do both.
//
// A customer who registered under a reseller code (resellerId on their own
// users/{uid} doc - see functions/customerRegistration.js) has an extra hop
// in front of that: customer submits -> resellerId is denormalized onto the
// order same as dealerId, but dealerId itself starts unset -> the reseller
// forwards it to a specific dealer (assignDealer below - same action admin
// uses for "Appoint Dealer" on an unassigned order, just restricted at the
// rules layer to that reseller's own resellerId pool) -> from there it's a
// normal order in that dealer's queue (accept -> processing -> completed).
// A customer with no resellerId skips straight to the existing dealerId
// behavior, unchanged.
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  runTransaction,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from './config';
import { logActivity } from './logService';

const COLLECTION = 'transactions';

// All four services below carry a real wallet charge (role-based points for
// Recharge/Internet, MYR 1:1 for Mobile Banking/Remittance - see
// rechargePointCostPerUnit/internetPointCostPerUnit in settingsService.js)
// filed atomically with the order doc by a Cloud Function - see
// chargeRecharge/chargeInternetPackage/chargeMobileBanking/chargeRemittance
// in functions/walletService.js, and firestore.rules' serviceIsChargeable(),
// which is what actually blocks a plain client create for all four. Every
// one of them also recomputes its own MYR amount server-side from
// rates/current rather than trusting the client's number (Next Update PRD
// §9) and snapshots the exchange rate used onto the transaction doc (PRD
// §5) - see recomputeChargeAmounts in functions/walletService.js. Matches
// the exact `service` label strings DEALER_LABELS produces in
// AppContext.js's buildTransactionPayload.
const CHARGEABLE_SERVICE_FNS = {
  Recharge: 'chargeRecharge',
  Internet: 'chargeInternetPackage',
  'Mobile Banking': 'chargeMobileBanking',
  Remittance: 'chargeRemittance',
};
const REJECT_FNS = {
  Recharge: 'rejectRechargeTransaction',
  Internet: 'rejectInternetPackageTransaction',
  'Mobile Banking': 'rejectMobileBankingTransaction',
  Remittance: 'rejectRemittanceTransaction',
};

export async function createTransaction(payload, customer) {
  const chargeFnName = CHARGEABLE_SERVICE_FNS[payload.service];
  if (chargeFnName) {
    const fn = httpsCallable(functions, chargeFnName);
    try {
      const { data } = await fn({ payload, customer });
      logActivity('transaction_submitted', { service: payload.service, amount: payload.amount || 0, cost: data.cost });
      return data.id;
    } catch (err) {
      throw new Error(err.message || 'Could not submit this order right now.');
    }
  }

  // Fallback for any non-dealer-queue transaction type. The four services in
  // the Phase 10 order flow all use the callable charge path above.
  const docRef = await addDoc(collection(db, COLLECTION), {
    service: payload.service,
    details: payload.details || '',
    amount: payload.amount || 0,
    total: payload.total || 0,
    cost: payload.cost || 0,
    profit: payload.profit || 0,
    status: 'pending',
    customerId: customer && customer.uid ? customer.uid : null,
    customerPhone: (customer && customer.phone) || payload.customerPhone || '',
    resellerId: null,
    dealerId: null,
    claimedBy: null,
    claimedByRole: null,
    rejectedBy: {},
    rejected: false,
    rejectReason: '',
    pin: '',
    raw: payload.raw || {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  logActivity('transaction_submitted', { service: payload.service, amount: payload.amount || 0 });
  return docRef.id;
}

/** Live list of all transactions, newest first - admin/superadmin only
 * (they aren't scoped to a single dealer). */
export function subscribeTransactions(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/**
 * Live broadcast queue for Dealers and Resellers. Every pending order is
 * visible to the whole staff pool; once claimed it remains visible as a
 * processing/completed record but only the claimer can complete it.
 *
 * The status filter is deliberately server-side so Firestore rules can allow
 * the same broadcast query without exposing unrelated customer data.
 */
export function subscribeBroadcastTransactions(callback, onError) {
  const q = query(collection(db, COLLECTION), where('status', 'in', ['pending', 'processing', 'completed']));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}

/**
 * Live list of just the signed-in customer's own transactions, newest first
 * - used by the customer History screen. No orderBy here on purpose (a
 * where + orderBy on different fields needs a composite Firestore index);
 * sorting happens client-side instead.
 */
export function subscribeMyTransactions(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('customerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}

export async function acceptTransaction(id) {
  const txRef = doc(db, COLLECTION, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(txRef);
    if (!snap.exists()) throw new Error('That order no longer exists.');
    const order = snap.data();
    if (order.status !== 'pending' || order.claimedBy) {
      throw new Error('This order was already accepted by another staff member.');
    }
    // Rules verify request.auth.uid against claimedBy. Keeping the write
    // client-side is safe because Firestore retries this transaction on a
    // concurrent change and only the first pending snapshot can transition.
    const currentUser = getCurrentUserUid();
    if (!currentUser) throw new Error('You must be signed in to accept an order.');
    tx.update(txRef, {
      status: 'processing',
      claimedBy: currentUser,
      claimedByRole: null,
      updatedAt: serverTimestamp(),
    });
  });
}

function getCurrentUserUid() {
  // Firebase Auth state is already owned by the app. Importing auth here
  // would create a second config dependency, so use the cached auth instance
  // exposed by config when available.
  return auth?.currentUser?.uid || null;
}

/**
 * A reject is per-recipient in the broadcast model: it records that this
 * staff member declined the order but leaves the order pending for everyone
 * else. Refunds therefore happen only through an explicit terminal reject
 * path, not on an individual recipient's decline.
 */
export async function rejectTransaction(id, reason, service) {
  const rejectFnName = REJECT_FNS[service];
  if (rejectFnName) {
    const fn = httpsCallable(functions, rejectFnName);
    try {
      const { data } = await fn({ transactionId: id, reason: reason || '' });
      return data;
    } catch (err) {
      throw new Error(err.message || 'Could not reject this order right now.');
    }
  }

  throw new Error('This order type does not support rejection.');
}

export async function completeTransaction(id, pin, receiptUrl) {
  const patch = {
    status: 'completed',
    pin: pin || '',
    updatedAt: serverTimestamp(),
  };
  if (receiptUrl) patch.receiptUrl = receiptUrl;
  await updateDoc(doc(db, COLLECTION, id), patch);
}

/** Appoints a dealer to an order that has no dealerId yet - moves it into
 * that dealer's own queue, since subscribeDealerTransactions only ever
 * matches an exact dealerId. Two callers, both plain client writes:
 *   - Admin, on any unassigned order (a customer who registered without a
 *     dealer code) - see AdminHomeScreen's "Appoint Dealer" button.
 *   - A reseller, on an order in their own resellerId pool - see
 *     ResellerHomeScreen's "Send to Dealer" button. firestore.rules
 *     restricts a reseller's update here to just dealerId/updatedAt on
 *     their own resellerId orders; it can't touch anything else. */
export async function assignDealer(id, dealerId) {
  // Legacy compatibility for already-routed historical orders. New Phase 10
  // orders are broadcast and do not use this path.
  await updateDoc(doc(db, COLLECTION, id), { dealerId, updatedAt: serverTimestamp() });
}
