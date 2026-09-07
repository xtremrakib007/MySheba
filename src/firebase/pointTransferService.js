// Point (wallet balance) transfers - lets any staff member (dealer,
// dealer, admin, superadmin) push points to someone they manage:
//   dealer/dealer -> their own customer pool (customers + dealers
//     scoped to them via dealerId - same set userManagementService.js's
//     subscribeManageableUsers already exposes for User Management, reused
//     here as the recipient picker)
//   admin             -> dealers
//   superadmin        -> admins + dealers
//
// The balance move itself happens inside the transferPoints Cloud Function
// (functions/walletService.js), not here - it re-checks the exact same
// scope rules server-side (a client claiming to be a "dealer" proves
// nothing; the function reads the caller's real profile via the Admin
// SDK), runs the debit/credit as one Firestore transaction, and writes the
// pointTransfers audit record itself. firestore.rules freezes walletBalance
// on every client write, so this file has no way to move points on its
// own even if it tried - the Cloud Function is the only path.
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { logActivity, logError } from './logService';

const COLLECTION = 'pointTransfers';

/**
 * `to` is {uid, name, role} - only `to.uid` and `amount`/`note` actually
 * reach the server; the rest of `to` and all of `from` are for the
 * function's return value / local UI only, since the server derives the
 * real sender identity from the authenticated call, not from anything the
 * client claims about itself.
 */
export async function transferPoints({ to, amount, note }) {
  if (!to?.uid) throw new Error('Missing recipient.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('Enter a valid amount.');

  const fn = httpsCallable(functions, 'transferPoints');
  try {
    const { data } = await fn({ toUid: to.uid, amount: amt, note: note || '' });
    logActivity('points_transferred', { toUid: to.uid, amount: amt });
    return data;
  } catch (err) {
    logError('pointTransferService.transferPoints', err);
    // Cloud Functions HttpsError surfaces its message on err.message already.
    throw new Error(err.message || 'Could not complete the transfer.');
  }
}

/** Live history of transfers this user sent or received, newest first. */
export function subscribeMyTransfers(uid, onUpdate, onError) {
  const q = query(collection(db, COLLECTION), where('participants', 'array-contains', uid));
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

/** Live history for a dealer/dealer's whole pool (admin gets this scoped view too, per-dealer, from the dealer's own screen - AdminHomeScreen uses subscribeAllTransfers instead for the global view). */
export function subscribePoolTransfers(dealerScope, onUpdate, onError) {
  const q = query(collection(db, COLLECTION), where('dealerId', '==', dealerScope));
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

/** Every transfer platform-wide - admin/superadmin only (enforced by firestore.rules' isAdmin() branch). */
export function subscribeAllTransfers(onUpdate, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}
