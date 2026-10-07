// PHASE 2 - MySheba Advertisement Feature Controls.
//
// This is the Super Admin advertisement CONTROL layer: the Global
// Controls (Global Ads / Direct MySheba Ads / Banner /
// Native / Interstitial - AdSettings in src/types/ads.ts) and the
// per-feature controls (Ads / Banner / Native / Interstitial for each of
// the 12 FEATURE_IDS - AdFeatureControl in src/types/ads.ts), plus the
// pure logic that later rendering-phase code will call to decide whether
// a given ad is allowed to show. Nothing in this file ever touches a
// MySheba feature's own functionality - see canShowAd's header comment
// below and the PHASE 2 brief's "IMPORTANT BEHAVIOR" section this file
// was written against: these controls only ever gate whether an
// advertisement renders, never whether Mobile Recharge/Jobs/etc. work.
//
// Reads are plain firebase/firestore v9 modular calls (same shape as
// every other *Service.js file here, e.g. featureAccessService.js).
// Writes are NOT direct Firestore calls, even though firestore.rules
// would permit a superadmin to write ad_settings/ad_feature_controls
// directly - they go through the updateAdSettings/updateAdFeatureControl/
// bulkUpdateAdFeatureControls Cloud Functions (functions/adControlsService.js)
// instead, because "record every change in ad_audit_logs" (PHASE 2
// SECURITY) requires a server-side write: ad_audit_logs' own rule is
// `allow write: if false` - the client has no write path to it at all,
// same trust model as userAuditLog - so only a Cloud Function via the
// Admin SDK can both make the change AND log it atomically.

import { doc, onSnapshot, collection } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { AD_COLLECTIONS, AD_SETTINGS_DOC_ID } from '../constants/adCollections';
import { AD_TYPES, AD_NETWORKS } from '../constants/adEnums';
import { FEATURE_ID_LIST, FEATURE_LABELS } from '../constants/adFeatures';

// ---- defaults - every install ships ads ON everywhere until a
// superadmin turns something off, same "opt-out, not opt-in" default
// featureAccessService.js uses for DEFAULT_FEATURE_ACCESS ----

export const DEFAULT_AD_SETTINGS = {
  adsEnabled: true,
  admobEnabled: true,
  admobBannerEnabled: true,
  directAdsEnabled: true,
  bannerAdsEnabled: true,
  nativeAdsEnabled: true,
  interstitialAdsEnabled: true,
  defaultMaxImpressionsPerUser: 0, // 0 = unlimited, matches AdPackage.includedImpressions' null-is-unlimited convention loosely (kept numeric here since this is a per-user cap, not a package total)
  defaultMaxClicksPerUser: 0,
  // PHASE 6 - FREQUENCY section: "Maximum interstitials per hour". Unlike
  // the two caps above (per-ad, per-day - see Advertisement.
  // maxImpressionsPerUser/maxClicksPerUser in src/types/ads.ts), this one
  // is global/per-user, not per-ad - a full-screen interstitial format is
  // disruptive regardless of WHICH advertiser's interstitial it is, so the
  // cap is "how many interstitials total has this user seen in the last
  // hour" (see adFrequencyRules.js's isUnderInterstitialHourlyCap). 0 =
  // unlimited, same convention as the two fields above.
  maxInterstitialsPerUserPerHour: 3,
};

function defaultFeatureControl(featureId) {
  return {
    featureId,
    featureName: FEATURE_LABELS[featureId] || featureId,
    adsEnabled: true,
    bannerEnabled: true,
    nativeEnabled: true,
    interstitialEnabled: true,
  };
}

/** One default control doc per FEATURE_IDS entry (adFeatures.ts), keyed by
 * featureId - the shape AdFeatureControlsScreen renders before a
 * superadmin has ever touched a given feature (no Firestore doc exists
 * for it yet, same "merge with defaults, don't require a write just to
 * read" approach as featureAccessService.js's mergeWithDefaults). */
export const DEFAULT_AD_FEATURE_CONTROLS = FEATURE_ID_LIST.reduce((acc, featureId) => {
  acc[featureId] = defaultFeatureControl(featureId);
  return acc;
}, {});

function mergeSettings(data) {
  return { ...DEFAULT_AD_SETTINGS, ...(data || {}) };
}

function mergeFeatureControls(docsById) {
  const merged = {};
  FEATURE_ID_LIST.forEach((featureId) => {
    const existing = docsById && docsById[featureId];
    merged[featureId] = existing
      ? { ...defaultFeatureControl(featureId), ...existing }
      : defaultFeatureControl(featureId);
  });
  return merged;
}

// ---- reads ----

/** Live Global Controls (ad_settings/general), merged with defaults for
 * any field not yet set. */
export function subscribeAdSettings(callback, onError) {
  const ref = doc(db, AD_COLLECTIONS.SETTINGS, AD_SETTINGS_DOC_ID);
  return onSnapshot(
    ref,
    (snap) => callback(mergeSettings(snap.exists() ? snap.data() : null)),
    onError
  );
}

/** Live per-feature controls (ad_feature_controls/{featureId}) for all 12
 * FEATURE_IDS at once, as a `{ [featureId]: AdFeatureControl }` map -
 * every key from FEATURE_ID_LIST is always present, defaulted if no doc
 * exists yet for that feature. */
export function subscribeAdFeatureControls(callback, onError) {
  const colRef = collection(db, AD_COLLECTIONS.FEATURE_CONTROLS);
  return onSnapshot(
    colRef,
    (snap) => {
      const docsById = {};
      snap.forEach((d) => { docsById[d.id] = { featureId: d.id, ...d.data() }; });
      callback(mergeFeatureControls(docsById));
    },
    onError
  );
}

