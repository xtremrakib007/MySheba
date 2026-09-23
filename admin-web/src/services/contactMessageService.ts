// Website contact-form submissions. The messages are written only by the
// `submitContact` Cloud Function (mysheba-web/functions/index.js), which
// also records whether the notification email reached info@mysheba.top;
// the admin panel reads them and moves them through a handling status.

import {
  collection,
  doc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const COLLECTION = 'contactMessages';
const PAGE_SIZE = 100;

export type ContactStatus = 'new' | 'read' | 'replied' | 'closed';
export const CONTACT_STATUSES: ContactStatus[] = ['new', 'read', 'replied', 'closed'];
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  new: 'New', read: 'Read', replied: 'Replied', closed: 'Closed',
};

/** Delivery state of the notification email Resend was asked to send. */
export type ContactEmailStatus = 'pending' | 'sent' | 'failed';

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  subjectLabel: string;
  message: string;
  language: string;
  status: ContactStatus;
  emailStatus: ContactEmailStatus;
  emailError: string | null;
  createdAt: string | null;
}

function mapMessage(d: QueryDocumentSnapshot<DocumentData>): ContactMessage {
  const data = d.data();
  return {
    id: d.id,
    name: data.name ?? '(no name)',
    email: data.email ?? '',
    phone: data.phone ?? '',
    subject: data.subject ?? '',
    subjectLabel: data.subjectLabel ?? data.subject ?? '(no subject)',
    message: data.message ?? '',
    language: data.language ?? 'en',
    status: (data.status as ContactStatus) ?? 'new',
    emailStatus: (data.emailStatus as ContactEmailStatus) ?? 'pending',
    emailError: data.emailError ?? null,
    createdAt: data.createdAt?.toDate?.().toLocaleString() ?? data.createdAt ?? null,
  };
}

export async function fetchContactMessages(status: ContactStatus | 'all' = 'all'): Promise<ContactMessage[]> {
  const ref = collection(db, COLLECTION);
  const q = status === 'all'
    ? query(ref, orderBy('createdAt', 'desc'), fbLimit(PAGE_SIZE))
    : query(ref, where('status', '==', status), orderBy('createdAt', 'desc'), fbLimit(PAGE_SIZE));
  return (await getDocs(q)).docs.map(mapMessage);
}

export async function setContactStatus(id: string, status: ContactStatus): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status,
    handledBy: auth.currentUser?.uid ?? null,
    handledAt: serverTimestamp(),
  });
}
