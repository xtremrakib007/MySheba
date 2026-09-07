// Flight / Bus / Train are handled as *inquiries*, not bookings: the
// customer tells us what they want (route + date[/time]) and contact
// details, we save it to Firestore, and an admin calls them back to
// arrange the actual ticket. This matches how the business really works -
// there is no live seat inventory to book against.
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

const COLLECTION = 'inquiries';

/**
 * type: 'flight' | 'bus' | 'train'
 * payload: { from, to, date, time?, passengers?, name, phone, email?, notes? }
 */
export async function createInquiry(type, payload, customer) {
  const docRef = await addDoc(collection(db, COLLECTION), {
    type,
    from: payload.from || '',
    to: payload.to || '',
    date: payload.date || '',
    time: payload.time || '',
    passengers: payload.passengers || 1,
    name: payload.name || '',
    phone: payload.phone || '',
    email: payload.email || '',
    notes: payload.notes || '',
    status: 'new', // new -> contacted -> closed
    customerId: customer && customer.uid ? customer.uid : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/** Live list of all inquiries, newest first - used by the Admin panel. */
export function subscribeInquiries(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/**
 * Live list of just the signed-in customer's own inquiries, newest first -
 * used by the customer History screen. Sorted client-side, same reasoning
 * as subscribeMyTransactions above.
 */
export function subscribeMyInquiries(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('customerId', '==', uid));
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

export async function updateInquiryStatus(id, status) {
  await updateDoc(doc(db, COLLECTION, id), { status, updatedAt: serverTimestamp() });
}

/** Closes a flight inquiry with the issued ticket attached - admin picks
 * a photo/PDF of the e-ticket first (see mediaUpload.uploadFlightTicket),
 * then this saves the URL and flips status to 'closed' in one write. Bus/
 * Train inquiries still close via the plain updateInquiryStatus above -
 * only Flight requires a ticket attachment. */
export async function closeInquiryWithTicket(id, ticketUrl) {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'closed',
    ticketUrl,
    updatedAt: serverTimestamp(),
  });
}
