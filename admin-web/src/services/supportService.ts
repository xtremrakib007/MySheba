// Support ticket queue — real schema confirmed against the mobile app's
// src/firebase/supportTicketService.js. Replaces the earlier Phase 4
// version, which guessed a `messages` subcollection, a `priority` field,
// and `inProgress`/`closed` status values that don't exist in the real
// schema (it's just subject + message + a single adminNote, statuses are
// 'open' | 'in_progress' | 'resolved').
//
// Permission model (see firestore.rules match /supportTickets/{id}):
// superadmin reads the full incoming queue; a plain admin/dealer/subdealer
// only ever sees tickets already assigned to them (assignedToUid == their
// uid) - there's no "browse everything" for non-superadmin staff. This
// matters for getCountFromServer especially: Firestore aggregation
// queries require the WHOLE matched set to be readable, not just the
// caller's own subset, so a superadmin-scoped collection can't be counted
// by a plain admin at all (see reportsService.ts's per-metric try/catch).

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const COLLECTION = 'supportTickets';

export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

export interface SupportTicket {
  id: string;
  userId: string | null;
  userPhone: string;
  userName: string;
  userRole: string;
  subject: string;
  message: string;
  status: TicketStatus;
  adminNote: string;
  assignedToUid: string;
  assignedToName: string;
  assignedToRole: string;
  createdAt: string | null;
}

function mapTicket(d: QueryDocumentSnapshot<DocumentData>): SupportTicket {
  const data = d.data();
  return {
    id: d.id,
    userId: data.userId ?? null,
    userPhone: data.userPhone ?? '',
    userName: data.userName ?? 'Unknown user',
    userRole: data.userRole ?? 'customer',
    subject: data.subject ?? '(no subject)',
    message: data.message ?? '',
    status: (data.status as TicketStatus) ?? 'open',
    adminNote: data.adminNote ?? '',
    assignedToUid: data.assignedToUid ?? '',
    assignedToName: data.assignedToName ?? '',
    assignedToRole: data.assignedToRole ?? '',
    createdAt: data.createdAt?.toDate?.().toLocaleString() ?? data.createdAt ?? null,
  };
}

/**
 * `mode: 'queue'` is the superadmin-only full incoming queue, filterable
 * by status. `mode: 'assigned'` is what a plain admin/dealer/subdealer
 * gets instead — only tickets handed to them — and ignores rules-side
 * blanket access entirely, matching AdminSupportScreen.js's split with
 * the regular Support screen's "Assigned to You" queue.
 */
export async function fetchTickets(
  mode: 'queue' | 'assigned',
  opts: { status?: TicketStatus | 'all'; myUid?: string }
): Promise<SupportTicket[]> {
  const ref = collection(db, COLLECTION);
  if (mode === 'assigned') {
    if (!opts.myUid) return [];
    const snap = await getDocs(query(ref, where('assignedToUid', '==', opts.myUid)));
    const rows = snap.docs.map(mapTicket);
    rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return rows;
  }
  const q =
    opts.status && opts.status !== 'all'
      ? query(ref, where('status', '==', opts.status), orderBy('createdAt', 'desc'))
      : query(ref, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(mapTicket);
}

export async function markTicketInProgress(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { status: 'in_progress' });
}

export async function resolveTicket(id: string, adminNote: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { status: 'resolved', adminNote: adminNote || '' });
}

export async function reopenTicket(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { status: 'open' });
}

export async function assignTicket(
  id: string,
  staff: { id: string; name?: string; role?: string }
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    assignedToUid: staff.id,
    assignedToName: staff.name ?? '',
    assignedToRole: staff.role ?? '',
  });
}

export async function unassignTicket(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    assignedToUid: '',
    assignedToName: '',
    assignedToRole: '',
  });
}

export interface AssignableStaff {
  id: string;
  name: string;
  role: string;
}

/** Same picker source as chatService.subscribeAssignableStaff on mobile -
 * every admin/superadmin/dealer/subdealer, for the "Assign to" list.
 * Superadmin-only in the UI (see SupportTicketsPage.tsx), matching
 * AdminSupportScreen.js's canAssign gate. */
export function subscribeAssignableStaff(
  onUpdate: (staff: AssignableStaff[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'superadmin', 'dealer', 'subdealer']));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        name: (d.data().name as string) ?? '',
        role: (d.data().role as string) ?? '',
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      onUpdate(list);
    },
    (err) => onError(err as Error)
  );
}
