// PHASE 1 FOUNDATION - MySheba Advertisement System.
//
// Type definitions ONLY - no runtime code lives in this file. One
// interface per Firestore collection in AD_COLLECTIONS (adCollections.ts),
// so every doc shape the ad system reads or writes is typed somewhere.
// Fixed-choice fields (adType, status, clickAction.type, etc.) reuse the
// union types from adEnums.ts/adFeatures.ts/adPlacements.ts rather than
// redeclaring their own - one source of truth per field.
//
// This is a types-only foundation: no service in src/firebase/ad*.js
// implements more than basic CRUD yet (see those files' own header
// comments for exactly what's deferred to the current ad pipeline).
import type { AdType, ClickActionType, AdStatus, AdAuditAction, AdPricingModel } from '../constants/adEnums';
import type { FeatureId } from '../constants/adFeatures';
import type { PlacementId } from '../constants/adPlacements';

/** A Firestore Timestamp, as seen on the client via the firebase/firestore SDK. Kept as `unknown` here rather than importing firebase/firestore's Timestamp type, so this file has zero runtime dependency on the SDK - callers narrow it themselves (e.g. `(ad.createdAt as Timestamp).toDate()`). serverTimestamp() writes resolve to this same shape once read back. */
export type FirestoreTimestamp = unknown;

/**
 * clickAction - what happens when someone taps an ad. `value` is
 * deliberately optional and generic (not just `url`) so every action type
 * can reuse the same shape:
 *   - none: value unused
 *   - url: value = the URL to open
 *   - internal: value = an in-app route/feature id to navigate to (see
 *     FEATURE_IDS in adFeatures.ts) - what "internal" resolves to is a
 *     later-phase navigation concern, not this phase's
 *   - whatsapp: value = a phone number (WhatsApp deep link target)
 *   - phone: value = a phone number (tel: link target)
 */
export interface ClickAction {
  type: ClickActionType;
  value?: string;
}

/**
 * advertisements/{adId} - the ad creative + targeting + scheduling
 * record. One doc per ad; totalImpressions/totalClicks are denormalized
 * counters the current ad pipeline adTrackingService.js keeps in sync (Phase 1
 * never writes to them - see that file's header comment).
 */
export interface Advertisement {
  adId: string;
  // PHASE 3 - a banner created from BannerManagementScreen isn't
  // necessarily tied to an ad_campaigns/ad_advertisers doc (the brief's
  // CREATE BANNER form only takes a free-text Advertiser name, not a
  // campaign/advertiser picker) - both optional so that flow doesn't need
  // to fabricate placeholder ids. the current ad pipeline linking banners to real
  // campaigns/advertisers can populate these.
  campaignId?: string;
  advertiserId?: string;
  /** PHASE 3 - free-text advertiser name from BannerManagementScreen's
   * "Advertiser" field, shown on the admin list/card. Separate from
   * advertiserId (ad_advertisers/{id}) above, which this phase's simple
   * banner form does not set. */
  advertiserName?: string;
  name: string;
  adType: AdType;
  imageUrl: string;
  thumbnailUrl: string;
  /** PHASE 3 - Storage paths (AD_STORAGE_PATHS.BANNERS/...) the image/
   * thumbnail above were uploaded to, kept alongside the download URLs so
   * adService.deleteBannerCreative can delete the actual files (via the
   * deleteAdCreative Cloud Function - storage.rules denies client-side
   * delete on ads/banners/) without re-deriving a path from the URL. */
  imageStoragePath?: string;
  thumbnailStoragePath?: string;
  clickAction: ClickAction;

  // ---- placement + targeting ----
  placements: PlacementId[];
  targetFeatures: FeatureId[];
  targetCountries: string[];
  targetStates: string[];
  targetCities: string[];
  targetAreas: string[];
  targetOutlets: string[];
  targetUserTypes: string[]; // e.g. 'customer' | 'dealer' | 'dealer' | 'reseller' | 'admin' | 'superadmin' - kept as string[] rather than the app's Role union so the ad system doesn't take a hard dependency on auth's role model; see src/constants/adTargeting.js's AD_USER_TYPES for the PHASE 5 vocabulary this matches against.
  targetLanguages: string[]; // e.g. 'en' | 'bn' | 'ms' - see src/i18n/LanguageContext.js's LANGUAGE_LIST

