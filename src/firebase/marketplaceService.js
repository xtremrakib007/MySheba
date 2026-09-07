// Marketplace "Buy & Sell" module (Phase 1 of the Marketplace PRD) - a
// community classifieds board layered on top of the existing MySheba
// account system. Any signed-in account (customer/dealer/dealer/
// admin/superadmin) can list an item or browse/buy.
//
// Data model:
//   marketplaceListings/{listingId}
//     sellerId, sellerName, sellerRole,
//     title, category, description, images[] (Storage download URLs),
//     price, negotiable, condition, location,
//     status: 'active' | 'sold' | 'hidden'  (hidden = auto-moderated, see
//       functions/index.js onMarketplaceReportCreated),
//     reportCount, createdAt, updatedAt
//   marketplaceSaves/{uid_listingId}
//     uid, listingId, createdAt, plus a small denormalized snapshot
//     (title, price, image, sellerId) so "Saved Items" can render as one
//     query with no per-item follow-up read.
//   marketplaceReports/{reportId}
//     listingId, listingTitle, reporterId, reason, note, createdAt
//
// Chat with the seller reuses the app's existing general-purpose Direct
// Chat (src/firebase/directChatService.js) - see openListingChat below -
// so there's no separate marketplace chat collection or screen.
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { computeGeohash } from '../utils/geo';
import { logActivity, logError } from './logService';
import { fetchBusinessProfile } from './businessProfileService';

const LISTINGS = 'marketplaceListings';
const SAVES = 'marketplaceSaves';
const REPORTS = 'marketplaceReports';

// Matches the PRD's Buy & Sell category list.
export const CATEGORIES = ['Electronics', 'Mobile Phones', 'Computers', 'Vehicles', 'Furniture', 'Appliances', 'Clothing', 'Other'];
export const CONDITIONS = ['New', 'Like New', 'Good', 'Fair'];
export const REPORT_REASONS = ['Fake or scam', 'Prohibited item', 'Offensive content', 'Already sold / spam'];

const MAX_FEED = 200; // client-side search/filter operates over this recent window - see note in MarketplaceHomeScreen.

/** Creates a listing doc (images added afterward once uploaded - Storage
 * rules for marketplace-images/{listingId} check the listing already
 * exists and is owned by the caller). Returns the new listing id.
 * `seller.verified` (the caller's own users/{uid}.verified) is snapshotted
 * onto the listing as sellerVerified for the "Verified" badge (Phase 3) -
 * firestore.rules checks this against the caller's real profile
 * server-side, so it can't be spoofed. Like sellerName/sellerRole, it's a
 * snapshot: a badge earned after this listing was posted won't
 * retroactively appear on it. sellerIsBusiness is the same idea for the
 * "🏢 Business" badge (PRD section 15) - fetched here (rather than passed
 * in like `verified` is) since callers don't otherwise load
 * businessProfiles/{uid}, and firestore.rules re-checks it server-side the
 * same way. Denormalizing this onto the listing, instead of only the live
 * per-uid lookup ListingDetailScreen does, is what lets the feed cards
 * (MarketplaceHomeScreen) show the badge without a subscription per card. */
