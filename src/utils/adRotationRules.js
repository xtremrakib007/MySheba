// PHASE 4 FOUNDATION, PHASE 6 - MySheba Advertisement System - Ad Rotation Engine.
//
// The actual selection/rotation algorithm behind adRotationService's
// selectAdForPlacement/getRotationForPlacement, pulled into a
// zero-dependency CommonJS module for the same reason as
// adScheduleUtils.js/adTargetingRules.js (see those files' header
// comments): so scripts/phase6-campaign-scheduling-tests.js can require()
// the EXACT code the app runs, in a plain Node process, with no
// Firebase/Expo/Metro/npm install involved - not a hand-copied
// re-implementation that could quietly drift from the real thing.
//
// src/firebase/adRotationService.js imports every export below and
// re-exports selectAdForPlacement/getRotationForPlacement under the same
// names/signatures Phase 4 already established (SmartAd.js is unaffected),
// just now threading through an optional placementConfig (ad_placements/
// {id} - AdPlacement in src/types/ads.ts) for maxConcurrentAds.
//
// PHASE 6 CHANGES FROM PHASE 4:
//   - getRotationForPlacement no longer returns a fixed weight-descending
//     order. A carousel that always opens on the highest-weight ad and
//     always cycles the same direction IS "always displaying the same
//     banner first" in every practical sense (first slide gets the most
//     eye time) - the PHASE 6 brief's ROTATION section ("Do not always
//     display the same banner if multiple eligible banners exist") calls
//     that out directly. This phase replaces the stable weight-sort with
//     weightedShuffle: a weighted-random permutation, recomputed every
//     call, so which ad opens the carousel varies (still weighted - a
//     weight-50 ad opens it more often than a weight-20 one, just not
//     100% of the time).
//   - maxConcurrentAds: PHASE 4's header comment explicitly deferred
//     "per-placement maxConcurrentAds/AdPlacement config lookup" - this
//     phase adds it as an optional parameter (falls back to the same
//     MAX_ROTATION_ADS=5 hard ceiling Phase 4 used when a placement has no
//     configured value, or the configured value is invalid/<=0).
//
// selectAdForPlacement's own behavior (highest-priority tier, then
// weighted-random single pick) is UNCHANGED from Phase 4 - it was already
// random per call (Math.random()-backed weightedPick), so it already
// satisfied "don't always show the same banner" for single-ad placements.

const MAX_ROTATION_ADS = 5;

function weightOf(ad) {
  const w = Number(ad && ad.weight);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

function priorityOf(ad) {
  const p = Number(ad && ad.priority);
  return Number.isFinite(p) ? p : 0;
}

/** The highest-priority tier among `ads` (every ad sharing the max
 * `priority` value present) - empty in, empty out. Higher priority always
 * wins outright; weight only ever breaks ties within this tier - an ad
 * with priority 1/weight 1000 never displaces one with priority 2/weight 1,
 * matching the brief's "Higher priority campaigns should receive stronger
 * preference." */
function topPriorityTier(ads) {
  if (!ads.length) return [];
  const top = Math.max(...ads.map(priorityOf));
  return ads.filter((ad) => priorityOf(ad) === top);
}

/** One weighted-random pick from `ads` - each ad's chance of being picked
 * is its own weight over the sum of all weights present. `rng` defaults to
 * Math.random but is injectable so a caller (or a test) can get a
 * deterministic sequence without touching global state. Falls back to the
 * first ad if every weight resolves to 0 (shouldn't happen given
 * weightOf's own >0 floor, but keeps this from ever returning null on a
 * non-empty input). */
function weightedPick(ads, rng) {
  if (!ads.length) return null;
  const random = typeof rng === 'function' ? rng : Math.random;
  const total = ads.reduce((sum, ad) => sum + weightOf(ad), 0);
  if (total <= 0) return ads[0];
  let r = random() * total;
  for (const ad of ads) {
    r -= weightOf(ad);
    if (r <= 0) return ad;
  }
  return ads[ads.length - 1];
}

/**
 * A weighted-random PERMUTATION of `ads` (every element present exactly
 * once, order approximates weight - example distribution 50/30/20 gives
 * A the best odds of landing first, not a guarantee - see the brief's
 * WEIGHT section: "Do not guarantee exact percentages"), built by
 * repeatedly weightedPick-ing from whatever remains. `rng` is injectable,
 * same as weightedPick, purely for deterministic tests. Never mutates
 * `ads`.
 */
function weightedShuffle(ads, rng) {
  const remaining = ads.slice();
  const result = [];
  while (remaining.length) {
    const pick = weightedPick(remaining, rng);
    const idx = remaining.indexOf(pick);
    remaining.splice(idx, 1);
    result.push(pick);
  }
  return result;
}

/** The rotation cap for a placement: its own configured
 * AdPlacement.maxConcurrentAds when that's a finite positive integer,
 * otherwise the MAX_ROTATION_ADS hard ceiling Phase 4 always used - a
 * placement with no config doc yet (or an admin-entered 0/negative/NaN
 * value) still gets a sane bound instead of an unbounded carousel. */
function rotationCap(placementConfig) {
  const configured = Number(placementConfig && placementConfig.maxConcurrentAds);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(Math.floor(configured), MAX_ROTATION_ADS * 4); // sanity ceiling even on a misconfigured admin value
  }
  return MAX_ROTATION_ADS;
}

/**
 * Picks one ad from `eligibleAds` (already filtered for `placementId` by
 * adTargetingService.filterAdsForContext) - highest priority first,
 * weighted-random by weight among ties. null if `eligibleAds` is empty.
 */
function selectAdForPlacement(eligibleAds, rng) {
  const ads = Array.isArray(eligibleAds) ? eligibleAds : [];
  return weightedPick(topPriorityTier(ads), rng);
}

/**
 * For a placement meant to rotate through more than one ad (e.g. SmartAd's
 * carousel for Home) rather than always showing a single top pick, returns
 * the set to rotate through: the same highest-priority tier
 * selectAdForPlacement picks from, in a fresh weighted-random order each
 * call (see weightedShuffle above), capped per rotationCap(placementConfig).
 * Empty array in, empty array out.
 */
function getRotationForPlacement(eligibleAds, placementConfig, rng) {
  const ads = Array.isArray(eligibleAds) ? eligibleAds : [];
  return weightedShuffle(topPriorityTier(ads), rng).slice(0, rotationCap(placementConfig));
}

module.exports = {
  MAX_ROTATION_ADS,
  weightOf,
  priorityOf,
  topPriorityTier,
  weightedPick,
  weightedShuffle,
  rotationCap,
  selectAdForPlacement,
  getRotationForPlacement,
};
