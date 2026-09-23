// Support Chat lock: a signed-in user can hide the Support Chat thread behind
// the existing security PIN gate. Direct Chat, Group Chat and Room Chat were
// removed from MySheba and are intentionally rejected here.
//
// Data model: users/{uid}.lockedChatIds contains only "support:id" keys.
// The preference is private to the locker and lives on that user's document.
import { doc, setDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from './config';

export const SUPPORT_CHAT_KIND = 'support';

export function lockKey(kind, id) {
  return `${kind}:${id}`;
}

export function parseLockKey(key) {
  const i = key.indexOf(':');
  if (i < 0) return { kind: '', id: key };
  return { kind: key.slice(0, i), id: key.slice(i + 1) };
}

/** Live list of Support Chat lock keys for the signed-in user. */
export function subscribeLockedChats(uid, callback, onError) {
  if (!uid) return () => {};
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      const keys = snap.exists() ? (snap.data().lockedChatIds || []) : [];
      callback(keys.filter((key) => parseLockKey(key).kind === SUPPORT_CHAT_KIND));
    },
    onError
  );
}

/** Locks a Support Chat thread for the signed-in user only. */
export async function lockChat(uid, kind, id) {
  if (!uid || !id || kind !== SUPPORT_CHAT_KIND) return;
  await setDoc(doc(db, 'users', uid), { lockedChatIds: arrayUnion(lockKey(SUPPORT_CHAT_KIND, id)) }, { merge: true });
}

/** Unlocks a Support Chat thread for the signed-in user only. */
export async function unlockChat(uid, kind, id) {
  if (!uid || !id || kind !== SUPPORT_CHAT_KIND) return;
  await setDoc(doc(db, 'users', uid), { lockedChatIds: arrayRemove(lockKey(SUPPORT_CHAT_KIND, id)) }, { merge: true });
}
