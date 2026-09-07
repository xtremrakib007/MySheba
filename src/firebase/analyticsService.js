// Admin Panel > Analytics (sitemap section; PRD section 19 "Success
// Metrics" - active sellers/listings, messages, completed transactions,
// retention). Every other Admin Panel item from the sitemap already has a
// screen (User Management, Marketplace Moderation = Listing + Report
// Management, Categories = Category Management, Verification Management)
// except this one, which was still missing.
//
// Rather than stand up a new write path (Cloud Function rollups, a daily
// "visits" counter, etc.) this reads the same collections every other
// module already writes to, so the numbers are always live and there's
// nothing new to keep in sync. Counts use getCountFromServer (a single
// aggregation query - no documents downloaded) wherever we only need a
// number; the "new this week" trend and "top categories" cards need
// individual docs, so those fall back to a bounded getDocs.
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { REPORT_KINDS } from './marketplaceModerationService';

const DAY_MS = 24 * 60 * 60 * 1000;

// module key -> { collection, activeValue, closedValues } - closedValues is
// every status that counts as "no longer live" for that module (mirrors
// each service's own status comment), used for the active/closed split on
// the Modules card. 'hidden' (auto-moderated) is intentionally left out of
// both buckets so a hidden post doesn't inflate either count.
const MODULES = {
  listings: { label: 'Buy & Sell', icon: '🛒', collection: 'marketplaceListings', closedStatus: 'sold', closedLabel: 'Sold' },
  properties: { label: 'Accommodation', icon: '🏠', collection: 'properties', closedStatus: 'rented', closedLabel: 'Rented' },
  roommates: { label: 'Room Sharing', icon: '👥', collection: 'roommateRequests', closedStatus: 'closed', closedLabel: 'Closed' },
  services: { label: 'Local Services', icon: '🧰', collection: 'serviceProviders', closedStatus: null, closedLabel: null },
  community: { label: 'Community', icon: '📢', collection: 'communityPosts', closedStatus: null, closedLabel: null },
};

async function countOf(collectionName, ...constraints) {
  const snap = await getCountFromServer(query(collection(db, collectionName), ...constraints));
  return snap.data().count;
}

/** Total listings/properties/etc, split into active vs the module's
 * "closed" status (sold/rented/closed), plus how many were created in the
 * last 7 days - one object per module, keyed the same as MODULES above. */
async function getModuleStats() {
  const entries = await Promise.all(
    Object.entries(MODULES).map(async ([key, cfg]) => {
      const weekAgo = Timestamp.fromMillis(Date.now() - 7 * DAY_MS);
      const [total, active, closed, newThisWeek] = await Promise.all([
        countOf(cfg.collection),
        countOf(cfg.collection, where('status', '==', 'active')),
        cfg.closedStatus ? countOf(cfg.collection, where('status', '==', cfg.closedStatus)) : Promise.resolve(0),
        countOf(cfg.collection, where('createdAt', '>=', weekAgo)),
      ]);
      return [key, { ...cfg, total, active, closed, newThisWeek }];
    })
  );
  return Object.fromEntries(entries);
}

/** Registered accounts by role, plus how many are ID-verified. */
async function getUserStats() {
  const roles = ['customer', 'dealer', 'reseller', 'admin', 'superadmin'];
  const [total, verified, ...byRole] = await Promise.all([
    countOf('users'),
    countOf('users', where('verified', '==', true)),
    ...roles.map((r) => countOf('users', where('role', '==', r))),
  ]);
  return {
    total,
    verified,
    byRole: Object.fromEntries(roles.map((r, i) => [r, byRole[i]])),
  };
}

/** Open (unresolved) reports across all five report collections, total and
 * per-kind - reuses the same REPORT_KINDS table MarketplaceModerationScreen
 * is built on, so a new report type added there is picked up here too. */
