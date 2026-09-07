#!/usr/bin/env node
// PHASE 8 — MY SHEBA AD ANALYTICS — acceptance tests.
//
// Runs with plain `node scripts/phase8-ad-analytics-tests.js` - no npm
// install, no Metro/Babel build step, no Firebase emulator, same pattern
// scripts/phase5-ad-targeting-tests.js / phase6-campaign-scheduling-tests.js
// / phase7-ad-tracking-tests.js already established. It works because it
// requires the SAME production logic src/firebase/adAnalyticsService.js
// runs (src/utils/adAnalyticsRules.js), not a hand-copied
// re-implementation.
//
// Covers the brief's own ACCEPTANCE TEST list - "Verify totals against
// tracking data" - by feeding this module small, hand-built sets of
// AdDailyStat-shaped rows (the exact shape ad_daily_stats docs have, and
// the exact shape functions/adTrackingService.js's DAILY ROLLUP section
// produces from tracking events) and checking the summed/grouped
// impressions+clicks+CTR numbers this module derives from them are
// arithmetically exact - plus the FILTERS date-range math and the CTR
// "handle zero impressions safely" requirement, both called out
// explicitly in the brief.
//
// Run: node scripts/phase8-ad-analytics-tests.js

const path = require('path');
const {
  dateKeyFromMillis, ctrOf, resolveDateRange, sumStats, aggregateBy, DAY_MS,
} = require(path.join(__dirname, '../src/utils/adAnalyticsRules'));

let pass = 0;
let fail = 0;
const failures = [];

function check(actual, expected, description) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${description}`);
  } else {
    fail += 1;
    failures.push(description);
    console.log(`  ✗ ${description} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// A fixed "now" - 2026-03-15T10:30:00Z - so every date-math assertion
// below is deterministic regardless of when this script actually runs.
const NOW = Date.UTC(2026, 2, 15, 10, 30, 0);

console.log('PHASE 8 — MY SHEBA AD ANALYTICS — acceptance tests\n');

// ---- 1. CTR calculation, including "handle zero impressions safely" ----
console.log('1. CTR calculation');
{
  check(ctrOf(200, 10), 5, 'CTR = clicks / impressions * 100 (10/200 = 5%)');
  check(ctrOf(3, 1), (1 / 3) * 100, 'CTR handles a non-round division correctly');
  check(ctrOf(0, 0), 0, 'CTR on zero impressions and zero clicks is 0, not NaN');
  check(ctrOf(0, 5), 0, 'CTR on zero impressions is 0 even if clicks is somehow non-zero (never divides by zero)');
  check(Number.isFinite(ctrOf(0, 0)), true, 'CTR on zero impressions is always a finite number, never Infinity/NaN');
}

// ---- 2. FILTERS - Today / Yesterday / Last 7 Days / Last 30 Days / Custom ----
console.log('\n2. FILTERS date ranges');
{
  check(resolveDateRange('today', NOW), { startKey: '2026-03-15', endKey: '2026-03-15' }, "'today' resolves to a single-day range, today's UTC date key");
  check(resolveDateRange('yesterday', NOW), { startKey: '2026-03-14', endKey: '2026-03-14' }, "'yesterday' resolves to a single-day range, one UTC day before today");
  check(resolveDateRange('last7', NOW), { startKey: '2026-03-09', endKey: '2026-03-15' }, "'last7' spans exactly 7 days (today - 6 .. today), inclusive on both ends");
  check(resolveDateRange('last30', NOW), { startKey: '2026-02-14', endKey: '2026-03-15' }, "'last30' spans exactly 30 days (today - 29 .. today), inclusive on both ends");
  check(
    resolveDateRange('custom', NOW, { startKey: '2026-01-01', endKey: '2026-01-31' }),
    { startKey: '2026-01-01', endKey: '2026-01-31' },
    "'custom' uses the caller-supplied range verbatim"
  );
  check(
    resolveDateRange('custom', NOW, { startKey: '2026-01-31', endKey: '2026-01-01' }),
    { startKey: '2026-01-01', endKey: '2026-01-31' },
    "'custom' swaps an inverted start/end range rather than returning it backwards"
  );
  let threw = false;
  try { resolveDateRange('custom', NOW, undefined); } catch (e) { threw = true; }
  check(threw, true, "'custom' with no range supplied throws rather than silently querying an unbounded range");

  // UTC day-boundary check: a millis value just before UTC midnight must
  // resolve to the day before, not the day of - the exact boundary
  // src/utils/adAnalyticsRules.js and functions/adTrackingService.js must
  // agree on, per this file's own header comment.
  const justBeforeMidnightUtc = Date.UTC(2026, 2, 15, 23, 59, 59);
  const justAfterMidnightUtc = justBeforeMidnightUtc + 2000; // 2026-03-16T00:00:01Z
  check(dateKeyFromMillis(justBeforeMidnightUtc), '2026-03-15', 'A millis value one second before UTC midnight stays on the earlier UTC day');
  check(dateKeyFromMillis(justAfterMidnightUtc), '2026-03-16', 'A millis value one second after UTC midnight rolls onto the next UTC day');
}

