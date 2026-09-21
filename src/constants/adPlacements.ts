// PHASE 1 FOUNDATION - MySheba Advertisement System.
//
// Every ad slot position an advertisement can be placed in
// (Advertisement.placements in src/types/ads.ts). No rendering code reads
// this yet - see adRotationService.js's selectAdForPlacement stub for
// where a placement id will actually pick which ad to show, in a later
// phase.
//
// Extend this by adding one more key: value pair, grouped under whichever
// FEATURE_IDS (adFeatures.ts) feature it belongs to - nothing else needs
// to change to recognize a new placement.
import { FEATURE_IDS, type FeatureId } from './adFeatures';

export const PLACEMENT_IDS = {
  // FEATURE_IDS.HOME
  HOME_TOP: 'HOME_TOP',
  HOME_MIDDLE: 'HOME_MIDDLE',
  HOME_BOTTOM: 'HOME_BOTTOM',

  // FEATURE_IDS.MOBILE_RECHARGE
  RECHARGE_TOP: 'RECHARGE_TOP',
  RECHARGE_BOTTOM: 'RECHARGE_BOTTOM',

  // FEATURE_IDS.INTERNET_PACKAGE
  INTERNET_TOP: 'INTERNET_TOP',
  INTERNET_BOTTOM: 'INTERNET_BOTTOM',

  // FEATURE_IDS.MOBILE_BANKING
  MOBILE_BANKING_TOP: 'MOBILE_BANKING_TOP',
  MOBILE_BANKING_BOTTOM: 'MOBILE_BANKING_BOTTOM',

  // FEATURE_IDS.REMITTANCE
  REMITTANCE_TOP: 'REMITTANCE_TOP',
  REMITTANCE_BOTTOM: 'REMITTANCE_BOTTOM',

  // FEATURE_IDS.AIR_TICKET
  FLIGHT_TOP: 'FLIGHT_TOP',
  FLIGHT_BOTTOM: 'FLIGHT_BOTTOM',

  // FEATURE_IDS.JOBS
  JOBS_TOP: 'JOBS_TOP',
  JOBS_BOTTOM: 'JOBS_BOTTOM',

  // FEATURE_IDS.HELP_SUPPORT
  HELP_SUPPORT_TOP: 'HELP_SUPPORT_TOP',
  HELP_SUPPORT_BOTTOM: 'HELP_SUPPORT_BOTTOM',
} as const;

export type PlacementId = (typeof PLACEMENT_IDS)[keyof typeof PLACEMENT_IDS];

/**
 * PHASE 3 - human-readable label per PLACEMENT_IDS value, for
 * BannerAdFormModal's Placement chips and BannerManagementScreen's list.
 */
export const PLACEMENT_LABELS: Record<PlacementId, string> = {
  [PLACEMENT_IDS.HOME_TOP]: 'Home - Top',
  [PLACEMENT_IDS.HOME_MIDDLE]: 'Home - Middle',
  [PLACEMENT_IDS.HOME_BOTTOM]: 'Home - Bottom',

  [PLACEMENT_IDS.RECHARGE_TOP]: 'Mobile Recharge - Top',
  [PLACEMENT_IDS.RECHARGE_BOTTOM]: 'Mobile Recharge - Bottom',

  [PLACEMENT_IDS.INTERNET_TOP]: 'Internet Package - Top',
  [PLACEMENT_IDS.INTERNET_BOTTOM]: 'Internet Package - Bottom',

  [PLACEMENT_IDS.MOBILE_BANKING_TOP]: 'Mobile Banking - Top',
  [PLACEMENT_IDS.MOBILE_BANKING_BOTTOM]: 'Mobile Banking - Bottom',

  [PLACEMENT_IDS.REMITTANCE_TOP]: 'Remittance - Top',
  [PLACEMENT_IDS.REMITTANCE_BOTTOM]: 'Remittance - Bottom',

  [PLACEMENT_IDS.FLIGHT_TOP]: 'Air Ticket - Top',
  [PLACEMENT_IDS.FLIGHT_BOTTOM]: 'Air Ticket - Bottom',

  [PLACEMENT_IDS.JOBS_TOP]: 'Jobs - Top',
  [PLACEMENT_IDS.JOBS_BOTTOM]: 'Jobs - Bottom',





  [PLACEMENT_IDS.HELP_SUPPORT_TOP]: 'Help / Support - Top',
  [PLACEMENT_IDS.HELP_SUPPORT_BOTTOM]: 'Help / Support - Bottom',
};

/**
 * PHASE 3 - which PLACEMENT_IDS belong to which FEATURE_IDS, mirroring the
 * grouping the `// FEATURE_IDS.X` comments above already encode, just in a
 * form BannerAdFormModal can actually look up at runtime: pick a Feature,
 * then only offer that feature's placements (form clears `placementId`
 * whenever `featureId` changes - see onChangeFeature there - since a
 * placement from a different feature would otherwise be silently invalid).
 */
export const PLACEMENTS_BY_FEATURE: Record<FeatureId, PlacementId[]> = {
  [FEATURE_IDS.HOME]: [PLACEMENT_IDS.HOME_TOP, PLACEMENT_IDS.HOME_MIDDLE, PLACEMENT_IDS.HOME_BOTTOM],
  [FEATURE_IDS.MOBILE_RECHARGE]: [PLACEMENT_IDS.RECHARGE_TOP, PLACEMENT_IDS.RECHARGE_BOTTOM],
  [FEATURE_IDS.INTERNET_PACKAGE]: [PLACEMENT_IDS.INTERNET_TOP, PLACEMENT_IDS.INTERNET_BOTTOM],
  [FEATURE_IDS.MOBILE_BANKING]: [PLACEMENT_IDS.MOBILE_BANKING_TOP, PLACEMENT_IDS.MOBILE_BANKING_BOTTOM],
  [FEATURE_IDS.REMITTANCE]: [PLACEMENT_IDS.REMITTANCE_TOP, PLACEMENT_IDS.REMITTANCE_BOTTOM],
  [FEATURE_IDS.AIR_TICKET]: [PLACEMENT_IDS.FLIGHT_TOP, PLACEMENT_IDS.FLIGHT_BOTTOM],
  [FEATURE_IDS.JOBS]: [PLACEMENT_IDS.JOBS_TOP, PLACEMENT_IDS.JOBS_BOTTOM],
  [FEATURE_IDS.ACCOMMODATION]: [PLACEMENT_IDS.ACCOMMODATION_TOP, PLACEMENT_IDS.ACCOMMODATION_BOTTOM],
  [FEATURE_IDS.BUY_SELL]: [PLACEMENT_IDS.BUY_SELL_TOP, PLACEMENT_IDS.BUY_SELL_BOTTOM],
  [FEATURE_IDS.SERVICES]: [PLACEMENT_IDS.SERVICES_TOP, PLACEMENT_IDS.SERVICES_BOTTOM],
  [FEATURE_IDS.COMMUNITY]: [PLACEMENT_IDS.COMMUNITY_TOP, PLACEMENT_IDS.COMMUNITY_BOTTOM],
  [FEATURE_IDS.HELP_SUPPORT]: [PLACEMENT_IDS.HELP_SUPPORT_TOP, PLACEMENT_IDS.HELP_SUPPORT_BOTTOM],
};
