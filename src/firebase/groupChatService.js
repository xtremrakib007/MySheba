// Group chat - multiple people (any mix of customers/dealers/admins) in one
// real-time thread. Mirrors chatService's shape so ChatScreen can render
// both with the same message bubble code.
//
// Data model:
//   groupChats/{groupId}
//     name, memberUids (array), memberNames ({uid: name}), createdBy,
//     createdAt, lastMessage, lastMessageAt, lastSenderName,
//     unreadCounts ({uid: count})
//   groupChats/{groupId}/messages/{messageId}
//     senderId, senderName, senderRole, text, type, mediaUrl, mediaName,
//     mediaSize, mimeType, duration, createdAt
import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  deleteDoc,
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

const COLLECTION = 'groupChats';
const MESSAGES = 'messages';

const MEDIA_PREVIEW = {
  image: '\uD83D\uDCF7 Photo',
  video: '\uD83C\uDFA5 Video',
  document: '\uD83D\uDCC4 Document',
  voice: '\uD83C\uDFA4 Voice message',
};

/** Creates a new group thread. `members` is [{uid, name}], `creator` is {uid, name}. Returns the new group id. */
export async function createGroup(name, members, creator) {
  const memberUids = Array.from(new Set([creator.uid, ...members.map((m) => m.uid)]));
  const memberNames = { [creator.uid]: creator.name || '' };
  members.forEach((m) => { memberNames[m.uid] = m.name || ''; });
  const unreadCounts = {};
  memberUids.forEach((uid) => { unreadCounts[uid] = 0; });

  const docRef = await addDoc(collection(db, COLLECTION), {
    name: (name || '').trim() || 'Group Chat',
    memberUids,
    memberNames,
    unreadCounts,
    createdBy: creator.uid,
    createdAt: serverTimestamp(),
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    lastSenderName: '',
  });
  return docRef.id;
}

/** Live list of every group the given uid belongs to, most recently active first. No orderBy in the query (array-contains + orderBy on a different field needs a composite index) - sorted client-side instead. */
export function subscribeMyGroups(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('memberUids', 'array-contains', uid));
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

/** One-time fetch of a group's metadata - used to resolve a notification tap into a group name without waiting for subscribeMyGroups to load. Returns null if the group doesn't exist. */
export async function getGroupMeta(groupId) {
  if (!groupId) return null;
  const snap = await getDoc(doc(db, COLLECTION, groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live thread metadata for one group (name, members, unread counts). */
export function subscribeGroupMeta(groupId, callback, onError) {
  return onSnapshot(
    doc(db, COLLECTION, groupId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

/** Live list of messages in a group, oldest first. Capped to the most
 * recent 100 - see the matching note in directChatService.js's
 * subscribeMessages for why this matters and the pagination trade-off. */
export function subscribeGroupMessages(groupId, callback, onError) {
  const q = query(collection(db, COLLECTION, groupId, MESSAGES), orderBy('createdAt', 'asc'), limitToLast(100));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

async function bumpGroupPreview(groupId, sender, previewText) {
  const groupSnap = await getDoc(doc(db, COLLECTION, groupId));
  const data = groupSnap.exists() ? groupSnap.data() : { memberUids: [] };
  const unreadPatch = {};
  (data.memberUids || []).forEach((uid) => {
    if (uid !== sender.uid) unreadPatch[`unreadCounts.${uid}`] = increment(1);
  });

  await updateDoc(doc(db, COLLECTION, groupId), {
    lastMessage: previewText,
    lastMessageAt: serverTimestamp(),
    lastSenderName: sender.name || '',
    [`unreadCounts.${sender.uid}`]: 0,
    ...unreadPatch,
  });
}

/** Sends a plain text message into a group. */
export async function sendGroupMessage(groupId, sender, text) {
  const trimmed = (text || '').trim();
  if (!groupId || !trimmed) return;

  await addDoc(collection(db, COLLECTION, groupId, MESSAGES), {
    senderId: sender.uid,
    senderName: sender.name || '',
    senderRole: sender.profileRole || '',
    text: trimmed,
    type: 'text',
    createdAt: serverTimestamp(),
  });
  await bumpGroupPreview(groupId, sender, trimmed);
}

/** Sends a media message (photo/video/document/voice note) into a group. */
export async function sendGroupMediaMessage(groupId, sender, media) {
  if (!groupId || !media || !media.url) return;

  await addDoc(collection(db, COLLECTION, groupId, MESSAGES), {
    senderId: sender.uid,
    senderName: sender.name || '',
    senderRole: sender.profileRole || '',
    text: '',
    type: media.type,
    mediaUrl: media.url,
    mediaName: media.name || '',
    mediaSize: media.size || 0,
    mimeType: media.mimeType || '',
    duration: media.duration || 0,
    createdAt: serverTimestamp(),
  });
  await bumpGroupPreview(groupId, sender, MEDIA_PREVIEW[media.type] || 'Attachment');
}

/** Clears the unread counter for this member. */
export async function markGroupRead(groupId, uid) {
  if (!groupId || !uid) return;
  await updateDoc(doc(db, COLLECTION, groupId), { [`unreadCounts.${uid}`]: 0 });
}

/** Adds a member to an existing group (staff-only, enforced by firestore.rules). */
export async function addGroupMember(groupId, member) {
  await updateDoc(doc(db, COLLECTION, groupId), {
    memberUids: arrayUnion(member.uid),
    [`memberNames.${member.uid}`]: member.name || '',
    [`unreadCounts.${member.uid}`]: 0,
  });
}

/** Removes a member from a group. */
export async function removeGroupMember(groupId, uid) {
  await updateDoc(doc(db, COLLECTION, groupId), { memberUids: arrayRemove(uid) });
}

/** Renames a group. */
export async function renameGroup(groupId, name) {
  await updateDoc(doc(db, COLLECTION, groupId), { name: (name || '').trim() || 'Group Chat' });
}

/**
 * Group creator permanently deletes the group. Only removes the
 * groupChats/{groupId} document itself from here - the messages
 * subcollection is cleaned up server-side by functions/index.js's
 * onGroupChatDeleted trigger, same as roomChatService.deleteRoom.
 * Irreversible - confirm with the creator before calling.
 */
export async function deleteGroup(groupId) {
  await deleteDoc(doc(db, COLLECTION, groupId));
}
