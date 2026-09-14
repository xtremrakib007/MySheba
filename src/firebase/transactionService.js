// Dealer-queue transactions use a broadcast, first-accept-wins workflow.
// Approval is a separate admin/superadmin step: approve -> operator accepts -> operator completes.
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
    approved: false,
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

export async function approveTransaction(id) {
  const currentUser = getCurrentUserUid();
  if (!currentUser) throw new Error('You must be signed in to approve an order.');
  const profileSnap = await getDoc(doc(db, 'users', currentUser));
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  const role = profile.role || '';
  if (role !== 'admin' && role !== 'superadmin') {
    throw new Error('Only an admin or superadmin can approve an order.');
  }
  const name = profile.fullName || profile.name || profile.displayName || profile.phone || currentUser;

  await runTransaction(db, async (tx) => {
    const ref = doc(db, COLLECTION, id);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That order no longer exists.');
    const order = snap.data();
    if (order.status !== 'pending') throw new Error('Only pending orders can be approved.');
    if (order.approved === true) throw new Error('This order is already approved.');
    tx.update(ref, {
      approved: true,
      approvedBy: currentUser,
      approvedByName: name,
      approvedByRole: role,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function acceptTransaction(id) {
  const txRef = doc(db, COLLECTION, id);
  const currentUser = getCurrentUserUid();
  if (!currentUser) throw new Error('You must be signed in to accept an order.');
  const profileSnap = await getDoc(doc(db, 'users', currentUser));
  const staffProfile = profileSnap.exists() ? profileSnap.data() : {};
  const staffRole = staffProfile.role || '';
  if (staffRole !== 'dealer' && staffRole !== 'reseller') {
    throw new Error('Only a dealer or reseller can accept an approved order.');
  }
  const staffName = staffProfile.fullName || staffProfile.name || staffProfile.displayName || staffProfile.phone || currentUser;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(txRef);
    if (!snap.exists()) throw new Error('That order no longer exists.');
    const order = snap.data();
    if (order.status !== 'pending' || order.claimedBy) {
      throw new Error('This order was already accepted by another operator.');
    }
    if (order.approved !== true || !order.approvedBy) {
      throw new Error('This order must be approved by an admin or superadmin first.');
    }
    tx.update(txRef, {
      status: 'processing',
      claimedBy: currentUser,
      claimedByRole: staffRole,
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
  if (staffRole !== 'dealer' && staffRole !== 'reseller') {
    throw new Error('Only the dealer/reseller Operator can complete an order.');
  }
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    throw new Error('A 4-digit collection PIN is required.');
  }
  if (!receiptUrl) throw new Error('The transfer receipt is required before completion.');

  await updateDoc(doc(db, COLLECTION, id), {
    status: 'completed',
    pin: String(pin),
    completedBy: currentUser,
    completedByName: staffName,
    completedByRole: staffRole,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    receiptUrl,
  });
}

export async function assignDealer(id, dealerId) {
  await updateDoc(doc(db, COLLECTION, id), { dealerId, updatedAt: serverTimestamp() });
}