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
  getDoc,
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
import { db, functions, auth } from '../firebase/config';

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
    createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null,
  };
}

export function subscribeTransactions(
  onUpdate: (txs: Transaction[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => onUpdate(snap.docs.map(mapTx)), (err) => onError(err as Error));
}

async function getStaffActor() {
  const uid = auth?.currentUser?.uid || '';
  if (!uid) throw new Error('You must be signed in to perform this action.');
  const profileSnap = await getDoc(doc(db, 'users', uid));
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  return {
    uid,
    name: profile.fullName || profile.name || profile.displayName || profile.phone || uid,
    role: profile.role || '',
  };
}

export async function acceptTransaction(id: string): Promise<void> {
  const actor = await getStaffActor();
  const patch: Record<string, unknown> = {
    status: 'processing',
    claimedBy: actor.uid,
    claimedByName: actor.name,
    claimedByRole: actor.role || null,
    updatedAt: serverTimestamp(),
  };
  // Admin/superadmin acceptance is the approval event. A dealer/reseller
  // remains the operator if they later complete the order.
  if (actor.role === 'admin' || actor.role === 'superadmin') {
    patch.approvedBy = actor.uid;
    patch.approvedByName = actor.name;
    patch.approvedByRole = actor.role;
    patch.approvedAt = serverTimestamp();
  }
  await updateDoc(doc(db, COLLECTION, id), patch);
}

const REJECT_FNS: Record<string, string> = {
  Recharge: 'rejectRechargeTransaction',
  Internet: 'rejectInternetPackageTransaction',
};

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

export async function completeTransaction(id: string, pin?: string, receiptUrl?: string): Promise<void> {
  const actor = await getStaffActor();
  const patch: Record<string, unknown> = {
    status: 'completed',
    pin: pin || '',
    completedBy: actor.uid,
    completedByName: actor.name,
    completedByRole: actor.role || null,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  // Preserve the approver for dealer/reseller-completed orders. If an
  // admin/superadmin completes directly, that actor is the approver too.
  if (actor.role === 'admin' || actor.role === 'superadmin') {
    patch.approvedBy = actor.uid;
    patch.approvedByName = actor.name;
    patch.approvedByRole = actor.role;
    patch.approvedAt = serverTimestamp();
  }
  if (receiptUrl) patch.receiptUrl = receiptUrl;
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