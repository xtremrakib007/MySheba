// PHASE 1 FOUNDATION - MySheba Advertisement System.
//
// Generic Firestore CRUD for the ad system's "configuration" collections -
// advertisements, ad_campaigns, ad_advertisers, ad_placements, ad_packages.
// Same shape every other service file in this folder uses (compare
// modular calls against the shared `db` from ./config, no new Firebase
// initialization anywhere in this file.
//
// Responsibilities deliberately kept in their dedicated modules:
//  - targeting evaluation -> src/firebase/adTargetingService.js
//  - rotation/selection among matching ads -> src/firebase/adRotationService.js
//  - impression/click recording + frequency-cap enforcement -> src/firebase/adTrackingService.js
//  - creative upload for native/interstitial adTypes is implemented
//    below alongside the banner uploader; all three paths are protected by
//    storage.rules and limited to image creatives
//  - server-side authorization/audit policy - enforced by Firestore/Cloud Functions;
//  - ad_audit_logs writes for any action below - mirrors userAuditLog:
//    only a Cloud Function via the Admin SDK writes there (see
//    firestore.rules), so nothing in this client file can create an
//    audit entry no matter how it's called
//
// Every write function here requires the caller to already be a
// superadmin - firestore.rules is the actual enforcement (see its
// "PHASE 1 - Advertisement System" section), this file doesn't
// second-guess that, it just won't succeed for anyone rules would reject.
//
// PHASE 3 additions: the "banner-specific helpers" section below
// (subscribeBannerAdvertisements, getEffectiveAdStatus, activate/
// deactivate/pause/archiveAdvertisement), uploadBannerCreative/
// deleteBannerCreative (real Storage upload + Cloud-Function-routed
// delete), and validateClickUrl - built for BannerManagementScreen /
// BannerAdFormModal.js.

