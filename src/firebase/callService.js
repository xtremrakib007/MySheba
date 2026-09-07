// Voice/video call signaling. Agora handles the actual audio/video once two
// people are in the same channel, but something still has to tell the other
// person's phone "you're being called" and let both sides agree on when the
// call starts/ends - that's what this file + the `calls` collection do.
//
// Data model:
//   calls/{callId}
//     type ('audio' | 'video')
//     channelName        - the Agora channel everyone on the call joins
//     callerUid, callerName
//     -- 1:1 calls only --
//     calleeUid, calleeName
//     status             - 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed'
//     -- group calls only (isGroup: true) --
//     groupId, groupName
//     participantUids ([uid])       - everyone invited, including the caller; fixed at creation
//     participantNames ({uid: name})
//     ringingUids ([uid])           - invited members who haven't responded yet
//     activeUids ([uid])            - members currently in the call (caller starts in this)
//     status             - 'ringing' (nobody but the caller has joined) |
//                          'active' (someone else has joined) | 'ended'
//     createdAt, updatedAt
//
// onCallCreated (functions/index.js) sends a push to the callee(s) when a
// doc is created with status 'ringing'; onCallUpdated auto-closes out a
// group call once ringingUids and activeUids both empty.
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
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const COLLECTION = 'calls';
const RING_TIMEOUT_MS = 45000; // auto-mark-missed if never answered

/** Starts a call: creates the signaling doc and returns {callId, channelName}. */
export async function startCall(caller, callee, type = 'video') {
  if (!caller?.uid || !callee?.uid) throw new Error('startCall needs both caller and callee');

  // Agora channel names are capped at 64 bytes. Packing both uids +
  // a timestamp ("call_<uid>_<uid>_<ts>") ran past that for standard
  // Firebase Auth uids (~76 chars), so generateAgoraToken rejected every
  // single call with invalid-argument. The call doc's own id is already
  // unique per-call and short, so use that instead - well under the limit
  // and no need for the extra timestamp to dedupe channels.
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

/** Callee accepts - flips status so the caller's screen knows to proceed. */
export async function acceptCall(callId) {
  await updateDoc(doc(db, COLLECTION, callId), { status: 'accepted', updatedAt: serverTimestamp() });
}

/** Callee declines, or caller cancels before it's answered. */
export async function declineCall(callId) {
  await updateDoc(doc(db, COLLECTION, callId), { status: 'declined', updatedAt: serverTimestamp() });
}

/** Either side hangs up once the call is underway. */
export async function endCall(callId) {
  await updateDoc(doc(db, COLLECTION, callId), { status: 'ended', updatedAt: serverTimestamp() });
}

/**
 * Listens for a call ringing FOR me (I'm the callee) so the app can show an
 * incoming-call screen no matter where I currently am in the app. Call this
 * once near the app root (see IncomingCallListener component).
 */
export function subscribeIncomingCalls(myUid, callback) {
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
  });
}

/** Watches one call doc's status - used by the CallScreen on both ends so
 * either side leaving/declining ends the call for the other. */
export function subscribeCall(callId, callback) {
  return onSnapshot(doc(db, COLLECTION, callId), (snap) => {
    if (!snap.exists()) return callback(null);
    callback({ id: snap.id, ...snap.data() });
  });
}

/** Fetches an Agora RTC token for a channel from the Cloud Function. Call
 * this right before joining - tokens are short-lived on purpose. `uid` is
 * optional - group calls pass their deterministic agoraUidFor() value (see
 * src/utils/agoraUid.js) so remote tiles can be identified; 1:1 calls omit
 * it and get the usual "let Agora assign one" behavior. */
export async function fetchAgoraToken(channelName, uid) {
  const fn = httpsCallable(functions, 'generateAgoraToken');
  const { data } = await fn(uid ? { channelName, uid } : { channelName });
  return data; // { token, appId, uid, channelName, expiresAt }
}

// ---------------------------------------------------------------------------
// Group calls - same `calls` collection as 1:1 (isGroup: true), but ring
// every other member of a group chat instead of one callee. See the data
// model comment at the top of this file.
// ---------------------------------------------------------------------------

/** Starts a group call: rings every other member of the group chat.
 * `group` is {id, name, memberUids, memberNames} (a groupChats doc);
 * `caller` is {uid, name}. Returns {callId, channelName}. */
export async function startGroupCall(caller, group, type = 'video') {
  if (!caller?.uid || !group?.id) throw new Error('startGroupCall needs a caller and a group');
  const calleeUids = (group.memberUids || []).filter((uid) => uid !== caller.uid);
  if (calleeUids.length === 0) throw new Error('No other members to call');

  // Same reasoning as startCall: the doc's own id is short and already
  // unique per-call, well under Agora's 64-byte channel name cap.
  const docRef = doc(collection(db, COLLECTION));
  const channelName = `gcall_${docRef.id}`;

  const participantNames = { ...(group.memberNames || {}), [caller.uid]: caller.name || '' };

  await setDoc(docRef, {
    isGroup: true,
    groupId: group.id,
    groupName: group.name || 'Group',
    type,
    channelName,
    callerUid: caller.uid,
    callerName: caller.name || '',
    participantUids: [caller.uid, ...calleeUids],
    participantNames,
    ringingUids: calleeUids,
    activeUids: [caller.uid],
    status: 'ringing',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { callId: docRef.id, channelName };
}

/** A callee accepts a group call - moves them from "ringing" to "in the
 * call" for everyone else watching the doc. */
export async function acceptGroupCall(callId, uid) {
  await updateDoc(doc(db, COLLECTION, callId), {
    ringingUids: arrayRemove(uid),
    activeUids: arrayUnion(uid),
    status: 'active',
    updatedAt: serverTimestamp(),
  });
}

/** A callee declines without ever joining. */
export async function declineGroupCall(callId, uid) {
  await updateDoc(doc(db, COLLECTION, callId), {
    ringingUids: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

/** Leaves a group call that's already under way - drops `uid` off both
 * lists so their tile/row disappears for the rest of the group, without
 * affecting anyone else still on the call. */
export async function leaveGroupCall(callId, uid) {
  await updateDoc(doc(db, COLLECTION, callId), {
    ringingUids: arrayRemove(uid),
    activeUids: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

/** The caller backs out before anyone else has answered - unlike
 * leaveGroupCall, this stops the call ringing for every invitee still in
 * ringingUids, not just the caller. Only meaningful while status is still
 * 'ringing' (nobody else has joined yet); CallScreen enforces that. */
export async function cancelGroupCall(callId) {
  await updateDoc(doc(db, COLLECTION, callId), {
    ringingUids: [],
    activeUids: [],
    status: 'ended',
    updatedAt: serverTimestamp(),
  });
}

/** Listens for group calls ringing FOR me - mirrors subscribeIncomingCalls
 * but keyed off ringingUids, since a group call can be ringing for several
 * people at once instead of one calleeUid. */
export function subscribeIncomingGroupCalls(myUid, callback) {
  const q = query(
    collection(db, COLLECTION),
    where('ringingUids', 'array-contains', myUid),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) return callback(null);
    const d = snap.docs[0];
    callback({ id: d.id, ...d.data() });
  });
}

export { RING_TIMEOUT_MS };
