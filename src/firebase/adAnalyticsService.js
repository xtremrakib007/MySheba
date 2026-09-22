// PHASE 8 - MySheba Advertisement System - ADVERTISEMENT ANALYTICS.
//
// Super Admin's ad-performance dashboard + the four REPORT tables
// (Campaign/Feature/Placement/Advertiser Performance) - AdAnalyticsScreen
// is the only call site. Everything here is a one-shot read (getDocs/
// getCountFromServer), never a live onSnapshot - same "aggregate numbers
// don't need a live feed, pull-to-refresh instead" posture
// analyticsService.js's own header comment already established for the
// app's general Admin Analytics screen.
//
// PERFORMANCE (the brief's own section): every impressions/clicks/CTR
// number below is read from ad_daily_stats (see src/types/ads.ts's
// AdDailyStat and functions/adTrackingService.js's DAILY ROLLUP section) -
// a handful of small per-day-per-ad rollup docs - NEVER from
// ad_impressions/ad_clicks directly. A dashboard covering "Last 30 Days"
// across every ad in the app is, at most, one range query returning
// (days in range) x (ads with any activity that day) docs - not a scan of
// every individual impression/click event, which is exactly what the
// brief's PERFORMANCE section prohibits. The actual sum/group-by/CTR math
// over whatever this file fetches lives in src/utils/adAnalyticsRules.js,
// a zero-dependency module scripts/phase8-ad-analytics-tests.js
// require()s directly - this file's only job is turning Firestore query
// results into the plain AdDailyStat-shaped array that module operates
// on.
//
// SCOPE: Super Admin only, per the brief's own title ("Super Admin
// advertisement analytics") - AdAnalyticsScreen itself gates on
// profile.role === 'superadmin' before ever calling in here (same
// treatment AdFeatureControlsScreen/BannerManagementScreen already get in
// AdminFeaturesScreen.js), even though firestore.rules' own read rule on
// ad_daily_stats/ad_reports is the slightly wider isAdmin() (see that
// section's own comment on why - a plain admin CAN technically read this
// collection, the app's own navigation just never offers them the
// screen). ad_payments (Direct Advertising Revenue) is superadmin-only at
// the rules layer too, so that card would simply fail to read for a
// plain admin regardless.
import {
  collection, query, where, getDocs, getCountFromServer,
} from 'firebase/firestore';
import { db } from './config';
import { AD_COLLECTIONS } from '../constants/adCollections';
import { AD_STATUSES } from '../constants/adEnums';
import { getEffectiveAdStatus } from './adService';
import {
  resolveDateRange, sumStats, aggregateBy,
} from '../utils/adAnalyticsRules';

function colRef(collectionName) {
  return collection(db, collectionName);
}

async function countOf(collectionName, ...constraints) {
  const snap = await getCountFromServer(query(colRef(collectionName), ...constraints));
  return snap.data().count;
}

