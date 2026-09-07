// Next Update PRD §3 - Social Feed (Facebook-style general posts), distinct
// from the existing Community module (communityService.js - typed
// Jobs/Events/Lost&Found/Emergency/News posts). This mirrors communityService
// exactly (same like/comment/share/report shape, same client-side country
// filter over one live subscription, same client-incremented counters and
// server-trusted reportCount) but for a single untyped feed of general posts -
// see CreateSocialPostScreen.js / SocialFeedScreen.js / SocialPostDetailScreen.js.
//
// Data model:
//   socialPosts/{postId}
//     authorId, authorName, authorRole, country,
//     text, images[] (Storage download URLs),
//     status: 'active' | 'hidden'  (hidden = auto-moderated past the report
//       threshold, see functions/index.js onSocialReportCreated - no
//       'closed' status here, unlike Community: a general post has nothing
//       to mark resolved),
//     likeCount, commentCount, shareCount, reportCount, createdAt, updatedAt
//   socialLikes/{uid_postId}
//     uid, postId, createdAt
//   socialComments/{commentId}
//     postId, authorId, authorName, text, createdAt
//   socialReports/{reportId}
//     postId, postText, reporterId, reason, note, createdAt
//
// likeCount/commentCount/shareCount are bumped client-side with a plain
// increment() - same reasoning as communityService: none of the three is a
// moderation gate an adversarial write could defeat. reportCount is the one
// exception, incremented only by the onSocialReportCreated trigger below.
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

const POSTS = 'socialPosts';
const LIKES = 'socialLikes';
const COMMENTS = 'socialComments';
const REPORTS = 'socialReports';

export const REPORT_REASONS = ['Spam', 'Fake or misleading', 'Offensive content', 'Harassment or bullying'];

const MAX_FEED = 200; // client-side global/country filtering happens over this recent window, same as communityService - avoids a composite index on status+country.

/** Creates a post doc (images added afterward once uploaded, same two-step
 * flow as communityService.createPost / marketplaceService.createListing).
 * Returns the new post id.
 *
 * country tags the post with the author's home country/region
 * (author.country, e.g. profile.country from AppContext) at post time, so
 * SocialFeedScreen's country mode can filter to it. Left null for authors
 * with no country set (treated as global, per PRD §2 - "Content without a
 * country/region remains global and can be shown across regions"). */
export async function createPost(author, data) {
  const ref = await addDoc(collection(db, POSTS), {
    authorId: author.uid,
    authorName: author.name || '',
    authorRole: author.role || '',
    country: author.country || null,
    text: (data.text || '').trim(),
    images: [],
    status: 'active',
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
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

export async function deletePost(postId) {
  await deleteDoc(doc(db, POSTS, postId));
}

export async function getPost(postId) {
  const snap = await getDoc(doc(db, POSTS, postId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Author/admin-only status change (e.g. admin hiding a post from
 * MarketplaceModerationScreen - see setStatus in REPORT_KINDS below). */
export async function setPostStatus(postId, status) {
  await updateDoc(doc(db, POSTS, postId), { status, updatedAt: serverTimestamp() });
}

/** Live single-post subscription - used by SocialPostDetailScreen so a like
 * or admin hide from another device shows up live. */
export function subscribePost(postId, callback, onError) {
  return onSnapshot(doc(db, POSTS, postId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

/** Live feed of active posts, most recent first, capped at MAX_FEED.
 * Global/country filtering happens client-side over this window (see
 * SocialFeedScreen's mode toggle) rather than needing a composite index. */
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

// ---- Shares ----

/** Bumps shareCount after the native share sheet completes (see
 * SocialPostDetailScreen.sharePost) - not a subcollection, just a counter,
 * since there's nothing per-share worth recording beyond the count. */
export async function recordShare(postId) {
  await updateDoc(doc(db, POSTS, postId), { shareCount: increment(1), updatedAt: serverTimestamp() });
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

/** Live list of every comment on a post. Filters by postId only (no orderBy
 * in the query, sorted client-side) - same trick communityService.
 * subscribeComments uses to avoid needing a composite index. */
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

/** Files a report on a post. functions/index.js's onSocialReportCreated
 * bumps the post's reportCount server-side and auto-hides it past the
 * threshold. The client never writes reportCount or status directly. */
export async function reportPost(postId, postText, reporterId, reason, note) {
  await addDoc(collection(db, REPORTS), {
    postId,
    postText: postText || '',
    reporterId,
    reason,
    note: (note || '').trim(),
    createdAt: serverTimestamp(),
  });
}