async function getReportStats() {
  const kinds = Object.entries(REPORT_KINDS);
  const counts = await Promise.all(kinds.map(([, cfg]) => countOf(cfg.collection)));
  // Reports only get a `status` field once acted on (see
  // marketplaceModerationService's comment on subscribeAllReports); reports
  // still missing that field are implicitly open, so "open" = total minus
  // whatever's explicitly resolved/dismissed.
  const resolvedCounts = await Promise.all(
    kinds.map(([, cfg]) => countOf(cfg.collection, where('status', '==', 'resolved')))
  );
  const byKind = kinds.map(([kind, cfg], i) => ({
    kind,
    label: cfg.label,
    total: counts[i],
    open: counts[i] - resolvedCounts[i],
  }));
  return {
    total: counts.reduce((a, b) => a + b, 0),
    open: byKind.reduce((a, k) => a + k.open, 0),
    byKind,
  };
}

/** Total review count + live average rating across every marketplace
 * seller and service provider (sums each stats doc rather than every
 * individual review, matching how the seller/provider badges already
 * compute their own average). */
async function getReviewStats() {
  const [sellerSnap, providerSnap] = await Promise.all([
    getDocs(collection(db, 'marketplaceSellerStats')),
    getDocs(query(collection(db, 'serviceProviders'))),
  ]);
  let count = 0;
  let sum = 0;
  sellerSnap.forEach((d) => {
    const v = d.data();
    count += v.count || 0;
    sum += v.sum || 0;
  });
  providerSnap.forEach((d) => {
    const v = d.data();
    count += v.reviewCount || 0;
    sum += (v.ratingAvg || 0) * (v.reviewCount || 0);
  });
  return { count, avg: count > 0 ? sum / count : 0 };
}

/** New posts per day (summed across every module) for the last 7 days -
 * the closest honest proxy for "daily marketplace activity" available
 * without a dedicated page-view/analytics pipeline. Bounded to 500 recent
 * docs per module so this stays a handful of reads even on a busy app. */
async function getWeeklyTrend() {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const totals = days.map(() => 0);
  const weekStart = Timestamp.fromMillis(days[0].getTime());

  await Promise.all(
    Object.values(MODULES).map(async (cfg) => {
      const snap = await getDocs(
        query(collection(db, cfg.collection), where('createdAt', '>=', weekStart), orderBy('createdAt', 'asc'), limit(500))
      );
      snap.forEach((d) => {
        const ts = d.data().createdAt;
        if (!ts?.seconds) return;
        const dayIdx = Math.floor((ts.seconds * 1000 - weekStart.toMillis()) / DAY_MS);
        if (dayIdx >= 0 && dayIdx < 7) totals[dayIdx] += 1;
      });
    })
  );

  return days.map((d, i) => ({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), count: totals[i] }));
}

/** Buy & Sell listing counts by category, top 5 - powers the "Top
 * Categories" card. Reads active listings only (same MAX_FEED-sized
 * window every other Buy & Sell screen already reads). */
async function getTopCategories() {
  const snap = await getDocs(
    query(collection(db, 'marketplaceListings'), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(500))
  );
  const tally = {};
  snap.forEach((d) => {
    const c = d.data().category || 'Other';
    tally[c] = (tally[c] || 0) + 1;
  });
  return Object.entries(tally)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/** Everything the Analytics screen needs, fetched in parallel. Any one
 * section failing (e.g. a stale composite index while Firestore is still
 * building one after this feature ships) won't block the rest - each
 * promise is caught individually and falls back to an empty shape. */
export async function getDashboard() {
  const [modules, users, reports, reviews, trend, topCategories, conversations] = await Promise.all([
    getModuleStats().catch(() => ({})),
    getUserStats().catch(() => ({ total: 0, verified: 0, byRole: {} })),
    getReportStats().catch(() => ({ total: 0, open: 0, byKind: [] })),
    getReviewStats().catch(() => ({ count: 0, avg: 0 })),
    getWeeklyTrend().catch(() => []),
    getTopCategories().catch(() => []),
    countOf('directChats').catch(() => 0),
  ]);
  return { modules, users, reports, reviews, trend, topCategories, conversations };
}
