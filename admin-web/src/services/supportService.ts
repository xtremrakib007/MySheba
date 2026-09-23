// Support ticket queue. Assignment mutations are server-owned; status/note mutations remain rule-gated.
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
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

const COLLECTION = 'supportTickets';
const assignSupportTicketFn = httpsCallable(functions, 'assignSupportTicket');
const unassignSupportTicketFn = httpsCallable(functions, 'unassignSupportTicket');

export type TicketStatus = 'open' | 'in_progress' | 'resolved';
export const STATUS_LABELS: Record<TicketStatus, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };

export interface SupportTicket { id: string; userId: string | null; userPhone: string; userName: string; userRole: string; subject: string; message: string; status: TicketStatus; adminNote: string; assignedToUid: string; assignedToName: string; assignedToRole: string; createdAt: string | null; }
function mapTicket(d: QueryDocumentSnapshot<DocumentData>): SupportTicket { const data = d.data(); return { id: d.id, userId: data.userId ?? null, userPhone: data.userPhone ?? '', userName: data.userName ?? 'Unknown user', userRole: data.userRole ?? 'customer', subject: data.subject ?? '(no subject)', message: data.message ?? '', status: (data.status as TicketStatus) ?? 'open', adminNote: data.adminNote ?? '', assignedToUid: data.assignedToUid ?? '', assignedToName: data.assignedToName ?? '', assignedToRole: data.assignedToRole ?? '', createdAt: data.createdAt?.toDate?.().toLocaleString() ?? data.createdAt ?? null }; }

export async function fetchTickets(mode: 'queue' | 'assigned', opts: { status?: TicketStatus | 'all'; myUid?: string }): Promise<SupportTicket[]> {
  const ref = collection(db, COLLECTION);
  if (mode === 'assigned') { if (!opts.myUid) return []; const snap = await getDocs(query(ref, where('assignedToUid', '==', opts.myUid))); const rows = snap.docs.map(mapTicket); rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')); return rows; }
  const q = opts.status && opts.status !== 'all' ? query(ref, where('status', '==', opts.status), orderBy('createdAt', 'desc')) : query(ref, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q); return snap.docs.map(mapTicket);
}

export async function markTicketInProgress(id: string): Promise<void> { await updateDoc(doc(db, COLLECTION, id), { status: 'in_progress' }); }
export async function resolveTicket(id: string, adminNote: string): Promise<void> { await updateDoc(doc(db, COLLECTION, id), { status: 'resolved', adminNote: adminNote || '' }); }
export async function reopenTicket(id: string): Promise<void> { await updateDoc(doc(db, COLLECTION, id), { status: 'open' }); }
export async function assignTicket(id: string, staff: { id: string; name?: string; role?: string }): Promise<void> { await assignSupportTicketFn({ ticketId: id, staffUid: staff.id }); }
export async function unassignTicket(id: string): Promise<void> { await unassignSupportTicketFn({ ticketId: id }); }

export interface AssignableStaff { id: string; name: string; role: string; }
export function subscribeAssignableStaff(onUpdate: (staff: AssignableStaff[]) => void, onError: (err: Error) => void) {
  const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'superadmin', 'support']));
  return onSnapshot(q, (snap) => { const list = snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '', role: (d.data().role as string) ?? '' })); list.sort((a, b) => a.name.localeCompare(b.name)); onUpdate(list); }, (err) => onError(err as Error));
}