async function getAllDocs(collectionName, ...constraints) {
  const snap = await getDocs(query(colRef(collectionName), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Every ad_daily_stats row whose `date` falls within [startKey, endKey]
 * (both 'YYYY-MM-DD', inclusive) - the one query every dashboard/report
 * number below is built from. `date` is a plain string field, so this is
 * a single-field range query (Firestore auto-indexes it, no composite
 * index needed) rather than the multi-field composite indexes PHASE 6/7's
 * per-user frequency queries needed - see firestore.indexes.json's
 * existing ad_impressions/ad_clicks entries for why those needed one and
 * this deliberately doesn't.
 */
async function getDailyStatsInRange(startKey, endKey) {
  return getAllDocs(
    AD_COLLECTIONS.DAILY_STATS,
    where('date', '>=', startKey),
    where('date', '<=', endKey)
  );
}

/** DASHBOARD - "Active Campaigns"/"Pending Ads"/"Active Ads"/
 * "Advertisers" counts. Campaigns/ads use getEffectiveAdStatus (schedule-
 * aware - see adService.js's own header comment on why a stored 'active'
 * status alone isn't enough) rather than a raw status === 'active' query,
 * so a campaign/ad that's approved-and-scheduled-into-today's-range still
 * counts as active the instant its startAt arrives, exactly like
 * BannerManagementScreen's own list already does. Bounded getDocs, not a
 * live subscription (see file header) - the number of advertisements/
 * campaigns/advertisers is nowhere near the "millions of raw impression
 * documents" scale the PERFORMANCE section is about; this is the same
 * "small config collection, just read it" posture analyticsService.js's
 * getModuleStats already uses. */
async function getCountsSummary() {
  const [campaigns, ads, advertiserCount] = await Promise.all([
    getAllDocs(AD_COLLECTIONS.CAMPAIGNS),
    getAllDocs(AD_COLLECTIONS.ADVERTISEMENTS),
    countOf(AD_COLLECTIONS.ADVERTISERS),
  ]);
  const activeCampaigns = campaigns.filter((c) => getEffectiveAdStatus(c) === AD_STATUSES.ACTIVE).length;
  const activeAds = ads.filter((a) => getEffectiveAdStatus(a) === AD_STATUSES.ACTIVE).length;
  const pendingAds = ads.filter((a) => a.status === AD_STATUSES.PENDING_APPROVAL).length;
  return {
    activeCampaigns,
    pendingAds,
    activeAds,
    advertisers: advertiserCount,
  };
}

/** DASHBOARD - "Direct Advertising Revenue": sum of ad_payments.amount
 * where status === 'paid' (AdPayment.status - see src/types/ads.ts). No
 * payment flow writes ad_payments yet as of this phase (see that
 * collection's own header comment - "a later phase's Cloud Function is
 * the only writer"), so this correctly totals 0 today and starts
 * reflecting real revenue the moment that phase ships, with no change
 * needed here. getDocs rather than getCountFromServer because the SUM of
 * `amount` is needed, not just a count - Firestore has no server-side sum
 * aggregation over an arbitrary field as of this SDK version, so this
 * downloads the (expected to stay small - one doc per payment, not per
 * event) ad_payments collection and sums client-side, same as
 * analyticsService.js's own getReviewStats does for review sums. */
async function getDirectRevenue() {
  const paid = await getAllDocs(AD_COLLECTIONS.PAYMENTS, where('status', '==', 'paid'));
  return paid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

/** DASHBOARD - "AdMob Revenue when available". No AdMob SDK/reporting
 * integration exists anywhere in this app yet (adSettings.admobEnabled is
 * only ever a global on/off switch for whether AdMob ads are ALLOWED to
 * show - src/types/ads.ts's AdSettings - never a revenue source), so
 * there is no collection this could honestly read from. Returns `null`
 * (not 0 - see this function's own distinction) so AdAnalyticsScreen can
 * render "Not available yet" rather than a misleading "MYR 0.00" that
 * would look like AdMob ran and earned nothing, per the brief's own
 * "when available" qualifier - this is the ONE dashboard number in this
 * file that isn't a real Firestore read, deliberately, because there is
 * nothing yet to read. */
function getAdmobRevenue() {
  return null;
}

/** DASHBOARD - everything AdAnalyticsScreen's top cards need, fetched in
 * parallel. Any one section failing (e.g. a stale composite index while
 * Firestore is still building one after this feature ships) won't block
 * the rest - each promise is caught individually and falls back to a
 * zeroed shape, same "any section failing never blocks the rest" posture
 * analyticsService.js's own getDashboard already uses. `filterKey`/
 * `customRange` are exactly what src/utils/adAnalyticsRules.js's
 * resolveDateRange expects - see that function's own docs for the FILTERS
 * vocabulary ('today' | 'yesterday' | 'last7' | 'last30' | 'custom').
 * @param {'today' | 'yesterday' | 'last7' | 'last30' | 'custom'} filterKey
 * @param {{ startKey: string, endKey: string }} [customRange]
 */
export async function getAdDashboard(filterKey, customRange) {
  const { startKey, endKey } = resolveDateRange(filterKey, Date.now(), customRange);
  const [counts, dailyStats, directRevenue] = await Promise.all([
    getCountsSummary().catch(() => ({ activeCampaigns: 0, pendingAds: 0, activeAds: 0, advertisers: 0 })),
    getDailyStatsInRange(startKey, endKey).catch(() => []),
    getDirectRevenue().catch(() => 0),
  ]);
  const { impressions, clicks, ctr } = sumStats(dailyStats);
  return {
    ...counts,
    impressions,
    clicks,
    ctr,
    directRevenue,
    admobRevenue: getAdmobRevenue(),
    dateRange: { startKey, endKey },
  };
}

/**
 * REPORTS - Campaign Performance. Groups the same date-ranged
 * ad_daily_stats rows by campaignId, then joins in each campaign's own
 * name/status (a small, bounded ad_campaigns read - one doc per campaign
 * that had ANY activity in range, not per event) so the table can show a
 * name/status instead of a bare id. A campaign with zero activity in the
 * selected range simply doesn't appear - matching every other PHASE 8
 * report's "only rows with data in range show up" behavior, rather than
 * padding the table with every campaign that has ever existed.
 * @param {'today' | 'yesterday' | 'last7' | 'last30' | 'custom'} filterKey
 * @param {{ startKey: string, endKey: string }} [customRange]
 */
export async function getCampaignPerformance(filterKey, customRange) {
  const { startKey, endKey } = resolveDateRange(filterKey, Date.now(), customRange);
  const dailyStats = await getDailyStatsInRange(startKey, endKey);
  const grouped = aggregateBy(dailyStats.filter((r) => r.campaignId), (r) => r.campaignId);
  if (grouped.length === 0) return [];

  const campaigns = await Promise.all(grouped.map((g) => getDocById(AD_COLLECTIONS.CAMPAIGNS, g.key)));
  return grouped.map((g, i) => {
    const campaign = campaigns[i];
    return {
      campaignId: g.key,
      name: campaign?.name || g.key,
      status: campaign ? getEffectiveAdStatus(campaign) : null,
      impressions: g.impressions,
      clicks: g.clicks,
      ctr: g.ctr,
    };
  });
}

/**
 * REPORTS - Feature Performance. Groups by `feature` (the FEATURE_IDS
 * screen the impression/click happened on - denormalized onto every
 * ad_daily_stats row since PHASE 7 stamps it on the raw event - see
 * AdDailyStat's own header comment). Rows with no feature recorded (an
 * event from before PHASE 7 added the field) are grouped under
 * `'unknown'` rather than silently dropped, so historical totals still
 * reconcile against the dashboard's own top-line Impressions/Clicks sum.
 */
export async function getFeaturePerformance(filterKey, customRange) {
  const { startKey, endKey } = resolveDateRange(filterKey, Date.now(), customRange);
  const dailyStats = await getDailyStatsInRange(startKey, endKey);
  return aggregateBy(dailyStats, (r) => r.feature || 'unknown')
    .map((g) => ({ feature: g.key, impressions: g.impressions, clicks: g.clicks, ctr: g.ctr }));
}

/**
 * REPORTS - Placement Performance. Same shape as Feature Performance
 * above, grouped by placementId instead.
 */
export async function getPlacementPerformance(filterKey, customRange) {
  const { startKey, endKey } = resolveDateRange(filterKey, Date.now(), customRange);
  const dailyStats = await getDailyStatsInRange(startKey, endKey);
  return aggregateBy(dailyStats, (r) => r.placementId || 'unknown')
    .map((g) => ({ placementId: g.key, impressions: g.impressions, clicks: g.clicks, ctr: g.ctr }));
}

/**
 * REPORTS - Advertiser Performance. Groups by advertiserId, joins in each
 * advertiser's companyName (same bounded, only-advertisers-with-activity
 * read pattern as getCampaignPerformance above), and adds two things
 * neither Feature nor Placement Performance need: a distinct campaign
 * count (how many different campaigns of this advertiser's had activity
 * in range - counted from the SAME grouped ad_daily_stats rows, not a
 * second query) and Revenue (this advertiser's own share of Direct
 * Advertising Revenue - ad_payments.amount where status === 'paid' AND
 * advertiserId matches, same 0-until-a-payment-flow-exists caveat as
 * getDirectRevenue above).
 */
export async function getAdvertiserPerformance(filterKey, customRange) {
  const { startKey, endKey } = resolveDateRange(filterKey, Date.now(), customRange);
  const dailyStats = await getDailyStatsInRange(startKey, endKey);
  const rowsWithAdvertiser = dailyStats.filter((r) => r.advertiserId);
  const grouped = aggregateBy(rowsWithAdvertiser, (r) => r.advertiserId);
  if (grouped.length === 0) return [];

  const [advertisers, revenueByAdvertiser] = await Promise.all([
    Promise.all(grouped.map((g) => getDocById(AD_COLLECTIONS.ADVERTISERS, g.key))),
    Promise.all(grouped.map((g) => getPaidRevenueForAdvertiser(g.key))),
  ]);

  return grouped.map((g, i) => {
    const advertiser = advertisers[i];
    const campaignCount = new Set(
      rowsWithAdvertiser.filter((r) => r.advertiserId === g.key).map((r) => r.campaignId).filter(Boolean)
    ).size;
    return {
      advertiserId: g.key,
      name: advertiser?.companyName || g.key,
      campaigns: campaignCount,
      impressions: g.impressions,
      clicks: g.clicks,
      ctr: g.ctr,
      revenue: revenueByAdvertiser[i],
    };
  });
}

/**
 * ADVERTISER DETAIL - the top stat cards on AdvertiserDetailScreen, scoped
 * to one advertiser instead of the whole account. Same ad_daily_stats rows
 * and the same "sum then divide" CTR as getAdvertiserPerformance above,
 * just filtered to a single advertiserId rather than grouped across all of
 * them.
 *
 * `revenue` is that advertiser's lifetime paid total, NOT the filtered
 * range - getPaidRevenueForAdvertiser sums every ad_payments row with
 * status 'paid' regardless of date, exactly as getAdvertiserPerformance
 * already reports it. Kept consistent deliberately: the same figure should
 * not mean one thing on the roster report and another on the detail
 * screen. Worth revisiting if the screen's "Last 30 Days" heading is meant
 * to cover this card too.
 * @param {string} advertiserId
 * @param {'today' | 'yesterday' | 'last7' | 'last30' | 'custom'} filterKey
 * @param {{ startKey: string, endKey: string }} [customRange]
 */
export async function getAdvertiserSummary(advertiserId, filterKey, customRange) {
  const { startKey, endKey } = resolveDateRange(filterKey, Date.now(), customRange);
  const [dailyStats, revenue] = await Promise.all([
    getDailyStatsInRange(startKey, endKey),
    getPaidRevenueForAdvertiser(advertiserId),
  ]);
  const { impressions, clicks, ctr } = sumStats(
    dailyStats.filter((r) => r.advertiserId === advertiserId)
  );
  return { impressions, clicks, ctr, revenue };
}

/**
 * ADVERTISER DETAIL - the "By Campaign" table on AdvertiserDetailScreen.
 * getCampaignPerformance's per-advertiser counterpart: same grouping and
 * same campaign-name join, over only this advertiser's rows. A campaign
 * whose config doc has since been deleted still renders, falling back to
 * its bare id, for the reason getDocById's own comment gives.
 * @param {string} advertiserId
 * @param {'today' | 'yesterday' | 'last7' | 'last30' | 'custom'} filterKey
 * @param {{ startKey: string, endKey: string }} [customRange]
 */
export async function getAdvertiserCampaignPerformance(advertiserId, filterKey, customRange) {
  const { startKey, endKey } = resolveDateRange(filterKey, Date.now(), customRange);
  const dailyStats = await getDailyStatsInRange(startKey, endKey);
  const grouped = aggregateBy(
    dailyStats.filter((r) => r.advertiserId === advertiserId && r.campaignId),
    (r) => r.campaignId
  );
  if (grouped.length === 0) return [];

  const campaigns = await Promise.all(
    grouped.map((g) => getDocById(AD_COLLECTIONS.CAMPAIGNS, g.key))
  );
  return grouped.map((g, i) => {
    const campaign = campaigns[i];
    return {
      campaignId: g.key,
      name: campaign?.name || g.key,
      status: campaign ? getEffectiveAdStatus(campaign) : null,
      impressions: g.impressions,
      clicks: g.clicks,
      ctr: g.ctr,
    };
  });
}

async function getPaidRevenueForAdvertiser(advertiserId) {
  const paid = await getAllDocs(
    AD_COLLECTIONS.PAYMENTS,
    where('status', '==', 'paid'),
    where('advertiserId', '==', advertiserId)
  );
  return paid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

// Thin, never-throwing lookup-by-id, returning `null` for a missing/
// deleted doc - a campaign or advertiser referenced by an old
// ad_daily_stats row can outlive its own config doc (e.g. deleted after
// running), and a report row must still render (falling back to the bare
// id - see getCampaignPerformance/getAdvertiserPerformance above) rather
// than the whole report call failing. Queried by document id via
// `__name__` rather than a plain doc() + getDoc() read, purely so this
// file only needs the `query`/`where`/`getDocs` imports it already has,
// not a second read primitive.
async function getDocById(collectionName, id) {
  try {
    const snap = await getDocs(query(colRef(collectionName), where('__name__', '==', id)));
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (err) {
    return null;
  }
}
