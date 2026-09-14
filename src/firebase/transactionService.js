// Dealer-queue transactions use a broadcast, first-accept-wins workflow.
//
// Mobile Banking specifically splits accept/reject and complete across the
// two dealer-tier roles: the parent Dealer accepts/rejects, then only the
// Sub Dealer can complete + collect the PIN (enforced in DealerHomeScreen.js
// and firestore.rules' mobileBankingRoleOk()). Every other service keeps the
// shared queue where either role can do both.
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
  getDoc,
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

export function subscribeTransactions(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export function subscribeBroadcastTransactions(callback, onError) {
  const q = query(collection(db, COLLECTION), where('status', 'in', ['pending', 'processing', 'completed']));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(list);
  }, onError);
}

export function subscribeMyTransactions(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('customerId', '==', uid));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(list);
  }, onError);
}

export async function acceptTransaction(id) {
  const txRef = doc(db, COLLECTION, id);
  const currentUser = getCurrentUserUid();
  if (!currentUser) throw new Error('You must be signed in to accept an order.');
  const profileSnap = await getDoc(doc(db, 'users', currentUser));
  const staffProfile = profileSnap.exists() ? profileSnap.data() : {};
  const staffRole = staffProfile.role || '';
  const staffName = staffProfile.fullName || staffProfile.name || staffProfile.displayName || staffProfile.phone || currentUser;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(txRef);
    if (!snap.exists()) throw new Error('That order no longer exists.');
    const order = snap.data();
    if (order.status !== 'pending' || order.claimedBy) {
      throw new Error('This order was already accepted by another staff member.');
    }
    tx.update(txRef, {
      status: 'processing',
      claimedBy: currentUser,
      claimedByRole: staffRole || null,
      claimedByName: staffName,
      updatedAt: serverTimestamp(),
    });
  });
}

function getCurrentUserUid() {
  return auth?.currentUser?.uid || null;
}

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
  const currentUser = getCurrentUserUid();
  if (!currentUser) throw new Error('You must be signed in to complete an order.');

  const profileSnap = await getDoc(doc(db, 'users', currentUser));
  const staffProfile = profileSnap.exists() ? profileSnap.data() : {};
  const staffName = staffProfile.fullName || staffProfile.name || staffProfile.displayName || staffProfile.phone || currentUser;
  const staffRole = staffProfile.role || '';

  const patch = {
    status: 'completed',
    pin: pin || '',
    approvedBy: currentUser,
    approvedByName: staffName,
    approvedByRole: staffRole || null,
    completedBy: currentUser,
    completedByName: staffName,
    completedByRole: staffRole || null,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (receiptUrl) patch.receiptUrl = receiptUrl;
  await updateDoc(doc(db, COLLECTION, id), patch);
}

export async function assignDealer(id, dealerId) {
  await updateDoc(doc(db, COLLECTION, id), { dealerId, updatedAt: serverTimestamp() });
}