import {
  collection, doc, addDoc, getDoc, updateDoc, deleteDoc, setDoc,
  onSnapshot, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { db, storage, functions } from './config';
import { AD_COLLECTIONS, AD_STORAGE_PATHS } from '../constants/adCollections';
import { AD_STATUSES, AD_TYPES } from '../constants/adEnums';
import { getEffectiveAdStatus as getEffectiveAdStatusPure } from '../utils/adScheduleUtils';

// ---- generic helpers, one per collection - kept boring on purpose ----

function colRef(collectionName) {
  return collection(db, collectionName);
}

async function createDoc(collectionName, data) {
  const ref = await addDoc(colRef(collectionName), {
    ...data,
    status: data.status || AD_STATUSES.DRAFT,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function getDocById(collectionName, id) {
  const snap = await getDoc(doc(db, collectionName, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function updateDocById(collectionName, id, changes) {
  await updateDoc(doc(db, collectionName, id), { ...changes, updatedAt: serverTimestamp() });
}

async function deleteDocById(collectionName, id) {
  await deleteDoc(doc(db, collectionName, id));
}

function subscribeCollection(collectionName, callback, onError, constraints = []) {
  const q = query(colRef(collectionName), ...constraints);
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

// ---- advertisements ----

export async function createAdvertisement(data) {
  return createDoc(AD_COLLECTIONS.ADVERTISEMENTS, data);
}
export async function getAdvertisement(adId) {
  return getDocById(AD_COLLECTIONS.ADVERTISEMENTS, adId);
}
export async function updateAdvertisement(adId, changes) {
  return updateDocById(AD_COLLECTIONS.ADVERTISEMENTS, adId, changes);
}
export async function deleteAdvertisement(adId) {
  return deleteDocById(AD_COLLECTIONS.ADVERTISEMENTS, adId);
}
/** Foundation only - no workflow validation. A later phase should reject
 * invalid transitions here (e.g. 'rejected' -> 'active') and write the
 * matching ad_audit_logs entry server-side. */
export async function updateAdvertisementStatus(adId, status) {
  return updateDocById(AD_COLLECTIONS.ADVERTISEMENTS, adId, { status });
}
export function subscribeAdvertisements(callback, onError) {
  return subscribeCollection(AD_COLLECTIONS.ADVERTISEMENTS, callback, onError, [orderBy('createdAt', 'desc')]);
}
export function subscribeAdvertisementsByCampaign(campaignId, callback, onError) {
  return subscribeCollection(AD_COLLECTIONS.ADVERTISEMENTS, callback, onError, [where('campaignId', '==', campaignId)]);
}
// PHASE 6 - STATUS AUTOMATION. An ad's stored `status` and its effective,
// schedule-aware status (getEffectiveAdStatus below) are deliberately
// allowed to disagree: an ad approved and scheduled ahead of time sits at
// status 'approved' or 'scheduled' right up until its startAt arrives,
// then reads as effectively 'active' WITHOUT any write-back to Firestore
// (see getEffectiveAdStatus's own header comment - "without ever writing
// anything back"). Querying for the literal string 'active' only (as
// PHASE 1-5 did) would mean an ad that was correctly approved/scheduled
// ahead of time never gets fetched at all once its start date arrives, so
// it never has a chance to be recognized as active - the automation this
// phase's brief asks for ("An advertisement should automatically be
// considered active only when... current time is within start/end")
// requires the client to already HAVE the doc in hand before it can
// compute that. AUTO_ACTIVE_QUERY_STATUSES is every status whose
// eligibility is schedule-driven rather than a manual terminal state -
// mirrors adScheduleUtils.js's own MANUAL_STATUSES split exactly
// (everything NOT in that list here). Manual/terminal statuses
// (draft/pending_approval/rejected/paused/archived) are intentionally
// excluded - a paused or still-pending-approval ad should never render
// regardless of its dates, so there's no reason to even fetch it for this
// placement.
const AUTO_ACTIVE_QUERY_STATUSES = [AD_STATUSES.APPROVED, AD_STATUSES.SCHEDULED, AD_STATUSES.ACTIVE];

export function subscribeAdvertisementsByPlacement(placementId, callback, onError) {
  return subscribeCollection(
    AD_COLLECTIONS.ADVERTISEMENTS,
    callback,
    onError,
    [where('placements', 'array-contains', placementId), where('status', 'in', AUTO_ACTIVE_QUERY_STATUSES)]
  );
}

// ---- PHASE 3 - banner-specific helpers (BannerManagementScreen) ----
//
// Everything below targets adType === 'banner' Advertisement docs
// specifically, on top of the generic CRUD above. This is a NEW banner
// system, entirely separate from the pre-existing home page banner
// slider (banners/{id} - see bannerService.js/BannerSlider.js) - that
// older system is untouched by anything here.

/** Every banner Advertisement, newest first - backs BannerManagementScreen's
 * list (see firestore.indexes.json for the composite index this needs). */
export function subscribeBannerAdvertisements(callback, onError) {
  return subscribeCollection(
    AD_COLLECTIONS.ADVERTISEMENTS,
    callback,
    onError,
    [where('adType', '==', AD_TYPES.BANNER), orderBy('createdAt', 'desc')]
  );
}

function toMillis(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike.toMillis === 'function') return dateLike.toMillis();
  if (typeof dateLike.seconds === 'number') return dateLike.seconds * 1000;
  if (dateLike instanceof Date) return dateLike.getTime();
  return null;
}

/**
 * The status a banner should be TREATED as right now, given its stored
 * `status` plus its `startAt`/`endAt` schedule - without ever writing
 * anything back to Firestore. A banner stored as 'active' or 'scheduled'
 * whose end date has passed reads as 'expired' here; one whose start date
 * hasn't arrived yet reads as 'scheduled'; otherwise a schedule-driven
 * status that's within its date range reads as 'active'. Manual statuses
 * (draft/pending_approval/rejected/paused/archived) always pass through
 * unchanged - a paused banner stays 'paused' even mid-schedule.
 *
 * Every place a banner's status is DISPLAYED (BannerManagementScreen's
 * card/filter) should read through this rather than `ad.status` directly,
 * so the list never shows a stale 'active' badge on something whose end
 * date already passed - see the "PHASE 3 - status-transition helpers"
 * section below for where the schedule is actually turned into a write.
 *
 * PHASE 5: the actual date/status logic now lives in
 * src/utils/adScheduleUtils.js (zero-dependency, so
 * scripts/phase5-ad-targeting-tests.js can require() it directly without
 * pulling in firebase/expo) - this is a thin re-export so every existing
 * caller (BannerManagementScreen, adTargetingService.js, activate/
 * deactivate/pause/archiveAdvertisement below) is unaffected.
 */
export function getEffectiveAdStatus(ad) {
  return getEffectiveAdStatusPure(ad);
}

// ---- PHASE 3 - status-transition helpers ----
//
// Thin, deliberately simple wrappers over updateAdvertisementStatus for
// the four actions the brief's CRUD list asks for beyond plain
// create/read/update/delete. Foundation-only, same as
// updateAdvertisementStatus itself: no ad_audit_logs entry is written
// (Phase 1's header comment already covers why - only a Cloud Function
// can write that collection, and none of the plain CRUD above logs
// either) and there is no rejected/approved workflow here - "Activate"
// just decides between 'scheduled' and 'active' from today's date vs the
// banner's own startAt.

/** Puts a banner live: 'scheduled' if its startAt is still in the future,
 * 'active' if that date has already arrived (or there's no startAt at
 * all). Mirrors getEffectiveAdStatus's own schedule check so a banner
 * Activate always lands on the status its dates already imply. */
export async function activateAdvertisement(ad) {
  const startMs = toMillis(ad && ad.startAt);
  const status = startMs && startMs > Date.now() ? AD_STATUSES.SCHEDULED : AD_STATUSES.ACTIVE;
  return updateAdvertisementStatus(ad.id, status);
}

/** Fully takes a banner off schedule, back to 'draft' - distinct from
 * Pause (below): a deactivated banner needs its dates/status reviewed and
 * re-Activated on purpose, rather than simply resuming where it left off. */
export async function deactivateAdvertisement(adId) {
  return updateAdvertisementStatus(adId, AD_STATUSES.DRAFT);
}

/** Temporarily stops a banner from showing without losing its schedule -
 * Activate on a paused banner re-evaluates its startAt exactly as if it
 * had never been paused. */
export async function pauseAdvertisement(adId) {
  return updateAdvertisementStatus(adId, AD_STATUSES.PAUSED);
}

/** Retires a banner for good. Archived banners are excluded from every
 * "All"/status filter chip on BannerManagementScreen except a dedicated
 * one, matching how the brief's FILTERS list keeps Archived out of the
 * everyday filter set. Does not delete the banner doc or its image - use
 * deleteAdvertisement + deleteBannerCreative for that. */
export async function archiveAdvertisement(adId) {
  return updateAdvertisementStatus(adId, AD_STATUSES.ARCHIVED);
}

// ---- ad_campaigns ----

export async function createCampaign(data) {
  return createDoc(AD_COLLECTIONS.CAMPAIGNS, data);
}
export async function getCampaign(campaignId) {
  return getDocById(AD_COLLECTIONS.CAMPAIGNS, campaignId);
}
export async function updateCampaign(campaignId, changes) {
  return updateDocById(AD_COLLECTIONS.CAMPAIGNS, campaignId, changes);
}
export function subscribeCampaigns(callback, onError) {
  return subscribeCollection(AD_COLLECTIONS.CAMPAIGNS, callback, onError, [orderBy('createdAt', 'desc')]);
}
export function subscribeCampaignsByAdvertiser(advertiserId, callback, onError) {
  return subscribeCollection(AD_COLLECTIONS.CAMPAIGNS, callback, onError, [where('advertiserId', '==', advertiserId)]);
}

// ---- PHASE 9 - ad_campaigns status-transition helpers ----
// Same thin-wrapper posture as activate/deactivateAdvertisement above:
// "Activate" defers to the campaign's own startAt exactly like a banner
// does, "Deactivate" always lands on 'paused' (not 'draft' - unlike a
// banner, a campaign being taken down rarely means "start over from
// scratch"; an admin can still Edit it back to Draft explicitly via
// CampaignFormModal's own Status chips if that's really what's needed).
export async function activateCampaign(campaign) {
  const startMs = toMillis(campaign && campaign.startAt);
  const status = startMs && startMs > Date.now() ? AD_STATUSES.SCHEDULED : AD_STATUSES.ACTIVE;
  return updateCampaign(campaign.id, { status });
}
export async function deactivateCampaign(campaignId) {
  return updateCampaign(campaignId, { status: AD_STATUSES.PAUSED });
}

// ---- ad_advertisers ----

export async function createAdvertiser(data) {
  return createDoc(AD_COLLECTIONS.ADVERTISERS, { ...data, status: data.status || 'active' });
}
export async function getAdvertiser(advertiserId) {
  return getDocById(AD_COLLECTIONS.ADVERTISERS, advertiserId);
}
export async function updateAdvertiser(advertiserId, changes) {
  return updateDocById(AD_COLLECTIONS.ADVERTISERS, advertiserId, changes);
}
export function subscribeAdvertisers(callback, onError) {
  return subscribeCollection(AD_COLLECTIONS.ADVERTISERS, callback, onError, [orderBy('companyName', 'asc')]);
}
/** PHASE 9 - live single-doc listener for one ad_advertisers doc, for
 * AdvertiserDetailScreen (mirrors subscribePlacement's null-for-missing-
 * doc shape below, rather than subscribeCollection's array shape). */
export function subscribeAdvertiser(advertiserId, callback, onError) {
  return onSnapshot(
    doc(db, AD_COLLECTIONS.ADVERTISERS, advertiserId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}
/** PHASE 9 - the brief's ADVERTISER "Activate"/"Deactivate" actions.
 * 'suspended' rather than a delete/archive - an inactive advertiser's
 * campaigns/history stay intact, it's just excluded wherever eligibility
 * is checked (see adTargetingService.js's getEligibleAds). */
export async function activateAdvertiser(advertiserId) {
  return updateAdvertiser(advertiserId, { status: 'active' });
}
export async function deactivateAdvertiser(advertiserId) {
  return updateAdvertiser(advertiserId, { status: 'suspended' });
}

// ---- ad_payments (read-only from the client - see ad_payments' own header comment) ----

/** PHASE 9 - AdvertiserDetailScreen's Payment History tab. Client never
 * writes ad_payments (see AdPayment's own header comment in types/ads.ts -
 * only a later-phase Cloud Function does), so this is read-only, same
 * trust model as everywhere else this collection is touched. */
export function subscribeAdvertiserPayments(advertiserId, callback, onError) {
  return subscribeCollection(AD_COLLECTIONS.PAYMENTS, callback, onError, [where('advertiserId', '==', advertiserId)]);
}
/** PHASE 10 - every ad_payments doc, newest first - backs
 * AdPaymentsManagementScreen's cross-advertiser list (its Pending/Paid/
 * Failed/Refunded tabs filter this client-side, same "fetch once, filter
 * in memory" approach subscribeCampaignsByAdvertiser's CampaignsTab
 * already uses, rather than a separate composite-indexed query per tab). */
export function subscribeAllPayments(callback, onError) {
  return subscribeCollection(AD_COLLECTIONS.PAYMENTS, callback, onError, [orderBy('createdAt', 'desc')]);
}
/** PHASE 10 - records a new manually-taken payment (bank transfer,
 * DuitNow QR, cash, cheque - no payment gateway exists in this app).
 * Routed through the createAdPayment Cloud Function, never a direct
 * Firestore write - ad_payments' firestore.rules is `allow write: if
 * false` (see that collection's PHASE 1 comment there), same trust
 * model as topups/transactions elsewhere in this app.
 * @param {{advertiserId:string, campaignId?:string, packageId?:string, amount:number, currency:string, paymentMethod:string, transactionReference?:string, paymentStatus?:string}} payload
 * @returns {Promise<{ok:boolean, paymentId:string}>}
 */
export async function createAdPayment(payload) {
  const fn = httpsCallable(functions, 'createAdPayment');
  const result = await fn(payload);
  return result.data;
}
/** PHASE 10 - moves an existing payment to a new paymentStatus (the
 * brief's admin Pending -> Paid/Failed -> Refunded workflow). Same
 * Cloud-Function-routed write as createAdPayment above - see that
 * function's own comment for why. Throws (via HttpsError, surfaced as a
 * rejected promise) if the transition isn't allowed - see
 * PAYMENT_STATUS_TRANSITIONS in src/utils/adPackagePaymentRules.js.
 * @param {string} paymentId
 * @param {'pending'|'paid'|'failed'|'refunded'} paymentStatus
 * @param {string} [note]
 */
export async function updateAdPaymentStatus(paymentId, paymentStatus, note) {
  const fn = httpsCallable(functions, 'updateAdPaymentStatus');
  const result = await fn({ paymentId, paymentStatus, note });
  return result.data;
}

// ---- ad_placements ----
// Doc id IS the PlacementId (see adPlacements.ts) - so these take/return
// that id directly rather than a Firestore-generated one.

export async function upsertPlacement(placementId, data) {
  await setDoc(
    doc(db, AD_COLLECTIONS.PLACEMENTS, placementId),
    { ...data, placementId, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
export async function getPlacement(placementId) {
  return getDocById(AD_COLLECTIONS.PLACEMENTS, placementId);
}
export function subscribePlacements(callback, onError) {
  return subscribeCollection(AD_COLLECTIONS.PLACEMENTS, callback, onError);
}
/**
 * PHASE 6 - live single-doc listener for one placement's own config
 * (ad_placements/{placementId} - enabled + maxConcurrentAds), for a
 * rendering call site (SmartAd.js) that only ever needs its own
 * placement, not the whole PLACEMENT_IDS collection. `callback` receives
 * null (not an error) when no config doc exists yet for this placement -
 * every consumer of this (isPlacementEnabled, adRotationService's
 * rotationCap) already treats a missing config as "enabled, default cap",
 * matching this app's existing DEFAULT_* merge convention elsewhere.
 */
export function subscribePlacement(placementId, callback, onError) {
  return onSnapshot(
    doc(db, AD_COLLECTIONS.PLACEMENTS, placementId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

// ---- ad_packages ----

export async function createPackage(data) {
  return createDoc(AD_COLLECTIONS.PACKAGES, { ...data, active: data.active !== false });
}
export async function getPackage(packageId) {
  return getDocById(AD_COLLECTIONS.PACKAGES, packageId);
}
export async function updatePackage(packageId, changes) {
  return updateDocById(AD_COLLECTIONS.PACKAGES, packageId, changes);
}
export function subscribePackages(callback, onError) {
  return subscribeCollection(AD_COLLECTIONS.PACKAGES, callback, onError, [orderBy('price', 'asc')]);
}
/** PHASE 10 - the brief's PACKAGE "Activate"/"Deactivate" admin actions.
 * Plain `active` boolean writes (no state machine, unlike Advertisement/
 * Campaign status) - ad_packages write is already superadmin-only per
 * firestore.rules, so this goes straight through updatePackage above
 * rather than a Cloud Function, same "no audit trail need was called
 * for" posture as this file's other plain CRUD (see this file's own
 * header comment on ad_audit_logs). */
export async function activatePackage(packageId) {
  return updatePackage(packageId, { active: true });
}
export async function deactivatePackage(packageId) {
  return updatePackage(packageId, { active: false });
}

// ---- creative upload (Storage) ----

/**
 * Uploads a native/interstitial advertisement image to its dedicated
 * Storage prefix. Banner creatives use uploadBannerCreative because banners
 * also keep a resized thumbnail. Storage rules enforce superadmin-only writes
 * and an image-only 10 MB limit.
 *
 * @param {string} localUri local file URI from expo-image-picker
 * @param {'native'|'interstitial'} adType
 * @param {string} [mimeType] e.g. 'image/jpeg'
 * @returns {Promise<{imageUrl:string, storagePath:string}>}
 */
export async function uploadAdCreative(localUri, adType, mimeType) {
  if (!localUri) throw new Error('A local creative image is required.');
  if (adType !== AD_TYPES.NATIVE && adType !== AD_TYPES.INTERSTITIAL) {
    throw new Error(`uploadAdCreative only supports native/interstitial creatives; use uploadBannerCreative for "${adType}".`);
  }

  const ext = (mimeType || '').toLowerCase().includes('png') ? 'png' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const response = await fetch(localUri);
  if (!response.ok) throw new Error('Could not read the selected creative image.');
  const blob = await response.blob();

  if (blob.size >= 10 * 1024 * 1024) {
    throw new Error('Creative image must be smaller than 10 MB.');
  }

  const prefix = adType === AD_TYPES.NATIVE ? AD_STORAGE_PATHS.NATIVE : AD_STORAGE_PATHS.INTERSTITIAL;
  const storagePath = `${prefix}/${Date.now()}-${Crypto.randomUUID()}.${ext}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType });
  const imageUrl = await getDownloadURL(storageRef);
  return { imageUrl, storagePath };
}

/**
 * PHASE 3 - uploads a banner's image to Storage twice: the original
 * (untouched, per the brief's STORAGE note "Do not destroy the original
 * unnecessarily") and a resized thumbnail, both under
 * AD_STORAGE_PATHS.BANNERS ('ads/banners') so storage.rules' existing
 * superadmin-only write check on that prefix covers both. Mirrors
 * mediaUpload.js's fetch-local-uri -> blob -> uploadBytes -> getDownloadURL
 * shape; the only new step is expo-image-manipulator generating the
 * thumbnail client-side before the second upload.
 *
 * @param {string} localUri - local file uri from expo-image-picker.
 * @param {string} [mimeType] - e.g. 'image/jpeg'.
 * @returns {Promise<{imageUrl:string, thumbnailUrl:string, imageStoragePath:string, thumbnailStoragePath:string}>}
 */
export async function uploadBannerCreative(localUri, mimeType) {
  const ext = (mimeType || '').includes('png') ? 'png' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const stamp = Date.now();

  // ---- original, untouched ----
  const originalResponse = await fetch(localUri);
  const originalBlob = await originalResponse.blob();
  const imageStoragePath = `${AD_STORAGE_PATHS.BANNERS}/${stamp}-original.${ext}`;
  await uploadBytes(ref(storage, imageStoragePath), originalBlob, { contentType });
  const imageUrl = await getDownloadURL(ref(storage, imageStoragePath));

  // ---- thumbnail - resized copy, original file is never modified ----
  let thumbnailUrl = imageUrl;
  let thumbnailStoragePath = imageStoragePath;
  try {
    const resized = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 480 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    const thumbResponse = await fetch(resized.uri);
    const thumbBlob = await thumbResponse.blob();
    thumbnailStoragePath = `${AD_STORAGE_PATHS.BANNERS}/${stamp}-thumb.jpg`;
    await uploadBytes(ref(storage, thumbnailStoragePath), thumbBlob, { contentType: 'image/jpeg' });
    thumbnailUrl = await getDownloadURL(ref(storage, thumbnailStoragePath));
  } catch (e) {
    // Thumbnail generation is an optimization, not a requirement - the
    // brief only asks to "generate optimized image/thumbnail WHERE
    // APPROPRIATE". If it fails for any reason (unsupported format,
    // manipulator error), the original image URL/path double as the
    // thumbnail rather than failing the whole upload.
  }

  return { imageUrl, thumbnailUrl, imageStoragePath, thumbnailStoragePath };
}

/**
 * PHASE 3 - deletes a banner's uploaded image(s) from Storage. Routed
 * through the deleteAdCreative Cloud Function rather than a direct
 * `deleteObject` call because storage.rules sets `allow delete: if false`
 * on ads/banners/{fileName} (see that file's "PHASE 1 - Advertisement
 * System" section) - Storage delete is deliberately not exposed to any
 * client, superadmin or not, so a bad client-side path can never wipe an
 * arbitrary file. The Cloud Function re-checks superadmin server-side via
 * the Admin SDK, which bypasses storage.rules entirely.
 *
 * Always best-effort from the caller's side (every call site here wraps
 * this in `.catch(() => {})` for in-session cleanup, or an already-saved
 * delete where the Firestore doc is gone either way) - a failed image
 * cleanup should never surface as a failed banner delete/edit.
 *
 * @param {{imageStoragePath?: string, thumbnailStoragePath?: string}} paths
 */
export async function deleteBannerCreative({ imageStoragePath, thumbnailStoragePath } = {}) {
  const storagePaths = Array.from(new Set([imageStoragePath, thumbnailStoragePath].filter(Boolean)));
  if (storagePaths.length === 0) return;
  const fn = httpsCallable(functions, 'deleteAdCreative');
  await fn({ storagePaths });
}

/**
 * PHASE 9 - uploads an advertiser's logo to Storage under
 * AD_STORAGE_PATHS.ADVERTISERS ('ads/advertisers'), which storage.rules
 * already scoped to superadmin-write back in PHASE 1 (see that
 * collection's own header comment in adCollections.ts). Single image, no
 * thumbnail generation - unlike uploadBannerCreative, a logo is shown
 * small everywhere it appears (AdvertiserFormModal's 110x110 preview,
 * AdvertiserDetailScreen's 46x46 profile chip), so a second resized
 * upload isn't worth the extra round trip.
 *
 * @param {string} localUri - local file uri from expo-image-picker.
 * @param {string} [mimeType]
 * @returns {Promise<{logoUrl: string, logoStoragePath: string}>}
 */
export async function uploadAdvertiserLogo(localUri, mimeType) {
  const ext = (mimeType || '').includes('png') ? 'png' : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const logoStoragePath = `${AD_STORAGE_PATHS.ADVERTISERS}/${Date.now()}-logo.${ext}`;

  const response = await fetch(localUri);
  const blob = await response.blob();
  await uploadBytes(ref(storage, logoStoragePath), blob, { contentType });
  const logoUrl = await getDownloadURL(ref(storage, logoStoragePath));

  return { logoUrl, logoStoragePath };
}

/**
 * PHASE 9 - deletes a previously-uploaded advertiser logo. Same
 * Cloud-Function-routed delete as deleteBannerCreative above (and for the
 * same reason - storage.rules denies client-side delete on ads/advertisers/
 * too), reusing the one generic deleteAdCreative function rather than a
 * second Cloud Function, since both just take a list of storage paths.
 * Always best-effort - see deleteBannerCreative's own comment on why every
 * call site wraps this in `.catch(() => {})`.
 *
 * @param {string} logoStoragePath
 */
export async function deleteAdvertiserLogo(logoStoragePath) {
  if (!logoStoragePath) return;
  const fn = httpsCallable(functions, 'deleteAdCreative');
  await fn({ storagePaths: [logoStoragePath] });
}

// ---- click URL validation ----

/**
 * PHASE 3 - validates/normalizes the banner form's optional Click URL
 * field, per the brief's URL section ("If URL is empty: Banner has no
 * action... Validate URL before saving. Prefer HTTPS."). A blank input is
 * valid (means "no action") - only a non-empty value that isn't a usable
 * http(s) URL is rejected.
 *
 * @param {string} raw - whatever the admin typed into the Click URL field.
 * @returns {{valid: boolean, normalized: string, reason?: string, warning?: string}}
 *   `normalized` is '' for a blank/no-action URL, or the http(s) URL to
 *   save otherwise. `reason` is set (and `valid` false) when the URL
 *   can't be used at all. `warning` is set (with `valid` true) when the
 *   URL is usable but not HTTPS, so the caller can surface a "prefer
 *   HTTPS" notice without blocking the save.
 */
export function validateClickUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { valid: true, normalized: '' };

  // Admins commonly type a bare domain ("example.com") - assume https://
  // rather than rejecting it outright, same "prefer HTTPS" default the
  // brief asks for.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url;
  try {
    url = new URL(candidate);
  } catch (e) {
    return { valid: false, normalized: '', reason: 'Enter a valid URL, e.g. https://example.com' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, normalized: '', reason: 'Click URL must start with https:// (or http://).' };
  }
  if (!url.hostname) {
    return { valid: false, normalized: '', reason: 'Enter a valid URL, e.g. https://example.com' };
  }

  if (url.protocol === 'http:') {
    return { valid: true, normalized: url.toString(), warning: 'This URL is not secure (HTTPS). Consider using an HTTPS link instead.' };
  }
  return { valid: true, normalized: url.toString() };
}
