// Point (wallet balance) transfers - lets staff send points to accounts in
// their permitted scope. The actual balance move is server-side.
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { logActivity, logError } from './logService';

const COLLECTION = 'pointTransfers';

function createRequestId() {
  return `pt_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

export async function transferPoints({ to, amount, note }) {
  if (!to?.uid) throw new Error('Missing recipient.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.');

  // Keep this ID for the lifetime of this invocation. If the callable times
  // out after the server committed, a retry of this same operation should
  // reuse the same requestId rather than creating a second transfer.
  const requestId = createRequestId();
  const fn = httpsCallable(functions, 'transferPoints');
  try {
    const { data } = await fn({ requestId, toUid: to.uid, amount: amt, note: note || '' });
    logActivity('points_transferred', { toUid: to.uid, amount: amt });
    return data;
  } catch (err) {
    logError('pointTransferService.transferPoints', err);
    throw new Error(err.message || 'Could not complete the transfer.');
  }
}

export function subscribeMyTransfers(uid, onUpdate, onError) {
  const q = query(collection(db, COLLECTION), where('participants', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    onUpdate(list);
  }, onError);
}

export function subscribePoolTransfers(dealerScope, onUpdate, onError) {
  const q = query(collection(db, COLLECTION), where('dealerId', '==', dealerScope));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    onUpdate(list);
  }, onError);
}

export function subscribeAllTransfers(onUpdate, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}
