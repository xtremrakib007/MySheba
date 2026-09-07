// PHASE 5 - MySheba Advertisement System - Ad Targeting Engine.
//
// getEffectiveAdStatus was originally PHASE 3's own inline helper inside
// src/firebase/adService.js. Extracted here, unchanged in behavior, for
// one reason: adService.js pulls in firebase/firestore, firebase/storage,
// firebase/functions, and expo-image-manipulator (real Storage upload
// plumbing) - none of which are available (or needed) to run the PHASE 5
// acceptance tests (scripts/phase5-ad-targeting-tests.js) in a plain Node
// process with no npm/build step. This file has ZERO imports/requires of
// its own - CommonJS module.exports on purpose (not `export`), so it can
// be `require()`d directly by a plain Node script exactly as easily as it
// is `import`ed from RN/Metro-built code (Metro's babel-plugin-transform-
// commonjs interop already handles named imports from a CJS module the
// same way it handles every third-party CJS package this app already
// imports, e.g. `firebase/firestore` itself).
//
// adService.js now imports getEffectiveAdStatus from here and re-exports
// it, so every existing call site (BannerManagementScreen, SmartAd via
// adTargetingService, etc.) is unaffected - same function, same name,
// same behavior, just no longer duplicated between "the real app" and
// "the test script".
//
// AD_STATUSES values are duplicated here as plain string literals rather
// than imported from src/constants/adEnums.ts, for the same
// zero-dependency reason - these five/three-way status strings are
// exactly as stable as the rest of this file's contract; adEnums.ts
// remains the source of truth every other file in the app imports from.

const AD_STATUS_DRAFT = 'draft';
const AD_STATUS_PENDING_APPROVAL = 'pending_approval';
const AD_STATUS_REJECTED = 'rejected';
const AD_STATUS_PAUSED = 'paused';
const AD_STATUS_ARCHIVED = 'archived';
const AD_STATUS_ACTIVE = 'active';
const AD_STATUS_SCHEDULED = 'scheduled';
const AD_STATUS_EXPIRED = 'expired';

// Manual/terminal statuses an admin (or a rejection workflow) put a
// banner into on purpose - the schedule (startAt/endAt) never overrides
// these. Everything else ('scheduled', 'approved', 'active') IS
// schedule-driven, since those three all mean "this banner is meant to be
// live according to its dates", just at different points in the approval
// flow.
const MANUAL_STATUSES = [
  AD_STATUS_DRAFT,
  AD_STATUS_PENDING_APPROVAL,
  AD_STATUS_REJECTED,
  AD_STATUS_PAUSED,
  AD_STATUS_ARCHIVED,
];

function toMillis(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike.toMillis === 'function') return dateLike.toMillis();
  if (typeof dateLike.seconds === 'number') return dateLike.seconds * 1000;
  if (dateLike instanceof Date) return dateLike.getTime();
  if (typeof dateLike === 'number') return dateLike;
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
 * @param {{status?: string, startAt?: any, endAt?: any}} ad
 * @returns {string}
 */
function getEffectiveAdStatus(ad) {
  if (!ad) return AD_STATUS_DRAFT;
  const status = ad.status || AD_STATUS_DRAFT;
  if (MANUAL_STATUSES.includes(status)) return status;

  const now = Date.now();
  const startMs = toMillis(ad.startAt);
  const endMs = toMillis(ad.endAt);
  if (endMs && now > endMs) return AD_STATUS_EXPIRED;
  if (startMs && now < startMs) return AD_STATUS_SCHEDULED;
  return AD_STATUS_ACTIVE;
}

module.exports = {
  getEffectiveAdStatus,
  toMillis,
  AD_STATUS_ACTIVE,
};