// ---- writes - superadmin-only Cloud Functions, see file header ----

/** Updates one or more Global Controls fields (any subset of
 * DEFAULT_AD_SETTINGS' keys except defaultMax*PerUser, which this screen
 * doesn't expose - see AdFeatureControlsScreen). Throws with a
 * user-readable message on failure (permission-denied, etc.) - callers
 * should catch and showAlert. */
export async function updateAdSettings(changes) {
  const fn = httpsCallable(functions, 'updateAdSettings');
  await fn({ changes });
}

/** Updates one feature's controls (any subset of adsEnabled/bannerEnabled/
 * nativeEnabled/interstitialEnabled). */
export async function updateAdFeatureControl(featureId, changes) {
  const fn = httpsCallable(functions, 'updateAdFeatureControl');
  await fn({ featureId, changes });
}

/** Applies the same `changes` to every featureId in `featureIds` in one
 * call - backs the Enable All / Disable All buttons on
 * AdFeatureControlsScreen. One ad_audit_logs entry covers the whole bulk
 * change (see functions/adControlsService.js) rather than one per
 * feature, so the audit trail reads as the single admin action it was. */
export async function bulkUpdateAdFeatureControls(featureIds, changes) {
  const fn = httpsCallable(functions, 'bulkUpdateAdFeatureControls');
  await fn({ featureIds, changes });
}

// ---- resolution logic - real, working code (plumbing/boolean logic,
// not business/targeting logic - see this file's header and contrast
// with adTargetingService.js's deliberately-stubbed matchesTargeting).
// A later rendering phase calls canShowAd before ever asking
// adTargetingService/adRotationService for a specific ad, so a feature
// or ad-type that's toggled off never even reaches targeting/rotation. ----

/** Is `adType` (banner/native/interstitial) enabled by the Global
 * Controls? False whenever Global Ads itself is off, regardless of the
 * per-format switch - "sponsored" ads have no dedicated global format
 * toggle (see AdSettings in src/types/ads.ts) so they're only gated by
 * the master adsEnabled switch. */
export function isGlobalAdTypeEnabled(adSettings, adType) {
  const settings = adSettings || DEFAULT_AD_SETTINGS;
  if (settings.adsEnabled === false) return false;
  switch (adType) {
    case AD_TYPES.BANNER: return settings.bannerAdsEnabled !== false;
    case AD_TYPES.NATIVE: return settings.nativeAdsEnabled !== false;
    case AD_TYPES.INTERSTITIAL: return settings.interstitialAdsEnabled !== false;
    default: return true;
  }
}

/** Is `network` (AD_NETWORKS in adEnums.ts) enabled by the Global Controls?
 * Also false whenever Global Ads itself is off. Direct is the only network
 * now, and an unspecified or unknown one still answers to the "direct"
 * switch, since every Advertisement created before a `network` field existed
 * is a Direct MySheba Ad. */
export function isAdNetworkEnabled(adSettings, network) {
  const settings = adSettings || DEFAULT_AD_SETTINGS;
  if (settings.adsEnabled === false) return false;
  return settings.directAdsEnabled !== false;
}

/** Is `adType` enabled for this one feature's own controls? False
 * whenever that feature's own adsEnabled master switch is off, regardless
 * of the per-format switch. `featureControl` may be null/undefined (no
 * doc yet, or an unrecognized featureId) - treated as "everything on",
 * matching DEFAULT_AD_FEATURE_CONTROLS. */
export function isFeatureAdTypeEnabled(featureControl, adType) {
  const control = featureControl || { adsEnabled: true, bannerEnabled: true, nativeEnabled: true, interstitialEnabled: true };
  if (control.adsEnabled === false) return false;
  switch (adType) {
    case AD_TYPES.BANNER: return control.bannerEnabled !== false;
    case AD_TYPES.NATIVE: return control.nativeEnabled !== false;
    case AD_TYPES.INTERSTITIAL: return control.interstitialEnabled !== false;
    default: return true;
  }
}

/**
 * The single yes/no a later rendering phase should ask before showing
 * any advertisement: true only if every applicable layer allows it -
 * Global Ads, that ad's global format toggle, that ad's global network
 * toggle, that feature's own ads switch, and that feature's own format
 * toggle. Any one OFF anywhere in that chain means no ad, but never
 * means the feature itself stops working - this function's return value
 * is never consulted by, and has no way to affect, any non-ad code path.
 * @param {{ adSettings: import('../types/ads').AdSettings, featureControl: import('../types/ads').AdFeatureControl, adType: import('../constants/adEnums').AdType, network?: import('../constants/adEnums').AdNetwork }} args
 * @returns {boolean}
 */
export function canShowAd({ adSettings, featureControl, adType, network }) {
  return (
    isGlobalAdTypeEnabled(adSettings, adType) &&
    isAdNetworkEnabled(adSettings, network) &&
    isFeatureAdTypeEnabled(featureControl, adType)
  );
}

/**
 * PHASE 6 - the STATUS AUTOMATION section's "placement is enabled" check:
 * true unless `placementConfig` (ad_placements/{placementId} - AdPlacement
 * in src/types/ads.ts) explicitly has `enabled: false`. Missing entirely
 * (no doc yet for this placement) or `enabled` left unset both read as
 * enabled - same "opt-out, not opt-in" default every other ad control in
 * this file uses (compare isFeatureAdTypeEnabled's `featureControl == null`
 * case), so a superadmin who never touched a placement's config doc isn't
 * silently blocking every ad in it.
 * @param {import('../types/ads').AdPlacement} [placementConfig]
 * @returns {boolean}
 */
export function isPlacementEnabled(placementConfig) {
  return !placementConfig || placementConfig.enabled !== false;
}
