// Support tickets: a customer/dealer submits a subject + message describing
// their issue; Admin sees the queue, can mark it 'in_progress' (they're on
// it) and 'resolved' (with an optional note back to the requester). This is
// a separate, trackable record with a status - unlike "Message Support" on
// the same screen, which just opens a live 1:1 chat thread (see
// chatService.js / SupportScreen.js's messageSupport()). Mirrors the
// topups dealer-queue pattern already used elsewhere in the app.
//
// assignedTo* mirrors the same fields on chats/{uid} (see chatService.js) -
// which admin/superadmin currently owns resolving this ticket. Blank/''
// until claimed via assignTicket. Unlike chats, every write here already
// requires isAdmin() at the rules layer (see firestore.rules), so no
// extra field-scoped rule was needed to gate this the way chats needed.
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { logActivity } from './logService';

const COLLECTION = 'supportTickets';

export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

/**
 * payload: { subject, message }
 * user: { uid, phone, name, role }
 */
export async function createSupportTicket(payload, user) {
  const docRef = await addDoc(collection(db, COLLECTION), {
    userId: user && user.uid ? user.uid : null,
    userPhone: (user && user.phone) || '',
    userName: (user && user.name) || '',
    userRole: (user && user.role) || 'customer',
    subject: (payload.subject || '').trim(),
    message: (payload.message || '').trim(),
    status: 'open', // open -> in_progress -> resolved
    adminNote: '',
    assignedToUid: '',
    assignedToName: '',
    assignedToRole: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  logActivity('support_ticket_created', { subject: (payload.subject || '').trim() });
  return docRef.id;
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

/** Live list of tickets a superadmin has appointed this admin/dealer to
 * solve, newest first - powers the "Assigned to You" queue on the
 * customer-style Support screen for staff who aren't superadmin (they
 * don't get the full incoming queue, only what's been handed to them). */
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

/** Admin has started working the ticket - doesn't close it, just signals it's been picked up. */
export async function markTicketInProgress(id) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'in_progress',
    updatedAt: serverTimestamp(),
  });
}

/** Admin marks the ticket resolved, with an optional note explaining how it was handled - shown back to the requester. */
export async function resolveTicket(id, adminNote) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'resolved',
    adminNote: adminNote || '',
    updatedAt: serverTimestamp(),
  });
}

/** Re-opens a resolved ticket if the requester's issue wasn't actually fixed. */
export async function reopenTicket(id) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'open',
    updatedAt: serverTimestamp(),
  });
}

/** Assigns this ticket to a specific admin/dealer so it's clear who owns
 * resolving it - same idea as chatService.assignChat for the Messages tab.
 * Any admin/superadmin can (re)assign, not just whoever's currently on it. */
export async function assignTicket(id, staff) {
  await updateDoc(doc(db, COLLECTION, id), {
    assignedToUid: staff.id,
    assignedToName: staff.name || '',
    assignedToRole: staff.role || '',
    updatedAt: serverTimestamp(),
  });
}

/** Clears the assignment, putting the ticket back in the unclaimed pool. */
export async function unassignTicket(id) {
  await updateDoc(doc(db, COLLECTION, id), {
    assignedToUid: '',
    assignedToName: '',
    assignedToRole: '',
    updatedAt: serverTimestamp(),
  });
}
