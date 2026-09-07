// PHASE 8 - MySheba Advertisement System - ADVERTISEMENT ANALYTICS.
// DATE RANGE / CTR / AGGREGATION math.
//
// Zero-dependency CommonJS module (same reason as adScheduleUtils.js/
// adRotationRules.js/adFrequencyRules.js/adTrackingRules.js - see those
// files' header comments): scripts/phase8-ad-analytics-tests.js
// require()s this directly, so what's under test is the exact math
// src/firebase/adAnalyticsService.js runs, not a parallel
// re-implementation. This file has no idea what Firestore, a dashboard
// card, or a report table is - it only turns (a filter key + now) into a
// ['YYYY-MM-DD', 'YYYY-MM-DD'] range, and a plain array of
// AdDailyStat-shaped rows (src/types/ads.ts) into summed/grouped
// impressions+clicks+CTR numbers.
//
// DATE KEY: every function below deals in 'YYYY-MM-DD' UTC calendar-day
// strings - the exact shape of AdDailyStat.date - never a Date object or
// millis, so a value produced here can be dropped straight into a
// Firestore `where('date', '>=', startKey)` range query. dateKeyFromMillis
// uses UTC (getUTCFullYear/Month/Date), matching
// functions/adTrackingService.js's DAILY ROLLUP section exactly - both
// sides of this feature must agree on what day an event "happened on", or
// a report keyed by one and queried by the other would silently miss rows
// right at a day boundary.
//
// CTR: clicks / impressions x 100, per the brief's own CTR section -
// ctrOf is the ONE place that division happens, so "handle zero
// impressions safely" (also the brief's own words) is guaranteed
// everywhere a CTR number is produced in this file, not re-implemented
// per call site.

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** millis -> 'YYYY-MM-DD', UTC calendar day. See file header - this must
 * stay in lockstep with functions/adTrackingService.js's own
 * dateKeyFromMillis. */
function dateKeyFromMillis(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * CTR = clicks / impressions * 100, safe on zero impressions (the brief's
 * own "handle zero impressions safely" instruction) - returns 0 rather
 * than NaN/Infinity so every dashboard/report number stays a plain,
 * renderable number.
 * @param {number} impressions
 * @param {number} clicks
 * @returns {number}
 */
function ctrOf(impressions, clicks) {
  const imp = Number(impressions) || 0;
  const clk = Number(clicks) || 0;
  if (imp <= 0) return 0;
  return (clk / imp) * 100;
}

/**
 * FILTERS - "Today / Yesterday / Last 7 Days / Last 30 Days / Custom Date
 * Range", per the brief's own FILTERS section vocabulary. Returns an
 * inclusive ['startKey', 'endKey'] pair of 'YYYY-MM-DD' UTC calendar-day
 * strings, ready to hand straight to a Firestore range query on
 * AdDailyStat.date. 'last7'/'last30' both include TODAY as their most
 * recent day (a 7-day window ending today has 7 days total, i.e. today
 * minus 6, not today minus 7) - the more intuitive reading of "Last 7
 * Days" on a dashboard someone is looking at right now.
 * @param {'today' | 'yesterday' | 'last7' | 'last30' | 'custom'} filterKey
 * @param {number} nowMs
 * @param {{ startKey: string, endKey: string }} [customRange] - required, and used verbatim, when filterKey === 'custom'
 * @returns {{ startKey: string, endKey: string }}
 */
function resolveDateRange(filterKey, nowMs, customRange) {
  const today = dateKeyFromMillis(nowMs);
  switch (filterKey) {
    case 'today':
      return { startKey: today, endKey: today };
    case 'yesterday': {
      const y = dateKeyFromMillis(nowMs - DAY_MS);
      return { startKey: y, endKey: y };
    }
    case 'last7':
      return { startKey: dateKeyFromMillis(nowMs - 6 * DAY_MS), endKey: today };
    case 'last30':
      return { startKey: dateKeyFromMillis(nowMs - 29 * DAY_MS), endKey: today };
    case 'custom':
      if (!customRange || !customRange.startKey || !customRange.endKey) {
        throw new Error("resolveDateRange: filterKey 'custom' requires a { startKey, endKey } customRange");
      }
      // Swap rather than throw on an inverted range (a custom-range date
      // picker can't itself stop someone tapping an end date before the
      // start date) - a dashboard should still render something sensible,
      // not error out on what's clearly just a user mis-tap.
      return customRange.startKey <= customRange.endKey
        ? { startKey: customRange.startKey, endKey: customRange.endKey }
        : { startKey: customRange.endKey, endKey: customRange.startKey };
    default:
      return { startKey: today, endKey: today };
  }
}

/**
 * DASHBOARD/REPORTS - sums impressions/clicks across every row (each row
 * being one AdDailyStat-shaped object, i.e. one ad_daily_stats doc), and
 * derives CTR from the summed totals (not an average of each row's own
 * CTR - summing then dividing is the only way the top-line CTR stays
 * consistent with "total clicks / total impressions" across every ad in
 * range, matching the brief's own CTR formula).
 * @param {Array<{impressions?: number, clicks?: number}>} rows
 * @returns {{ impressions: number, clicks: number, ctr: number }}
 */
function sumStats(rows) {
  const impressions = rows.reduce((sum, r) => sum + (Number(r.impressions) || 0), 0);
  const clicks = rows.reduce((sum, r) => sum + (Number(r.clicks) || 0), 0);
  return { impressions, clicks, ctr: ctrOf(impressions, clicks) };
}

/**
 * REPORTS - groups `rows` by `keyFn(row)`, summing impressions/clicks per
 * group and deriving that group's own CTR the same "sum then divide" way
 * sumStats does above. Used for all four PHASE 8 reports (Campaign/
 * Feature/Placement/Advertiser Performance) - each just picks a different
 * keyFn over the same ad_daily_stats rows. Sorted by impressions
 * descending (highest-traffic rows first), the natural "what's performing"
 * reading order for a performance table.
 * @param {Array<{impressions?: number, clicks?: number}>} rows
 * @param {(row: any) => string} keyFn
 * @returns {Array<{ key: string, impressions: number, clicks: number, ctr: number }>}
 */
function aggregateBy(rows, keyFn) {
  const byKey = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    const entry = byKey.get(key) || { key, impressions: 0, clicks: 0 };
    entry.impressions += Number(row.impressions) || 0;
    entry.clicks += Number(row.clicks) || 0;
    byKey.set(key, entry);
  });
  return Array.from(byKey.values())
    .map((entry) => ({ ...entry, ctr: ctrOf(entry.impressions, entry.clicks) }))
    .sort((a, b) => b.impressions - a.impressions);
}

module.exports = {
  DAY_MS,
  dateKeyFromMillis,
  ctrOf,
  resolveDateRange,
  sumStats,
  aggregateBy,
};
