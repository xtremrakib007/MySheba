// Game Points: play-money balance used by the in-app room games.
// All wallet-changing Game Points operations go through callable Functions;
// requestId makes retries/double taps safe.
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { logActivity, logError } from './logService';

const COLLECTION = 'gamePoints';
const TRANSFERS_COLLECTION = 'gamePointsTransfers';
const GIFTS_COLLECTION = 'gamePointsGifts';

export const STARTING_POINTS = 100;

function createRequestId(prefix) {
  return `ms_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

export function subscribeMyGamePoints(uid, callback, onError) {
  return onSnapshot(
    doc(db, COLLECTION, uid),
    (snap) => callback(snap.exists() ? Number(snap.data().balance || 0) : STARTING_POINTS),
    onError
  );
}

/** Reuses the same requestId only when deliberately retrying one attempt. */
export async function rechargeGamePoints(amount, requestId) {
  const fn = httpsCallable(functions, 'chargeGamePoints');
  const id = requestId || createRequestId('gp_recharge');
  try {
    const { data } = await fn({ amount, requestId: id });
    logActivity('gamepoints_recharged', { amount, cost: data.cost });
    return data;
  } catch (e) {
    logError('gamePointsService.rechargeGamePoints', e);
    throw new Error(e.message || 'Could not recharge game points right now.');
  }
}

export async function withdrawGamePoints(amount, requestId) {
  const fn = httpsCallable(functions, 'withdrawGamePoints');
  const id = requestId || createRequestId('gp_withdraw');
  try {
    const { data } = await fn({ amount, requestId: id });
    logActivity('gamepoints_withdrawn', { amount, fee: data.fee, credited: data.credited });
    return data;
  } catch (e) {
    logError('gamePointsService.withdrawGamePoints', e);
    throw new Error(e.message || 'Could not withdraw Game Points right now.');
  }
}

export async function transferGamePoints({ to, amount, note, requestId }) {
  if (!to?.uid) throw new Error('Missing recipient.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.');

  const fn = httpsCallable(functions, 'transferGamePoints');
  const id = requestId || createRequestId('gp_transfer');
  try {
    const { data } = await fn({ toUid: to.uid, amount: amt, note: note || '', requestId: id });
    logActivity('gamepoints_transferred', { toUid: to.uid, amount: amt });
    return data;
  } catch (err) {
    logError('gamePointsService.transferGamePoints', err);
    throw new Error(err.message || 'Could not complete the transfer.');
  }
}

export async function giftGamePoints({ toUid, amount, idempotencyKey }) {
  if (!toUid) throw new Error('Missing recipient.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.');

  const key = idempotencyKey || createRequestId('gp_gift');
  const fn = httpsCallable(functions, 'giftGamePoints');
  try {
    const { data } = await fn({ toUid, amount: amt, idempotencyKey: key });
    logActivity('gamepoints_gifted', { toUid, amount: amt, systemFee: data.systemFee });
    return data;
  } catch (err) {
    logError('gamePointsService.giftGamePoints', err);
    throw new Error(err.message || 'Could not send the gift right now.');
  }
}

export function subscribeMyGamePointsGifts(uid, onUpdate, onError) {
  const sentQ = query(collection(db, GIFTS_COLLECTION), where('senderUid', '==', uid));
  const receivedQ = query(collection(db, GIFTS_COLLECTION), where('receiverUid', '==', uid));
  let sent = [];
  let received = [];
  const emit = () => {
    const list = [...sent, ...received];
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    onUpdate(list);
  };
  const unsubSent = onSnapshot(sentQ, (snap) => { sent = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, onError);
  const unsubReceived = onSnapshot(receivedQ, (snap) => { received = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, onError);
  return () => { unsubSent(); unsubReceived(); };
}

export function subscribeMyGamePointsTransfers(uid, onUpdate, onError) {
  const q = query(collection(db, TRANSFERS_COLLECTION), where('participants', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      onUpdate(list);
    },
    onError
  );
}
