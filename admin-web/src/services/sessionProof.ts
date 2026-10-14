// The session proof callables check (functions/sessionSlots.js): this
// browser's session id and device id.
//
// A user signed in on a phone and in the admin web holds one session per
// platform, in users/{uid}.activeSessions.{mobile,web}. The legacy
// activeSessionId field is whichever sign-in came LAST, so after a phone
// sign-in it named the phone's session and every web call carrying it was
// refused ("This device session is no longer active"). The web slot is
// read first, and the legacy field only for an account that has no slots.
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { getOrCreateDeviceId } from '../utils/deviceId';

export async function getSessionProof(): Promise<{ sessionId: string; deviceId: string }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? snap.data() : {};
  const web = data?.activeSessions?.web;
  const sessionId = typeof web?.sessionId === 'string' && web.sessionId ? web.sessionId : data?.activeSessionId;
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('Your secure session is missing. Please sign in again.');
  return { sessionId, deviceId: getOrCreateDeviceId() };
}
