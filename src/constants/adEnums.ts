// PHASE 1 FOUNDATION - MySheba Advertisement System.
//
// Runtime constant objects for every fixed-choice field on the ad model,
// each paired with the TS union type derived FROM that object (not typed
// separately) so the runtime list and the type can never drift apart -
// add a value here and both the constant and the type pick it up.

/** adType - see Advertisement.adType in src/types/ads.ts. */
export const AD_TYPES = {
  BANNER: 'banner',
  NATIVE: 'native',
  INTERSTITIAL: 'interstitial',
  SPONSORED: 'sponsored',
} as const;
export type AdType = (typeof AD_TYPES)[keyof typeof AD_TYPES];

/**
 * PHASE 2 - which ad network an Advertisement was sourced from: sold and
 * managed directly through this app's own advertisements/ad_campaigns
 * collections ("Direct MySheba Ads" in the Global Controls section of
 * AdFeatureControlsScreen), or served through Google AdMob. Independent
 * of AdType above (a banner can come from either network) - see
 * AdSettings.directAdsEnabled/admobEnabled in src/types/ads.ts and
 * adControlsService.js's isAdNetworkEnabled.
 */
export const AD_NETWORKS = {
  DIRECT: 'direct',
  ADMOB: 'admob',
} as const;
export type AdNetwork = (typeof AD_NETWORKS)[keyof typeof AD_NETWORKS];

/** clickAction.type - see ClickAction in src/types/ads.ts. */
export const CLICK_ACTION_TYPES = {
  NONE: 'none',
  URL: 'url',
  INTERNAL: 'internal',
  WHATSAPP: 'whatsapp',
  PHONE: 'phone',
} as const;
export type ClickActionType = (typeof CLICK_ACTION_TYPES)[keyof typeof CLICK_ACTION_TYPES];

/**
 * Advertisement.status - the full lifecycle. Deliberately kept as one flat
 * list rather than a state machine in this phase (no transition-validation
 * logic exists yet - see adService.js's updateAdvertisementStatus stub for
 * where that belongs in the current ad pipeline).
 */
export const AD_STATUSES = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  PAUSED: 'paused',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  ARCHIVED: 'archived',
} as const;
export type AdStatus = (typeof AD_STATUSES)[keyof typeof AD_STATUSES];

/**
 * PHASE 3 - human-readable label per AD_STATUSES value, for
 * BannerManagementScreen's status badge and anywhere else an AdStatus
 * needs to show up as text instead of its raw snake_case value.
 */
export const AD_STATUS_LABELS: Record<AdStatus, string> = {
  [AD_STATUSES.DRAFT]: 'Draft',
  [AD_STATUSES.PENDING_APPROVAL]: 'Pending Approval',
  [AD_STATUSES.APPROVED]: 'Approved',
  [AD_STATUSES.SCHEDULED]: 'Scheduled',
  [AD_STATUSES.ACTIVE]: 'Active',
  [AD_STATUSES.PAUSED]: 'Paused',
  [AD_STATUSES.REJECTED]: 'Rejected',
  [AD_STATUSES.EXPIRED]: 'Expired',
  [AD_STATUSES.ARCHIVED]: 'Archived',
};

/**
 * PHASE 3 - the status filter chips on BannerManagementScreen's list, per
 * the brief's FILTERS section ("All, Active, Scheduled, Paused, Expired,
 * Rejected, Draft"). 'all' is a UI-only pseudo-status (not in AD_STATUSES)
 * meaning "no status filter applied" - BannerManagementScreen checks for
 * it by key before comparing against adService.getEffectiveAdStatus.
 * Deliberately omits pending_approval/approved/archived: those aren't in
 * the brief's filter list (archived banners are hidden by default the
 * same way - there's no "Archived" chip - see BannerManagementScreen).
 */
