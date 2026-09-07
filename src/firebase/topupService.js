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

/** Uploads a picked receipt image (local file uri) to Storage, returns its download URL. */
export async function uploadReceipt(localUri, uid) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const fileName = `${Date.now()}.jpg`;
  const storageRef = ref(storage, `topup-receipts/${uid}/${fileName}`);
  // Explicit contentType: fetch(localUri).blob() on Expo/React Native often
  // comes back with an empty/generic mime type for local file:// uris, which
  // Storage would then save as application/octet-stream - failing the
  // storage.rules check that requires contentType to match image/.* and
  // making the upload (and the whole Top-Up submission) silently fail.
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

/**
 * payload: { amount, method: 'transfer'|'deposit', bankName, refNo, receiptUrl }
 * user: { uid, phone, name, role }
 * 1 RM submitted = 1 point credited on approval. Just files the request -
 * no balance change happens here, so this stays a plain client write.
 */
export async function createTopupRequest(payload, user) {
  const docRef = await addDoc(collection(db, COLLECTION), {
    userId: user && user.uid ? user.uid : null,
    userPhone: (user && user.phone) || '',
    userName: (user && user.name) || '',
    userRole: (user && user.role) || 'customer',
    amount: payload.amount || 0,
    points: payload.amount || 0, // 1 RM = 1 point
    method: payload.method || 'transfer',
    bankName: payload.bankName || '',
    refNo: payload.refNo || '',
    receiptUrl: payload.receiptUrl || '',
    status: 'pending', // pending -> approved | rejected
    rejectReason: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  logActivity('topup_requested', { amount: payload.amount || 0, method: payload.method || 'transfer' });
  return docRef.id;
}

/** Live list of all top-up requests, newest first - used by the Admin panel. */
export function subscribeTopups(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Live list of just the signed-in user's own top-up requests, newest first. */
export function subscribeMyTopups(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}

/** Approves a request and credits the points 1:1 onto the requester's walletBalance. */
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

// ---------------------------------------------------------------------------
// Self top-ups: admin/superadmin buying points for their own account.
// Kept in a completely separate 'selfTopups' collection rather than mixing
// into 'topups', so a staff member's own purchase never shows up in the
// customer/dealer approval queue and no admin ever has to review their own
// (or a peer's) top-up. Auto-approved on create - staff are trusted, so
// there's no pending/approve/reject step here, just an instant credit and a
// record of it for the requester's own history.
const SELF_COLLECTION = 'selfTopups';

/**
 * payload: { amount, method: 'transfer'|'deposit', bankName, refNo, receiptUrl }
 * Credits walletBalance immediately (1 RM = 1 point) via the createSelfTopup
 * Cloud Function, which also writes the selfTopups record server-side.
 */
export async function createSelfTopup(payload) {
  const fn = httpsCallable(functions, 'createSelfTopup');
  try {
    const { data } = await fn({
      amount: payload.amount,
      method: payload.method,
      bankName: payload.bankName,
      refNo: payload.refNo,
      receiptUrl: payload.receiptUrl,
    });
    logActivity('self_topup_requested', { amount: payload.amount || 0, method: payload.method || 'transfer' });
    return data.id;
  } catch (e) {
    logError('topupService.createSelfTopup', e);
    throw e;
  }
}

/** Live list of just the signed-in staff member's own self-topups, newest first - their personal record, not a queue. */
export function subscribeMySelfTopups(uid, callback, onError) {
  const q = query(collection(db, SELF_COLLECTION), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}
