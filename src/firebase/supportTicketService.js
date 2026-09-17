// Support tickets: a customer/dealer submits a subject + message describing
// their issue; Admin sees the queue, can mark it 'in_progress' (they're on
// it) and 'resolved' (with an optional note back to the requester). This is
// a separate, trackable record with a status.
import {
  collection,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { logActivity } from './logService';

const COLLECTION = 'supportTickets';
const createSupportTicketFn = httpsCallable(functions, 'createSupportTicket');
const assignSupportTicketFn = httpsCallable(functions, 'assignSupportTicket');
const unassignSupportTicketFn = httpsCallable(functions, 'unassignSupportTicket');

export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

/**
 * payload: { subject, message }
 * user is intentionally not trusted for identity; the callable derives the
 * account identity and role from Firebase Auth + the server-side profile.
 */
export async function createSupportTicket(payload, _user) {
  const result = await createSupportTicketFn({
    subject: String(payload?.subject || '').trim(),
    message: String(payload?.message || '').trim(),
  });
  const id = result.data?.id;
  if (!id) throw new Error('Support ticket creation returned no ticket id.');
  logActivity('support_ticket_created', { ticketId: id });
  return id;
}

/** Live list of every support ticket, newest first - used by the Admin queue. */
export function subscribeSupportTickets(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Live list of just the signed-in user's own support tickets, newest first. */
export function subscribeMySupportTickets(uid, callback, onError) {
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

/** Live list of tickets assigned to the signed-in staff member. */
export function subscribeAssignedTickets(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('assignedToUid', '==', uid));
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

export async function markTicketInProgress(id) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'in_progress',
    updatedAt: serverTimestamp(),
  });
}

export async function resolveTicket(id, adminNote) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'resolved',
    adminNote: adminNote || '',
    updatedAt: serverTimestamp(),
  });
}

export async function reopenTicket(id) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'open',
    updatedAt: serverTimestamp(),
  });
}

export async function assignTicket(id, staff) {
  const result = await assignSupportTicketFn({
    ticketId: String(id || '').trim(),
    staffUid: String(staff?.id || '').trim(),
  });
  return result.data;
}

export async function unassignTicket(id) {
  const result = await unassignSupportTicketFn({
    ticketId: String(id || '').trim(),
  });
  return result.data;
}
