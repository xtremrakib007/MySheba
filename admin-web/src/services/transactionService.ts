// Admin/superadmin transaction queue. Approval is separate from operator
// acceptance: admin/superadmin approves first, dealer/reseller claims as the
// Operator, then that Operator completes the order.
import { collection, doc, onSnapshot, orderBy, query, updateDoc, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

const COLLECTION = 'transactions';
export type TxStatus = 'pending' | 'processing' | 'completed';
export interface Transaction {
  id: string; service: string; details: string; amount: number; total: number; status: TxStatus; approved: boolean;
  approvedBy?: string | null; approvedByName?: string | null; approvedByRole?: string | null;
  claimedBy?: string | null; claimedByName?: string | null; claimedByRole?: string | null;
  completedBy?: string | null; completedByName?: string | null; completedByRole?: string | null;
  customerId: string | null; customerPhone: string; dealerId: string | null; resellerId: string | null;
  rejected: boolean; rejectReason: string; pin: string; receiptUrl?: string; createdAt: string | null;
}
function mapTx(d: QueryDocumentSnapshot<DocumentData>): Transaction {
  const data = d.data();
  return { id: d.id, service: data.service ?? '', details: data.details ?? '', amount: data.amount ?? 0, total: data.total ?? 0,
    status: (data.status as TxStatus) ?? 'pending', approved: data.approved === true, approvedBy: data.approvedBy ?? null,
    approvedByName: data.approvedByName ?? null, approvedByRole: data.approvedByRole ?? null, claimedBy: data.claimedBy ?? null,
    claimedByName: data.claimedByName ?? null, claimedByRole: data.claimedByRole ?? null, completedBy: data.completedBy ?? null,
    completedByName: data.completedByName ?? null, completedByRole: data.completedByRole ?? null, customerId: data.customerId ?? null,
    customerPhone: data.customerPhone ?? '', dealerId: data.dealerId ?? null, resellerId: data.resellerId ?? null, rejected: !!data.rejected,
    rejectReason: data.rejectReason ?? '', pin: data.pin ?? '', receiptUrl: data.receiptUrl ?? '', createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null };
}
export function subscribeTransactions(onUpdate: (txs: Transaction[]) => void, onError: (err: Error) => void) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc')); return onSnapshot(q, (snap) => onUpdate(snap.docs.map(mapTx)), (err) => onError(err as Error));
}
export async function approveTransaction(id: string): Promise<void> {
  try { await httpsCallable(functions, 'approveTransaction')({ transactionId: id }); }
  catch (err) { throw new Error((err as Error).message || 'Could not approve this order.'); }
}
export async function acceptTransaction(id: string): Promise<void> {
  try { await httpsCallable(functions, 'acceptTransaction')({ transactionId: id }); }
  catch (err) { throw new Error((err as Error).message || 'Could not accept this order.'); }
}
const REJECT_FNS: Record<string, string> = {
  Recharge: 'rejectRechargeTransaction', Internet: 'rejectInternetPackageTransaction',
  'Mobile Banking': 'rejectMobileBankingTransaction', Remittance: 'rejectRemittanceTransaction',
  'Bill Payment': 'rejectBillPaymentTransaction',
};
export async function rejectTransaction(id: string, reason: string, service: string): Promise<void> {
  const fnName = REJECT_FNS[service];
  if (fnName) { try { await httpsCallable(functions, fnName)({ transactionId: id, reason: reason || '' }); } catch (err) { throw new Error((err as Error).message || 'Could not reject this order right now.'); } return; }
  // Rejection is a server-side operation for every service the platform
  // issues; a client write here would be denied by firestore.rules.
  throw new Error(`No rejection workflow exists for "${service}" orders.`);
}
export async function completeTransaction(id: string, pin?: string, receiptUrl?: string): Promise<void> {
  try { await httpsCallable(functions, 'completeTransaction')({ transactionId: id, pin: pin || '', receiptUrl: receiptUrl || '' }); }
  catch (err) { throw new Error((err as Error).message || 'Could not complete this order.'); }
}
export async function assignDealer(id: string, dealerId: string): Promise<void> {
  const { serverTimestamp } = await import('firebase/firestore'); await updateDoc(doc(db, COLLECTION, id), { dealerId, updatedAt: serverTimestamp() });
}
export interface DealerOption { id: string; name: string; phone: string; }
export function subscribeDealerOptions(onUpdate: (dealers: DealerOption[]) => void, onError: (err: Error) => void) {
  const q = query(collection(db, 'users'), where('role', '==', 'dealer'));
  return onSnapshot(q, (snap) => { const list = snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '', phone: (d.data().phone as string) ?? '' })); list.sort((a, b) => a.name.localeCompare(b.name)); onUpdate(list); }, (err) => onError(err as Error));
}
