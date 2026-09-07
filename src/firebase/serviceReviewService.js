// Marketplace "Local Services" module (Phase 2 of the Marketplace PRD,
// section 8) - reviews on a service-provider profile. One review per
// (reviewer, provider) pair, editable in place - not a new doc per edit.
//
// Data model:
//   serviceReviews/{uid_providerId}
//     reviewerId, reviewerName, providerId,
//     rating (1-5), comment,
//     createdAt, updatedAt
//
// The provider doc's ratingSum/ratingCount (see serviceProviderService.js
// createProvider, and ratingAvg() there) are kept in sync from here rather
// than via a Cloud Function trigger: unlike reportCount, nothing here is a
// moderation gate an adversarial write could defeat, so there's no need
// for the server-trusted-increment pattern onMarketplaceReportCreated /
// onAccommodationReportCreated / onRoommateReportCreated use. Firestore
// rules instead just constrain a serviceReviews write to the caller's own
// reviewerId and require it to carry a matching ratingDelta the provider
// update applies - see firestore.rules for the exact check.
import {
  collection,
  doc,
  runTransaction,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

const REVIEWS = 'serviceReviews';
const PROVIDERS = 'serviceProviders';

function reviewId(uid, providerId) {
  return `${uid}_${providerId}`;
}

/** Submits (or edits, if the reviewer already reviewed this provider) a
 * 1-5 star review with an optional comment. Runs as a transaction so the
 * review write and the provider's ratingSum/ratingCount update land
 * together - an edit removes the old rating from the sum before adding
 * the new one, so ratingAvg() never double-counts a change of mind. */
export async function submitReview(reviewer, providerId, rating, comment) {
  const id = reviewId(reviewer.uid, providerId);
  const reviewRef = doc(db, REVIEWS, id);
  const providerRef = doc(db, PROVIDERS, providerId);

  await runTransaction(db, async (tx) => {
    const [reviewSnap, providerSnap] = await Promise.all([tx.get(reviewRef), tx.get(providerRef)]);
    if (!providerSnap.exists()) throw new Error('This service is no longer available.');

    const prevRating = reviewSnap.exists() ? reviewSnap.data().rating || 0 : 0;
    const provider = providerSnap.data();
    const ratingSum = (provider.ratingSum || 0) - prevRating + rating;
    const ratingCount = (provider.ratingCount || 0) + (reviewSnap.exists() ? 0 : 1);

    tx.set(reviewRef, {
      reviewerId: reviewer.uid,
      reviewerName: reviewer.name || '',
      providerId,
      rating,
      comment: (comment || '').trim(),
      createdAt: reviewSnap.exists() ? reviewSnap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.update(providerRef, { ratingSum, ratingCount, updatedAt: serverTimestamp() });
  });
}

/** The signed-in user's own review of a provider, or null if they haven't
 * reviewed it yet - used to pre-fill "Your review" vs "Leave a review". */
export async function getMyReview(uid, providerId) {
  const snap = await getDoc(doc(db, REVIEWS, reviewId(uid, providerId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live list of every review on a provider, most recent first. */
export function subscribeProviderReviews(providerId, callback, onError) {
  const q = query(collection(db, REVIEWS), where('providerId', '==', providerId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}

/** Live list of every review the signed-in user has written on service
 * providers (i.e. reviews they gave, not received), most recent first.
 * Used by the "My Reviews" screen (My Marketplace) - see PRD section 11. */
export function subscribeMyReviews(uid, callback, onError) {
  const q = query(collection(db, REVIEWS), where('reviewerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}

/** Live reviews received across a set of provider ids (e.g. every profile
 * the signed-in user owns), most recent first. Firestore's `in` operator
 * caps at 10 values - fine here since a user owning >10 service-provider
 * profiles isn't a real scenario for this app. Pass an empty array to get
 * an empty list back without a network round-trip. */
export function subscribeReviewsForProviders(providerIds, callback, onError) {
  if (!providerIds || providerIds.length === 0) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, REVIEWS), where('providerId', 'in', providerIds.slice(0, 10)));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}
