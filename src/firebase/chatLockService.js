// WhatsApp-style "Chat Lock": lets a signed-in user hide specific direct /
// group / room threads behind the existing security PIN gate
// (securityPinService.js / SecurityPinGate.js - same PIN used for My
// Documents, Transfer Points, Notepad). Locking is a personal, per-device
// preference, not a thread-wide setting - it lives on the locker's own
// users/{uid} doc, not on the chat thread itself, so nobody else's view of
// the conversation is affected. See AppContext's isChatLocked/lockChatThread/
// unlockChatThread/openLockedChats for how the UI wires into this, and
// LockedChatsScreen.js for where locked threads actually get listed.
//
// Data model: users/{uid}.lockedChatIds - a flat array of "kind:id" strings,
// e.g. "direct:abc_def", "group:xyz123", "room:foo456". A flat array (rather
// than a subcollection) keeps it in the same doc AppContext already
// subscribes to for the rest of the profile, and array-union/array-remove
// give atomic toggling without a read-modify-write race between devices.
import { doc, setDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from './config';

export function lockKey(kind, id) {
  return `${kind}:${id}`;
}

export function parseLockKey(key) {
  const i = key.indexOf(':');
  if (i < 0) return { kind: '', id: key };
  return { kind: key.slice(0, i), id: key.slice(i + 1) };
}

/** Live list of "kind:id" keys the signed-in user has locked. */
export function subscribeLockedChats(uid, callback, onError) {
  if (!uid) return () => {};
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => callback(snap.exists() ? (snap.data().lockedChatIds || []) : []),
    onError
  );
}

/** Locks one thread for the signed-in user only. */
export async function lockChat(uid, kind, id) {
  if (!uid || !kind || !id) return;
  await setDoc(doc(db, 'users', uid), { lockedChatIds: arrayUnion(lockKey(kind, id)) }, { merge: true });
}

/** Unlocks (removes the lock from) one thread for the signed-in user only. */
export async function unlockChat(uid, kind, id) {
  if (!uid || !kind || !id) return;
  await setDoc(doc(db, 'users', uid), { lockedChatIds: arrayRemove(lockKey(kind, id)) }, { merge: true });
}
