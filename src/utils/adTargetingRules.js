// PHASE 5 - MySheba Advertisement System - Ad Targeting Engine.
//
// The actual matching algorithm behind adTargetingService.matchesTargeting,
// pulled out into a zero-dependency CommonJS module for the same reason
// as adScheduleUtils.js (see that file's header comment): so
// scripts/phase5-ad-targeting-tests.js can require() the EXACT code the
// app runs, in a plain Node process, with no Firebase/Expo/Metro/npm
// install involved at all - not a hand-copied re-implementation that
// could quietly drift from the real thing.
//
// src/firebase/adTargetingService.js imports matchesTargeting from here
// and re-exports it (after resolving the one input this module can't
// compute itself - the ad's effective status - via adScheduleUtils.js),
// so every existing call site is unaffected.
//
// DEFAULT / EMPTY-MEANS-UNRESTRICTED and the FAIL-CLOSED-ON-MISSING-
// CONTEXT decision are both documented in full in adTargetingService.js's
// own header comment - this file is the implementation, that file is the
// place with the reasoning written out.

function matchesArrayTarget(targetArray, value) {
  const targets = Array.isArray(targetArray) ? targetArray : [];
  if (targets.length === 0) return true; // empty = unrestricted
  if (value === undefined || value === null || value === '') return false; // restricted + unknown context = fail closed
  return targets.includes(value);
}

/**
 * True only if `ad` is eligible for `context`, given its already-resolved
 * `effectiveStatus` (see adScheduleUtils.getEffectiveAdStatus - computed
 * by the caller so this module never has to know how a Firestore
 * Timestamp is shaped).
 * @param {Object} ad - an Advertisement-shaped plain object (src/types/ads.ts).
 * @param {Object} context - an AdTargetingContext-shaped plain object (see adTargetingService.js's typedef).
 * @param {string} effectiveStatus - the value adScheduleUtils.getEffectiveAdStatus(ad) returned.
 * @returns {boolean}
 */
function matchesTargeting(ad, context, effectiveStatus) {
  if (!ad) return false;
  const ctx = context || {};

  if (effectiveStatus !== 'active') return false;

  if (ctx.placementId && Array.isArray(ad.placements) && ad.placements.length > 0) {
    if (!ad.placements.includes(ctx.placementId)) return false;
  }

  if (!matchesArrayTarget(ad.targetFeatures, ctx.featureId)) return false;
  if (!matchesArrayTarget(ad.targetCountries, ctx.country)) return false;
  if (!matchesArrayTarget(ad.targetStates, ctx.state)) return false;
  if (!matchesArrayTarget(ad.targetCities, ctx.city)) return false;
  if (!matchesArrayTarget(ad.targetAreas, ctx.area)) return false;
  if (!matchesArrayTarget(ad.targetOutlets, ctx.outletId)) return false;
  if (!matchesArrayTarget(ad.targetUserTypes, ctx.userType)) return false;
  if (!matchesArrayTarget(ad.targetLanguages, ctx.language)) return false;

  return true;
}

module.exports = { matchesArrayTarget, matchesTargeting };
