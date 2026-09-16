// Voice/video call signaling for 1-to-1 calls only.
// Agora handles the actual audio/video once both participants join.
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const COLLECTION = 'calls';
const RING_TIMEOUT_MS = 45000;

export async function startCall(caller, callee, type = 'video') {
  if (!caller?.uid || !callee?.uid) throw new Error('startCall needs both caller and callee');
  const docRef = doc(collection(db, COLLECTION));
  const channelName = `call_${docRef.id}`;
  await setDoc(docRef, {
    type,
    channelName,
    callerUid: caller.uid,
    callerName: caller.name || '',
    calleeUid: callee.uid,
    calleeName: callee.name || '',
    status: 'ringing',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { callId: docRef.id, channelName };
}

export async function acceptCall(callId) {
  await updateDoc(doc(db, COLLECTION, callId), { status: 'accepted', updatedAt: serverTimestamp() });
}

export async function declineCall(callId) {
  await updateDoc(doc(db, COLLECTION, callId), { status: 'declined', updatedAt: serverTimestamp() });
}

export async function endCall(callId) {
  await updateDoc(doc(db, COLLECTION, callId), { status: 'ended', updatedAt: serverTimestamp() });
}

export function subscribeIncomingCalls(myUid, callback, onError) {
  const q = query(
    collection(db, COLLECTION),
    where('calleeUid', '==', myUid),
    where('status', '==', 'ringing'),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) return callback(null);
    const d = snap.docs[0];
    callback({ id: d.id, ...d.data() });
  }, onError);
}

export function subscribeCall(callId, callback, onError) {
  return onSnapshot(doc(db, COLLECTION, callId), (snap) => {
    if (!snap.exists()) return callback(null);
    callback({ id: snap.id, ...snap.data() });
  }, onError);
}

export async function fetchAgoraToken(channelName, uid) {
  const fn = httpsCallable(functions, 'generateAgoraToken');
  const { data } = await fn(uid ? { channelName, uid } : { channelName });
  return data;
}

// Compatibility no-ops for stale AppContext code. These APIs intentionally
// do not create or subscribe to group calls; group calling has been retired.
export async function startGroupCall() {
  throw new Error('Group calls have been removed from MySheba.');
}
export async function acceptGroupCall() {
  throw new Error('Group calls have been removed from MySheba.');
}
export async function declineGroupCall() {
  throw new Error('Group calls have been removed from MySheba.');
}
export async function leaveGroupCall() {
  throw new Error('Group calls have been removed from MySheba.');
}
export async function cancelGroupCall() {
  throw new Error('Group calls have been removed from MySheba.');
}
export function subscribeIncomingGroupCalls(_uid, callback) {
  if (typeof callback === 'function') callback(null);
  return () => {};
}

export { RING_TIMEOUT_MS };
