// PHASE 1 FOUNDATION - MySheba Advertisement System.
// PHASE 4 - basic implementation (status/schedule + feature/placement only).
// PHASE 5 - MY SHEBA AD TARGETING ENGINE. This phase finishes what PHASE 4
// explicitly deferred: every remaining targeting dimension on an
// Advertisement (src/types/ads.ts) is now evaluated -
//
//   targetFeatures     (PHASE 4 - unchanged)
//   targetCountries    (NEW)
//   targetStates       (NEW)
//   targetCities       (NEW)
//   targetAreas        (NEW)
//   targetOutlets      (NEW)
//   targetUserTypes    (NEW)
//   targetLanguages    (NEW)
//
// plus a single consolidated entry point, getEligibleAds(), that a caller
// (SmartAd.js) can use instead of hand-composing adControlsService.canShowAd
// + matchesTargeting + an adType filter itself - see that function's own
// header comment below for exactly what it evaluates and in what order.
//
// DEFAULT / EMPTY-MEANS-UNRESTRICTED (unchanged convention from PHASE 4):
// an empty target* array on the ad means "no restriction on this
// dimension" - it matches every value, including a context with that
// field missing entirely.
//
// MISSING CONTEXT ON A RESTRICTED DIMENSION (PHASE 5 decision, new -
// PHASE 4 never had to make this call since it never evaluated these
// dimensions at all): when an ad DOES restrict a dimension (a non-empty
// target array) but the caller's context has no value for that same
// dimension (e.g. an ad has targetCountries: ['MY'] but the context has
// no `country` at all), this phase treats that as NOT eligible - fails
// closed, not open. Reasoning: a targeting restriction is the advertiser
// paying to reach a specific audience; showing it to an audience this
// code can't confirm matches would silently defeat that restriction
// (and, worse, silently over-serve a Malaysia-only ad to a Bangladesh
// user the one time the app doesn't know the user's country yet). This
// mirrors how targetFeatures/placementId already behaved in PHASE 4 -
// both were always supplied by SmartAd, so this distinction never came
// up there, but the same "restricted + unknown = no match" logic is the
// only one of the two options that can't be exploited to silently bypass
// a restriction.

import { getEffectiveAdStatus } from './adService';
import { canShowAd, isPlacementEnabled } from './adControlsService';
import { matchesTargeting as matchesTargetingRules } from '../utils/adTargetingRules';

/**
 * The context a targeting decision is made against - deliberately a
 * separate type from the user's Firestore profile doc, so this service
 * doesn't take a hard dependency on that shape; a caller builds this from
 * whatever it has on hand (AppContext's profile, device locale, current
 * screen/feature).
 * @typedef {Object} AdTargetingContext
 * @property {string} [country]
 * @property {string} [state]
 * @property {string} [city]
 * @property {string} [area]
 * @property {string} [outletId]
 * @property {string} [userType] - e.g. 'customer' | 'dealer' | 'dealer' | 'reseller' | 'admin' | 'superadmin' (see src/constants/adTargeting.js's AD_USER_TYPES) - PHASE 5: should come from a server-trusted source (users/{uid}.role, e.g. AppContext's `profile.role`), never from anything a client can set arbitrarily. See this file's SECURITY note below.
 * @property {string} [language] - e.g. 'en' | 'bn' | 'ms'
 * @property {import('../constants/adPlacements').PlacementId} [placementId]
 * @property {import('../constants/adFeatures').FeatureId} [featureId]
 */

// ---- SECURITY (PHASE 5 brief: "Targeting decisions should not depend
// solely on untrusted client input") ----
//
// Every dimension this file evaluates reads from an Advertisement doc a
// signed-in user can already read in full (firestore.rules: `allow read:
// if signedIn()` on advertisements/{adId} - unchanged since PHASE 1), so
// there's no new server-side read to lock down here. The actual risk
// this phase has to guard against is the CONTEXT side: whoever calls
// matchesTargeting/getEligibleAds decides what `context.userType` is, and
// if that ever came from something a user can edit client-side (a local
// setting, a query param, anything not backed by a Firestore-rules-
// protected field), a user could hand-pick which user-type-restricted ads
// they see - low severity (it's ad content, not a permission), but still
// not the intended behavior. This file itself has no way to enforce
// that - it's a pure function of whatever context it's given - so the
// enforcement point is the call site: SmartAd.js builds `userType` from
// AppContext's `profile.role`, which is populated by a live Firestore
// listener on users/{uid} - a field firestore.rules protects from
// self-editing (see "role (as EVERY client write...)" in that file's
// users/{uid} section) - never from any prop/param a screen could pass
// in freely. Any future call site MUST source userType the same way.

