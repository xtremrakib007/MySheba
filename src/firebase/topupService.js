// Point top-up: customer/dealer sends money via bank transfer or bank
// deposit, uploads the receipt, and submits a request. Admin reviews the
// receipt and Approves (credits `walletBalance` on the user's `users/{uid}`
// doc 1:1 - 1 RM = 1 point) or Rejects it. Mirrors the transactions/
// inquiries dealer-queue pattern already used elsewhere in the app.
//
// approveTopup/rejectTopup/createSelfTopup call Cloud Functions
// (functions/walletService.js) rather than writing walletBalance directly -
// firestore.rules freezes that field on every client write, so the Admin
// SDK inside those functions is the only thing that can change it. See
// walletService.js's file header for why.
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from './config';
import { logActivity, logError } from './logService';

const COLLECTION = 'topups';

export const METHODS = {
  transfer: 'Bank Transfer',
  deposit: 'Bank Deposit',
  jompay: 'JomPay',
  duitnow: 'DuitNow QR',
};

function createRequestId(prefix = 'selftopup') {
  return `ms_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

/** Uploads a picked receipt image (local file uri) to Storage, returns its download URL. */
export async function uploadReceipt(localUri, uid) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const fileName = `${Date.now()}.jpg`;
  const storageRef = ref(storage, `topup-receipts/${uid}/${fileName}`);
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

export async function createTopupRequest(payload, user) {
  const docRef = await addDoc(collection(db, COLLECTION), {
    userId: user && user.uid ? user.uid : null,
    userPhone: (user && user.phone) || '',
    userName: (user && user.name) || '',
    userRole: (user && user.role) || 'customer',
    amount: payload.amount || 0,
    points: payload.amount || 0,
    method: payload.method || 'transfer',
    bankName: payload.bankName || '',
    refNo: payload.refNo || '',
    receiptUrl: payload.receiptUrl || '',
    status: 'pending',
    rejectReason: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  logActivity('topup_requested', { amount: payload.amount || 0, method: payload.method || 'transfer' });
  return docRef.id;
}

export function subscribeTopups(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export function subscribeMyTopups(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('userId', '==', uid));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(list);
  }, onError);
}

export async function approveTopup(topup) {
  const fn = httpsCallable(functions, 'approveTopup');
  try {
    await fn({ topupId: topup.id });
    logActivity('topup_approved', { topupId: topup.id });
  } catch (e) {
    logError('topupService.approveTopup', e);
    throw e;
  }
}

export async function rejectTopup(id, reason) {
  const fn = httpsCallable(functions, 'rejectTopup');
  try {
    await fn({ topupId: id, reason });
    logActivity('topup_rejected', { topupId: id });
  } catch (e) {
    logError('topupService.rejectTopup', e);
    throw e;
  }
}

const SELF_COLLECTION = 'selfTopups';

/**
 * Credits the authenticated staff account through the guarded createSelfTopup
 * Cloud Function. A unique requestId makes retries idempotent and prevents
 * the same client request from being credited twice.
 */
export async function createSelfTopup(payload, requestId = createRequestId()) {
  const fn = httpsCallable(functions, 'createSelfTopup');
  const effectiveRequestId = requestId || createRequestId();
  try {
    const { data } = await fn({
      amount: payload.amount,
      method: payload.method,
      bankName: payload.bankName,
      refNo: payload.refNo,
      receiptUrl: payload.receiptUrl,
      requestId: effectiveRequestId,
    });
    logActivity('self_topup_requested', {
      amount: payload.amount || 0,
      method: payload.method || 'transfer',
      requestId: effectiveRequestId,
    });
    return data?.id;
  } catch (e) {
    logError('topupService.createSelfTopup', e);
    throw e;
  }
}

export function subscribeMySelfTopups(uid, callback, onError) {
  const q = query(collection(db, SELF_COLLECTION), where('userId', '==', uid));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(list);
  }, onError);
}
