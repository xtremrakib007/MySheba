// Dealer/reseller queue: approve -> accept as Operator -> complete.
import { collection, doc, onSnapshot, query, where, orderBy, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from './config';
import { logActivity } from './logService';

const COLLECTION = 'transactions';
const CHARGEABLE_SERVICE_FNS = { Recharge: 'chargeRecharge', Internet: 'chargeInternetPackage', 'Mobile Banking': 'chargeMobileBanking', Remittance: 'chargeRemittance' };

function createRequestId() { return `ms_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`; }

export async function createTransaction(payload, customer) {
  const chargeFnName = CHARGEABLE_SERVICE_FNS[payload.service];
  if (!chargeFnName) throw new Error('Unsupported transaction service.');
  const requestId = payload.requestId || createRequestId(); payload.requestId = requestId;
  const fn = httpsCallable(functions, chargeFnName);
  try { const { data } = await fn({ payload, customer, requestId }); logActivity('transaction_submitted', { service: payload.service, amount: payload.amount || 0, cost: data.cost }); return data.id; }
  catch (err) { throw new Error(err.message || 'Could not submit this order right now.'); }
}

export function subscribeTransactions(callback, onError) { const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc')); return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError); }

export function subscribeBroadcastTransactions(callback, onError) {
  let stopped = false, unsubPending = () => {}, unsubClaimed = () => {}, pending = [], claimed = [];
  const emit = () => { const byId = new Map(); [...pending, ...claimed].forEach((tx) => byId.set(tx.id, tx)); const list = Array.from(byId.values()); list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list); };
  (async () => { try { const uid = auth.currentUser?.uid; if (!uid) return; const profileSnap = await getDoc(doc(db, 'users', uid)); if (stopped) return; const role = profileSnap.exists() ? profileSnap.data()?.role : null;
    if (role === 'admin' || role === 'superadmin') { const q = query(collection(db, COLLECTION), where('status', 'in', ['pending', 'processing', 'completed', 'rejected'])); unsubPending = onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), onError); return; }
    if (role !== 'dealer' && role !== 'reseller') return;
    const pendingQuery = role === 'dealer' ? query(collection(db, COLLECTION), where('status', '==', 'pending'), where('service', '==', 'Mobile Banking')) : query(collection(db, COLLECTION), where('status', '==', 'pending'), where('service', 'in', ['Recharge', 'Internet', 'Remittance']));
    const claimedQuery = query(collection(db, COLLECTION), where('claimedBy', '==', uid));
    unsubPending = onSnapshot(pendingQuery, (snap) => { pending = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, onError);
    unsubClaimed = onSnapshot(claimedQuery, (snap) => { claimed = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, onError);
  } catch (err) { if (!stopped) onError?.(err); } })();
  return () => { stopped = true; unsubPending(); unsubClaimed(); };
}

export function subscribeMyTransactions(uid, callback, onError) { const q = query(collection(db, COLLECTION), where('customerId', '==', uid)); return onSnapshot(q, (snap) => { const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })); list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list); }, onError); }

export async function approveTransaction(id) { try { await httpsCallable(functions, 'approveTransaction')({ transactionId: id }); } catch (err) { throw new Error(err.message || 'Could not approve this order.'); } }
export async function acceptTransaction(id) { try { await httpsCallable(functions, 'acceptTransaction')({ transactionId: id }); } catch (err) { throw new Error(err.message || 'Could not accept this order.'); } }

export async function rejectTransaction(id, reason, service) {
  if (!['Recharge', 'Internet', 'Mobile Banking', 'Remittance'].includes(service)) throw new Error('This order type does not support rejection.');
  try { return (await httpsCallable(functions, 'rejectTransaction')({ transactionId: id, reason: reason || '' })).data; }
  catch (err) { throw new Error(err.message || 'Could not reject this order right now.'); }
}

export async function completeTransaction(id, pin, receiptUrl) { try { await httpsCallable(functions, 'completeTransaction')({ transactionId: id, pin: pin || '', receiptUrl: receiptUrl || '' }); } catch (err) { throw new Error(err.message || 'Could not complete this order.'); } }
export async function assignDealer(id, dealerId) { try { await httpsCallable(functions, 'assignDealer')({ transactionId: id, dealerId }); } catch (err) { throw new Error(err.message || 'Could not assign this dealer.'); } }
