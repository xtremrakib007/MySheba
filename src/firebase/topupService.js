// Point top-up service.
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { db, storage, functions } from './config';
import { logActivity, logError } from './logService';

export const METHODS = { transfer: 'Bank Transfer', deposit: 'Bank Deposit', jompay: 'JomPay', duitnow: 'DuitNow QR' };

function createRequestId(prefix = 'pt') {
  if (typeof Crypto.randomUUID !== 'function') throw new Error('Secure request ID generation is unavailable.');
  return `${prefix}_${Crypto.randomUUID().replace(/-/g, '')}`;
}

export async function uploadReceipt(localUri, uid) {
  if (!localUri || !uid) throw new Error('Missing receipt upload details.');
  const response = await fetch(localUri);
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > 10 * 1024 * 1024) throw new Error('Receipt image must be between 1 byte and 10 MB.');
  const contentType = blob.type || 'image/jpeg';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) throw new Error('Receipt must be a JPEG, PNG, or WebP image.');
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const storageRef = ref(storage, `topup-receipts/${uid}/${Date.now()}-${Crypto.randomUUID().replace(/-/g, '')}.${extension}`);
  await uploadBytes(storageRef, blob, { contentType });
  return getDownloadURL(storageRef);
}

export async function createTopupRequest(payload, requestId = createRequestId('topup')) {
  const fn = httpsCallable(functions, 'submitTopupRequest');
  try {
    const { data } = await fn({ amount: payload.amount, method: payload.method, bankName: payload.bankName, refNo: payload.refNo, receiptUrl: payload.receiptUrl, requestId });
    logActivity('topup_requested', { amount: payload.amount || 0, method: payload.method || 'transfer' });
    return data?.id;
  } catch (e) { logError('topupService.createTopupRequest', e); throw e; }
}

export function subscribeTopups(callback, onError) {
  const q = query(collection(db, 'topups'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}
export function subscribeMyTopups(uid, callback, onError) {
  const q = query(collection(db, 'topups'), where('userId', '==', uid));
  return onSnapshot(q, snap => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); list.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list); }, onError);
}
export async function approveTopup(topup) { try { await httpsCallable(functions, 'approveTopup')({ topupId: topup.id }); logActivity('topup_approved', { topupId: topup.id }); } catch (e) { logError('topupService.approveTopup', e); throw e; } }
export async function rejectTopup(id, reason) { try { await httpsCallable(functions, 'rejectTopup')({ topupId: id, reason }); logActivity('topup_rejected', { topupId: id }); } catch (e) { logError('topupService.rejectTopup', e); throw e; } }
export async function createSelfTopup(payload, requestId) { const { data } = await httpsCallable(functions, 'createSelfTopup')({ ...payload, requestId }); return data?.id; }
export function subscribeMySelfTopups(uid, callback, onError) { const q = query(collection(db, 'selfTopups'), where('userId', '==', uid)); return onSnapshot(q, snap => { const list = snap.docs.map(d => ({ id: d.id, ...d.data() })); list.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list); }, onError); }