// ---- 3. Verify totals against tracking data (sumStats) ----
// Models one ad shown 3 times across 3 different ad_daily_stats rows
// (e.g. different placements/features/days within the selected range) -
// the dashboard's top-line Impressions/Clicks/CTR must equal the exact
// sum of every underlying tracking-derived row, per the brief's own
// ACCEPTANCE TEST instruction.
console.log('\n3. Verify totals against tracking data');
{
  const rows = [
    { date: '2026-03-14', adId: 'ad-1', campaignId: 'camp-1', advertiserId: 'adv-1', placementId: 'HOME_TOP', feature: 'home', impressions: 100, clicks: 5 },
    { date: '2026-03-15', adId: 'ad-1', campaignId: 'camp-1', advertiserId: 'adv-1', placementId: 'HOME_TOP', feature: 'home', impressions: 150, clicks: 9 },
    { date: '2026-03-15', adId: 'ad-2', campaignId: 'camp-1', advertiserId: 'adv-1', placementId: 'RECHARGE_TOP', feature: 'mobile_recharge', impressions: 50, clicks: 1 },
  ];
  const totals = sumStats(rows);
  check(totals.impressions, 300, 'Summed impressions across every row matches the raw tracking totals exactly (100+150+50)');
  check(totals.clicks, 15, 'Summed clicks across every row matches the raw tracking totals exactly (5+9+1)');
  check(totals.ctr, (15 / 300) * 100, 'Top-line CTR is derived from SUMMED totals (15/300), not an average of each row\'s own CTR');
  check(sumStats([]), { impressions: 0, clicks: 0, ctr: 0 }, 'No rows in range sums to all-zero, CTR safely 0, not an empty-array crash');
}

// ---- 4. Campaign / Feature / Placement / Advertiser Performance grouping ----
console.log('\n4. Report grouping (aggregateBy)');
{
  const rows = [
    { campaignId: 'camp-1', advertiserId: 'adv-1', feature: 'home', placementId: 'HOME_TOP', impressions: 100, clicks: 5 },
    { campaignId: 'camp-1', advertiserId: 'adv-1', feature: 'mobile_recharge', placementId: 'RECHARGE_TOP', impressions: 50, clicks: 1 },
    { campaignId: 'camp-2', advertiserId: 'adv-2', feature: 'home', placementId: 'HOME_TOP', impressions: 200, clicks: 20 },
  ];

  const byCampaign = aggregateBy(rows, (r) => r.campaignId);
  check(byCampaign.length, 2, 'Grouping by campaignId produces one row per distinct campaign');
  check(
    byCampaign.find((g) => g.key === 'camp-1'),
    { key: 'camp-1', impressions: 150, clicks: 6, ctr: (6 / 150) * 100 },
    'camp-1\'s two ad_daily_stats rows (home + mobile_recharge) are summed into one Campaign Performance row'
  );
  check(byCampaign[0].key, 'camp-2', 'Rows are sorted by impressions descending, so camp-2 (200 impressions) leads camp-1 (150)');

  const byFeature = aggregateBy(rows, (r) => r.feature);
  check(byFeature.find((g) => g.key === 'home'), { key: 'home', impressions: 300, clicks: 25, ctr: (25 / 300) * 100 }, 'Feature Performance sums across every campaign sharing that feature (camp-1 + camp-2, both \'home\')');

  const byPlacement = aggregateBy(rows, (r) => r.placementId);
  check(byPlacement.find((g) => g.key === 'RECHARGE_TOP'), { key: 'RECHARGE_TOP', impressions: 50, clicks: 1, ctr: (1 / 50) * 100 }, 'Placement Performance groups correctly by placementId');

  const byAdvertiser = aggregateBy(rows, (r) => r.advertiserId);
  check(byAdvertiser.find((g) => g.key === 'adv-1'), { key: 'adv-1', impressions: 150, clicks: 6, ctr: (6 / 150) * 100 }, 'Advertiser Performance sums across every campaign belonging to that advertiser');

  check(aggregateBy([], (r) => r.campaignId), [], 'Grouping an empty row set returns an empty report, not an error');
}

// ---- 5. Rows with no activity in range simply don't appear ----
// Matches adAnalyticsService.js's own "only rows with data in range show
// up" behavior for every PHASE 8 report.
console.log('\n5. No padding for zero-activity keys');
{
  const rows = [{ campaignId: 'camp-1', impressions: 10, clicks: 1 }];
  const grouped = aggregateBy(rows, (r) => r.campaignId);
  check(grouped.map((g) => g.key), ['camp-1'], 'A campaign/feature/placement/advertiser with zero rows in the selected range is simply absent, not padded in with zeros');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
