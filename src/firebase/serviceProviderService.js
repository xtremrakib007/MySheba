// Marketplace "Local Services" module (Phase 2 of the Marketplace PRD,
// section 8) - service-provider profiles layered on top of the existing
// MySheba account system, mirroring accommodationService.js's pattern.
// Unlike Buy & Sell / Accommodation, PRD section 8 has a single profile
// photo rather than a gallery, so this stores `photo` (one Storage
// download URL) instead of `images[]`.
//
// Data model:
//   serviceProviders/{providerId}
//     ownerId, ownerName, ownerRole,
//     category ('Cleaning' | 'Moving' | 'Driver' | 'Repair' | 'Food Catering'
//       | 'Translation' | 'Tuition' | 'Freelance'),
//     name, description, photo (Storage download URL, or ''),
//     priceMin, priceMax, serviceArea, availability,
//     status: 'active' | 'hidden'  (hidden = auto-moderated, see
//       functions/index.js onServiceProviderReportCreated),
//     reportCount,
//     ratingSum, ratingCount  (denormalized - see serviceReviewService.js;
//       ratingAvg() below derives the average from these two so no screen
//       has to redo the division itself),
//     createdAt, updatedAt
//   serviceProviderReports/{reportId}
//     providerId, providerName, reporterId, reason, note, createdAt
//
// "Message" (PRD's Local Services > Provider Profile > contact) reuses the
// app's existing general-purpose Direct Chat
// (src/firebase/directChatService.js) - see ServiceProviderDetailScreen's
// messageProvider - so there's no separate local-services chat collection
// or screen. The lead-form side of contact ("Request Service") is
// serviceRequestService.js instead, a separate module.
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
import { computeGeohash } from '../utils/geo';
import { fetchBusinessProfile } from './businessProfileService';

const PROVIDERS = 'serviceProviders';
const REPORTS = 'serviceProviderReports';

// Matches the PRD's Local Services category list.
export const CATEGORIES = ['Cleaning', 'Moving', 'Driver', 'Repair', 'Food Catering', 'Translation', 'Tuition', 'Freelance'];
export const REPORT_REASONS = ['Fake or scam', 'No longer available / spam', 'Misleading info', 'Offensive content'];

const MAX_FEED = 200; // client-side search/filter operates over this recent window - see note in ServiceProvidersHomeScreen.

/** Average rating (1-5) from the provider's denormalized ratingSum/
 * ratingCount, or null if it has no reviews yet - screens use this instead
 * of computing the division themselves. */
export function ratingAvg(provider) {
  if (!provider || !provider.ratingCount) return null;
  return provider.ratingSum / provider.ratingCount;
}

/** Creates a service-provider profile doc (photo added afterward once
 * uploaded, if any - Storage rules for service-provider-images/{providerId}
 * check the provider doc already exists and is owned by the caller).
 * Returns the new provider id. ownerIsBusiness is a denormalized snapshot
 * of the owner's Business Profile status at creation time (PRD section
 * 15), same pattern as accommodationService.createProperty's
 * ownerIsBusiness - lets ServiceProvidersHomeScreen's feed cards show the
 * "🏢 Business" badge without a live subscription per card. */
export async function createProvider(owner, data) {
  const biz = await fetchBusinessProfile(owner.uid);
  const ref = await addDoc(collection(db, PROVIDERS), {
    ownerId: owner.uid,
    ownerName: owner.name || '',
    ownerRole: owner.role || '',
    ownerIsBusiness: !!biz?.isBusinessProfile,
    category: data.category,
    name: (data.name || '').trim(),
    description: (data.description || '').trim(),
    photo: '',
    priceMin: Number(data.priceMin) || 0,
    priceMax: Number(data.priceMax) || 0,
    serviceArea: (data.serviceArea || '').trim(),
    availability: (data.availability || '').trim(),
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    geohash: computeGeohash(data.latitude, data.longitude),
    status: 'active',
    reportCount: 0,
    ratingSum: 0,
    ratingCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Sets the final photo URL on a provider once the upload finishes. */
export async function setProviderPhoto(providerId, photo) {
  await updateDoc(doc(db, PROVIDERS, providerId), { photo, updatedAt: serverTimestamp() });
}

/** Owner-only edit of a provider's fields. */
export async function updateProvider(providerId, patch) {
  await updateDoc(doc(db, PROVIDERS, providerId), { ...patch, updatedAt: serverTimestamp() });
}

export async function setProviderStatus(providerId, status) {
  await updateDoc(doc(db, PROVIDERS, providerId), { status, updatedAt: serverTimestamp() });
}

export async function deleteProvider(providerId) {
  await deleteDoc(doc(db, PROVIDERS, providerId));
}

export async function getProvider(providerId) {
  const snap = await getDoc(doc(db, PROVIDERS, providerId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Live single-provider subscription - used by the detail screen so a
 * price edit, "hide listing", or a new review's rating tally from another
 * device shows up live. */
export function subscribeProvider(providerId, callback, onError) {
  return onSnapshot(doc(db, PROVIDERS, providerId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, onError);
}

/** Live feed of active service providers, most recent first, capped at
 * MAX_FEED. Category/text search filters client-side over this window
 * (see ServiceProvidersHomeScreen) rather than needing a separate search
 * index. */
export function subscribeActiveProviders(callback, onError) {
  const q = query(collection(db, PROVIDERS), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(MAX_FEED));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

/** Live list of one owner's own service-provider profiles (any status),
 * most recent first. */
export function subscribeMyProviders(uid, callback, onError) {
  const q = query(collection(db, PROVIDERS), where('ownerId', '==', uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

// ---- Reports ----

/** Files a report on a service provider. functions/index.js's
 * onServiceProviderReportCreated bumps the provider's reportCount
 * server-side and auto-hides it past the threshold - the client never
 * writes reportCount directly. */
export async function reportProvider(providerId, providerName, reporterId, reason, note) {
  await addDoc(collection(db, REPORTS), {
    providerId,
    providerName: providerName || '',
    reporterId,
    reason,
    note: (note || '').trim(),
    createdAt: serverTimestamp(),
  });
}
