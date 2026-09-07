// PHASE 6 - MySheba Advertisement System - Campaign Scheduling & Rotation.
// FREQUENCY section.
//
// Zero-dependency CommonJS module (same reason as adScheduleUtils.js/
// adTargetingRules.js/adRotationRules.js - see those files' header
// comments): scripts/phase6-campaign-scheduling-tests.js require()s this
// directly so what's under test is the exact caps math adTrackingService.js
// runs, not a parallel re-implementation.
//
// This file only does the WINDOW MATH (given a list of event millisecond
// timestamps and a cap, is the caller still under it) - it has no idea
// what a Firestore Timestamp or an ad_impressions doc looks like.
// adTrackingService.js is what turns a Firestore query result into a
// plain `number[]` of millis and calls in here; keeping that conversion
// out of this file is exactly why it can be required() in plain Node with
// no Firebase SDK installed.
//
// TIMEZONE (PHASE 6 brief: "Use a consistent timezone strategy... do not
// rely on device-local time for campaign authorization"): every window
// boundary here is computed from `nowMs` (a plain UTC millisecond
// timestamp - Date.now() or a Firestore Timestamp already resolved to
// millis by the caller) using UTC calendar math (startOfUtcDay below), so
// two devices in different timezones checking the same ad at the same
// instant get the same window boundary and the same answer. "Per day"
// therefore means "per UTC calendar day" everywhere in this file, not
// "per device-local day" - a deliberate, consistent choice rather than
// one that silently shifts with whoever's phone is asking.

const HOUR_MS = 60 * 60 * 1000;

/** Start of the UTC calendar day containing `nowMs`, in millis. */
function startOfUtcDay(nowMs) {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Start of the trailing 1-hour window ending at `nowMs`, in millis - a
 * sliding window (now - 1h), not a calendar-hour bucket, so "max N per
 * hour" can't be gamed by bursting right at a calendar-hour boundary. */
function startOfTrailingHour(nowMs) {
  return nowMs - HOUR_MS;
}

/** How many of `eventTimestampsMs` fall at or after `sinceMs`. Ignores
 * anything falsy/non-numeric defensively (a still-pending serverTimestamp()
 * read back optimistically as null, before the server round-trip resolves
 * it, must never crash a cap check - see adTrackingService.js). */
function countEventsSince(eventTimestampsMs, sinceMs) {
  const events = Array.isArray(eventTimestampsMs) ? eventTimestampsMs : [];
  return events.filter((ms) => typeof ms === 'number' && Number.isFinite(ms) && ms >= sinceMs).length;
}

/** A cap of 0, null, undefined, or anything non-finite means "unlimited" -
 * matches DEFAULT_AD_SETTINGS.defaultMaxImpressionsPerUser/
 * defaultMaxClicksPerUser's own "0 = unlimited" convention
 * (adControlsService.js) and Advertisement.maxImpressionsPerUser/
 * maxClicksPerUser (src/types/ads.ts), so this file doesn't have to know
 * which of those two sources a caller resolved the cap from. */
function isUnlimited(cap) {
  const n = Number(cap);
  return !Number.isFinite(n) || n <= 0;
}

/**
 * True if showing one more impression of an ad with `maxPerDay` (an
 * Advertisement's own maxImpressionsPerUser, or the global/feature
 * default) would still be within the cap, given the UTC-calendar-day
 * impression timestamps already recorded for (this ad, this user).
 * @param {number[]} impressionTimestampsMs
 * @param {number} maxPerDay
 * @param {number} nowMs
 * @returns {boolean}
 */
function isUnderImpressionCap(impressionTimestampsMs, maxPerDay, nowMs) {
  if (isUnlimited(maxPerDay)) return true;
  return countEventsSince(impressionTimestampsMs, startOfUtcDay(nowMs)) < Number(maxPerDay);
}

/**
 * Same idea as isUnderImpressionCap, for maxClicksPerUser (an
 * Advertisement's own cap, per UTC calendar day).
 * @param {number[]} clickTimestampsMs
 * @param {number} maxPerDay
 * @param {number} nowMs
 * @returns {boolean}
 */
function isUnderClickCap(clickTimestampsMs, maxPerDay, nowMs) {
  if (isUnlimited(maxPerDay)) return true;
  return countEventsSince(clickTimestampsMs, startOfUtcDay(nowMs)) < Number(maxPerDay);
}

/**
 * True if showing one more interstitial would still be within
 * `maxPerHour` (a global/feature cap - see AdSettings.
 * maxInterstitialsPerUserPerHour in src/types/ads.ts - interstitials are a
 * full-screen format, so this cap is deliberately NOT per-ad the way
 * impressions/clicks are; it's "how many interstitials of ANY kind has
 * this user been shown in the trailing hour"), given every interstitial
 * impression timestamp already recorded for this user in that window.
 * @param {number[]} interstitialImpressionTimestampsMs
 * @param {number} maxPerHour
 * @param {number} nowMs
 * @returns {boolean}
 */
function isUnderInterstitialHourlyCap(interstitialImpressionTimestampsMs, maxPerHour, nowMs) {
  if (isUnlimited(maxPerHour)) return true;
  return countEventsSince(interstitialImpressionTimestampsMs, startOfTrailingHour(nowMs)) < Number(maxPerHour);
}

module.exports = {
  HOUR_MS,
  startOfUtcDay,
  startOfTrailingHour,
  countEventsSince,
  isUnlimited,
  isUnderImpressionCap,
  isUnderClickCap,
  isUnderInterstitialHourlyCap,
};
