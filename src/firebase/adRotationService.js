// PHASE 1 FOUNDATION - MySheba Advertisement System.
// PHASE 4 - basic implementation. SmartAd (src/components/SmartAd.js) is
// the first and only caller of this file.
// PHASE 6 - CAMPAIGN SCHEDULING AND ROTATION. The actual selection/
// rotation algorithm now lives in src/utils/adRotationRules.js (a
// zero-dependency CommonJS module scripts/phase6-campaign-scheduling-
// tests.js requires() directly - see that file's header comment for why,
// same pattern as adScheduleUtils.js/adTargetingRules.js). This file is a
// thin re-export that also resolves the one input the pure module can't
// take a position on itself: a placement's own AdPlacement config
// (ad_placements/{id}.maxConcurrentAds), so a caller here never has to
// import both adRotationRules AND adService just to pass maxConcurrentAds
// through - see getRotationForPlacement below.
//
// Given more than one Advertisement eligible for the same placement
// (already filtered by adTargetingService.getEligibleAds/filterAdsForContext),
// deciding WHICH one(s) to actually show: highest Advertisement.priority
// wins outright, weighted-random by `weight` among ties.

import {
  selectAdForPlacement as selectAdForPlacementPure,
  getRotationForPlacement as getRotationForPlacementPure,
} from '../utils/adRotationRules';

/**
 * Picks one ad from `eligibleAds` (already filtered for `placementId` by
 * adTargetingService.filterAdsForContext) - highest Advertisement.priority
 * first, weighted-random by Advertisement.weight among ties. null if
 * `eligibleAds` is empty. Random per call (see adRotationRules.js's
 * header comment) - so a placement rendering a single ad at a time still
 * doesn't always show the same one across mounts/refreshes when more than
 * one ad shares the top priority tier.
 * @param {import('../constants/adPlacements').PlacementId} _placementId
 * @param {import('../types/ads').Advertisement[]} eligibleAds
 * @returns {import('../types/ads').Advertisement | null}
 */
export function selectAdForPlacement(_placementId, eligibleAds) {
  return selectAdForPlacementPure(eligibleAds);
}

/**
 * For a placement meant to rotate through more than one ad (e.g. SmartAd's
 * carousel for Home) rather than always showing a single top pick, returns
 * the set to rotate through: the same highest-priority tier
 * selectAdForPlacement picks from, in a fresh weighted-random order every
 * call (PHASE 6 - see adRotationRules.js's weightedShuffle: which ad opens
 * the carousel now varies, not just which ad wins a single-pick
 * placement), capped to `placementConfig.maxConcurrentAds` when the
 * placement has one configured (ad_placements/{placementId} -
 * AdPlacement.maxConcurrentAds in src/types/ads.ts), otherwise the same
 * MAX_ROTATION_ADS=5 hard ceiling Phase 4 always used. Empty array in,
 * empty array out - SmartAd treats that as "nothing to show".
 * @param {import('../constants/adPlacements').PlacementId} _placementId
 * @param {import('../types/ads').Advertisement[]} eligibleAds
 * @param {import('../types/ads').AdPlacement} [placementConfig] - PHASE 6, optional so existing call sites that don't fetch a placement doc keep working unchanged (falls back to the MAX_ROTATION_ADS ceiling).
 * @returns {import('../types/ads').Advertisement[]}
 */
export function getRotationForPlacement(_placementId, eligibleAds, placementConfig) {
  return getRotationForPlacementPure(eligibleAds, placementConfig);
}