export const BANNER_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: AD_STATUSES.ACTIVE, label: 'Active' },
  { key: AD_STATUSES.SCHEDULED, label: 'Scheduled' },
  { key: AD_STATUSES.PAUSED, label: 'Paused' },
  { key: AD_STATUSES.EXPIRED, label: 'Expired' },
  { key: AD_STATUSES.REJECTED, label: 'Rejected' },
  { key: AD_STATUSES.DRAFT, label: 'Draft' },
];

/**
 * PHASE 9 - ADVERTISER AND CAMPAIGN MANAGEMENT.
 *
 * AdCampaign.pricingModel - how this campaign's budget converts into
 * delivered impressions/clicks. Purely a record of what was agreed with
 * the advertiser (shown on CampaignFormModal/AdvertiserDetailScreen) -
 * no billing/metering logic reads this yet (that's ad_payments' concern,
 * still a later-phase Cloud Function per adCollections.ts's own
 * PAYMENTS comment).
 */
export const AD_PRICING_MODELS = {
  FIXED: 'fixed',
  CPM: 'cpm',
  CPC: 'cpc',
} as const;
export type AdPricingModel = (typeof AD_PRICING_MODELS)[keyof typeof AD_PRICING_MODELS];

export const AD_PRICING_MODEL_LABELS: Record<AdPricingModel, string> = {
  [AD_PRICING_MODELS.FIXED]: 'Fixed',
  [AD_PRICING_MODELS.CPM]: 'CPM',
  [AD_PRICING_MODELS.CPC]: 'CPC',
};

/** PHASE 9 - CampaignFormModal's Pricing Model chip row. */
export const AD_PRICING_MODEL_OPTIONS = [
  { key: AD_PRICING_MODELS.FIXED, label: AD_PRICING_MODEL_LABELS[AD_PRICING_MODELS.FIXED] },
  { key: AD_PRICING_MODELS.CPM, label: AD_PRICING_MODEL_LABELS[AD_PRICING_MODELS.CPM] },
  { key: AD_PRICING_MODELS.CPC, label: AD_PRICING_MODEL_LABELS[AD_PRICING_MODELS.CPC] },
];

/**
 * PHASE 9 - AdAdvertiser.status human-readable labels, for
 * AdvertiserManagementScreen/AdvertiserDetailScreen's status badge.
 * Matches AdAdvertiser['status'] in src/types/ads.ts ('active' |
 * 'suspended') - deliberately a two-value scheme, separate from the
 * broader AD_STATUSES lifecycle above, since an advertiser is a business
 * record, not a piece of schedulable ad inventory.
 */
export const ADVERTISER_STATUS_LABELS: Record<'active' | 'suspended', string> = {
  active: 'Active',
  suspended: 'Inactive',
};

/**
 * PHASE 9 - AdvertiserDetailScreen's Campaigns tab status filter chips.
 * Same "'all' is a UI-only pseudo-status" convention as
 * BANNER_STATUS_FILTERS above - compared against
 * adService.getEffectiveAdStatus(campaign), not the raw stored status.
 */
export const CAMPAIGN_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: AD_STATUSES.ACTIVE, label: 'Active' },
  { key: AD_STATUSES.SCHEDULED, label: 'Scheduled' },
  { key: AD_STATUSES.PAUSED, label: 'Paused' },
  { key: AD_STATUSES.EXPIRED, label: 'Expired' },
  { key: AD_STATUSES.DRAFT, label: 'Draft' },
];

/**
 * PHASE 10 - ADVERTISING PACKAGES AND PAYMENTS.
 *
 * AdPackage active/inactive filter chips for AdPackagesManagementScreen.
 * A package only ever has the one boolean (active) from the brief's
 * PACKAGE field list - no broader lifecycle like AD_STATUSES above, so
 * this is a plain 3-chip filter rather than a reused status list.
 */
export const PACKAGE_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

/**
 * PHASE 10 - AdPayment.paymentStatus - the brief's admin Payments tabs
 * (Pending / Paid / Failed / Refunded) exactly. See
 * PAYMENT_STATUS_TRANSITIONS in src/utils/adPackagePaymentRules.js for
 * which of these an existing payment may move between - this object is
 * just the fixed vocabulary, not the transition rules.
 */
