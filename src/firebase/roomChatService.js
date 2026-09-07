// Room chat - a community-style thread (bigger than a group, with a name,
// description, join rules, and a set of house rules members must accept
// before posting). Mirrors groupChatService's shape so ChatScreen can
// render all three thread types with the same message bubble code.
//
// Data model:
//   roomChats/{roomId}
//     name, description, rules ([string]),
//     type ('open' | 'approval' | 'invite') - open: anyone can join instantly;
//       approval: join request sits in pendingUids until an admin approves it;
//       invite: only an admin can add members directly (addRoomMember).
//     ownerUid, adminUids ([uid]), moderatorUids ([uid]) - can mute/kick/
//       approve-reject join requests but not ban, promote, or edit room
//       settings; see promoteToModerator/demoteModerator,
//     memberUids ([uid]), memberNames ({uid: name}),
//     pendingUids ([uid]) - join requests awaiting approval,
//     mutedUids ([uid]), bannedUids ([uid]),
//     agreedUids ([uid]) - members who've tapped "I agree" on the rules,
//     createdBy, createdAt, lastMessage, lastMessageAt, lastSenderName,
//     unreadCounts ({uid: count})
//   roomChats/{roomId}/messages/{messageId}
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

const COLLECTION = 'roomChats';
const MESSAGES = 'messages';

const MEDIA_PREVIEW = {
  image: '\uD83D\uDCF7 Photo',
  video: '\uD83C\uDFA5 Video',
  document: '\uD83D\uDCC4 Document',
  voice: '\uD83C\uDFA4 Voice message',
};

/**
 * Creates a new room. `creator` is {uid, name}. `type` is
 * 'open' | 'approval' | 'invite'. `rules` is an array of rule strings.
 * The creator is auto-added as owner, admin, member, and counted as
 * already agreeing to the rules. Returns the new room id.
 */
export async function createRoom(name, description, rules, type, creator) {
  const docRef = await addDoc(collection(db, COLLECTION), {
    name: (name || '').trim() || 'Room Chat',
    description: (description || '').trim(),
    rules: (rules || []).map((r) => (r || '').trim()).filter(Boolean),
    type: ['open', 'approval', 'invite'].includes(type) ? type : 'open',
    adminsOnlyPost: false,
    ownerUid: creator.uid,
    adminUids: [creator.uid],
    memberUids: [creator.uid],
    memberNames: { [creator.uid]: creator.name || '' },
    pendingUids: [],
    mutedUids: [],
    bannedUids: [],
    agreedUids: [creator.uid],
    unreadCounts: { [creator.uid]: 0 },
    createdBy: creator.uid,
    createdAt: serverTimestamp(),
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    lastSenderName: '',
  });
  return docRef.id;
}

/** Live list of every room the given uid is a member of, most recently active first. */
export function subscribeMyRooms(uid, callback, onError) {
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

/** Live list of every "open" or "approval" room the user isn't already in, for browsing/discovery. */
export function subscribeDiscoverableRooms(uid, callback, onError) {
  const q = query(collection(db, COLLECTION), where('type', 'in', ['open', 'approval']));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => !(r.memberUids || []).includes(uid) && !(r.bannedUids || []).includes(uid));
      callback(list);
    },
    onError
  );
}

