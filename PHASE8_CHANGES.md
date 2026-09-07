# Phase 8 — Advertisement Analytics

Adds the Super Admin advertisement analytics dashboard + reports on top
of Phase 7's ad tracking. Nothing here has been run against a live
Firebase project or emulator — no `npm install`/Functions deploy was
available in the sandbox this was written in. Review and test before
merging.

## New files
- `src/utils/adAnalyticsRules.js` — zero-dependency date-range/CTR/
  aggregation math (`resolveDateRange`, `ctrOf`, `sumStats`,
  `aggregateBy`). Same "CommonJS module a test script can `require()`
  directly" pattern as `adFrequencyRules.js`/`adTrackingRules.js`.
- `src/firebase/adAnalyticsService.js` — `getAdDashboard` +
  `getCampaignPerformance`/`getFeaturePerformance`/
  `getPlacementPerformance`/`getAdvertiserPerformance`. Every number is
  read from `ad_daily_stats` (see below), never the raw
  `ad_impressions`/`ad_clicks` collections — the brief's own PERFORMANCE
  requirement.
- `src/screens/AdAnalyticsScreen.js` — Super Admin-only dashboard (9 stat
  cards: Active Campaigns / Pending Ads / Active Ads / Advertisers /
  Impressions / Clicks / CTR / Direct Advertising Revenue / AdMob
  Revenue), Today/Yesterday/Last 7/Last 30/Custom filter chips, and
  tabbed Campaign/Feature/Placement/Advertiser Performance report cards.
  One-shot fetch per filter change + pull-to-refresh, no live
  subscription — aggregate numbers don't need one.
- `scripts/phase8-ad-analytics-tests.js` — acceptance tests for
  `adAnalyticsRules.js`: CTR-on-zero-impressions, the five FILTERS date
  ranges (including the UTC day-boundary), "verify totals against
  tracking data" (summed totals across hand-built rows), and the four
  reports' grouping math. `node scripts/phase8-ad-analytics-tests.js` —
  26/26 passing.

## Modified files
- `src/constants/adCollections.ts` — added
  `AD_COLLECTIONS.DAILY_STATS = 'ad_daily_stats'`.
- `src/types/ads.ts` — added the `AdDailyStat` interface (one row per
  UTC-day + ad + placement + feature bucket).
- `functions/adTrackingService.js` — the existing
  `onAdImpressionCreated`/`onAdClickCreated` triggers now also upsert
  the matching `ad_daily_stats/{date}__{adId}__{placementId}__{feature}`
  doc (`FieldValue.increment` on `impressions`/`clicks`, `set(...,
  {merge:true})`), inside the SAME transaction that already syncs
  `advertisements/{adId}.totalImpressions/totalClicks` — one more write
  on an already-open transaction, no extra read. `campaignId`/
  `advertiserId` are denormalized off the ad doc that transaction reads,
  since the impression/click event itself never carries `advertiserId`.
- `firestore.rules` — new `ad_daily_stats/{id}` section: `read:
  isAdmin()`, `write: false` (Cloud Function only, via the Admin SDK,
  which bypasses rules entirely). No `firestore.indexes.json` change —
  every query this phase runs is a single-field range on `date`, which
  Firestore auto-indexes.
- `src/screens/AdminFeaturesScreen.js` — new "Ad Analytics" tile in the
  📢 Advertisement section, alongside Feature Ad Controls/Banner
  Management, superadmin-only.
- `App.js` — imports `AdAnalyticsScreen` and routes `screen ===
  'adAnalytics'` to it.

## Data model
`ad_daily_stats/{date}__{adId}__{placementId}__{feature}`:
```
{
  date: 'YYYY-MM-DD',       // UTC calendar day
  adId, campaignId, advertiserId, placementId, feature,
  impressions, clicks,      // both server-incremented, never client-writable
  updatedAt,
}
```
A dashboard covering "Last 30 Days" across every ad in the app is, at
most, one range query returning (days in range) × (ad/placement/feature
combinations with any activity that day) docs — never a scan of every
individual impression/click event.

## Before merging
1. Deploy `firestore.rules` and the updated `functions/adTrackingService.js`
   to a project you can test against — ideally the emulator suite first.
2. Manually walk: view a banner a few times across a couple of
   placements/features, tap one, then open Ad Analytics as a superadmin
   and confirm the dashboard's Impressions/Clicks/CTR match what you just
   generated, across each of Today/Last 7 Days/a Custom range spanning
   today.
3. Confirm the Campaign/Feature/Placement/Advertiser report rows you'd
   expect show up, and that an ad/campaign with zero activity in the
   selected range is correctly absent rather than padded in at zero.
4. `node scripts/phase8-ad-analytics-tests.js` should show 26 passed, 0
   failed before and after any further edits to `adAnalyticsRules.js`.
5. Direct Advertising Revenue and AdMob Revenue both correctly read as
   0/"Not available yet" today, since no payment flow or AdMob
   integration writes `ad_payments`/reports yet — this is expected, not a
   bug, per each function's own header comment in
   `src/firebase/adAnalyticsService.js`.