  // ---- scheduling + ranking ----
  startAt: FirestoreTimestamp;
  endAt: FirestoreTimestamp;
  priority: number;
  weight: number;
  status: AdStatus;

  // ---- frequency capping - PHASE 6: enforced by adTrackingService.js's
  // canShowImpression/canRecordClick (see that file's header comment).
  // Both are per-UTC-calendar-day caps ("Maximum impressions/clicks per
  // user/day" in the PHASE 6 brief) - a value of 0 means unlimited, same
  // convention as AdSettings.defaultMaxImpressionsPerUser/
  // defaultMaxClicksPerUser in adControlsService.js. ----
  maxImpressionsPerUser: number;
  maxClicksPerUser: number;

  // ---- denormalized counters (kept in sync by the current ad pipeline - see adTrackingService.js) ----
  totalImpressions: number;
  totalClicks: number;

  createdBy: string; // uid of the superadmin who created this ad
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * ad_campaigns/{campaignId} - groups one or more Advertisements under one
 * advertiser + budget + date range. An ad's campaignId points here.
 */
export interface AdCampaign {
  campaignId: string;
  advertiserId: string;
  name: string;
  description: string;
  packageId: string; // ad_packages/{packageId} this campaign was purchased under, if any
  startAt: FirestoreTimestamp;
  endAt: FirestoreTimestamp;
  budget: number;
  /** PHASE 9 - ISO 4217 currency code the budget/spend is denominated in, e.g. 'MYR'. */
  currency: string;
  /** PHASE 9 - see AD_PRICING_MODELS in adEnums.ts (fixed | cpm | cpc). */
  pricingModel: AdPricingModel;
  /** PHASE 9 - 0 means no target set, per the brief's CAMPAIGN "Target Impressions/Clicks" fields. */
  targetImpressions: number;
  targetClicks: number;
  status: AdStatus;
  createdBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * ad_advertisers/{advertiserId} - the business/entity buying ad space.
 * Not necessarily a MySheba app user - an advertiser may be onboarded by
 * an admin without ever having a users/{uid} account, so this is
 * deliberately its own record rather than a reference into users/.
 */
export interface AdAdvertiser {
  advertiserId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** PHASE 9 - the brief's ADVERTISER "Fields" list, beyond the Phase 1 foundation above. */
  whatsapp: string;
  address: string;
  country: string;
  logoUrl: string;
  logoStoragePath: string;
  linkedUserId: string | null; // users/{uid}, if this advertiser also has a MySheba account
  status: 'active' | 'suspended';
  createdBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * ad_placements/{placementId} - admin-configurable metadata about a slot
 * from PLACEMENT_IDS (adPlacements.ts): whether it's enabled at all, and
 * how many concurrent ads it can rotate. The id from PLACEMENT_IDS IS the
 * doc id - this collection doesn't need its own generated ids.
 */
export interface AdPlacement {
  placementId: PlacementId;
  featureId: FeatureId;
  label: string; // human-readable name for the admin UI, e.g. "Home - Top Banner"
  enabled: boolean;
  maxConcurrentAds: number;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * ad_packages/{packageId} - a purchasable bundle (e.g. "7-day home
 * banner") an ad_campaigns doc can reference via packageId. Prices are
 * NEVER hard-coded anywhere in the app - every screen that shows or
 * charges a package price reads it live off this doc (see
 * src/components/AdPackageFormModal.js / AdPackagesManagementScreen.js);
 * the "Starter/Standard/Business/Premium" names in the PHASE 10 brief
 * are configurable examples an admin creates through that form, not
 * fixed app constants.
 *
 * PHASE 10 - field names renamed from the PHASE 1 foundation
 * (includedPlacements -> placements, includedImpressions ->
 * maxImpressions) to match the brief's PACKAGE field list exactly, and
 * to read consistently with Advertisement.placements above (same field
 * name, same PlacementId[] shape) rather than a package-specific synonym.
 * No existing document had ever been written under the old names (Phase
 * 1-9 only ever read/wrote these through the generic adService.js CRUD
 * with no field-specific consumer), so this is a pure rename, not a
 * migration.
 */
export interface AdPackage {
  packageId: string;
  name: string;
  description: string;
  price: number;
  currency: string; // 'MYR', matching every other price field in this app
  durationDays: number;
  placements: PlacementId[];
  maxImpressions: number | null; // null = unlimited within durationDays
  /** PHASE 10 - higher sorts first wherever packages are offered
   * side-by-side (e.g. a future advertiser-facing picker) - same
   * "number, higher wins" convention as Advertisement.priority. */
  priority: number;
  active: boolean;
  createdBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * ad_impressions/{id} - one "this ad was shown" event. Write shape
 * mirrors src/firebase/logService.js's activityLog exactly (create-only,
 * capped to the writing user's own uid) - see adTrackingService.js.
 */
export interface AdImpression {
  adId: string;
  campaignId: string;
  placementId: PlacementId;
  /** PHASE 6 - the ad's own adType at the moment it was shown (defaults
   * to 'banner' server-side for any doc written before this field existed
   * - see adTrackingService.recordImpression). Lets canShowInterstitial
   * query "every interstitial this user has seen recently" directly off
   * this collection without joining back to each adId's own ad doc. */
  adType: AdType;
  /** PHASE 7 - the FEATURE_IDS (src/constants/adFeatures.ts) screen this
   * impression happened on, e.g. 'mobile_recharge'. Same field SmartAd
   * already receives as a required prop (its feature-controls lookup key)
   * - this just also stamps it onto the event so ad_reports can break
   * performance down per feature without joining back through
   * ad_placements. Optional/undefined on events recorded before this
   * field existed. */
  feature?: string;
  /** PHASE 7 - id of the local, in-memory ad-analytics session this event
   * belongs to (see src/firebase/adSessionService.js) - a fresh id per
   * app launch, distinct from the device-login session in
   * deviceSessionService.js. Lets a reporting query group "how many
   * distinct sessions saw this ad" separately from raw impression count,
   * without needing a signed-in user (present even when userId is
   * omitted - see USER ID note on recordImpression/recordClick). */
  sessionId: string;
  /** PHASE 7 - omitted (not written as undefined/null) when nobody is
   * signed in, e.g. an impression on a public/pre-login screen - "record
   * userId when appropriate" from the PHASE 7 brief. Do not assume this
   * field is always present. */
  userId?: string;
  createdAt: FirestoreTimestamp;
}

/** ad_clicks/{id} - one "this ad was tapped" event. Same shape/trust level as AdImpression above. */
export interface AdClick {
  adId: string;
  campaignId: string;
  placementId: PlacementId;
  /** PHASE 7 - see AdImpression.feature above. */
  feature?: string;
  /** PHASE 7 - see AdImpression.sessionId above. */
  sessionId: string;
  /** PHASE 7 - see AdImpression.userId above; omitted, not null/undefined-valued, when signed out. */
  userId?: string;
  clickAction: ClickAction;
  createdAt: FirestoreTimestamp;
}

/**
 * ad_reports/{id} - aggregated performance rollups (e.g. daily
 * impressions/clicks per ad or campaign). Written by the current ad pipeline
 * scheduled Cloud Function, not the client - see firestore.rules.
 */
export interface AdReport {
  reportId: string;
  scope: 'ad' | 'campaign' | 'advertiser';
  scopeId: string; // the adId/campaignId/advertiserId this report covers
  periodStart: FirestoreTimestamp;
  periodEnd: FirestoreTimestamp;
  impressions: number;
  clicks: number;
  ctr: number; // clicks / impressions
  generatedAt: FirestoreTimestamp;
}

/**
 * PHASE 8 - ad_daily_stats/{id} - a pre-aggregated (UTC calendar day, ad,
 * placement, feature) rollup row, the ONLY thing AdAnalyticsScreen's
 * dashboard/reports ever read impressions/clicks/CTR from (see
 * src/firebase/adAnalyticsService.js) - never the raw ad_impressions/
 * ad_clicks collections directly, per the PHASE 8 brief's own PERFORMANCE
 * section. `id` is `${date}__${adId}__${placementId}__${feature}` (not a
 * generated id), so the server-side upsert
 * (functions/adTrackingService.js's DAILY ROLLUP section) can `set(...,
 * { merge: true })` with a deterministic doc id and a
 * FieldValue.increment(1) on `impressions`/`clicks`, instead of racing
 * multiple events into two separate creates. campaignId/advertiserId are
 * denormalized off the matching advertisements/{adId} doc at write time
 * (the ad_impressions/ad_clicks event itself doesn't carry advertiserId)
 * so a report can group by either without joining back per row.
 */
export interface AdDailyStat {
  id: string;
  /** 'YYYY-MM-DD', UTC calendar day - a plain string field so date-range
   * reports are a single-field range query (date >= startKey && date <=
   * endKey), auto-indexed by Firestore with no composite index needed. */
  date: string;
  adId: string;
  campaignId: string | null;
  advertiserId: string | null;
  placementId: PlacementId | 'unknown';
  /** FeatureId (adFeatures.ts), or 'unknown' for an event recorded before
   * PHASE 7 added `feature` to AdImpression/AdClick. */
  feature: string;
  impressions: number;
  clicks: number;
  updatedAt: FirestoreTimestamp;
}

/**
 * ad_payments/{paymentId} - an advertiser's payment for a campaign/
 * package. Client never writes here directly (see firestore.rules) -
 * same trust model this app already uses for topups/transactions. The
 * only writers are the PHASE 10 Cloud Functions createAdPayment /
 * updateAdPaymentStatus (functions/adPaymentService.js) - there is no
 * payment gateway integrated anywhere in this app, so every payment here
 * is an admin manually recording what came in outside the app (bank
 * transfer, DuitNow QR, cash, cheque) and then moving it through the
 * Pending -> Paid/Failed -> Refunded workflow from
 * AdPaymentsManagementScreen. See PAYMENT_STATUS_TRANSITIONS in
 * src/utils/adPackagePaymentRules.js for exactly which status changes
 * are allowed.
 *
 * PHASE 10 - field names renamed from the PHASE 9 stub (status -> paymentStatus,
 * method -> paymentMethod, reference -> transactionReference) to match the
 * brief's PAYMENT field list exactly. Safe rename: PHASE 9 only ever
 * built the read-only Payment History tab (AdvertiserDetailScreen) against
 * this collection, and nothing had a write path to it yet (firestore.rules'
 * `allow write: if false` predates this phase) - no ad_payments document
 * has ever been created under the old field names.
 */
export interface AdPayment {
  paymentId: string;
  advertiserId: string;
  campaignId: string;
  packageId: string;
  amount: number;
  currency: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentMethod: string; // e.g. 'bank_transfer', 'duitnow', 'cash', 'cheque' - see AD_PAYMENT_METHODS in adEnums.ts
  transactionReference: string;
  /** PHASE 10 - denormalized off ad_advertisers/ad_campaigns/ad_packages
   * at creation time (same "denormalize the display name so a list
   * screen doesn't need N joins" convention as Advertisement.advertiserName)
   * so AdPaymentsManagementScreen's cross-advertiser list can show who/what
   * each payment was for without a lookup per row. */
  advertiserName?: string;
  campaignName?: string;
  packageName?: string;
  /** PHASE 10 - uid of the superadmin who recorded this payment / most
   * recently changed its status - mirrors createdBy elsewhere in this file. */
  recordedBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

/**
 * ad_audit_logs/{id} - security-relevant ad-system actions (approvals,
 * status changes, settings edits). Mirrors userAuditLog's shape/trust
 * model exactly (functions/logService.js) - written only by a later
 * phase's Cloud Function via the Admin SDK, never by the client.
 *
 * PHASE 2: 'ad_feature_control' added to targetType - every Global
 * Control / Feature Ad Control change from AdFeatureControlsScreen is
 * logged here by functions/adControlsService.js (updateAdSettings /
 * updateAdFeatureControl / bulkUpdateAdFeatureControls), never by the
 * client directly (see this collection's firestore.rules: write: false).
 */
export interface AdAuditLog {
  action: AdAuditAction;
  targetType: 'advertisement' | 'ad_campaign' | 'ad_advertiser' | 'ad_package' | 'ad_payment' | 'ad_settings' | 'ad_feature_control';
  targetId: string;
  performedBy: string; // uid of the superadmin who performed the action
  details: Record<string, unknown>;
  createdAt: FirestoreTimestamp;
}

/**
 * ad_settings/{id} - global ad-system configuration (a single doc, id
 * 'general' - see AD_SETTINGS_DOC_ID in adCollections.ts): master
 * enable/disable, default frequency caps. Mirrors this app's existing
 * settings/{id} collection shape - one doc per logical settings group,
 * superadmin-only write (see firestore.rules).
 *
 * PHASE 2 GLOBAL CONTROLS: adsEnabled is the master "Global Ads" switch -
 * everything else in the ad system (every ad network and every per-feature
 * control) is only ever consulted when this is true (see
 * adControlsService.js's canShowAd). The other five fields are
 * independent global switches, each gating one ad network/format
 * regardless of which feature or placement it would otherwise show in:
 *   - directAdsEnabled: "Direct MySheba Ads" - ads sold/managed directly
 *     (the advertisements/ad_campaigns collections above), as opposed to
 *   - bannerAdsEnabled / nativeAdsEnabled / interstitialAdsEnabled:
 *     "Banner Ads" / "Native Ads" / "Interstitial Ads" - global toggle
 *     per ad *format* (AdType in adEnums.ts), independent of network.
 */
export interface AdPlacementControl {
  enabled: boolean;
  position: 'top' | 'bottom';
}

export interface AdPlacementControls {
  screenBanners: Record<string, AdPlacementControl>;
  webviewBannerEnabled: boolean;
  webviewBannerPosition: 'top' | 'bottom';
  webviewBanners: Record<string, AdPlacementControl>;
  webviewInterstitialEnabled: boolean;
  webviewInterstitials: Record<string, boolean>;
  interstitialCooldownSeconds: number;
  admobInterstitialUnitId: string;
}

export interface AdSettings {
  adsEnabled: boolean;
  directAdsEnabled: boolean;
  bannerAdsEnabled: boolean;
  nativeAdsEnabled: boolean;
  interstitialAdsEnabled: boolean;
  defaultMaxImpressionsPerUser: number;
  defaultMaxClicksPerUser: number;
  /** PHASE 6 - FREQUENCY section: "Maximum interstitials per hour". Global/
   * per-user (not per-ad, unlike the two fields above) - see
   * adTrackingService.canShowInterstitial and adFrequencyRules.
   * isUnderInterstitialHourlyCap for why a full-screen format is capped
   * as a whole rather than per-advertiser. 0 = unlimited. */
  maxInterstitialsPerUserPerHour: number;
  updatedBy: string;
  placementControls?: AdPlacementControls;
  updatedAt: FirestoreTimestamp;
}

/**
 * ad_feature_controls/{featureId} - per-feature ad toggles, doc id is a
 * FeatureId (adFeatures.ts). Lets a superadmin disable ads on one feature
 * (e.g. help_support) without touching the global ad_settings switches -
 * and, within one feature, disable just one ad format without touching
 * the others (e.g. Mobile Recharge: banner + native on, interstitial
 * off). adsEnabled is that feature's own master switch: when false, none
 * of that feature's ads show regardless of banner/native/interstitial
 * below (same "master gates the rest" relationship AdSettings.adsEnabled
 * has to its own six fields - see adControlsService.js's canShowAd).
 * Disabling any/all of these never touches the feature itself - see
 * FEATURE_IDS in adFeatures.ts and the PHASE 2 brief's "IMPORTANT
 * BEHAVIOR" section this interface was written against.
 */
export interface AdFeatureControl {
  featureId: FeatureId;
  featureName: string;
  adsEnabled: boolean;
  bannerEnabled: boolean;
  nativeEnabled: boolean;
  interstitialEnabled: boolean;
  updatedBy: string;
  updatedAt: FirestoreTimestamp;
}
