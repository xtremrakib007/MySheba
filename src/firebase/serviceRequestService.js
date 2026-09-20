// customer sends a provider a lead with a short message - mirrors
// inquiryService.js's new -> contacted -> closed status flow rather than
// being a live chat (though the provider can always open Direct Chat with
// "contact" buttons).
//
// Data model:
//   serviceRequests/{requestId}
//     customerId, customerName,
//     providerId, providerName, providerOwnerId,
//     message,
//     status: 'new' | 'contacted' | 'closed',
//     createdAt, updatedAt
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

const REQUESTS = 'serviceRequests';

/** Sends a service request (lead) from a customer to a provider. Returns
 * the new request id. */
export async function createServiceRequest(customer, provider, message) {
  const ref = await addDoc(collection(db, REQUESTS), {
    customerId: customer.uid,
    customerName: customer.name || '',
    providerId: provider.id,
    providerName: provider.name || '',
    providerOwnerId: provider.ownerId,
    message: (message || '').trim(),
    status: 'new',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Provider's own view - requests sent to any of their provider profiles.
 * Sorted client-side, same reasoning as subscribeMyTransactions elsewhere. */
export function subscribeReceivedRequests(providerOwnerUid, callback, onError) {
  const q = query(collection(db, REQUESTS), where('providerOwnerId', '==', providerOwnerUid), limit(100));
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

/** Customer's own view - requests they've sent to any provider. */
export function subscribeMyRequests(customerUid, callback, onError) {
  const q = query(collection(db, REQUESTS), where('customerId', '==', customerUid), limit(100));
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

/** Provider-owner-only status change (new -> contacted -> closed). */
export async function setRequestStatus(requestId, status) {
  await updateDoc(doc(db, REQUESTS, requestId), { status, updatedAt: serverTimestamp() });
}
