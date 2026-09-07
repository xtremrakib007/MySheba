// PHASE 7 - MySheba Advertisement System - AD TRACKING.
// DUPLICATE PROTECTION section.
//
// Zero-dependency CommonJS module (same reason as adScheduleUtils.js/
// adRotationRules.js/adFrequencyRules.js - see those files' header
// comments): scripts/phase7-ad-tracking-tests.js require()s this
// directly, so what's under test is the exact cooldown math
// src/firebase/adTrackingService.js runs, not a parallel
// re-implementation.
//
// This file only does the "is (kind, adId, placementId) still on
// cooldown, given the last time it was recorded" bookkeeping - it has no
// idea what a React effect, a Firestore doc, or a component remount is.
// adTrackingService.js is what turns a live remount/rapid-tap into a call
// into here.
//
// See adTrackingService.js's own DUPLICATE PROTECTION comment for WHY
// this exists alongside (not instead of) SmartAd's activeAd.id effect
// dependency: a React re-render never reaches this code at all (the
// effect just doesn't re-run), so this module's whole job is catching
// what that dependency array structurally cannot - a REMOUNT that throws
// the effect's closure away and fires it fresh, or a rapid double-tap
// with no memory of the previous tap.

const DEFAULT_COOLDOWN_MS = 3000;

function makeKey(kind, adId, placementId) {
  return `${kind}:${adId || ''}:${placementId || ''}`;
}

/** A fresh, empty cooldown store - `Map<string, number>` of
 * makeKey(...) -> the millis timestamp it was last recorded at. Callers
 * (adTrackingService.js in production, this file's own tests) own the
 * store's lifetime; nothing in this module persists it anywhere. */
function createStore() {
  return new Map();
}

/**
 * True if (kind, adId, placementId) was already recorded within
 * `cooldownMs` of `nowMs`, per `store` - i.e. this exact event should be
 * treated as a duplicate (a remount or rapid repeat) and skipped rather
 * than recorded again.
 * @param {Map<string, number>} store
 * @param {'impression' | 'click'} kind
 * @param {string} adId
 * @param {string} placementId
 * @param {number} nowMs
 * @param {number} [cooldownMs]
 * @returns {boolean}
 */
function isOnCooldown(store, kind, adId, placementId, nowMs, cooldownMs = DEFAULT_COOLDOWN_MS) {
  const last = store.get(makeKey(kind, adId, placementId));
  return typeof last === 'number' && nowMs - last < cooldownMs;
}

/** Records that (kind, adId, placementId) was just recorded at `nowMs`,
 * so a subsequent isOnCooldown call within the same window returns true. */
function markRecorded(store, kind, adId, placementId, nowMs) {
  store.set(makeKey(kind, adId, placementId), nowMs);
}

module.exports = {
  DEFAULT_COOLDOWN_MS,
  createStore,
  isOnCooldown,
  markRecorded,
};
