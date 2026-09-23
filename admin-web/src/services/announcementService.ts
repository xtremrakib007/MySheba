// Admin push announcements — calls the same `sendAnnouncement` Cloud
// Function the mobile app uses (functions/announcements.js). All
// permission checks, push sending, and the broadcast history log happen
// server-side; this file just calls it and subscribes to the history.

import { httpsCallable } from 'firebase/functions';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { functions, db } from '../firebase/config';

// Matches AUDIENCES in functions/announcements.js exactly.
export const ANNOUNCEMENT_AUDIENCES = [
  { key: 'all', label: 'Everyone' },
  { key: 'customer', label: 'Customers' },
  { key: 'dealer', label: 'Dealers' },
  { key: 'support', label: 'Support Agents' },
  { key: 'finance', label: 'Finance' },
  { key: 'reseller', label: 'Resellers' },
  { key: 'admin', label: 'Admins' },
  { key: 'superadmin', label: 'Superadmins' },
] as const;

export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number]['key'];

export interface SendAnnouncementResult {
  id: string;
  audience: string;
  matchedCount: number;
  sentCount: number;
}

export async function sendAnnouncement(input: {
  title: string;
  body: string;
  audience: AnnouncementAudience;
}): Promise<SendAnnouncementResult> {
  const fn = httpsCallable<typeof input, SendAnnouncementResult>(functions, 'sendAnnouncement');
  const { data } = await fn(input);
  return data;
}

export interface AnnouncementLogEntry {
  id: string;
  title: string;
  body: string;
  audience: string;
  matchedCount: number;
  sentCount: number;
  sentByName: string;
  createdAt: string | null;
}

/** Live list of past broadcasts, newest first. */
export function subscribeAnnouncements(
  onUpdate: (list: AnnouncementLogEntry[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(
    q,
    (snap) =>
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title ?? '',
            body: data.body ?? '',
            audience: data.audience ?? 'all',
            matchedCount: data.matchedCount ?? 0,
            sentCount: data.sentCount ?? 0,
            sentByName: data.sentByName ?? '',
            createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null,
          };
        })
      ),
    (err) => onError(err as Error)
  );
}
