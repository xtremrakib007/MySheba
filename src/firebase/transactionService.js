// Dealer/reseller queue: approve -> accept as Operator -> complete.
import { collection, addDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from './config';
import { logActivity } from './logService';

const COLLECTION = 'transactions';
const CHARGEABLE_SERVICE_FNS = { Recharge: 'chargeRecharge', Internet: 'chargeInternetPackage', 'Mobile Banking': 'chargeMobileBanking', Remittance: 'chargeRemittance' };
const REJECT_FNS = { Recharge: 'rejectRechargeTransaction', Internet: 'rejectInternetPackageTransaction', 'Mobile Banking': 'rejectMobileBankingTransaction', Remittance: 'rejectRemittanceTransaction' };

export async function createTransaction(payload, customer) {
  const chargeFnName = CHARGEABLE_SERVICE_FNS[payload.service];
  if (chargeFnName) {
    const fn = httpsCallable(functions, chargeFnName);
    try {
      const { data } = await fn({ payload, customer });
      logActivity('transaction_submitted', { service: payload.service, amount: payload.amount || 0, cost: data.cost });
      return data.id;
    } catch (err) { throw new Error(err.message || 'Could not submit this order right now.'); }
  }
  const docRef = await addDoc(collection(db, COLLECTION), {
    service: payload.service, details: payload.details || '', amount: payload.amount || 0, total: payload.total || 0,
    cost: payload.cost || 0, profit: payload.profit || 0, status: 'pending', approved: false,
    customerId: customer?.uid || null, customerPhone: customer?.phone || payload.customerPhone || '',
    resellerId: null, dealerId: null, claimedBy: null, claimedByRole: null, rejectedBy: {}, rejected: false,
    rejectReason: '', pin: '', raw: payload.raw || {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  logActivity('transaction_submitted', { service: payload.service, amount: payload.amount || 0 });
  return docRef.id;
}

export function subscribeTransactions(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// Customer/dealer/reseller mobile queue. A dealer/reseller must never receive
// the completed history or another operator's processing records. Pending
// orders are intentionally broadcast to eligible operators; once claimed,
// the processing listener is restricted to the current operator's UID.
export function subscribeBroadcastTransactions(callback, onError) {
  let stopped = false;
  let unsubPending = () => {};
  let unsubClaimed = () => {};
  let pending = [];
  let claimed = [];

  const emit = () => {
    const byId = new Map();
    [...pending, ...claimed].forEach((tx) => byId.set(tx.id, tx));
    const list = Array.from(byId.values());
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(list);
  };

  (async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const profileSnap = await getDoc(doc(db, 'users', uid));
      if (stopped) return;
      const role = profileSnap.exists() ? profileSnap.data()?.role : null;

      // Admin/superadmin need the full operational stream. The Firestore rule
      // permits this only for admin roles.
      if (role === 'admin' || role === 'superadmin') {
        const q = query(collection(db, COLLECTION), where('status', 'in', ['pending', 'processing', 'completed']));
        unsubPending = onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), onError);
        return;
      }

      if (role !== 'dealer' && role !== 'reseller') return;

      const pendingQuery = query(collection(db, COLLECTION), where('status', '==', 'pending'));
      const claimedQuery = query(collection(db, COLLECTION), where('claimedBy', '==', uid));

      unsubPending = onSnapshot(pendingQuery, (snap) => {
        pending = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        emit();
      }, onError);
      unsubClaimed = onSnapshot(claimedQuery, (snap) => {
        claimed = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        emit();
      }, onError);
    } catch (err) {
      if (!stopped) onError?.(err);
    }
  })();

  return () => {
    stopped = true;
    unsubPending();
    unsubClaimed();
  };
}

export function subscribeMyTransactions(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('customerId', '==', uid));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list);
  }, onError);
}

export async function approveTransaction(id) {
  try { await httpsCallable(functions, 'approveTransaction')({ transactionId: id }); }
  catch (err) { throw new Error(err.message || 'Could not approve this order.'); }
}
export async function acceptTransaction(id) {
  try { await httpsCallable(functions, 'acceptTransaction')({ transactionId: id }); }
  catch (err) { throw new Error(err.message || 'Could not accept this order.'); }
}

export async function rejectTransaction(id, reason, service) {
  const rejectFnName = REJECT_FNS[service];
  if (rejectFnName) {
    try { return (await httpsCallable(functions, rejectFnName)({ transactionId: id, reason: reason || '' })).data; }
    catch (err) { throw new Error(err.message || 'Could not reject this order right now.'); }
  }
  throw new Error('This order type does not support rejection.');
}

export async function completeTransaction(id, pin, receiptUrl) {
  try { await httpsCallable(functions, 'completeTransaction')({ transactionId: id, pin: pin || '', receiptUrl: receiptUrl || '' }); }
  catch (err) { throw new Error(err.message || 'Could not complete this order.'); }
}

export async function assignDealer(id, dealerId) {
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, COLLECTION, id), { dealerId, updatedAt: serverTimestamp() });
}
