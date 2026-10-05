import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

const COLLECTION = 'pointTransfers';

function createRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) throw new Error('Secure request ID generation is unavailable. Please reload the app.');
  return `pt_${uuid.replace(/-/g, '')}`;
}

export interface TransferResult {
  newBalance?: number;
  transferId?: string;
  replay?: boolean;
  [key: string]: unknown;
}

/** The server's own rule, so a mistyped PIN is caught before it costs an attempt. */
export const SECURITY_PIN_RE = /^\d{4,8}$/;

export async function transferPoints(
  input: { toUid: string; amount: number; note?: string; securityPin: string },
): Promise<TransferResult> {
  if (!input.toUid) throw new Error('Missing recipient.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Enter a valid amount.');
  // Five wrong PINs lock the account for an hour, so an obviously malformed
  // one is stopped here rather than spent on the server.
  if (!SECURITY_PIN_RE.test(input.securityPin)) throw new Error('Enter your 4-8 digit security PIN.');
  const requestId = createRequestId();
  const fn = httpsCallable<{ requestId: string; toUid: string; amount: number; note: string; securityPin: string }, TransferResult>(functions, 'transferPoints');
  try {
    const { data } = await fn({ requestId, toUid: input.toUid, amount: input.amount, note: input.note || '', securityPin: input.securityPin });
    return data;
  } catch (err) {
    throw new Error((err as Error).message || 'Could not complete the transfer.');
  }
}

export interface RecipientOption { id: string; name: string; phone: string; role: string; }

export function subscribeTransferRecipients(
  role: 'admin' | 'superadmin',
  onUpdate: (list: RecipientOption[]) => void,
  onError: (err: Error) => void
) {
  const roles = role === 'superadmin' ? ['admin', 'dealer', 'reseller', 'customer'] : ['dealer', 'reseller', 'customer'];
  const q = query(collection(db, 'users'), where('role', 'in', roles), limit(500));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '', phone: (d.data().phone as string) ?? '', role: (d.data().role as string) ?? '' }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    onUpdate(list);
  }, (err) => onError(err as Error));
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

export function subscribeAllTransfers(onUpdate: (list: PointTransfer[]) => void, onError: (err: Error) => void) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => onUpdate(snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, fromUid: data.fromUid ?? '', fromName: data.fromName ?? '', toUid: data.toUid ?? '', toName: data.toName ?? '', amount: data.amount ?? 0, note: data.note ?? '', createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null };
  })), (err) => onError(err as Error));
}
