// Marketplace "Buy & Sell" module - seller reviews & ratings (sitemap's
// "Leave Review" step after "Complete Transaction"). Mirrors
// serviceReviewService.js's pattern (one review per reviewer/seller pair,
// editable in place) with one difference: Local Services has a single
// provider profile doc to hold ratingSum/ratingCount on, but a Buy & Sell
// seller is just a uid with many listings and no profile doc of its own -
// so the aggregate lives in a small dedicated marketplaceSellerStats/{uid}
// doc instead, one per seller, created on that seller's first review.
//
// Data model:
//   marketplaceReviews/{uid_sellerId}
//     reviewerId, reviewerName, sellerId,
//     rating (1-5), comment,
//     createdAt, updatedAt
//   marketplaceSellerStats/{sellerId}
//     sellerId, ratingSum, ratingCount, updatedAt
//
// Same reasoning as serviceReviewService.js's header comment for why this
// is a client-side transaction rather than a Cloud Function: nothing here
// is a moderation gate an adversarial write could defeat, so there's no
// need for the server-trusted-increment pattern reportCount uses. See
// firestore.rules for the exact write constraints on both collections.
import {
  collection,
  doc,
  runTransaction,
  getDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

const REVIEWS = 'marketplaceReviews';
const STATS = 'marketplaceSellerStats';

function reviewId(uid, sellerId) {
  return `${uid}_${sellerId}`;
}

/** Derives the average rating from a stats doc, or null if it has no
 * reviews yet - same shape as serviceProviderService.ratingAvg. */
export function ratingAvg(stats) {
  if (!stats || !stats.ratingCount) return null;
  return stats.ratingSum / stats.ratingCount;
}

/** Submits (or edits, if the reviewer already reviewed this seller) a 1-5
 * star review with an optional comment. Runs as a transaction so the
 * review write and the seller's ratingSum/ratingCount update land
 * together - an edit removes the old rating from the sum before adding
 * the new one, so ratingAvg() never double-counts a change of mind. */
export async function submitReview(reviewer, sellerId, rating, comment) {
  if (reviewer.uid === sellerId) throw new Error("You can't review your own listing.");

  const id = reviewId(reviewer.uid, sellerId);
  const reviewRef = doc(db, REVIEWS, id);
  const statsRef = doc(db, STATS, sellerId);

  await runTransaction(db, async (tx) => {
    const [reviewSnap, statsSnap] = await Promise.all([tx.get(reviewRef), tx.get(statsRef)]);

    const prevRating = reviewSnap.exists() ? reviewSnap.data().rating || 0 : 0;
    const stats = statsSnap.exists() ? statsSnap.data() : { ratingSum: 0, ratingCount: 0 };
    const ratingSum = (stats.ratingSum || 0) - prevRating + rating;
    const ratingCount = (stats.ratingCount || 0) + (reviewSnap.exists() ? 0 : 1);

    tx.set(reviewRef, {
      reviewerId: reviewer.uid,
      reviewerName: reviewer.name || '',
      sellerId,
      rating,
      comment: (comment || '').trim(),
      createdAt: reviewSnap.exists() ? reviewSnap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.set(statsRef, { sellerId, ratingSum, ratingCount, updatedAt: serverTimestamp() }, { merge: true });
  });
}

/** The signed-in user's own review of a seller, or null if they haven't
 * reviewed them yet - used to pre-fill "Your review" vs "Leave a review". */
export async function getMyReview(uid, sellerId) {
  const snap = await getDoc(doc(db, REVIEWS, reviewId(uid, sellerId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live list of every review on a seller, most recent first. Filters by
 * sellerId only (no orderBy in the query, sorted client-side) - same
 * trick serviceReviewService.subscribeProviderReviews uses to avoid
 * needing a composite index. */
export function subscribeSellerReviews(sellerId, callback, onError) {
  const q = query(collection(db, REVIEWS), where('sellerId', '==', sellerId));
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

/** Live list of every review the signed-in user has written on sellers
 * (i.e. reviews they gave, not received), most recent first. Used by the
 * "My Reviews" screen (My Marketplace) - see PRD section 11. Reviews
 * *received* as a seller are already covered by subscribeSellerReviews(uid),
 * since sellerId on this collection is the seller's own uid. */
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

/** Live subscription to a seller's rating aggregate - used for the star
 * average shown on ListingDetailScreen. Resolves to null (no doc yet)
 * until the seller's first review lands. */
export function subscribeSellerStats(sellerId, callback, onError) {
  return onSnapshot(doc(db, STATS, sellerId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}
