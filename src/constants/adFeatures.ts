// PHASE 1 FOUNDATION - MySheba Advertisement System.
// Fixed-choice feature ids used by ad targeting and placements.
export const FEATURE_IDS = {
  HOME: 'home',
  MOBILE_RECHARGE: 'mobile_recharge',
  INTERNET_PACKAGE: 'internet_package',
  MOBILE_BANKING: 'mobile_banking',
  REMITTANCE: 'remittance',
  AIR_TICKET: 'air_ticket',
  JOBS: 'jobs',
  ACCOMMODATION: 'accommodation',
  BUY_SELL: 'buy_sell',
  SERVICES: 'services',
  COMMUNITY: 'community',
  HELP_SUPPORT: 'help_support',
} as const;

export type FeatureId = (typeof FEATURE_IDS)[keyof typeof FEATURE_IDS];

export const FEATURE_LABELS: Record<FeatureId, string> = {
  [FEATURE_IDS.HOME]: 'Home',
  [FEATURE_IDS.MOBILE_RECHARGE]: 'Mobile Recharge',
  [FEATURE_IDS.INTERNET_PACKAGE]: 'Internet Package',
  [FEATURE_IDS.MOBILE_BANKING]: 'Mobile Banking',
  [FEATURE_IDS.REMITTANCE]: 'Remittance',
  [FEATURE_IDS.AIR_TICKET]: 'Air Ticket',
  [FEATURE_IDS.JOBS]: 'Jobs',
  [FEATURE_IDS.ACCOMMODATION]: 'Accommodation',
  [FEATURE_IDS.BUY_SELL]: 'Buy & Sell',
  [FEATURE_IDS.SERVICES]: 'Services',
  [FEATURE_IDS.COMMUNITY]: 'Community',
  [FEATURE_IDS.HELP_SUPPORT]: 'Help / Support',
};

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