export const AD_PAYMENT_STATUSES = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;
export type AdPaymentStatus = (typeof AD_PAYMENT_STATUSES)[keyof typeof AD_PAYMENT_STATUSES];

export const AD_PAYMENT_STATUS_LABELS: Record<AdPaymentStatus, string> = {
  [AD_PAYMENT_STATUSES.PENDING]: 'Pending',
  [AD_PAYMENT_STATUSES.PAID]: 'Paid',
  [AD_PAYMENT_STATUSES.FAILED]: 'Failed',
  [AD_PAYMENT_STATUSES.REFUNDED]: 'Refunded',
};

/** AdPaymentsManagementScreen's tab row - 'all' is the same UI-only
 * pseudo-status convention as BANNER_STATUS_FILTERS/CAMPAIGN_STATUS_FILTERS
 * above, matched against the raw paymentStatus field (payments have no
 * schedule-driven "effective" status the way ads/campaigns do). */
export const PAYMENT_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: AD_PAYMENT_STATUSES.PENDING, label: 'Pending' },
  { key: AD_PAYMENT_STATUSES.PAID, label: 'Paid' },
  { key: AD_PAYMENT_STATUSES.FAILED, label: 'Failed' },
  { key: AD_PAYMENT_STATUSES.REFUNDED, label: 'Refunded' },
];

/**
 * PHASE 10 - AdPayment.paymentMethod vocabulary for the admin manual-
 * payment form (AdPaymentFormModal). Separate from this app's existing
 * customer-facing topup method vocabulary (src/firebase/topupService.js's
 * 'transfer'/'deposit'/'duitnow') since ad payments are a B2B advertiser
 * flow recorded entirely by an admin, not a customer self-service
 * top-up - 'cash' and 'cheque' are common for that but never appear in
 * the topup flow's options.
 */
export const AD_PAYMENT_METHODS = {
  BANK_TRANSFER: 'bank_transfer',
  DUITNOW: 'duitnow',
  CASH: 'cash',
  CHEQUE: 'cheque',
  OTHER: 'other',
} as const;
export type AdPaymentMethod = (typeof AD_PAYMENT_METHODS)[keyof typeof AD_PAYMENT_METHODS];

export const AD_PAYMENT_METHOD_LABELS: Record<AdPaymentMethod, string> = {
  [AD_PAYMENT_METHODS.BANK_TRANSFER]: 'Bank Transfer',
  [AD_PAYMENT_METHODS.DUITNOW]: 'DuitNow QR',
  [AD_PAYMENT_METHODS.CASH]: 'Cash',
  [AD_PAYMENT_METHODS.CHEQUE]: 'Cheque',
  [AD_PAYMENT_METHODS.OTHER]: 'Other',
};

/** AdPaymentFormModal's Payment Method chip row. */
export const AD_PAYMENT_METHOD_OPTIONS = Object.values(AD_PAYMENT_METHODS).map((key) => ({
  key,
  label: AD_PAYMENT_METHOD_LABELS[key],
}));

/**
 * ad_audit_logs/{id}.action - mirrors the snake_case action-name
 * convention functions/logService.js already uses for userAuditLog
 * (e.g. 'wallet_velocity_blocked'). Writing ad_audit_logs entries is a
 * later-phase Cloud Function, same as userAuditLog - see the
 * "PHASE 1 - Advertisement System" section of firestore.rules for why the
 * client has no write path to this collection at all.
 */
export const AD_AUDIT_ACTIONS = {
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  APPROVE: 'approve',
  REJECT: 'reject',
  PAUSE: 'pause',
  ACTIVATE: 'activate',
  ARCHIVE: 'archive',
  SETTINGS_CHANGE: 'settings_change',
} as const;
export type AdAuditAction = (typeof AD_AUDIT_ACTIONS)[keyof typeof AD_AUDIT_ACTIONS];
