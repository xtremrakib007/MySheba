// Point (wallet balance) transfers — real behavior confirmed against the
// mobile app's src/firebase/pointTransferService.js. The actual balance
// move happens entirely inside the `transferPoints` Cloud Function
// (functions/walletService.js), which re-derives the caller's real role
// server-side - this file only calls it and offers a same-scoped
// recipient picker + history, exactly like TransferPointsScreen.js does.

import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

const COLLECTION = 'pointTransfers';

export interface TransferResult {
  newBalance?: number;
  [key: string]: unknown;
}

export async function transferPoints(input: { toUid: string; amount: number; note?: string }): Promise<TransferResult> {
  if (!input.toUid) throw new Error('Missing recipient.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Enter a valid amount.');
  const fn = httpsCallable<{ toUid: string; amount: number; note: string }, TransferResult>(functions, 'transferPoints');
  try {
    const { data } = await fn({ toUid: input.toUid, amount: input.amount, note: input.note || '' });
    return data;
  } catch (err) {
    throw new Error((err as Error).message || 'Could not complete the transfer.');
  }
}

export interface RecipientOption {
  id: string;
  name: string;
  phone: string;
  role: string;
}

/** Same visibility subscribeManageableUsers gives admin/superadmin on
 * mobile: superadmin -> admin/dealer/reseller/customer, admin ->
 * dealer/reseller/customer. The Cloud Function re-checks this
 * server-side regardless of what this picker shows. */
export function subscribeTransferRecipients(
  role: 'admin' | 'superadmin',
  onUpdate: (list: RecipientOption[]) => void,
  onError: (err: Error) => void
) {
  const roles = role === 'superadmin' ? ['admin', 'dealer', 'reseller', 'customer'] : ['dealer', 'reseller', 'customer'];
  const q = query(collection(db, 'users'), where('role', 'in', roles));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        name: (d.data().name as string) ?? '',
        phone: (d.data().phone as string) ?? '',
        role: (d.data().role as string) ?? '',
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      onUpdate(list);
    },
    (err) => onError(err as Error)
  );
}

export interface PointTransfer {
  id: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  amount: number;
  note: string;
  createdAt: string | null;
}

/** Full platform-wide history - admin/superadmin only (isAdmin() blanket
 * read in firestore.rules; a dealer/subdealer only sees their own pool,
 * not relevant here since this page is admin-web only). */
export function subscribeAllTransfers(
  onUpdate: (list: PointTransfer[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) =>
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            fromUid: data.fromUid ?? '',
            fromName: data.fromName ?? '',
            toUid: data.toUid ?? '',
            toName: data.toName ?? '',
            amount: data.amount ?? 0,
            note: data.note ?? '',
            createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null,
          };
        })
      ),
    (err) => onError(err as Error)
  );
}
