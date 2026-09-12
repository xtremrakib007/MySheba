import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot,
  orderBy, query, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, functions } from './config';

const GIFTS = collection(db, 'virtualGifts');

export function subscribeVirtualGifts(callback, onError) {
  const q = query(GIFTS, orderBy('sortOrder', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export function subscribeEnabledVirtualGifts(callback, onError) {
  return subscribeVirtualGifts((items) => callback(items.filter((g) => g.enabled !== false)), onError);
}

export async function createVirtualGift(data) {
  const clean = normalizeGift(data);
  return addDoc(GIFTS, { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateVirtualGift(id, data) {
  await updateDoc(doc(db, 'virtualGifts', id), { ...normalizeGift(data), updatedAt: serverTimestamp() });
}

export async function deleteVirtualGift(id) {
  await deleteDoc(doc(db, 'virtualGifts', id));
}

/** Securely sends a catalogue gift. The Cloud Function reads the server-side
 * gift price and atomically deducts that amount from gamePoints/{uid}. */
export async function sendVirtualGift({ giftId, recipientUid, chatType, chatId, idempotencyKey }) {
  if (!giftId || !recipientUid || !chatType || !chatId) throw new Error('Missing gift recipient or chat.');
  const key = idempotencyKey || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fn = httpsCallable(functions, 'sendVirtualGift');
  try {
    const { data } = await fn({ giftId, recipientUid, chatType, chatId, idempotencyKey: key });
    return data;
  } catch (err) {
    throw new Error(err.message || 'Could not send the virtual gift right now.');
  }
}

export async function uploadVirtualGiftAsset(uri, uid, kind, mimeType) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const extension = (mimeType || '').split('/')[1] || (kind === 'animation' ? 'gif' : 'jpg');
  const path = `virtual-gifts/${uid}/${Date.now()}-${kind}.${extension}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: mimeType || blob.type || 'application/octet-stream' });
  return getDownloadURL(storageRef);
}

function normalizeGift(data) {
  return {
    name: String(data.name || '').trim(),
    description: String(data.description || '').trim(),
    imageUrl: String(data.imageUrl || '').trim(),
    animationUrl: String(data.animationUrl || '').trim(),
    animationType: String(data.animationType || 'gif'),
    price: Math.max(0, Number(data.price) || 0),
    enabled: data.enabled !== false,
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
  };
}
