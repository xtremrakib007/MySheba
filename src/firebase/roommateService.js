// Marketplace "Room Sharing" module (Phase 2 of the Marketplace PRD) -
// roommate-finding requests layered on top of the existing MySheba account
// system, mirroring accommodationService.js's pattern. Unlike Buy & Sell /
// Accommodation, PRD section 7 has no photo field for these - a request is
// just a text profile (location, budget, move-in date, headcount,
// preferences, description), so there's no images[]/Storage upload here.
//
// Data model:
//   roommateRequests/{requestId}
//     posterId, posterName, posterRole,
//     location, budget, moveInDate, numberOfPeople, preferences,
//     description,
//     status: 'active' | 'closed' | 'hidden'  (hidden = auto-moderated, see
//       functions/index.js onRoommateReportCreated; closed = poster found
//       a match),
//     reportCount, createdAt, updatedAt
//   roommateReports/{reportId}
//     requestId, requestPosterName, reporterId, reason, note, createdAt
//
// "Chat" (PRD's Room Sharing > Chat) reuses the app's existing
// general-purpose Direct Chat (src/firebase/directChatService.js) - see
// RoommateRequestDetailScreen's contactPoster - so there's no separate
// room-sharing chat collection or screen.
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

const REQUESTS = 'roommateRequests';
const REPORTS = 'roommateReports';

export const REPORT_REASONS = ['Fake or scam', 'Already filled / spam', 'Misleading info', 'Offensive content'];

const MAX_FEED = 200; // client-side search filters over this recent window - see note in RoomSharingHomeScreen.

/** Creates a roommate request doc. Returns the new request id. */
export async function createRoommateRequest(poster, data) {
  const ref = await addDoc(collection(db, REQUESTS), {
    posterId: poster.uid,
    posterName: poster.name || '',
    posterRole: poster.role || '',
    location: (data.location || '').trim(),
    budget: Number(data.budget) || 0,
    moveInDate: (data.moveInDate || '').trim(),
    numberOfPeople: Number(data.numberOfPeople) || 1,
    preferences: (data.preferences || '').trim(),
    description: (data.description || '').trim(),
    status: 'active',
    reportCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Poster-only edit of a request's fields. */
export async function updateRoommateRequest(requestId, patch) {
  await updateDoc(doc(db, REQUESTS, requestId), { ...patch, updatedAt: serverTimestamp() });
}

export async function setRoommateRequestStatus(requestId, status) {
  await updateDoc(doc(db, REQUESTS, requestId), { status, updatedAt: serverTimestamp() });
}

export async function deleteRoommateRequest(requestId) {
  await deleteDoc(doc(db, REQUESTS, requestId));
}

export async function getRoommateRequest(requestId) {
  const snap = await getDoc(doc(db, REQUESTS, requestId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live single-request subscription - used by the detail screen so a
 * "mark as filled" from another device shows up live. */
export function subscribeRoommateRequest(requestId, callback, onError) {
  return onSnapshot(doc(db, REQUESTS, requestId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

/** Live feed of active roommate requests, most recent first, capped at
 * MAX_FEED. Text search filters client-side over this window (see
 * RoomSharingHomeScreen) rather than needing a separate search index. */
export function subscribeActiveRoommateRequests(callback, onError) {
  const q = query(collection(db, REQUESTS), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(MAX_FEED));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** Live list of one poster's own requests (any status), most recent first. */
export function subscribeMyRoommateRequests(uid, callback, onError) {
  const q = query(collection(db, REQUESTS), where('posterId', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// ---- Reports ----

/** Files a report on a roommate request. functions/index.js's
 * onRoommateReportCreated bumps the request's reportCount server-side and
 * auto-hides it past the threshold - the client never writes reportCount
 * directly. */
export async function reportRoommateRequest(requestId, requestPosterName, reporterId, reason, note) {
  await addDoc(collection(db, REPORTS), {
    requestId,
    requestPosterName: requestPosterName || '',
    reporterId,
    reason,
    note: (note || '').trim(),
    createdAt: serverTimestamp(),
  });
}
