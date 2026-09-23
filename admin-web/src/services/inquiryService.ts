// Travel inquiries (Flight/Bus/Train "contact me" requests) — real schema
// from the mobile app's src/firebase/inquiryService.js. No live booking;
// customer leaves route/date/contact details, staff calls back to
// arrange the ticket. firestore.rules grants any staff (dealer/
// reseller/support/admin/superadmin) read+update - not admin-only.

import { collection, doc, onSnapshot, orderBy, query, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const COLLECTION = 'inquiries';

export type InquiryType = 'flight' | 'bus' | 'train';
export type InquiryStatus = 'new' | 'contacted' | 'closed';

export interface Inquiry {
  id: string;
  type: InquiryType;
  from: string;
  to: string;
  date: string;
  time: string;
  passengers: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  status: InquiryStatus;
  customerId: string | null;
  ticketUrl: string | null;
  createdAt: string | null;
}

export function subscribeInquiries(
  onUpdate: (list: Inquiry[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) =>
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: (data.type as InquiryType) ?? 'flight',
            from: data.from ?? '',
            to: data.to ?? '',
            date: data.date ?? '',
            time: data.time ?? '',
            passengers: data.passengers ?? 1,
            name: data.name ?? '',
            phone: data.phone ?? '',
            email: data.email ?? '',
            notes: data.notes ?? '',
            status: (data.status as InquiryStatus) ?? 'new',
            customerId: data.customerId ?? null,
            ticketUrl: data.ticketUrl ?? null,
            createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null,
          };
        })
      ),
    (err) => onError(err as Error)
  );
}

export async function updateInquiryStatus(id: string, status: InquiryStatus): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { status, updatedAt: serverTimestamp() });
}

/** Flight only - closes with the issued e-ticket attached. Mobile picks a
 * photo/PDF and uploads it; the web admin has no file-upload pipeline
 * wired up yet, so this takes an already-hosted URL instead, same
 * simplification used for Remittance receipts on the Transactions page. */
export async function closeInquiryWithTicket(id: string, ticketUrl: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), { status: 'closed', ticketUrl, updatedAt: serverTimestamp() });
}
