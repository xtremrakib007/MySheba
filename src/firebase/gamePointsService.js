// Game Points: the play-money balance functions-gamebot uses for the
// in-app room games (dice, lowcard, highcard, cricket, 29 - "no real
// money", see roomChatService.js's GameBot comments). gamebot owns
// gamePoints/{uid} (`{ balance, updatedAt }`) and gamePointsLedger/{id}
// (functions-gamebot/pointsLedger.js, deployed separately) - this file
// only ever reads gamePoints/{uid} directly and recharges it through the
// chargeGamePoints Cloud Function (functions/walletService.js), which is
// the only path that can debit walletBalance and credit gamePoints
// together. Mirrors topupService.js's "server is the only writer" shape,
// just auto-approved/instant instead of an admin-review queue - this is
// the user moving their own points from one bucket to another, not filing
// a claim someone else has to approve.
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { logActivity, logError } from './logService';

const COLLECTION = 'gamePoints';
const TRANSFERS_COLLECTION = 'gamePointsTransfers';
const GIFTS_COLLECTION = 'gamePointsGifts';

// Mirrors functions-gamebot/pointsLedger.js's STARTING_POINTS - shown as
// the starting balance before a user's gamePoints/{uid} doc exists yet
// (gamebot lazily creates it on first game, same seed value).
export const STARTING_POINTS = 100;

/** Live game points balance for the signed-in user. Falls back to
 * STARTING_POINTS if gamebot hasn't created the doc yet (brand-new player
 * who hasn't joined a room game or recharged before). */
export function subscribeMyGamePoints(uid, callback, onError) {
  return onSnapshot(
    doc(db, COLLECTION, uid),
    (snap) => callback(snap.exists() ? Number(snap.data().balance || 0) : STARTING_POINTS),
    onError
  );
}

/** Recharges `amount` game points, debiting the equivalent wallet points
 * (role-based rate, see gamePointsCostPerUnit in settingsService.js) via
 * the chargeGamePoints Cloud Function. Returns { cost, amount, gamePoints }. */
export async function rechargeGamePoints(amount) {
  const fn = httpsCallable(functions, 'chargeGamePoints');
  try {
    const { data } = await fn({ amount });
    logActivity('gamepoints_recharged', { amount, cost: data.cost });
    return data;
  } catch (e) {
    logError('gamePointsService.rechargeGamePoints', e);
    throw new Error(e.message || 'Could not recharge game points right now.');
  }
}

/** Withdraws `amount` Game Points back into walletBalance (minus the
 * GameBot payout fee, see gamePointsFeePercent in settingsService.js) via
 * the withdrawGamePoints Cloud Function. Returns
 * { amount, fee, credited, gamePoints, walletBalance }. */
export async function withdrawGamePoints(amount) {
  const fn = httpsCallable(functions, 'withdrawGamePoints');
  try {
    const { data } = await fn({ amount });
    logActivity('gamepoints_withdrawn', { amount, fee: data.fee, credited: data.credited });
    return data;
  } catch (e) {
    logError('gamePointsService.withdrawGamePoints', e);
    throw new Error(e.message || 'Could not withdraw Game Points right now.');
  }
}

/** Sends `amount` Game Points from the signed-in user to `toUid` via the
 * transferGamePoints Cloud Function. `to` mirrors pointTransferService's
 * shape - only `to.uid` reaches the server. Returns { transferId, gamePoints }. */
export async function transferGamePoints({ to, amount, note }) {
  if (!to?.uid) throw new Error('Missing recipient.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.');

  const fn = httpsCallable(functions, 'transferGamePoints');
  try {
    const { data } = await fn({ toUid: to.uid, amount: amt, note: note || '' });
    logActivity('gamepoints_transferred', { toUid: to.uid, amount: amt });
    return data;
  } catch (err) {
    logError('gamePointsService.transferGamePoints', err);
    throw new Error(err.message || 'Could not complete the transfer.');
  }
}

/** Sends `amount` Game Points from the signed-in user to `toUid` as a gift
 * (Next Update PRD §4 - 80/20 split: receiver gets 80%, the remaining 20%
 * is retained by the system) via the giftGamePoints Cloud Function. Unlike
 * transferGamePoints, the receiver never gets the full amount - that's the
 * product rule, not a bug. Generates a fresh idempotency key per call so a
 * double-tap or retry can't gift twice; pass the same `idempotencyKey` back
 * in yourself only if you're deliberately retrying one specific attempt.
 * Returns { giftId, status, senderDebited, receiverCredited, systemFee }. */
export async function giftGamePoints({ toUid, amount, idempotencyKey }) {
  if (!toUid) throw new Error('Missing recipient.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.');

  const key = idempotencyKey || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

/** Live history of gifts this user sent or received, newest first. */
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

/** Live history of Game Points transfers this user sent or received, newest first. */
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
