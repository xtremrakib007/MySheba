// Verification badge (Phase 3 of the Marketplace PRD, section 12 "Safety &
// Trust System" and the sitemap's Admin Panel > Verification Management).
//
// Phone verification already happens for every self-registered account at
// signup (see functions/otpService.js + RegisterScreen.js), so the piece
// that was actually missing is the PRD's "Optional identity verification":
// a user submits a photo of an ID document, an admin reviews it, and
// approval sets users/{uid}.verified = true, which VerifiedBadge.js reads
// to show a checkmark badge wherever a seller/owner/provider name appears.
//
// Data model:
//   verificationRequests/{uid} - one doc per user (resubmission overwrites
//     it, same "doc id = uid" pattern as marketplaceViews/recommendationService.js).
//     uid, name, phone, documentUrl, status: 'pending' | 'approved' | 'rejected',
//     note (admin's reason if rejected), submittedAt, reviewedAt, reviewedBy
//
// Approval/rejection go through Cloud Functions (functions/verificationService.js),
// not a direct client write - firestore.rules only lets the client ever
// write status: 'pending' on this doc (and freezes `verified` on
// users/{uid} the same way walletBalance is frozen), so the Admin SDK
// inside those functions is the only thing that can actually grant the
// badge. See that file's header for why.
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const REQUESTS = 'verificationRequests';

/** Submits (or resubmits after a rejection) an identity verification
 * request. Overwrites any prior pending/rejected request for this user -
 * there's only ever one "current" request per user. */
export async function submitVerificationRequest(uid, { name, phone }, documentUrl) {
  await setDoc(doc(db, REQUESTS, uid), {
    uid,
    name: name || '',
    phone: phone || '',
    documentUrl,
    status: 'pending',
    note: '',
    submittedAt: serverTimestamp(),
  });
}

/** Live status of the signed-in user's own verification request (or null
 * if they've never submitted one). */
export function subscribeMyVerificationRequest(uid, callback, onError) {
  if (!uid) { callback(null); return () => {}; }
  return onSnapshot(
    doc(db, REQUESTS, uid),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

/** Admin: live queue of pending verification requests, oldest first (so
 * the review queue works first-in-first-out like the topup/report queues
 * elsewhere in the admin panel). */
export function subscribePendingVerifications(callback, onError) {
  const q = query(collection(db, REQUESTS), where('status', '==', 'pending'), orderBy('submittedAt', 'asc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** Admin approves a pending request - grants the Verified badge. */
export async function approveVerification(targetUid) {
  const fn = httpsCallable(functions, 'approveVerification');
  await fn({ targetUid });
}

/** Admin rejects a pending request with a reason the user will see. */
export async function rejectVerification(targetUid, reason) {
  const fn = httpsCallable(functions, 'rejectVerification');
  await fn({ targetUid, reason });
}
