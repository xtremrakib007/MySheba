// PHASE 1 FOUNDATION - MySheba Advertisement System.
//
// The set of app "features" an advertisement can target (Advertisement.
// targetFeatures in src/types/ads.ts) or a placement can belong to
// (adPlacements.ts). Deliberately its own small object, separate from the
// app's existing internal service keys (ServiceGrid.js's tile keys like
// those drive navigation/routing today and this phase isn't touching
// that. A later phase's targeting logic is what will map between the two
// (e.g. FEATURE_IDS.MOBILE_RECHARGE <-> the 'recharge' service key) -
// noted here so that mapping has an obvious home when it's built, not
// implemented now.
//
// Extend this by adding one more key: value pair - nothing else in the ad
// system needs to change to recognize a new feature id.
export const FEATURE_IDS = {
  HOME: 'home',
  MOBILE_RECHARGE: 'mobile_recharge',
  INTERNET_PACKAGE: 'internet_package',
  MOBILE_BANKING: 'mobile_banking',
  REMITTANCE: 'remittance',
  AIR_TICKET: 'air_ticket',
  JOBS: 'jobs',
  BUY_SELL: 'buy_sell',
  SERVICES: 'services',
  HELP_SUPPORT: 'help_support',
} as const;

export type FeatureId = (typeof FEATURE_IDS)[keyof typeof FEATURE_IDS];

/**
 * PHASE 2 - human-readable label per FeatureId, for AdFeatureControlsScreen's
 * table and any other admin UI. Keys deliberately match FEATURE_IDS 1:1 (a
 * `satisfies`-style completeness isn't enforced here since this file
 * targets the same "any .js file can import a plain object" babel-strip
 * approach as adCollections.ts - see that file's header comment - but
 * every FEATURE_IDS value must have an entry here).
 */
export const FEATURE_LABELS: Record<FeatureId, string> = {
  [FEATURE_IDS.HOME]: 'Home',
  [FEATURE_IDS.MOBILE_RECHARGE]: 'Mobile Recharge',
  [FEATURE_IDS.INTERNET_PACKAGE]: 'Internet Package',
  [FEATURE_IDS.MOBILE_BANKING]: 'Mobile Banking',
  [FEATURE_IDS.REMITTANCE]: 'Remittance',
  [FEATURE_IDS.AIR_TICKET]: 'Air Ticket',
  [FEATURE_IDS.JOBS]: 'Jobs',
  [FEATURE_IDS.BUY_SELL]: 'Buy & Sell',
  [FEATURE_IDS.SERVICES]: 'Services',
  [FEATURE_IDS.HELP_SUPPORT]: 'Help / Support',
};

/**
 * PHASE 2 - FEATURE_IDS values in the fixed display order the PHASE 2
 * brief lists them (Home first, Help / Support last) - Object.values on
 * FEATURE_IDS would happen to match this today, but AdFeatureControlsScreen
 * imports this explicit list rather than relying on object key order.
 */
export const FEATURE_ID_LIST: FeatureId[] = [
  FEATURE_IDS.HOME,
  FEATURE_IDS.MOBILE_RECHARGE,
  FEATURE_IDS.INTERNET_PACKAGE,
  FEATURE_IDS.MOBILE_BANKING,
  FEATURE_IDS.REMITTANCE,
  FEATURE_IDS.AIR_TICKET,
  FEATURE_IDS.JOBS,
  FEATURE_IDS.ACCOMMODATION,
  FEATURE_IDS.BUY_SELL,
  FEATURE_IDS.SERVICES,
  FEATURE_IDS.COMMUNITY,
  FEATURE_IDS.HELP_SUPPORT,
];
