// Flight / Bus / Train are handled as inquiries, not bookings.
import { collection, doc, updateDoc, onSnapshot, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const COLLECTION = 'inquiries';
export async function createInquiry(type, payload, customer) {
  if (!customer?.uid) throw new Error('Not authenticated');
  const create = httpsCallable(functions, 'createInquiry');
  const result = await create({ type, from: payload?.from || '', to: payload?.to || '', date: payload?.date || '', time: payload?.time || '', passengers: payload?.passengers || 1, name: payload?.name || '', phone: payload?.phone || '', email: payload?.email || '', notes: payload?.notes || '' });
  const id = result.data?.id;
  if (!id) throw new Error('Inquiry was not created.');
  return id;
}
export function subscribeInquiries(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}
export function subscribeMyInquiries(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('customerId', '==', uid));
  return onSnapshot(q, (snap) => { const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })); list.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); callback(list); }, onError);
}
export async function updateInquiryStatus(id, status) { await updateDoc(doc(db, COLLECTION, id), { status, updatedAt: serverTimestamp() }); }
export async function closeInquiryWithTicket(id, ticketUrl) { await updateDoc(doc(db, COLLECTION, id), { status: 'closed', ticketUrl, updatedAt: serverTimestamp() }); }
