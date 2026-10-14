// Wallet top-ups from the admin web: customers' requests (verify, complete,
// reject - functions/secureTopupReview.js) and the superadmin's recorded bank
// deposit (functions/superadminDepositService.js). Every call carries this
// browser's session proof; the server refuses one without it.
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, functions, storage } from '../firebase/config';
import { getSessionProof } from './sessionProof';

export interface TopupRequest {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  amount: number;
  currency: string;
  method: string;
  bankName: string;
  refNo: string;
  receiptUrl: string;
  status: 'pending' | 'verified';
  createdAt: number;
}

const millis = (v: any): number => (v?.toMillis ? v.toMillis() : typeof v?.seconds === 'number' ? v.seconds * 1000 : 0);

/** Requests waiting for a decision, newest first. Needs the finance capability. */
export function subscribeOpenTopups(onUpdate: (rows: TopupRequest[]) => void, onError: (err: Error) => void) {
  const q = query(collection(db, 'topups'), where('status', 'in', ['pending', 'verified']), limit(200));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        userId: x.userId ?? '',
        userName: x.userName ?? x.name ?? '',
        userPhone: x.userPhone ?? x.phone ?? '',
        amount: Number(x.points ?? x.amount ?? 0),
        currency: x.currency ?? x.walletCurrency ?? 'MYR',
        method: x.method ?? '',
        bankName: x.bankName ?? '',
        refNo: x.refNo ?? '',
        receiptUrl: x.receiptUrl ?? '',
        status: x.status,
        createdAt: millis(x.createdAt),
      } as TopupRequest;
    });
    rows.sort((a, b) => b.createdAt - a.createdAt);
    onUpdate(rows);
  }, (err) => onError(err as Error));
}

async function call(name: string, data: Record<string, unknown>) {
  try {
    const { data: out } = await httpsCallable(functions, name)({ ...data, ...(await getSessionProof()) });
    return out;
  } catch (err) {
    throw new Error((err as Error).message || 'The request could not be completed.');
  }
}

export const verifyTopup = (topupId: string) => call('verifyTopup', { topupId });
export const completeTopup = (topupId: string) => call('completeTopup', { topupId });
export const rejectTopup = (topupId: string, reason: string) => call('rejectTopup', { topupId, reason });

/** Superadmin: record a real bank deposit into their own wallet. */
export async function recordDeposit(input: { amount: string; bankName: string; refNo: string; note: string; receipt: File; requestId: string }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  // storage.rules: topup-receipts/{uid}/ accepts the owner's own image only,
  // and the server checks the receipt belongs to the caller.
  const fileRef = ref(storage, `topup-receipts/${uid}/${Date.now()}.jpg`);
  await uploadBytes(fileRef, input.receipt, { contentType: input.receipt.type || 'image/jpeg' });
  const receiptUrl = await getDownloadURL(fileRef);
  return call('recordSuperadminDeposit', {
    amount: input.amount.trim(), bankName: input.bankName, refNo: input.refNo, note: input.note, receiptUrl, requestId: input.requestId,
  }) as Promise<{ id: string; amount: number; duplicate?: boolean }>;
}

export const newDepositRequestId = () => `deposit_${crypto.randomUUID()}`;