/** One-time fetch of a room's metadata - used to resolve a notification tap without waiting for subscribeMyRooms to load. */
export async function getRoomMeta(roomId) {
  if (!roomId) return null;
  const snap = await getDoc(doc(db, COLLECTION, roomId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live thread metadata for one room (name, rules, members, unread counts). */
export function subscribeRoomMeta(roomId, callback, onError) {
  return onSnapshot(
    doc(db, COLLECTION, roomId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

/** Live list of messages in a room, oldest first. Capped to the most
 * recent 100 - see the matching note in directChatService.js's
 * subscribeMessages for why this matters and the pagination trade-off. */
export function subscribeRoomMessages(roomId, callback, onError) {
  const q = query(collection(db, COLLECTION, roomId, MESSAGES), orderBy('createdAt', 'asc'), limitToLast(100));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

async function bumpRoomPreview(roomId, sender, previewText) {
  const roomSnap = await getDoc(doc(db, COLLECTION, roomId));
  const data = roomSnap.exists() ? roomSnap.data() : { memberUids: [] };
  const unreadPatch = {};
  (data.memberUids || []).forEach((uid) => {
    if (uid !== sender.uid) unreadPatch[`unreadCounts.${uid}`] = increment(1);
  });

  await updateDoc(doc(db, COLLECTION, roomId), {
    lastMessage: previewText,
    lastMessageAt: serverTimestamp(),
    lastSenderName: sender.name || '',
    [`unreadCounts.${sender.uid}`]: 0,
    ...unreadPatch,
  });
}

/** Sends a plain text message into a room. */
export async function sendRoomMessage(roomId, sender, text) {
  const trimmed = (text || '').trim();
  if (!roomId || !trimmed) return;

  await addDoc(collection(db, COLLECTION, roomId, MESSAGES), {
    senderId: sender.uid,
    senderName: sender.name || '',
    senderRole: sender.profileRole || '',
    text: trimmed,
    type: 'text',
    createdAt: serverTimestamp(),
  });
  await bumpRoomPreview(roomId, sender, trimmed);
}

/** Sends a media message (photo/video/document/voice note) into a room. */
export async function sendRoomMediaMessage(roomId, sender, media) {
  if (!roomId || !media || !media.url) return;

  await addDoc(collection(db, COLLECTION, roomId, MESSAGES), {
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
  await bumpRoomPreview(roomId, sender, MEDIA_PREVIEW[media.type] || 'Attachment');
}

/** Clears the unread counter for this member. */
export async function markRoomRead(roomId, uid) {
  if (!roomId || !uid) return;
  await updateDoc(doc(db, COLLECTION, roomId), { [`unreadCounts.${uid}`]: 0 });
}

/** Records that this member tapped "I agree" on the room's rules. Required before they can post. */
export async function agreeToRules(roomId, uid) {
  if (!roomId || !uid) return;
  await updateDoc(doc(db, COLLECTION, roomId), { agreedUids: arrayUnion(uid) });
}

/** Joins an 'open' room immediately, or files a join request for an 'approval' room. Caller decides which based on room.type. */
export async function joinRoom(roomId, member) {
  await updateDoc(doc(db, COLLECTION, roomId), {
    memberUids: arrayUnion(member.uid),
    [`memberNames.${member.uid}`]: member.name || '',
    [`unreadCounts.${member.uid}`]: 0,
  });
}

/** Files a join request on an 'approval' room - the requester lands in pendingUids until an admin approves. */
export async function requestToJoinRoom(roomId, member) {
  await updateDoc(doc(db, COLLECTION, roomId), {
    pendingUids: arrayUnion(member.uid),
    [`memberNames.${member.uid}`]: member.name || '',
  });
}

/** Admin approves a pending join request, moving the requester into full membership. */
export async function approveJoinRequest(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), {
    pendingUids: arrayRemove(uid),
    memberUids: arrayUnion(uid),
    [`unreadCounts.${uid}`]: 0,
  });
}

/** Admin rejects a pending join request. */
export async function rejectJoinRequest(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), { pendingUids: arrayRemove(uid) });
}

/** Admin adds a member directly - used for 'invite' rooms. */
export async function addRoomMember(roomId, member) {
  await updateDoc(doc(db, COLLECTION, roomId), {
    memberUids: arrayUnion(member.uid),
    [`memberNames.${member.uid}`]: member.name || '',
    [`unreadCounts.${member.uid}`]: 0,
  });
}

/** Leaves a room (self) or removes a member (admin action). */
export async function removeRoomMember(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), {
    memberUids: arrayRemove(uid),
    adminUids: arrayRemove(uid),
  });
}

/** Admin mutes a member - they stay in the room but the client hides their compose box. */
export async function muteRoomMember(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), { mutedUids: arrayUnion(uid) });
}

/** Admin unmutes a member. */
export async function unmuteRoomMember(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), { mutedUids: arrayRemove(uid) });
}

/** Admin bans a member - removes them and blocks them from rejoining an 'open' room. */
export async function banRoomMember(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), {
    memberUids: arrayRemove(uid),
    adminUids: arrayRemove(uid),
    pendingUids: arrayRemove(uid),
    bannedUids: arrayUnion(uid),
  });
}

/** Lifts a ban. */
export async function unbanRoomMember(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), { bannedUids: arrayRemove(uid) });
}

/** Promotes a member to admin. */
export async function promoteToAdmin(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), { adminUids: arrayUnion(uid) });
}

