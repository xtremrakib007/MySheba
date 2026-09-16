// "Business Profile" - PRD section 15 Monetization Plan premium feature.
// An upgraded, badge-carrying profile for a seller/property owner/service
// provider: a business name, logo, description, and category, plus a
// public page listing everything that user has posted across Buy & Sell,
// BusinessProfileScreen.js).
//
// Data model:
//   businessProfiles/{uid} - one doc per user who has ever been granted
//     Business Profile status (doc id = uid, same "one current doc"
//     pattern as verificationRequests/{uid}). Fields: uid,
//     isBusinessProfile (bool - the badge itself), businessName,
//     businessLogoUrl, businessDescription, businessCategory, createdAt,
//     grantedAt, grantedBy.
//
// Granting/revoking is admin-only and only ever happens through the
// setBusinessProfileStatus Cloud Function (functions/businessProfileService.js)
// - firestore.rules blocks any client "create" on this collection and
// freezes isBusinessProfile on every client update, so there's no
// client-writable path to the badge. Once granted, the owner can edit
// their own businessName/logo/description/category directly (see
// updateBusinessDetails below) - those fields aren't sensitive, so they
// don't need to go through a Cloud Function.
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

const BUSINESS_PROFILES = 'businessProfiles';

/** One-off read of a user's Business Profile doc, or null if they've never
 * been granted one (including a since-revoked one still returns the doc -
 * check isBusinessProfile to know whether the badge is currently active). */
export async function fetchBusinessProfile(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, BUSINESS_PROFILES, uid));
  return snap.exists() ? snap.data() : null;
}

/** Live version of fetchBusinessProfile - used by BusinessProfileScreen so
 * an admin revoking/re-granting status, or the owner editing their own
 * details, is reflected immediately without a manual refresh. */
export function subscribeBusinessProfile(uid, callback, onError) {
  if (!uid) { callback(null); return () => {}; }
  return onSnapshot(
    doc(db, BUSINESS_PROFILES, uid),
    (snap) => callback(snap.exists() ? snap.data() : null),
    onError
  );
}

/** Owner edits their own business display fields (name, logo, description,
 * category) - freely self-editable, unlike isBusinessProfile itself. Only
 * meaningful once an admin has granted Business Profile status (the
 * businessProfiles/{uid} doc won't exist before that), so screens should
 * gate the edit UI on profile.isBusinessProfile, not enforce it here. */
export async function updateBusinessDetails(uid, patch) {
  if (!uid || !patch || Object.keys(patch).length === 0) return;
  const clean = {};
  Object.keys(patch).forEach((k) => {
    clean[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
  });
  await updateDoc(doc(db, BUSINESS_PROFILES, uid), clean);
}

/** Admin: live list of every businessProfiles doc that has ever been
 * created (i.e. every user who has been granted Business Profile status
 * at least once, including since-revoked ones) - used by the Admin Panel
 * > Business Profiles screen to show current status next to each user it
 * lists. Small collection (one doc per business, not per listing), so no
 * pagination - same "just read the whole thing" choice as
 * subscribeAllUsers in userManagementService.js. */
export function subscribeAllBusinessProfiles(callback, onError) {
  return onSnapshot(
    collection(db, BUSINESS_PROFILES),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Admin: grants or revokes Business Profile status for a user. See
 * functions/businessProfileService.js - this is the only path that can
 * ever flip isBusinessProfile, and the only thing that creates the doc
 * the first time a business is granted. */
export async function setBusinessProfileStatus(targetUid, granted) {
  const fn = httpsCallable(functions, 'setBusinessProfileStatus');
  await fn({ targetUid, granted });
}
