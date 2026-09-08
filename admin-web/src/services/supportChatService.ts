// Live 1:1 support chat threads — real schema confirmed against the
// mobile app's src/firebase/chatService.js. This is a *separate* feature
// from supportTickets (see supportTicketService.js): tickets are a
// trackable open/in_progress/resolved record with no messaging at all;
// this is the actual live "Message Support" chat thread per customer.
// One thread per customer, doc ID == customer uid.

import {
  collection,
  doc,
  setDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
  limitToLast,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const COLLECTION = 'chats';
const MESSAGES = 'messages';

export interface ChatThread {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  lastMessage: string;
  lastMessageAt: string | null;
  lastSenderRole: 'customer' | 'staff' | '';
  unreadForStaff: number;
  assignedToUid: string;
  assignedToName: string;
  assignedToRole: string;
}

export interface ChatThreadMessage {
  id: string;
  senderId: string;
  senderRole: 'customer' | 'staff';
  senderName: string;
  text: string;
  type: string | null;
  createdAt: string | null;
}

/** Live list of every customer thread, most recently active first. */
export function subscribeAllChats(
  onUpdate: (threads: ChatThread[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy('lastMessageAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            customerId: data.customerId ?? d.id,
            customerName: data.customerName ?? '',
            customerPhone: data.customerPhone ?? '',
            lastMessage: data.lastMessage ?? '',
            lastMessageAt: data.lastMessageAt?.toDate?.().toLocaleString() ?? null,
            lastSenderRole: data.lastSenderRole ?? '',
            unreadForStaff: data.unreadForStaff ?? 0,
            assignedToUid: data.assignedToUid ?? '',
            assignedToName: data.assignedToName ?? '',
            assignedToRole: data.assignedToRole ?? '',
          };
        })
      );
    },
    (err) => onError(err as Error)
  );
}

/** Live list of messages in one thread, oldest first, capped to the most recent 100. */
export function subscribeMessages(
  chatId: string,
  onUpdate: (messages: ChatThreadMessage[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, COLLECTION, chatId, MESSAGES), orderBy('createdAt', 'asc'), limitToLast(100));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            senderId: data.senderId ?? '',
            senderRole: (data.senderRole as 'customer' | 'staff') ?? 'customer',
            senderName: data.senderName ?? '',
            text: data.text ?? '',
            type: data.type ?? null,
            createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null,
          };
        })
      );
    },
    (err) => onError(err as Error)
  );
}

/** Sends a staff reply into a thread and updates its preview/unread counters. */
export async function sendStaffMessage(
  chatId: string,
  staff: { uid: string; name?: string },
  text: string
): Promise<void> {
  const trimmed = text.trim();
  if (!chatId || !trimmed) return;

  await addDoc(collection(db, COLLECTION, chatId, MESSAGES), {
    senderId: staff.uid,
    senderRole: 'staff',
    senderName: staff.name || '',
    text: trimmed,
    type: 'text',
    createdAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, COLLECTION, chatId),
    {
      customerId: chatId,
      lastMessage: trimmed,
      lastMessageAt: serverTimestamp(),
      lastSenderRole: 'staff',
      unreadForCustomer: increment(1),
      unreadForStaff: 0,
    },
    { merge: true }
  );
}

export async function markChatReadByStaff(chatId: string): Promise<void> {
  await setDoc(doc(db, COLLECTION, chatId), { unreadForStaff: 0 }, { merge: true });
}