/** Demotes an admin back to a regular member (can't demote the owner). */
export async function demoteAdmin(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), { adminUids: arrayRemove(uid) });
}

/**
 * Promotes a member to moderator (admin-only action). Moderators can
 * mute/unmute, kick, ban/unban, and approve/reject join requests, but
 * can't promote/demote anyone, edit room info/rules/type, or manage
 * GameBot, and can't act on an admin or the owner - enforced in
 * firestore.rules, not just the UI.
 */
export async function promoteToModerator(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), { moderatorUids: arrayUnion(uid) });
}

/** Demotes a moderator back to a regular member (admin-only action). */
export async function demoteModerator(roomId, uid) {
  await updateDoc(doc(db, COLLECTION, roomId), { moderatorUids: arrayRemove(uid) });
}

// ---- GameBot (functions-gamebot, deployed separately) ----
// GAME_BOT_UID/NAME must match BOT_UID/BOT_NAME in
// functions-gamebot/index.js. Enabling writes `gameBotGame` on the room
// doc plus adds the bot as a normal member (same shape as addRoomMember);
// the gamebot Cloud Function reads `gameBotGame` per incoming message to
// decide whether/which game is active in that room. gamebot itself never
// writes to this document - only the client (via an admin) does.
export const GAME_BOT_UID = 'bot_gamebot';
export const GAME_BOT_NAME = 'GameBot';

export const GAME_BOT_GAMES = [
  { key: 'dice', label: '🎲 Dice' },
  { key: 'lowcard', label: '🃏 LowCard' },
  { key: 'highcard', label: '🂡 HighCard' },
  { key: 'cricket', label: '🏏 Cricket' },
  { key: '29', label: '🂮 29' },
];

/**
 * Admin enables (or switches) the GameBot for this room: sets which game
 * is active and ensures the bot is a member so it receives messages.
 * Calling this again with a different game switches games any time.
 */
export async function setRoomGameBot(roomId, game) {
  await updateDoc(doc(db, COLLECTION, roomId), {
    gameBotGame: game,
    memberUids: arrayUnion(GAME_BOT_UID),
    [`memberNames.${GAME_BOT_UID}`]: GAME_BOT_NAME,
  });
}

/** Admin turns the GameBot off for this room (leaves the bot as a member). */
export async function removeRoomGameBot(roomId) {
  await updateDoc(doc(db, COLLECTION, roomId), { gameBotGame: null });
}

/** Updates name/description. */
export async function updateRoomInfo(roomId, { name, description }) {
  const patch = {};
  if (name !== undefined) patch.name = (name || '').trim() || 'Room Chat';
  if (description !== undefined) patch.description = (description || '').trim();
  await updateDoc(doc(db, COLLECTION, roomId), patch);
}

/**
 * Replaces the room's rule list. Since the rules changed, every member's
 * prior agreement is cleared so they're prompted to review and re-accept.
 */
export async function updateRoomRules(roomId, rules) {
  await updateDoc(doc(db, COLLECTION, roomId), {
    rules: (rules || []).map((r) => (r || '').trim()).filter(Boolean),
    agreedUids: [],
  });
}

/** Admin changes how new members can join - 'open' (instant), 'approval'
 * (join request queues in pendingUids), or 'invite' (admin adds directly). */
export async function updateRoomType(roomId, type) {
  if (!['open', 'approval', 'invite'].includes(type)) return;
  await updateDoc(doc(db, COLLECTION, roomId), { type });
}

/** Admin toggles whether only admins can post. When on, ChatScreen hides
 * the compose box for non-admin members (same client-side gating pattern
 * as mutedUids - see the room rules note at the top of firestore.rules'
 * roomChats match block). */
export async function updateRoomAdminsOnlyPost(roomId, adminsOnlyPost) {
  await updateDoc(doc(db, COLLECTION, roomId), { adminsOnlyPost: !!adminsOnlyPost });
}

/**
 * Admin permanently deletes the room. Only removes the roomChats/{roomId}
 * document itself from here - the messages subcollection is cleaned up
 * server-side by functions/index.js's onRoomChatDeleted trigger (a client
 * can't reliably batch-delete an arbitrarily large subcollection).
 * Irreversible - the caller should confirm with the admin before calling.
 */
export async function deleteRoom(roomId) {
  await deleteDoc(doc(db, COLLECTION, roomId));
}
