// Admin/superadmin transaction queue ("All Tx" / "Pending" tiles) — real
// schema and behavior confirmed against the mobile app's
// src/firebase/transactionService.js and AdminHomeScreen.js. Recharge and
// Internet Package orders are wallet-charged atomically by a Cloud
// Function on create and require a matching Cloud Function to reject (for
// the refund); every other service (Mobile Banking, Remittance) accepts/
// rejects/completes with a plain client update, same as this file does.

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

const COLLECTION = 'transactions';

export type TxStatus = 'pending' | 'processing' | 'completed';

export interface Transaction {
  id: string;
  service: string;
  details: string;
  amount: number;
  total: number;
  status: TxStatus;
  customerId: string | null;
  customerPhone: string;
  dealerId: string | null;
  resellerId: string | null;
  rejected: boolean;
  rejectReason: string;
  pin: string;
  receiptNumber: string;
  receiptGeneratedAt: string | null;
  createdAt: string | null;
}

function mapTx(d: QueryDocumentSnapshot<DocumentData>): Transaction {
  const data = d.data();
  return {
    id: d.id,
    service: data.service ?? '',
    details: data.details ?? '',
    amount: data.amount ?? 0,
    total: data.total ?? 0,
    status: (data.status as TxStatus) ?? 'pending',
    customerId: data.customerId ?? null,
    customerPhone: data.customerPhone ?? '',
    dealerId: data.dealerId ?? null,
    resellerId: data.resellerId ?? null,
    rejected: !!data.rejected,
    rejectReason: data.rejectReason ?? '',
    pin: data.pin ?? '',
    receiptNumber: data.receiptNumber ?? '',
    receiptGeneratedAt: data.receiptGeneratedAt?.toDate?.().toLocaleString() ?? null,
    createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null,
  };
}

/** Live list of every transaction, newest first - admin/superadmin only
 * (firestore.rules' isAdmin() grants blanket read here). */
export function subscribeTransactions(
  onUpdate: (txs: Transaction[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => onUpdate(snap.docs.map(mapTx)), (err) => onError(err as Error));
}

export async function acceptTransaction(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { status: 'processing', updatedAt: serverTimestamp() });
}

const REJECT_FNS: Record<string, string> = {
  Recharge: 'rejectRechargeTransaction',
  Internet: 'rejectInternetPackageTransaction',
};

/** Recharge/Internet route through a Cloud Function so the customer's
 * points get refunded atomically with the reject - a plain client write
 * can't touch `rejected` for these two (frozen in firestore.rules). */
export async function rejectTransaction(id: string, reason: string, service: string): Promise<void> {
  const fnName = REJECT_FNS[service];
  if (fnName) {
    try {
      await httpsCallable(functions, fnName)({ transactionId: id, reason: reason || '' });
    } catch (err) {
      throw new Error((err as Error).message || 'Could not reject this order right now.');
    }
    return;
  }
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'completed',
    rejected: true,
    rejectReason: reason || '',
    updatedAt: serverTimestamp(),
  });
}

/** Remittance and Mobile Banking are completed by the staff member who
 * accepted the order. Remittance requires the staff-provided completion
 * PIN; no customer PIN entry and no receipt upload are used. Completion
 * automatically creates receipt metadata that the customer can see in
 * History. */
export async function completeTransaction(id: string, pin?: string): Promise<void> {
  const cleanPin = String(pin || '').replace(/\D/g, '').slice(0, 4);
  const receiptNumber = `MS-RMT-${id.slice(0, 8).toUpperCase()}`;
  const patch: Record<string, unknown> = {
    status: 'completed',
    pin: cleanPin,
    updatedAt: serverTimestamp(),
  };
  if (cleanPin) {
    patch.receiptNumber = receiptNumber;
    patch.receiptGeneratedAt = serverTimestamp();
  }
  await updateDoc(doc(db, COLLECTION, id), patch);
}

export async function assignDealer(id: string, dealerId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { dealerId, updatedAt: serverTimestamp() });
}

export interface DealerOption {
  id: string;
  name: string;
  phone: string;
}

/** Dealer/subdealer picker for "Appoint Dealer" on an unassigned order. */
export function subscribeDealerOptions(
  onUpdate: (dealers: DealerOption[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, 'users'), where('role', 'in', ['dealer', 'subdealer']));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        name: (d.data().name as string) ?? '',
        phone: (d.data().phone as string) ?? '',
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      onUpdate(list);
    },
    (err) => onError(err as Error)
  );
}