/**
 * True only if `ad` is currently eligible for `context`, across every
 * targeting dimension the Advertisement model defines:
 *   - effectively live right now (getEffectiveAdStatus === 'active' -
 *     schedule-aware).
 *   - belongs to `context.placementId` (when both the ad's `placements`
 *     array and `context.placementId` are given).
 *   - PHASE 5: targetCountries / targetStates / targetCities /
 *     targetAreas / targetOutlets / targetFeatures / targetUserTypes /
 *     targetLanguages, each matched against the context's country /
 *     state / city / area / outletId / featureId / userType / language -
 *     empty array = unrestricted, non-empty array + missing context
 *     value = not eligible (see file header).
 *
 * The actual per-dimension comparisons live in
 * src/utils/adTargetingRules.js (a zero-dependency module the PHASE 5
 * acceptance tests require() directly - see that file's header comment);
 * this function's only job is resolving the one input that module can't
 * compute itself, the ad's schedule-aware effective status.
 * @param {import('../types/ads').Advertisement} ad
 * @param {AdTargetingContext} context
 * @returns {boolean}
 */
export function matchesTargeting(ad, context) {
  if (!ad) return false;
  return matchesTargetingRules(ad, context, getEffectiveAdStatus(ad));
}

/**
 * Runs matchesTargeting against every ad in `ads`, returns only the ones
 * that pass.
 * @param {import('../types/ads').Advertisement[]} ads
 * @param {AdTargetingContext} context
 * @returns {import('../types/ads').Advertisement[]}
 */
export function filterAdsForContext(ads, context) {
  if (!Array.isArray(ads)) return [];
  return ads.filter((ad) => matchesTargeting(ad, context));
}

