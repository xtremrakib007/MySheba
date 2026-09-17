// Dealer/reseller queue: approve -> accept as Operator -> complete.
import { collection, doc, onSnapshot, query, where, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { db, functions, auth } from './config';
import { logActivity } from './logService';

const COLLECTION = 'transactions';
const QUEUE_COLLECTION = 'transactionQueue';
const CHARGEABLE_SERVICE_FNS = { Recharge: 'chargeRecharge', Internet: 'chargeInternetPackage', 'Mobile Banking': 'chargeMobileBanking', Remittance: 'chargeRemittance' };

function createRequestId() {
  if (typeof Crypto.randomUUID !== 'function') throw new Error('Secure request identifier generation is unavailable. Please update the app.');
  return Crypto.randomUUID().replace(/-/g, '');
}

function mapTransactionDoc(d) {
  const data = d.data();
  const { pin: _legacyPin, ...safeData } = data;
  return { id: d.id, ...safeData };
}

export async function createTransaction(payload, customer) {
  const chargeFnName = CHARGEABLE_SERVICE_FNS[payload.service];
  if (!chargeFnName) throw new Error('Unsupported transaction service.');
  const requestId = payload.requestId || createRequestId(); payload.requestId = requestId;
  const fn = httpsCallable(functions, chargeFnName);
  try { const { data } = await fn({ payload, customer, requestId }); logActivity('transaction_submitted', { service: payload.service, amount: payload.amount || 0, cost: data.cost }); return data.id; }
  catch (err) { throw new Error(err.message || 'Could not submit this order right now.'); }
}

export function subscribeBroadcastTransactions(callback, onError) {
  let stopped = false, unsubPending = () => {}, unsubClaimed = () => {}, pending = [], claimed = [];
  const emit = () => { const byId = new Map(); [...pending, ...claimed].forEach((tx) => byId.set(tx.id, tx)); const list = Array.from(byId.values()); list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list); };
  (async () => { try {
    const uid = auth.currentUser?.uid; if (!uid) return;
    const profileSnap = await getDoc(doc(db, 'users', uid)); if (stopped) return;
    const role = profileSnap.exists() ? profileSnap.data()?.role : null;
    if (role === 'admin' || role === 'superadmin') {
      const q = query(collection(db, COLLECTION), where('status', 'in', ['pending', 'processing', 'completed', 'rejected']));
      unsubPending = onSnapshot(q, (snap) => callback(snap.docs.map(mapTransactionDoc).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), onError); return;
    }
    if (role !== 'dealer' && role !== 'reseller') return;
    if (role === 'dealer') {
      const q1 = query(collection(db, QUEUE_COLLECTION), where('service', '==', 'Mobile Banking'), where('status', '==', 'pending'), where('dealerId', '==', null));
      const q2 = query(collection(db, QUEUE_COLLECTION), where('service', '==', 'Mobile Banking'), where('status', '==', 'pending'), where('dealerId', '==', uid));
      unsubPending = onSnapshot(q1, (snap) => { pending = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, onError);
      const oldPending = unsubPending;
      unsubClaimed = onSnapshot(q2, (snap) => { const second = snap.docs.map((d) => ({ id: d.id, ...d.data() })); pending = [...pending.filter((x) => !second.some((y) => y.id === x.id)), ...second]; emit(); }, onError);
      void oldPending;
    } else {
      const q1 = query(collection(db, QUEUE_COLLECTION), where('service', 'in', ['Recharge', 'Internet', 'Remittance']), where('status', '==', 'pending'), where('resellerId', '==', null));
      const q2 = query(collection(db, QUEUE_COLLECTION), where('service', 'in', ['Recharge', 'Internet', 'Remittance']), where('status', '==', 'pending'), where('resellerId', '==', uid));
      unsubPending = onSnapshot(q1, (snap) => { pending = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, onError);
      unsubClaimed = onSnapshot(q2, (snap) => { const second = snap.docs.map((d) => ({ id: d.id, ...d.data() })); pending = [...pending.filter((x) => !second.some((y) => y.id === x.id)), ...second]; emit(); }, onError);
    }
    const claimedQuery = query(collection(db, QUEUE_COLLECTION), where('claimedBy', '==', uid));
    const claimedUnsub = onSnapshot(claimedQuery, (snap) => { claimed = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, onError);
    const previous = unsubClaimed; unsubClaimed = () => { previous(); claimedUnsub(); };
  } catch (err) { if (!stopped) onError?.(err); } })();
  return () => { stopped = true; unsubPending(); unsubClaimed(); };
}

export function subscribeMyTransactions(uid, callback, onError) { const q = query(collection(db, COLLECTION), where('customerId', '==', uid)); return onSnapshot(q, (snap) => { const list = snap.docs.map(mapTransactionDoc); list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list); }, onError); }

export async function approveTransaction(id) { try { await httpsCallable(functions, 'approveTransaction')({ transactionId: id }); } catch (err) { throw new Error(err.message || 'Could not approve this order.'); } }
export async function acceptTransaction(id) { try { await httpsCallable(functions, 'acceptTransaction')({ transactionId: id }); } catch (err) { throw new Error(err.message || 'Could not accept this order.'); } }

export async function rejectTransaction(id, reason, service) {
  if (!['Recharge', 'Internet', 'Mobile Banking', 'Remittance'].includes(service)) throw new Error('This order type does not support rejection.');
  try { return (await httpsCallable(functions, 'rejectTransaction')({ transactionId: id, reason: reason || '' })).data; }
  catch (err) { throw new Error(err.message || 'Could not reject this order right now.'); }
}

export async function completeTransaction(id, pin, receiptUrl) { try { await httpsCallable(functions, 'completeTransaction')({ transactionId: id, pin: pin || '', receiptUrl: receiptUrl || '' }); } catch (err) { throw new Error(err.message || 'Could not complete this order.'); } }
export async function assignDealer(id, dealerId) { try { await httpsCallable(functions, 'assignDealer')({ transactionId: id, dealerId }); } catch (err) { throw new Error(err.message || 'Could not assign this dealer.'); } }
