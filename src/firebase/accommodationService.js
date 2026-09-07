// Marketplace "Accommodation" module (Phase 2 of the Marketplace PRD) -
// room/apartment/bed-space listings layered on top of the existing MySheba
// account system, mirroring marketplaceService.js's Buy & Sell pattern.
//
// Data model:
//   properties/{propertyId}
//     ownerId, ownerName, ownerRole,
//     listingType ('Room' | 'Bed Space' | 'Apartment' | 'House' | 'Hostel'),
//     title, description, images[] (Storage download URLs),
//     monthlyRent, deposit, availableDate, location, facilities[],
//     status: 'active' | 'rented' | 'hidden'  (hidden = auto-moderated, see
//       functions/index.js onAccommodationReportCreated),
//     reportCount, createdAt, updatedAt
//   propertySaves/{uid_propertyId}
//     uid, propertyId, createdAt, plus a small denormalized snapshot
//     (title, monthlyRent, image, ownerId) so "Saved Items" can render as
//     one query with no per-item follow-up read.
//   propertyReports/{reportId}
//     propertyId, propertyTitle, reporterId, reason, note, createdAt
//
// Chat with the owner reuses the app's existing general-purpose Direct
// Chat (src/firebase/directChatService.js) - see PropertyDetailScreen's
// chatOwner - so there's no separate accommodation chat collection or
// screen.
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
import { db } from './config';
import { fetchBusinessProfile } from './businessProfileService';
import { computeGeohash } from '../utils/geo';

const PROPERTIES = 'properties';
const SAVES = 'propertySaves';
const REPORTS = 'propertyReports';

// Matches the PRD's Accommodation property types / facilities lists.
export const LISTING_TYPES = ['Room', 'Bed Space', 'Apartment', 'House', 'Hostel'];
export const FACILITIES = ['WiFi', 'Parking', 'Kitchen', 'Air Conditioning', 'Washing Machine'];
export const REPORT_REASONS = ['Fake or scam', 'Already rented / spam', 'Misleading photos', 'Offensive content'];

const MAX_FEED = 200; // client-side search/filter operates over this recent window - see note in AccommodationHomeScreen.

/** Creates a property doc (images added afterward once uploaded - Storage
 * rules for accommodation-images/{propertyId} check the property already
 * exists and is owned by the caller). Returns the new property id.
 * ownerIsBusiness is a denormalized snapshot of the owner's Business
 * Profile status at listing-creation time (PRD section 15), same pattern
 * as marketplaceListings.sellerIsBusiness - firestore.rules re-checks it
 * against the caller's real businessProfiles/{uid} doc server-side, and
 * it's what lets AccommodationHomeScreen's feed cards show the "🏢
 * Business" badge without a live subscription per card. It's a snapshot,
 * not live: a Business Profile granted/revoked after this property was
 * posted won't retroactively update it. */
export async function createProperty(owner, data) {
  const biz = await fetchBusinessProfile(owner.uid);
  const ref = await addDoc(collection(db, PROPERTIES), {
    ownerId: owner.uid,
    ownerName: owner.name || '',
    ownerRole: owner.role || '',
    ownerIsBusiness: !!biz?.isBusinessProfile,
    listingType: data.listingType,
    title: (data.title || '').trim(),
    description: (data.description || '').trim(),
    images: [],
    monthlyRent: Number(data.monthlyRent) || 0,
    deposit: Number(data.deposit) || 0,
    availableDate: (data.availableDate || '').trim(),
    location: (data.location || '').trim(),
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    geohash: computeGeohash(data.latitude, data.longitude),
    facilities: data.facilities || [],
    status: 'active',
    reportCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Sets the final image URL list on a property once uploads finish. */
export async function setPropertyImages(propertyId, images) {
  await updateDoc(doc(db, PROPERTIES, propertyId), { images, updatedAt: serverTimestamp() });
}

/** Owner-only edit of a property's fields. */
export async function updateProperty(propertyId, patch) {
  await updateDoc(doc(db, PROPERTIES, propertyId), { ...patch, updatedAt: serverTimestamp() });
}

export async function setPropertyStatus(propertyId, status) {
  await updateDoc(doc(db, PROPERTIES, propertyId), { status, updatedAt: serverTimestamp() });
}

export async function deleteProperty(propertyId) {
  await deleteDoc(doc(db, PROPERTIES, propertyId));
}

export async function getProperty(propertyId) {
  const snap = await getDoc(doc(db, PROPERTIES, propertyId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live single-property subscription - used by the detail screen so a
 * rent edit or "mark as rented" from another device shows up live. */
export function subscribeProperty(propertyId, callback, onError) {
  return onSnapshot(doc(db, PROPERTIES, propertyId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

/** Live feed of active properties, most recent first, capped at MAX_FEED.
 * Listing-type/text search filters client-side over this window (see
 * AccommodationHomeScreen) rather than needing a separate search index. */
export function subscribeActiveProperties(callback, onError) {
  const q = query(collection(db, PROPERTIES), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(MAX_FEED));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** Live list of one owner's own properties (any status), most recent first. */
export function subscribeMyProperties(uid, callback, onError) {
  const q = query(collection(db, PROPERTIES), where('ownerId', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// ---- Saved properties ----

function saveId(uid, propertyId) {
  return `${uid}_${propertyId}`;
}

export async function saveProperty(uid, property) {
  await setDoc(doc(db, SAVES, saveId(uid, property.id)), {
    uid,
    propertyId: property.id,
    title: property.title || '',
    monthlyRent: property.monthlyRent || 0,
    image: (property.images && property.images[0]) || '',
    ownerId: property.ownerId || '',
    createdAt: serverTimestamp(),
  });
}

export async function unsaveProperty(uid, propertyId) {
  await deleteDoc(doc(db, SAVES, saveId(uid, propertyId)));
}

export async function isPropertySaved(uid, propertyId) {
  const snap = await getDoc(doc(db, SAVES, saveId(uid, propertyId)));
  return snap.exists();
}

/** Live list of a user's saved properties, most recent first. */
export function subscribeMySaved(uid, callback, onError) {
  const q = query(collection(db, SAVES), where('uid', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// ---- Reports ----

/** Files a report on a property. functions/index.js's
 * onAccommodationReportCreated bumps the property's reportCount
 * server-side and auto-hides it past the threshold - the client never
 * writes reportCount directly. */
export async function reportProperty(propertyId, propertyTitle, reporterId, reason, note) {
  await addDoc(collection(db, REPORTS), {
    propertyId,
    propertyTitle: propertyTitle || '',
    reporterId,
    reason,
    note: (note || '').trim(),
    createdAt: serverTimestamp(),
  });
}