/**
 * PHASE 5 - the single function a rendering call site should use to go
 * from "every ad in this placement's Firestore listener" to "the ads
 * that are actually allowed to show right now", in one call. Evaluates,
 * in order (short-circuiting the same way SmartAd.js's PHASE 4 six-step
 * comment already documented, just consolidated into one function):
 *
 *   1. Global ad setting     - adControlsService.isGlobalAdTypeEnabled
 *   2. Feature setting       - adControlsService.isFeatureAdTypeEnabled
 *   3. Placement setting     - adControlsService.isPlacementEnabled (PHASE 6 - ad_placements/{id}.enabled)
 *   4. adType                - ad.adType (defaulted to 'banner') must equal `adType`
 *   5. Advertisement status  - matchesTargeting -> getEffectiveAdStatus === 'active'
 *   6. Schedule              - matchesTargeting -> getEffectiveAdStatus (schedule-aware)
 *   7. Placement              - matchesTargeting -> ad.placements vs context.placementId
 *   8. Feature (targeting)   - matchesTargeting -> ad.targetFeatures vs context.featureId
 *   9. Geographic targeting  - matchesTargeting -> targetCountries/States/Cities/Areas/Outlets
 *  10. User targeting        - matchesTargeting -> targetUserTypes vs context.userType
 *  11. Language targeting    - matchesTargeting -> targetLanguages vs context.language
 *  12. Ad network            - adControlsService.isAdNetworkEnabled (per-candidate, an ad's own `network`)
 *  13. Campaign/Advertiser   - PHASE 9: if the ad is attached to a campaign
 *      (ad.campaignId) and options.campaignsById is supplied, the campaign
 *      must itself be effectively 'active' (schedule-aware, same check as
 *      step 6); if that campaign's advertiser (campaign.advertiserId) is
 *      also in options.advertisersById, the advertiser must not be
 *      'suspended'. An ad with no campaignId, or a campaignId that isn't a
 *      key in campaignsById (map not supplied, or campaign not loaded
 *      yet), skips this step and is treated as eligible on this dimension
 *      alone - same fail-open-on-missing-context posture PHASE 4's plain
 *      status/schedule check already had before targeting existed, kept
 *      deliberately different from steps 9-11's fail-closed rule above:
 *      those dimensions are the ADVERTISER's own paid-for targeting
 *      restriction, where failing open would silently defeat something
 *      they paid for, whereas this step is an ADMIN-side kill switch
 *      (Deactivate/Pause on the campaign or advertiser) - a caller that
 *      hasn't wired the maps in yet should not have every banner vanish.
 *
 * If Global Controls, this feature's controls, or this placement's own
 * config already disable things (steps 1-3), this returns [] immediately
 * without even looking at `ads` - same short-circuit SmartAd.js's
 * `typeGateOpen` already did for steps 1-2, just moved in here (plus the
 * PHASE 6 placement check) so a caller doesn't have to duplicate any of
 * it anymore.
 *
 * @param {import('../types/ads').Advertisement[]} ads - already-fetched candidates (e.g. from adService.subscribeAdvertisementsByPlacement).
 * @param {Object} options
 * @param {AdTargetingContext} [options.context] - see matchesTargeting's typedef above.
 * @param {import('../types/ads').AdSettings} [options.adSettings]
 * @param {import('../types/ads').AdFeatureControl} [options.featureControl]
 * @param {import('../types/ads').AdPlacement} [options.placementConfig] - PHASE 6, ad_placements/{placementId}; missing/undefined reads as enabled (see isPlacementEnabled).
 * @param {import('../constants/adEnums').AdType} [options.adType] - defaults to 'banner', matching SmartAd's own default.
 * @param {Record<string, import('../types/ads').AdCampaign & {id: string}>} [options.campaignsById] - PHASE 9, keyed by campaignId; see step 13 above.
 * @param {Record<string, import('../types/ads').AdAdvertiser & {id: string}>} [options.advertisersById] - PHASE 9, keyed by advertiserId; see step 13 above.
 * @returns {import('../types/ads').Advertisement[]}
 */
export function getEligibleAds(ads, options) {
  const { context, adSettings, featureControl, placementConfig, adType = 'banner', campaignsById, advertisersById } = options || {};

  // steps 1-3 - format/placement-level gate, no candidate even needs to
  // be looked at if the whole format or this placement is off (canShowAd
  // with no `network` yet still correctly evaluates the global/feature
  // adType switches - the per-candidate network check below is what
  // needs each real ad).
  if (!canShowAd({ adSettings, featureControl, adType })) return [];
  if (!isPlacementEnabled(placementConfig)) return [];
  if (!Array.isArray(ads) || ads.length === 0) return [];

  return ads
    .filter((ad) => (ad.adType || 'banner') === adType) // step 4
    .filter((ad) => matchesTargeting(ad, context)) // steps 5-11
    .filter((ad) => canShowAd({ adSettings, featureControl, adType, network: ad.network })) // step 12
    .filter((ad) => isCampaignAndAdvertiserEligible(ad, campaignsById, advertisersById)); // step 13
}

/**
 * PHASE 9 - step 13's per-ad check, split out so it stays independently
 * readable/testable. See getEligibleAds's own step-13 doc above for the
 * fail-open-on-missing-map reasoning.
 * @param {import('../types/ads').Advertisement} ad
 * @param {Record<string, any>} [campaignsById]
 * @param {Record<string, any>} [advertisersById]
 * @returns {boolean}
 */
function isCampaignAndAdvertiserEligible(ad, campaignsById, advertisersById) {
  if (!ad || !ad.campaignId || !campaignsById) return true;
  const campaign = campaignsById[ad.campaignId];
  if (!campaign) return true; // not loaded yet - fail open, see doc above
  if (getEffectiveAdStatus(campaign) !== 'active') return false;

  if (!campaign.advertiserId || !advertisersById) return true;
  const advertiser = advertisersById[campaign.advertiserId];
  if (!advertiser) return true;
  return advertiser.status !== 'suspended';
}
