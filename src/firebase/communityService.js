// Marketplace "Community" module (PRD section 9) - Jobs / Events /
// Lost & Found / Emergency notices / Community news posts, with
// like/comment/share/report, layered on top of the existing MySheba
// account system. Mirrors roommateService.js's pattern (no photo field
// is required by the PRD, but Lost & Found and Events posts clearly
// benefit from one, so - like marketplaceService.js - images[] is
// optional and uploaded after the post doc exists).
//
// Data model:
//   communityPosts/{postId}
//     authorId, authorName, authorRole,
//     type: 'job' | 'event' | 'lostfound' | 'emergency' | 'news',
//     title, description, images[] (Storage download URLs), location,
//     status: 'active' | 'closed' | 'hidden'  (hidden = auto-moderated,
//       see functions/index.js onCommunityReportCreated - EXCEPT
//       type:'emergency' posts, which are exempt from the automatic
//       threshold and can only be set to 'hidden' by an admin from
//       MarketplaceModerationScreen; closed = poster marked it resolved -
//       job filled, item found, event over),
//     likeCount, commentCount, reportCount, createdAt, updatedAt
//   communityLikes/{uid_postId}
//     uid, postId, createdAt
//   communityComments/{commentId}
//     postId, authorId, authorName, text, createdAt
//   communityReports/{reportId}
//     postId, postTitle, reporterId, reason, note, createdAt
//
// likeCount/commentCount are bumped client-side with a plain increment()
// (not a Cloud Function trigger) - same reasoning as serviceReviews'
// ratingSum/ratingCount in serviceReviewService.js: neither is a
// moderation gate an adversarial write could defeat, so there's no need
// for the server-trusted-increment pattern reportCount uses.
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { computeGeohash } from '../utils/geo';

const POSTS = 'communityPosts';
const LIKES = 'communityLikes';
const COMMENTS = 'communityComments';
const REPORTS = 'communityReports';

// Matches the PRD's Community "Post Types" list (section 9).
export const POST_TYPES = [
  { key: 'job', label: 'Jobs', icon: '💼' },
  { key: 'event', label: 'Events', icon: '🎉' },
  { key: 'lostfound', label: 'Lost & Found', icon: '🔍' },
  { key: 'emergency', label: 'Emergency', icon: '🚨' },
  { key: 'news', label: 'News', icon: '📰' },
];
export const REPORT_REASONS = ['Spam', 'Fake or misleading', 'Offensive content', 'Inappropriate for community'];

const MAX_FEED = 200; // client-side type/search filtering happens over this recent window - see note in CommunityHomeScreen.

/** Creates a post doc (images added afterward once uploaded, same two-step
 * flow as marketplaceService.createListing). Returns the new post id.
 *
 * Next Update PRD §2/§3 - `country` tags the post with the author's home
 * country/region (author.country, e.g. profile.country from AppContext) at
 * post time, so a country-first homepage (SocialHomeScreen.js) can prefer
 * region-tagged posts. Left null for authors with no country set (treated
 * as global, same as the PRD's "Content without a country/region remains
 * global and can be shown across regions") - existing callers that don't
 * pass author.country are unaffected. */
export async function createPost(author, data) {
  const ref = await addDoc(collection(db, POSTS), {
    authorId: author.uid,
    authorName: author.name || '',
    authorRole: author.role || '',
    country: author.country || null,
    type: data.type,
    title: (data.title || '').trim(),
    description: (data.description || '').trim(),
    images: [],
    location: (data.location || '').trim(),
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    geohash: computeGeohash(data.latitude, data.longitude),
    status: 'active',
    likeCount: 0,
    commentCount: 0,
    reportCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Sets the final image URL list on a post once uploads finish. */
export async function setPostImages(postId, images) {
  await updateDoc(doc(db, POSTS, postId), { images, updatedAt: serverTimestamp() });
}

/** Author-only edit of a post's fields. */
export async function updatePost(postId, patch) {
  await updateDoc(doc(db, POSTS, postId), { ...patch, updatedAt: serverTimestamp() });
}

export async function setPostStatus(postId, status) {
  await updateDoc(doc(db, POSTS, postId), { status, updatedAt: serverTimestamp() });
}

export async function deletePost(postId) {
  await deleteDoc(doc(db, POSTS, postId));
}

export async function getPost(postId) {
  const snap = await getDoc(doc(db, POSTS, postId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live single-post subscription - used by the detail screen so a like
 * or "mark as resolved" from another device shows up live. */
export function subscribePost(postId, callback, onError) {
  return onSnapshot(doc(db, POSTS, postId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

/** Live feed of active posts, most recent first, capped at MAX_FEED.
 * Type/text filtering happens client-side over this window (see
 * CommunityHomeScreen) rather than needing a composite index. */
export function subscribeActivePosts(callback, onError) {
  const q = query(collection(db, POSTS), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(MAX_FEED));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** Live list of one author's own posts (any status), most recent first. */
export function subscribeMyPosts(uid, callback, onError) {
  const q = query(collection(db, POSTS), where('authorId', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// ---- Likes ----

function likeId(uid, postId) {
  return `${uid}_${postId}`;
}

export async function likePost(uid, postId) {
  await setDoc(doc(db, LIKES, likeId(uid, postId)), { uid, postId, createdAt: serverTimestamp() });
  await updateDoc(doc(db, POSTS, postId), { likeCount: increment(1), updatedAt: serverTimestamp() });
}

export async function unlikePost(uid, postId) {
  await deleteDoc(doc(db, LIKES, likeId(uid, postId)));
  await updateDoc(doc(db, POSTS, postId), { likeCount: increment(-1), updatedAt: serverTimestamp() });
}

export async function isPostLiked(uid, postId) {
  const snap = await getDoc(doc(db, LIKES, likeId(uid, postId)));
  return snap.exists();
}

// ---- Comments ----

/** Adds a comment and bumps the post's commentCount - see file header for
 * why this is a plain client increment rather than a Cloud Function. */
export async function addComment(postId, author, text) {
  await addDoc(collection(db, COMMENTS), {
    postId,
    authorId: author.uid,
    authorName: author.name || '',
    text: (text || '').trim(),
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, POSTS, postId), { commentCount: increment(1), updatedAt: serverTimestamp() });
}

/** Live list of every comment on a post. Filters by postId only (no
 * orderBy in the query, sorted client-side) - same trick
 * serviceReviewService.subscribeProviderReviews uses to avoid needing a
 * composite index. */
export function subscribeComments(postId, callback, onError) {
  const q = query(collection(db, COMMENTS), where('postId', '==', postId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}

// ---- Reports ----

/** Files a report on a post. functions/index.js's onCommunityReportCreated
 * bumps the post's reportCount server-side and auto-hides it past the
 * threshold for every post type except 'emergency', which is exempt and
 * relies on admin manual review instead - see that function's comment for
 * why. The client never writes reportCount or status directly either way. */
export async function reportPost(postId, postTitle, reporterId, reason, note) {
  await addDoc(collection(db, REPORTS), {
    postId,
    postTitle: postTitle || '',
    reporterId,
    reason,
    note: (note || '').trim(),
    createdAt: serverTimestamp(),
  });
}
