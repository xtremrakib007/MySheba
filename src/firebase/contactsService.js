// Backs the "Add contact" flow (find anyone by name or phone, any role, to
// start a direct chat with) and the "Friends" list (see
// FriendsListScreen.js) - both the explicit-search-and-add flow and the
// WhatsApp-style "people from your phone contacts who are on MySheba"
// match. searchUsers/matchContactsByPhone go through Cloud Functions
// rather than a plain Firestore query - see functions/userSearch.js for
// why. The friends subcollection itself (users/{uid}/friends) is a normal
// client read/write - firestore.rules scopes it to the owner only.
import { httpsCallable } from 'firebase/functions';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { functions, db } from './config';

export async function searchUsers(queryText) {
  const fn = httpsCallable(functions, 'searchUsers');
  const { data } = await fn({ query: queryText });
  return (data && data.results) || [];
}

/** Looks up one account by uid - backs the QR "Scan to add contact" flow
 * (see QRScanScreen.js). Takes the uid decoded from a scanned MySheba QR
 * code and re-fetches that user's public-safe fields fresh from the
 * server, the same shape searchUsers/matchContactsByPhone return. */
export async function getUserByUid(uid) {
  const fn = httpsCallable(functions, 'getUserByUid');
  const { data } = await fn({ uid });
  return (data && data.result) || null;
}

/** Matches a batch of device-contact phone numbers against registered
 * MySheba accounts. Returns only users who are actually registered - the
 * caller (FriendsListScreen.js) pairs each match back up with the device
 * contact's saved name. */
export async function matchContactsByPhone(phoneNumbers) {
  const fn = httpsCallable(functions, 'matchContactsByPhone');
  const { data } = await fn({ phoneNumbers });
  return (data && data.results) || [];
}

/** Adds (or refreshes) one friend on the signed-in user's own friends list.
 * `friend` is whatever came back from searchUsers/matchContactsByPhone:
 * { uid, name, phone, role, userId }. `deviceContactName`, if given, is the
 * name saved for this number in the phone's own contacts (WhatsApp-style
 * display - see FriendsListScreen.js) rather than the MySheba profile name. */
export async function addFriend(ownerUid, friend, deviceContactName) {
  if (!ownerUid || !friend?.uid) return;
  await setDoc(doc(db, 'users', ownerUid, 'friends', friend.uid), {
    uid: friend.uid,
    name: friend.name || '',
    phone: friend.phone || '',
    role: friend.role || 'customer',
    userId: friend.userId || '',
    deviceContactName: deviceContactName || null,
    addedAt: serverTimestamp(),
  });
}

export async function removeFriend(ownerUid, friendUid) {
  if (!ownerUid || !friendUid) return;
  await deleteDoc(doc(db, 'users', ownerUid, 'friends', friendUid));
}

/** Live subscription to the signed-in user's friends list. */
export function subscribeFriends(ownerUid, onChange) {
  if (!ownerUid) return () => {};
  return onSnapshot(collection(db, 'users', ownerUid, 'friends'), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

