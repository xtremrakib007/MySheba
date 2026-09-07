// In-app "Chat" tab - a WhatsApp-style 1:1 conversation between a customer
// and the MySheba support/admin team, backed by Firestore so it works in
// real time on both sides with no polling.
//
// Data model (kept intentionally simple - one thread per customer):
//   chats/{customerUid}                     - thread metadata
//     customerId, customerName, customerPhone,
//     lastMessage, lastMessageAt, lastSenderRole ('customer' | 'staff'),
//     unreadForCustomer, unreadForStaff, createdAt,
//     assignedToUid, assignedToName, assignedToRole - who (admin/dealer) is
//     currently handling this thread; all blank/'' until someone claims it
//     (see assignChat / unassignChat below).
//   chats/{customerUid}/messages/{messageId} - the messages themselves
//     senderId, senderRole ('customer' | 'staff'), senderName, text, createdAt
//
// The thread's Firestore doc ID is always the customer's uid, so there's
// exactly one thread per customer and staff can list every thread with a
// single collection query (see subscribeAllChats).
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
  limitToLast,
} from 'firebase/firestore';
import { db } from './config';

const COLLECTION = 'chats';
const MESSAGES = 'messages';

/** Makes sure a chat thread doc exists for this customer (no-op if it already does). */
export async function ensureChat(customer) {
  if (!customer || !customer.uid) return;
  await setDoc(
    doc(db, COLLECTION, customer.uid),
    {
      customerId: customer.uid,
      customerName: customer.name || '',
      customerPhone: customer.phone || '',
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      lastSenderRole: '',
      unreadForCustomer: 0,
      unreadForStaff: 0,
      // merge:true means this never clobbers an assignment already set on
      // an existing thread - only fills these in the first time a thread
      // doc is created.
      assignedToUid: '',
      assignedToName: '',
      assignedToRole: '',
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Sends a message into a thread and updates the thread's preview/unread
 * counters. `sender.role` is 'customer' or 'staff' - staff replies bump
 * unreadForCustomer, customer messages bump unreadForStaff.
 */
export async function sendMessage(chatId, sender, text) {
  const trimmed = (text || '').trim();
  if (!chatId || !trimmed) return;

  await addDoc(collection(db, COLLECTION, chatId, MESSAGES), {
    senderId: sender.uid,
    senderRole: sender.role,
    senderName: sender.name || '',
    text: trimmed,
    type: 'text',
    createdAt: serverTimestamp(),
  });

  const isStaff = sender.role === 'staff';
  await setDoc(
    doc(db, COLLECTION, chatId),
    {
      customerId: chatId,
      customerName: sender.role === 'customer' ? sender.name || '' : sender.customerName || '',
      lastMessage: trimmed,
      lastMessageAt: serverTimestamp(),
      lastSenderRole: sender.role,
      unreadForCustomer: isStaff ? increment(1) : 0,
      unreadForStaff: isStaff ? 0 : increment(1),
    },
    { merge: true }
  );
}

// Human-friendly preview shown in the inbox list / thread meta for a media
// message, since `lastMessage` is plain text there.
const MEDIA_PREVIEW = {
  image: '\uD83D\uDCF7 Photo',
  video: '\uD83C\uDFA5 Video',
  document: '\uD83D\uDCC4 Document',
  voice: '\uD83C\uDFA4 Voice message',
};

/**
 * Sends a media message (photo, video, document, or voice note) into a
 * thread. `media` is the result of mediaUpload.uploadChatMedia plus a
 * `type` field ('image' | 'video' | 'document' | 'voice') and, for voice
 * notes, a `duration` in seconds.
 */
export async function sendMediaMessage(chatId, sender, media) {
  if (!chatId || !media || !media.url) return;

  await addDoc(collection(db, COLLECTION, chatId, MESSAGES), {
    senderId: sender.uid,
    senderRole: sender.role,
    senderName: sender.name || '',
    text: '',
    type: media.type,
    mediaUrl: media.url,
    mediaName: media.name || '',
    mediaSize: media.size || 0,
    mimeType: media.mimeType || '',
    duration: media.duration || 0,
    createdAt: serverTimestamp(),
  });

  const isStaff = sender.role === 'staff';
  const preview = MEDIA_PREVIEW[media.type] || 'Attachment';
  await setDoc(
    doc(db, COLLECTION, chatId),
    {
      customerId: chatId,
      customerName: sender.role === 'customer' ? sender.name || '' : sender.customerName || '',
      lastMessage: preview,
      lastMessageAt: serverTimestamp(),
      lastSenderRole: sender.role,
      unreadForCustomer: isStaff ? increment(1) : 0,
      unreadForStaff: isStaff ? 0 : increment(1),
    },
    { merge: true }
  );
}

/** Live list of messages in one thread, oldest first. Capped to the most
 * recent 100 - see the matching note in directChatService.js's
 * subscribeMessages for why this matters and the pagination trade-off. */
export function subscribeMessages(chatId, callback, onError) {
  const q = query(collection(db, COLLECTION, chatId, MESSAGES), orderBy('createdAt', 'asc'), limitToLast(100));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Live thread metadata (unread count, last message) for one customer - used for the Chat tab badge. */
export function subscribeChatMeta(chatId, callback, onError) {
  return onSnapshot(
    doc(db, COLLECTION, chatId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

/** Live list of every customer thread, most recently active first - used by the staff Chats inbox. */
export function subscribeAllChats(callback, onError) {
  const q = query(collection(db, COLLECTION), orderBy('lastMessageAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Clears the unread counter for whichever side just opened the thread. */
export async function markChatRead(chatId, role) {
  if (!chatId) return;
  const field = role === 'staff' ? 'unreadForStaff' : 'unreadForCustomer';
  await setDoc(doc(db, COLLECTION, chatId), { [field]: 0 }, { merge: true });
}

/** Live list of every admin/superadmin/dealer/dealer - used to populate
 * the "Assign to" picker on a support thread. Sorted client-side (same
 * no-orderBy reasoning as elsewhere) so this doesn't need a composite index. */
export function subscribeAssignableStaff(callback, onError) {
  const q = query(
    collection(db, 'users'),
    where('role', 'in', ['admin', 'superadmin', 'dealer'])
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      callback(list);
    },
    onError
  );
}

/** Assigns this thread to a specific admin/dealer so it's clear who owns
 * resolving it - shown on both the customer-facing "Support" screen queue
 * and the staff inbox. Any staff member can (re)assign, not just the one
 * currently assigned, so a superadmin can always hand a thread off. */
export async function assignChat(chatId, staff) {
  if (!chatId || !staff || !staff.id) return;
  await setDoc(
    doc(db, COLLECTION, chatId),
    {
      assignedToUid: staff.id,
      assignedToName: staff.name || '',
      assignedToRole: staff.role || '',
    },
    { merge: true }
  );
}

/** Clears the assignment, putting the thread back in the unclaimed pool. */
export async function unassignChat(chatId) {
  if (!chatId) return;
  await setDoc(
    doc(db, COLLECTION, chatId),
    { assignedToUid: '', assignedToName: '', assignedToRole: '' },
    { merge: true }
  );
}