export async function createListing(seller, data) {
  const biz = await fetchBusinessProfile(seller.uid);
  const ref = await addDoc(collection(db, LISTINGS), {
    sellerId: seller.uid,
    sellerName: seller.name || '',
    sellerRole: seller.role || '',
    sellerVerified: !!seller.verified,
    sellerIsBusiness: !!biz?.isBusinessProfile,
    title: (data.title || '').trim(),
    category: data.category,
    description: (data.description || '').trim(),
    images: [],
    price: Number(data.price) || 0,
    negotiable: !!data.negotiable,
    condition: data.condition,
    location: (data.location || '').trim(),
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    geohash: computeGeohash(data.latitude, data.longitude),
    status: 'active',
    reportCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Sets the final image URL list on a listing once uploads finish. */
export async function setListingImages(listingId, images) {
  await updateDoc(doc(db, LISTINGS, listingId), { images, updatedAt: serverTimestamp() });
}

/** Seller-only edit of a listing's fields. */
export async function updateListing(listingId, patch) {
  await updateDoc(doc(db, LISTINGS, listingId), { ...patch, updatedAt: serverTimestamp() });
}

export async function setListingStatus(listingId, status) {
  await updateDoc(doc(db, LISTINGS, listingId), { status, updatedAt: serverTimestamp() });
}

export async function deleteListing(listingId) {
  await deleteDoc(doc(db, LISTINGS, listingId));
}

export async function getListing(listingId) {
  const snap = await getDoc(doc(db, LISTINGS, listingId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live single-listing subscription - used by the detail screen so a
 * price edit or "mark as sold" from another device shows up live. */
export function subscribeListing(listingId, callback, onError) {
  return onSnapshot(doc(db, LISTINGS, listingId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

/** Live feed of active listings, most recent first, capped at MAX_FEED.
 * Category/text search filters client-side over this window (see
 * MarketplaceHomeScreen) rather than needing a separate search index. */
export function subscribeActiveListings(callback, onError) {
  const q = query(collection(db, LISTINGS), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(MAX_FEED));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** Live list of one seller's own listings (any status), most recent first. */
export function subscribeMyListings(uid, callback, onError) {
  const q = query(collection(db, LISTINGS), where('sellerId', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// ---- Saved items ----

function saveId(uid, listingId) {
  return `${uid}_${listingId}`;
}

export async function saveListing(uid, listing) {
  await setDoc(doc(db, SAVES, saveId(uid, listing.id)), {
    uid,
    listingId: listing.id,
    title: listing.title || '',
    price: listing.price || 0,
    image: (listing.images && listing.images[0]) || '',
    sellerId: listing.sellerId || '',
    createdAt: serverTimestamp(),
  });
}

export async function unsaveListing(uid, listingId) {
  await deleteDoc(doc(db, SAVES, saveId(uid, listingId)));
}

export async function isListingSaved(uid, listingId) {
  const snap = await getDoc(doc(db, SAVES, saveId(uid, listingId)));
  return snap.exists();
}

/** Live list of a user's saved listings, most recent first. */
export function subscribeMySaved(uid, callback, onError) {
  const q = query(collection(db, SAVES), where('uid', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// ---- Reports ----

/** Files a report on a listing. functions/index.js's onMarketplaceReportCreated
 * bumps the listing's reportCount server-side and auto-hides it past the
 * threshold - the client never writes reportCount directly. */
export async function reportListing(listingId, listingTitle, reporterId, reason, note) {
  await addDoc(collection(db, REPORTS), {
    listingId,
    listingTitle: listingTitle || '',
    reporterId,
    reason,
    note: (note || '').trim(),
    createdAt: serverTimestamp(),
  });
}

// ---- Featured listings / boost (Phase 3 monetization) ----

/** True while a listing's boost is still running. `featuredUntil` is a
 * Firestore Timestamp (has .seconds) once set by boostListing. */
export function isFeatured(listing) {
  if (!listing || !listing.featured || !listing.featuredUntil) return false;
  const untilMs = listing.featuredUntil.seconds ? listing.featuredUntil.seconds * 1000 : listing.featuredUntil;
  return untilMs > Date.now();
}

/** Debits the caller's wallet and features the listing for
 * settings/pricing's listingBoostDurationDays - see the boostListing
 * Cloud Function (functions/walletService.js), the only path that's
 * actually allowed to flip `featured`/`featuredUntil` (firestore.rules
 * freezes both on any client write, same treatment as walletBalance). */
export async function boostListing(listingId) {
  const fn = httpsCallable(functions, 'boostListing');
  try {
    const { data } = await fn({ listingId });
    logActivity('listing_boosted', { listingId });
    return data;
  } catch (err) {
    logError('marketplaceService.boostListing', err);
    throw new Error(err.message || 'Could not boost this listing right now.');
  }
}
