// Dealer/reseller queue: approve -> accept as Operator -> complete.
import { collection, doc, onSnapshot, query, where, getDoc, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { db, functions, auth } from './config';
import { logActivity } from './logService';
import { getSessionProof } from './deviceSessionService';

const COLLECTION = 'transactions';
const QUEUE_COLLECTION = 'transactionQueue';
const CHARGEABLE_SERVICE_FNS = { Recharge: 'chargeRecharge', Internet: 'chargeInternetPackage', 'Bill Payment': 'chargeBillPayment', 'Mobile Banking': 'chargeMobileBanking', Remittance: 'chargeRemittance' };

function createRequestId() {
  if (typeof Crypto.randomUUID !== 'function') throw new Error('Secure request identifier generation is unavailable. Please update the app.');
  return Crypto.randomUUID().replace(/-/g, '');
}

function mapTransactionDoc(d) {
  const data = d.data();
  return { id: d.id, ...data };
}

export async function createTransaction(payload, customer) {
  const chargeFnName = CHARGEABLE_SERVICE_FNS[payload.service];
  if (!chargeFnName) throw new Error('Unsupported transaction service.');
  const requestId = payload.requestId || createRequestId(); payload.requestId = requestId;
  const session = await getSessionProof();
  const fn = httpsCallable(functions, chargeFnName);
  try { const { data } = await fn({ payload, customer, requestId, ...session }); logActivity('transaction_submitted', { service: payload.service, amount: payload.amount || 0, cost: data.cost }); return data.id; }
  catch (err) { throw new Error(err.message || 'Could not submit this order right now.'); }
}

export function subscribeBroadcastTransactions(callback, onError) {
  let stopped = false;
  const unsubs = [];
  let pending = [];
  let claimed = [];
  const emit = () => { const byId = new Map(); [...pending, ...claimed].forEach((tx) => byId.set(tx.id, tx)); const list = Array.from(byId.values()); list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list); };
  const attach = (q, target, replace = true) => {
    const unsub = onSnapshot(q, (snap) => { if (replace) target.length = 0; snap.docs.forEach((d) => { const item = { id: d.id, ...d.data() }; const index = target.findIndex((x) => x.id === item.id); if (index >= 0) target[index] = item; else target.push(item); }); emit(); }, (err) => { if (!stopped) onError?.(err); });
    unsubs.push(unsub);
  };
  (async () => { try {
    const uid = auth.currentUser?.uid; if (!uid) return;
    const profileSnap = await getDoc(doc(db, 'users', uid)); if (stopped) return;
    const role = profileSnap.exists() ? profileSnap.data()?.role : null;
    if (role === 'admin' || role === 'superadmin') { attach(query(collection(db, COLLECTION), where('status', 'in', ['pending', 'processing', 'completed', 'rejected']), limit(100)), pending); return; }
    if (role !== 'dealer' && role !== 'reseller') return;
    if (role === 'dealer') {
      attach(query(collection(db, QUEUE_COLLECTION), where('service', '==', 'Mobile Banking'), where('status', '==', 'pending'), where('dealerId', '==', null), limit(100)), pending);
      attach(query(collection(db, QUEUE_COLLECTION), where('service', '==', 'Mobile Banking'), where('status', '==', 'pending'), where('dealerId', '==', uid), limit(100)), pending, false);
    } else {
      attach(query(collection(db, QUEUE_COLLECTION), where('service', 'in', ['Recharge', 'Internet', 'Bill Payment', 'Remittance']), where('status', '==', 'pending'), where('resellerId', '==', null), limit(100)), pending);
      attach(query(collection(db, QUEUE_COLLECTION), where('service', 'in', ['Recharge', 'Internet', 'Bill Payment', 'Remittance']), where('status', '==', 'pending'), where('resellerId', '==', uid), limit(100)), pending, false);
    }
    attach(query(collection(db, QUEUE_COLLECTION), where('claimedBy', '==', uid), limit(100)), claimed);
  } catch (err) { if (!stopped) onError?.(err); } })();
  return () => { stopped = true; unsubs.splice(0).forEach((unsub) => unsub()); };
}

export function subscribeMyTransactions(uid, callback, onError) { const q = query(collection(db, COLLECTION), where('customerId', '==', uid), limit(100)); return onSnapshot(q, (snap) => { const list = snap.docs.map(mapTransactionDoc); list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list); }, onError); }
export async function approveTransaction(id) { try { await httpsCallable(functions, 'approveTransaction')({ transactionId: id }); } catch (err) { throw new Error(err.message || 'Could not approve this order.'); } }
export async function acceptTransaction(id) { try { await httpsCallable(functions, 'acceptTransaction')({ transactionId: id }); } catch (err) { throw new Error(err.message || 'Could not accept this order.'); } }
export async function rejectTransaction(id, reason, service) { if (!['Recharge', 'Internet', 'Bill Payment', 'Mobile Banking', 'Remittance'].includes(service)) throw new Error('This order type does not support rejection.'); try { return (await httpsCallable(functions, 'rejectTransaction')({ transactionId: id, reason: reason || '' })).data; } catch (err) { throw new Error(err.message || 'Could not reject this order right now.'); } }
export async function completeTransaction(id, pin, receiptUrl) { try { await httpsCallable(functions, 'completeTransaction')({ transactionId: id, pin: pin || '', receiptUrl: receiptUrl || '' }); } catch (err) { throw new Error(err.message || 'Could not complete this order.'); } }
export async function assignDealer(id, dealerId) { try { await httpsCallable(functions, 'assignDealer')({ transactionId: id, dealerId }); } catch (err) { throw new Error(err.message || 'Could not assign this dealer.'); } }

export async function generateCollectionPin(id) {
  try {
    const { data } = await httpsCallable(functions, 'generateCollectionPin')({ transactionId: id });
    return data;
  } catch (err) {
    throw new Error(err.message || 'Could not generate the collection PIN.');
  }
}
