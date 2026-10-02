// PHASE 1 FOUNDATION - MySheba Advertisement System.
//
// Every Firestore collection name and Storage path prefix the ad system
// uses, in one place, so no service file hardcodes a string that could
// drift from another. Plain string constants (not enums) so any .js
// service file can import this with zero build-step changes - Metro
// already strips TypeScript via babel-preset-expo's bundled
// @babel/preset-typescript, so `import { AD_COLLECTIONS } from
// '../constants/adCollections'` works from a .js file exactly like
// importing another .js module would.

/** Firestore top-level collection names. Matches firestore.rules 1:1 - see the "PHASE 1 - Advertisement System" section there. */
export const AD_COLLECTIONS = {
  ADVERTISEMENTS: 'advertisements',
  CAMPAIGNS: 'ad_campaigns',
  ADVERTISERS: 'ad_advertisers',
  PLACEMENTS: 'ad_placements',
  PACKAGES: 'ad_packages',
  IMPRESSIONS: 'ad_impressions',
  CLICKS: 'ad_clicks',
  REPORTS: 'ad_reports',
  PAYMENTS: 'ad_payments',
  /**
   * PHASE 8 - ad_daily_stats/{date}__{adId}__{placementId}__{feature} - one
   * doc per (UTC calendar day, ad, placement, feature) bucket, incremented
   * server-side by functions/adTrackingService.js's DAILY ROLLUP section
   * every time an ad_impressions/ad_clicks doc is created. This is what
   * every PHASE 8 dashboard/report number is read from instead of the raw
   * ad_impressions/ad_clicks collections - see adAnalyticsService.js's own
   * header comment for why ("do not query millions of raw impression
   * documents for every dashboard load").
   */
  DAILY_STATS: 'ad_daily_stats',
  AUDIT_LOGS: 'ad_audit_logs',
  SETTINGS: 'ad_settings',
  FEATURE_CONTROLS: 'ad_feature_controls',
} as const;

export type AdCollectionName = (typeof AD_COLLECTIONS)[keyof typeof AD_COLLECTIONS];

/**
 * PHASE 2 - doc id of the single ad_settings document (AD_COLLECTIONS.SETTINGS)
 * that holds the Global Controls (Global Ads / Direct MySheba Ads /
 * Banner / Native / Interstitial) - see AdSettings in
 * src/types/ads.ts and adControlsService.js. One doc, same "single
 * settings/{id} doc per config group" shape this app already uses
 * elsewhere (e.g. settings/featureAccess - see featureAccessService.js).
 */
export const AD_SETTINGS_DOC_ID = 'general';

/**
 * Storage path prefixes. Firebase Storage has no real "folders" - a path
 * only exists once something is uploaded under it - so this is the
 * logical structure the PHASE 1 brief asked for: the set of prefixes
 * storage.rules grants write access to (superadmin only, see the
 * "PHASE 1 - Advertisement System" section there) and that a later
 * phase's upload helper (adService.js) will target. Nothing is uploaded
 * by this phase - see adService.js's uploadAdCreative for the Phase 2 stub.
 */
export const AD_STORAGE_PATHS = {
  BANNERS: 'ads/banners',
  NATIVE: 'ads/native',
  INTERSTITIAL: 'ads/interstitial',
  ADVERTISERS: 'ads/advertisers',
} as const;

export type AdStoragePath = (typeof AD_STORAGE_PATHS)[keyof typeof AD_STORAGE_PATHS];
