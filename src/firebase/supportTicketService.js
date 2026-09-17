// Support tickets: customer/staff submits a subject + message; admin manages status.
import { collection, doc, updateDoc, onSnapshot, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { logActivity } from './logService';

const COLLECTION = 'supportTickets';
export const STATUS_LABELS = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };

export async function createSupportTicket(payload, user) {
  if (!user?.uid) throw new Error('Not authenticated');
  const subject = String(payload?.subject || '').trim();
  const message = String(payload?.message || '').trim();
  if (!subject || subject.length > 200) throw new Error('Subject is required and must be at most 200 characters.');
  if (!message || message.length > 5000) throw new Error('Message is required and must be at most 5000 characters.');
  const create = httpsCallable(functions, 'createSupportTicket');
  const result = await create({ subject, message });
  const id = result.data?.id;
  if (!id) throw new Error('Support ticket was not created.');
  logActivity('support_ticket_created', { ticketId: id }).catch(() => {});
  return id;
}

export function subscribeSupportTickets(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export function subscribeMySupportTickets(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('userId', '==', uid));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(list);
  }, onError);
}

export function subscribeAssignedTickets(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('assignedToUid', '==', uid));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(list);
  }, onError);
}

export async function markTicketInProgress(id) { await updateDoc(doc(db, COLLECTION, id), { status: 'in_progress', updatedAt: serverTimestamp() }); }
export async function resolveTicket(id, adminNote) { await updateDoc(doc(db, COLLECTION, id), { status: 'resolved', adminNote: adminNote || '', updatedAt: serverTimestamp() }); }
export async function reopenTicket(id) { await updateDoc(doc(db, COLLECTION, id), { status: 'open', updatedAt: serverTimestamp() }); }
export async function assignTicket(id, staff) { await updateDoc(doc(db, COLLECTION, id), { assignedToUid: staff.id, assignedToName: staff.name || '', assignedToRole: staff.role || '', updatedAt: serverTimestamp() }); }
export async function unassignTicket(id) { await updateDoc(doc(db, COLLECTION, id), { assignedToUid: '', assignedToName: '', assignedToRole: '', updatedAt: serverTimestamp() }); }
