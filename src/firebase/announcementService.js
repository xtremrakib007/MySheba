// Client side of admin push announcements. All the actual permission checks
// and push-sending happen server-side in functions/announcements.js
// (sendAnnouncement) - this file just calls it and live-subscribes to the
// broadcast history so Admin > Announcements can show what's already been
// sent.
import { httpsCallable } from 'firebase/functions';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { functions, db } from './config';

// Who a broadcast can be sent to - mirrors AUDIENCES in
// functions/announcements.js, plus a friendly label for the picker.
export const ANNOUNCEMENT_AUDIENCES = [
  { key: 'all', label: 'Everyone' },
  { key: 'customer', label: 'Customers' },
  { key: 'dealer', label: 'Dealers' },
  { key: 'reseller', label: 'Resellers' },
  { key: 'admin', label: 'Admins' },
];

export async function sendAnnouncement({ title, body, audience }) {
  const fn = httpsCallable(functions, 'sendAnnouncement');
  const { data } = await fn({ title, body, audience });
  return data;
}

/** Live list of past broadcasts, newest first, for the Admin > Announcements history. */
export function subscribeAnnouncements(callback, onError) {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}
