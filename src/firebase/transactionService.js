// Dealer/reseller queue: approve -> accept as Operator -> complete.
import { collection, addDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { db, functions, auth } from './config';
import { logActivity } from './logService';

const COLLECTION = 'transactions';
const QUEUE_COLLECTION = 'transactionQueue';
const CHARGEABLE_SERVICE_FNS = { Recharge: 'chargeRecharge', Internet: 'chargeInternetPackage', 'Mobile Banking': 'chargeMobileBanking', Remittance: 'chargeRemittance', 'Bill Payment': 'chargeBillPayment' };
const REJECT_FNS = { Recharge: 'rejectRechargeTransaction', Internet: 'rejectInternetPackageTransaction', 'Mobile Banking': 'rejectMobileBankingTransaction', Remittance: 'rejectRemittanceTransaction', 'Bill Payment': 'rejectBillPaymentTransaction' };

function createRequestId() {
  if (typeof Crypto.randomUUID !== 'function') throw new Error('Secure request identifier generation is unavailable. Please update the app.');
  return Crypto.randomUUID().replace(/-/g, '');
}

export async function createTransaction(payload, customer) {
  const chargeFnName = CHARGEABLE_SERVICE_FNS[payload.service];
  if (chargeFnName) {
    const requestId = payload.requestId || createRequestId();
    payload.requestId = requestId;
    const fn = httpsCallable(functions, chargeFnName);
    try {
      const { data } = await fn({ payload, customer, requestId });
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

// Dealer/reseller broadcast queue. Full transaction documents are intentionally
// not read here. transactionQueue contains only server-sanitized operator fields.
// `fullStream` is true for staff whose access includes orders or finance
// (see accessControlService); everyone else gets their operator queue.
export function subscribeBroadcastTransactions(callback, onError, { fullStream = false } = {}) {
  let stopped = false;
  const unsubs = [];
  let pending = [];
  let claimed = [];

  const emit = () => {
    const byId = new Map();
    [...pending, ...claimed].forEach((tx) => byId.set(tx.id, tx));
    const list = Array.from(byId.values());
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(list);
  };

  const attach = (q, target) => {
    const unsub = onSnapshot(q, (snap) => {
      target.length = 0;
      snap.docs.forEach((d) => target.push({ id: d.id, ...d.data() }));
      emit();
    }, (err) => { if (!stopped) onError?.(err); });
    unsubs.push(unsub);
  };

  (async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const profileSnap = await getDoc(doc(db, 'users', uid));
      if (stopped) return;
      const role = profileSnap.exists() ? profileSnap.data()?.role : null;

      if (fullStream) {
        const q = query(collection(db, COLLECTION), where('status', 'in', ['pending', 'processing', 'completed']));
        attach(q, pending);
        return;
      }

      if (role !== 'dealer' && role !== 'reseller') return;

      if (role === 'dealer') {
        attach(query(collection(db, QUEUE_COLLECTION), where('service', '==', 'Mobile Banking'), where('status', '==', 'pending'), where('dealerId', '==', null)), pending);
        attach(query(collection(db, QUEUE_COLLECTION), where('service', '==', 'Mobile Banking'), where('status', '==', 'pending'), where('dealerId', '==', uid)), pending);
      } else {
        const services = ['Recharge', 'Internet', 'Remittance', 'Bill Payment'];
        attach(query(collection(db, QUEUE_COLLECTION), where('service', 'in', services), where('status', '==', 'pending'), where('resellerId', '==', null)), pending);
        attach(query(collection(db, QUEUE_COLLECTION), where('service', 'in', services), where('status', '==', 'pending'), where('resellerId', '==', uid)), pending);
      }

      // Claimed/completed history is restricted by Firestore rules to the operator
      // whose UID is stored in claimedBy, even though this query is intentionally broad.
      attach(query(collection(db, QUEUE_COLLECTION), where('claimedBy', '==', uid)), claimed);
    } catch (err) {
      if (!stopped) onError?.(err);
    }
  })();

  return () => {
    stopped = true;
    unsubs.splice(0).forEach((unsub) => unsub());
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
