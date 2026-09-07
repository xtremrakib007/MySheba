// Admin > Analytics — Overview half ported near-verbatim from the mobile
// app's src/firebase/analyticsService.js (same reasoning as that file:
// reads collections every other module already writes to, so nothing new
// needs to stay in sync). Activity Logs half wraps logService.js's three
// subscriptions - superadmin-only per firestore.rules, unlike Overview
// which any admin can see (isAdmin() blanket read on every collection it
// touches).

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors REPORT_KINDS from marketplaceModerationService.js exactly -
// five report collections, one per module. Worth flagging separately:
// the existing Marketplace Moderation page in this admin web app only
// reads 'marketplaceReports' (the 'listing' kind) - it doesn't yet cover
// property/roommate/service/community reports. That's a pre-existing gap
// in that page, not something this file should paper over; Analytics
// counts against the real five so its numbers stay honest even though
// the moderation queue itself doesn't act on all of them yet.
const REPORT_KINDS: Record<string, { label: string; collection: string }> = {
  listing: { label: 'Buy & Sell', collection: 'marketplaceReports' },
  property: { label: 'Accommodation', collection: 'propertyReports' },
  roommate: { label: 'Room Sharing', collection: 'roommateReports' },
  service: { label: 'Local Services', collection: 'serviceProviderReports' },
  community: { label: 'Community', collection: 'communityReports' },
};

const MODULES: Record<string, { label: string; icon: string; collection: string; closedStatus: string | null; closedLabel: string | null }> = {
  listings: { label: 'Buy & Sell', icon: '🛒', collection: 'marketplaceListings', closedStatus: 'sold', closedLabel: 'Sold' },
  properties: { label: 'Accommodation', icon: '🏠', collection: 'properties', closedStatus: 'rented', closedLabel: 'Rented' },
  roommates: { label: 'Room Sharing', icon: '👥', collection: 'roommateRequests', closedStatus: 'closed', closedLabel: 'Closed' },
  services: { label: 'Local Services', icon: '🧰', collection: 'serviceProviders', closedStatus: null, closedLabel: null },
  community: { label: 'Community', icon: '📢', collection: 'communityPosts', closedStatus: null, closedLabel: null },
};

async function countOf(collectionName: string, ...constraints: any[]): Promise<number> {
  try {
    const snap = await getCountFromServer(query(collection(db, collectionName), ...constraints));
    return snap.data().count;
  } catch (err) {
    console.warn(`Could not count ${collectionName}:`, err);
    return 0;
  }
}

export interface ModuleStat {
  key: string;
  label: string;
  icon: string;
  total: number;
  active: number;
  closed: number;
  closedLabel: string | null;
  newThisWeek: number;
}

async function getModuleStats(): Promise<ModuleStat[]> {
  const weekAgo = Timestamp.fromMillis(Date.now() - 7 * DAY_MS);
  return Promise.all(
    Object.entries(MODULES).map(async ([key, cfg]) => {
      const [total, active, closed, newThisWeek] = await Promise.all([
        countOf(cfg.collection),
        countOf(cfg.collection, where('status', '==', 'active')),
        cfg.closedStatus ? countOf(cfg.collection, where('status', '==', cfg.closedStatus)) : Promise.resolve(0),
        countOf(cfg.collection, where('createdAt', '>=', weekAgo)),
      ]);
      return { key, label: cfg.label, icon: cfg.icon, total, active, closed, closedLabel: cfg.closedLabel, newThisWeek };
    })
  );
}

export interface UserStats {
  total: number;
  verified: number;
  byRole: Record<string, number>;
}

async function getUserStats(): Promise<UserStats> {
  const roles = ['customer', 'dealer', 'subdealer', 'reseller', 'admin', 'superadmin'];
  const [total, verified, ...byRole] = await Promise.all([
    countOf('users'),
    countOf('users', where('verified', '==', true)),
    ...roles.map((r) => countOf('users', where('role', '==', r))),
  ]);
  return { total, verified, byRole: Object.fromEntries(roles.map((r, i) => [r, byRole[i]])) };
}

export interface ReportStats {
  total: number;
  open: number;
  byKind: { kind: string; label: string; total: number; open: number }[];
}

async function getReportStats(): Promise<ReportStats> {
  const kinds = Object.entries(REPORT_KINDS);
  const counts = await Promise.all(kinds.map(([, cfg]) => countOf(cfg.collection)));
  const resolvedCounts = await Promise.all(
    kinds.map(([, cfg]) => countOf(cfg.collection, where('status', '==', 'resolved')))
  );
  const byKind = kinds.map(([kind, cfg], i) => ({ kind, label: cfg.label, total: counts[i], open: counts[i] - resolvedCounts[i] }));
  return { total: counts.reduce((a, b) => a + b, 0), open: byKind.reduce((a, k) => a + k.open, 0), byKind };
}

