// Direct 1:1 messaging between any two accounts, any mix of roles - this is
// the general-purpose "Chat" tab. It's intentionally separate from:
//   - chatService.js's `chats` collection, which is ONLY the customer <->
//     Support thread (see SupportScreen.js)
//   - groupChatService.js's `groupChats` collection, for multi-person threads
//
// Data model (mirrors chatService.js's shape so ChatScreen can render all
// three with mostly the same code):
//   directChats/{chatId}                     - thread metadata
//     participants ([uidA, uidB]), participantNames ({uid: name}),
//     lastMessage, lastMessageAt, lastSenderId,
//     unreadCounts ({uid: count}), createdAt
//   directChats/{chatId}/messages/{messageId} - the messages themselves
//     senderId, senderName, senderRole, text, type, createdAt
//
// The thread's Firestore doc ID is always the two participants' uids,
// sorted and joined - so there's exactly one thread per pair and either
// side can deterministically find/create it with no query needed.
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  limitToLast,
} from 'firebase/firestore';
import { db } from './config';

const COLLECTION = 'directChats';
const MESSAGES = 'messages';
const REPORTS = 'directChatReports';

export const REPORT_REASONS = ['Harassment or abuse', 'Spam', 'Scam attempt', 'Inappropriate content'];

export function directChatId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

/** Ensures a direct-chat thread exists between `me` and `other` (each {uid, name}), creating it if needed. Returns the thread id. */
export async function ensureDirectChat(me, other) {
  const chatId = directChatId(me.uid, other.uid);
  const ref = doc(db, COLLECTION, chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [me.uid, other.uid],
      participantNames: { [me.uid]: me.name || '', [other.uid]: other.name || '' },
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      lastSenderId: '',
      unreadCounts: { [me.uid]: 0, [other.uid]: 0 },
      createdAt: serverTimestamp(),
    });
  } else {
    // Keep names fresh in case either side's display name changed since.
    await setDoc(
      ref,
      { participantNames: { [me.uid]: me.name || '', [other.uid]: other.name || '' } },
      { merge: true }
    );
  }
  return chatId;
}

/** One-time fetch of a thread's participants/names - used to resolve a notification tap into a chat name/uid without waiting for subscribeMyChats to load. Returns null if the thread doesn't exist. */
export async function getDirectChatMeta(chatId) {
  if (!chatId) return null;
  const snap = await getDoc(doc(db, COLLECTION, chatId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Sends a text message. `sender` is {uid, name, role}. */
export async function sendMessage(chatId, sender, text) {
  const trimmed = (text || '').trim();
  if (!chatId || !trimmed) return;

  const ref = doc(db, COLLECTION, chatId);
  const snap = await getDoc(ref);
  const participants = snap.exists() ? snap.data().participants || [] : [];
  const others = participants.filter((uid) => uid !== sender.uid);

  await addDoc(collection(db, COLLECTION, chatId, MESSAGES), {
    senderId: sender.uid,
    senderName: sender.name || '',
    senderRole: sender.role || '',
    text: trimmed,
    type: 'text',
    createdAt: serverTimestamp(),
  });

  const patch = { lastMessage: trimmed, lastMessageAt: serverTimestamp(), lastSenderId: sender.uid };
  others.forEach((uid) => { patch[`unreadCounts.${uid}`] = increment(1); });
  patch[`unreadCounts.${sender.uid}`] = 0;
  await setDoc(ref, patch, { merge: true });
}

const MEDIA_PREVIEW = {
  image: '\uD83D\uDCF7 Photo',
  video: '\uD83C\uDFA5 Video',
  document: '\uD83D\uDCC4 Document',
  voice: '\uD83C\uDFA4 Voice message',
};

/** Sends a media message (photo, video, document, or voice note). `media` is uploadChatMedia's result plus `type` and, for voice notes, `duration`. */
export async function sendMediaMessage(chatId, sender, media) {
  if (!chatId || !media || !media.url) return;

  const ref = doc(db, COLLECTION, chatId);
  const snap = await getDoc(ref);
  const participants = snap.exists() ? snap.data().participants || [] : [];
  const others = participants.filter((uid) => uid !== sender.uid);

  await addDoc(collection(db, COLLECTION, chatId, MESSAGES), {
    senderId: sender.uid,
    senderName: sender.name || '',
    senderRole: sender.role || '',
    text: '',
    type: media.type,
    mediaUrl: media.url,
    mediaName: media.name || '',
    mediaSize: media.size || 0,
    mimeType: media.mimeType || '',
    duration: media.duration || 0,
    createdAt: serverTimestamp(),
  });

  const preview = MEDIA_PREVIEW[media.type] || 'Attachment';
  const patch = { lastMessage: preview, lastMessageAt: serverTimestamp(), lastSenderId: sender.uid };
  others.forEach((uid) => { patch[`unreadCounts.${uid}`] = increment(1); });
  patch[`unreadCounts.${sender.uid}`] = 0;
  await setDoc(ref, patch, { merge: true });
}

/** Live list of messages in one thread, oldest first. Capped to the most
 * recent 100 - without a limit, a long-running conversation re-downloads
 * and re-renders every message ever sent on every single open, which was
 * one of the biggest real slowdowns in the app (gets worse the longer a
 * thread has been active, invisibly, until someone notices it's crawling).
 * limitToLast (not limit) is required together with an ascending orderBy
 * to get the newest N messages while still displaying oldest-to-newest -
 * plain limit() on an ascending query would instead return the OLDEST N,
 * which is the opposite of what a chat screen should open to. Trade-off:
 * messages older than the most recent 100 aren't loaded here - there's no
 * "load older messages" pagination yet, so very old history isn't
 * reachable from this screen until that's added. */
export function subscribeMessages(chatId, callback, onError) {
  const q = query(collection(db, COLLECTION, chatId, MESSAGES), orderBy('createdAt', 'asc'), limitToLast(100));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** Zeroes out one participant's unread count. */
export async function markRead(chatId, uid) {
  if (!chatId || !uid) return;
  await setDoc(doc(db, COLLECTION, chatId), { [`unreadCounts.${uid}`]: 0 }, { merge: true });
}

/** Blocks another user (Marketplace PRD section 11 "Security: Block user").
 * Written onto the blocker's own users/{uid} doc - a normal, non-frozen
 * field under firestore.rules - and enforced server-side there too: once
 * blocked, the other person's messages to this thread are rejected
 * (see firestore.rules' isBlockedByRecipient). */
export async function blockUser(myUid, otherUid) {
  if (!myUid || !otherUid) return;
  await setDoc(doc(db, 'users', myUid), { blockedUids: arrayUnion(otherUid) }, { merge: true });
}

/** Reverses blockUser. */
export async function unblockUser(myUid, otherUid) {
  if (!myUid || !otherUid) return;
  await setDoc(doc(db, 'users', myUid), { blockedUids: arrayRemove(otherUid) }, { merge: true });
}

/** Reports a direct-chat conversation to admins (PRD section 11 "Security:
 * Report conversation"). Write-only from the client, mirrors the other
 * *Reports collections (marketplaceReports, communityReports, ...). */
export async function reportConversation(chatId, reporterId, reportedUid, reason) {
  if (!chatId || !reporterId || !reportedUid) return;
  await addDoc(collection(db, REPORTS), {
    chatId,
    reporterId,
    reportedUid,
    reason: reason || '',
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

/** Live list of every direct-chat thread the signed-in user is part of - used for the Chat inbox and the unread badge. */
export function subscribeMyChats(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('participants', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}