async function getReviewStats(): Promise<{ count: number; avg: number }> {
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

export interface TrendPoint {
  label: string;
  count: number;
}

async function getWeeklyTrend(): Promise<TrendPoint[]> {
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
      try {
        const snap = await getDocs(
          query(collection(db, cfg.collection), where('createdAt', '>=', weekStart), orderBy('createdAt', 'asc'), limit(500))
        );
        snap.forEach((d) => {
          const ts = d.data().createdAt;
          if (!ts?.seconds) return;
          const dayIdx = Math.floor((ts.seconds * 1000 - weekStart.toMillis()) / DAY_MS);
          if (dayIdx >= 0 && dayIdx < 7) totals[dayIdx] += 1;
        });
      } catch (err) {
        console.warn(`Could not fetch weekly trend for ${cfg.collection}:`, err);
      }
    })
  );

  return days.map((d, i) => ({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), count: totals[i] }));
}

export interface CategoryCount {
  category: string;
  count: number;
}

async function getTopCategories(): Promise<CategoryCount[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'marketplaceListings'), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(500))
    );
    const tally: Record<string, number> = {};
    snap.forEach((d) => {
      const c = d.data().category || 'Other';
      tally[c] = (tally[c] || 0) + 1;
    });
    return Object.entries(tally)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  } catch (err) {
    console.warn('Could not fetch top categories:', err);
    return [];
  }
}

export interface AnalyticsDashboard {
  modules: ModuleStat[];
  users: UserStats;
  reports: ReportStats;
  reviews: { count: number; avg: number };
  trend: TrendPoint[];
  topCategories: CategoryCount[];
  conversations: number;
}

export async function getDashboard(): Promise<AnalyticsDashboard> {
  const [modules, users, reports, reviews, trend, topCategories, conversations] = await Promise.all([
    getModuleStats().catch(() => []),
    getUserStats().catch(() => ({ total: 0, verified: 0, byRole: {} })),
    getReportStats().catch(() => ({ total: 0, open: 0, byKind: [] })),
    getReviewStats().catch(() => ({ count: 0, avg: 0 })),
    getWeeklyTrend().catch(() => []),
    getTopCategories().catch(() => []),
    countOf('directChats'),
  ]);
  return { modules, users, reports, reviews, trend, topCategories, conversations };
}

// ---------------------------------------------------------------------
// Activity Logs — superadmin-only (see firestore.rules on activityLog/
// errorLog/userAuditLog). Ports logService.js's three subscriptions.
// ---------------------------------------------------------------------

export interface LogEntry {
  id: string;
  [key: string]: unknown;
}

function mapLog(d: QueryDocumentSnapshot<DocumentData>): LogEntry {
  const data = d.data();
  return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null };
}

export function subscribeActivityLog(onUpdate: (list: LogEntry[]) => void, onError: (err: Error) => void, pageSize = 100) {
  const q = query(collection(db, 'activityLog'), orderBy('createdAt', 'desc'), limit(pageSize));
  return onSnapshot(q, (snap) => onUpdate(snap.docs.map(mapLog)), (err) => onError(err as Error));
}

export function subscribeErrorLog(onUpdate: (list: LogEntry[]) => void, onError: (err: Error) => void, pageSize = 100) {
  const q = query(collection(db, 'errorLog'), orderBy('createdAt', 'desc'), limit(pageSize));
  return onSnapshot(q, (snap) => onUpdate(snap.docs.map(mapLog)), (err) => onError(err as Error));
}

export function subscribeAuditLog(onUpdate: (list: LogEntry[]) => void, onError: (err: Error) => void, pageSize = 100) {
  const q = query(collection(db, 'userAuditLog'), orderBy('createdAt', 'desc'), limit(pageSize));
  return onSnapshot(q, (snap) => onUpdate(snap.docs.map(mapLog)), (err) => onError(err as Error));
}

/** The only field an admin may change on an errorLog entry. */
export async function setErrorResolved(id: string, resolved: boolean): Promise<void> {
  const uid = auth.currentUser?.uid ?? null;
  await updateDoc(doc(db, 'errorLog', id), {
    resolved,
    resolvedBy: resolved ? uid : null,
    resolvedAt: resolved ? serverTimestamp() : null,
  });
}
