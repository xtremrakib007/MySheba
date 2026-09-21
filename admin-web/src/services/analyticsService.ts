// Admin > Analytics dashboard. Keep this service limited to modules that still
// exist in MySheba; retired marketplace/review modules are intentionally absent.

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

const MODULES: Record<string, { label: string; icon: string; collection: string; closedStatus: string | null; closedLabel: string | null }> = {
  transactions: { label: 'Transactions', icon: '💳', collection: 'transactions', closedStatus: 'completed', closedLabel: 'Completed' },
  inquiries: { label: 'Travel inquiries', icon: '✈️', collection: 'inquiries', closedStatus: 'closed', closedLabel: 'Closed' },
  topups: { label: 'Top-ups', icon: '💰', collection: 'topups', closedStatus: 'completed', closedLabel: 'Completed' },
  supportTickets: { label: 'Support tickets', icon: '🎧', collection: 'supportTickets', closedStatus: 'resolved', closedLabel: 'Resolved' },
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
  return Promise.all(Object.entries(MODULES).map(async ([key, cfg]) => {
    const [total, active, closed, newThisWeek] = await Promise.all([
      countOf(cfg.collection),
      countOf(cfg.collection, where('status', 'in', ['pending', 'processing', 'open', 'in_progress', 'new', 'contacted'])),
      cfg.closedStatus ? countOf(cfg.collection, where('status', '==', cfg.closedStatus)) : Promise.resolve(0),
      countOf(cfg.collection, where('createdAt', '>=', weekAgo)),
    ]);
    return { key, label: cfg.label, icon: cfg.icon, total, active, closed, closedLabel: cfg.closedLabel, newThisWeek };
  }));
}

export interface UserStats { total: number; verified: number; byRole: Record<string, number>; }

async function getUserStats(): Promise<UserStats> {
  const roles = ['customer', 'dealer', 'reseller', 'admin', 'superadmin'];
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
  const kinds = [
    ['supportTickets', 'Support tickets'],
    ['inquiries', 'Travel inquiries'],
  ] as const;
  const rows = await Promise.all(kinds.map(async ([kind, label]) => {
    const total = await countOf(kind);
    const closed = await countOf(kind, where('status', 'in', kind === 'supportTickets' ? ['resolved'] : ['closed']));
    return { kind, label, total, open: Math.max(0, total - closed) };
  }));
  return { total: rows.reduce((a, b) => a + b.total, 0), open: rows.reduce((a, b) => a + b.open, 0), byKind: rows };
}

async function getWeeklyTrend(): Promise<TrendPoint[]> {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d;
  });
  const totals = days.map(() => 0);
  const weekStart = Timestamp.fromMillis(days[0].getTime());
  await Promise.all(Object.values(MODULES).map(async (cfg) => {
    try {
      const snap = await getDocs(query(collection(db, cfg.collection), where('createdAt', '>=', weekStart), orderBy('createdAt', 'asc'), limit(500)));
      snap.forEach((d) => {
        const ts = d.data().createdAt;
        if (!ts?.seconds) return;
        const dayIdx = Math.floor((ts.seconds * 1000 - weekStart.toMillis()) / DAY_MS);
        if (dayIdx >= 0 && dayIdx < 7) totals[dayIdx] += 1;
      });
    } catch (err) { console.warn(`Could not fetch weekly trend for ${cfg.collection}:`, err); }
  }));
  return days.map((d, i) => ({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), count: totals[i] }));
}

export interface TrendPoint { label: string; count: number; }
export interface CategoryCount { category: string; count: number; }

async function getTopCategories(): Promise<CategoryCount[]> {
  try {
    const snap = await getDocs(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(500)));
    const tally: Record<string, number> = {};
    snap.forEach((d) => {
      const category = d.data().service || 'Other';
      tally[category] = (tally[category] || 0) + 1;
    });
    return Object.entries(tally).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  } catch (err) {
    console.warn('Could not fetch transaction service breakdown:', err);
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
  const [modules, users, reports, trend, topCategories, conversations] = await Promise.all([
    getModuleStats().catch(() => []),
    getUserStats().catch(() => ({ total: 0, verified: 0, byRole: {} })),
    getReportStats().catch(() => ({ total: 0, open: 0, byKind: [] })),
    getWeeklyTrend().catch(() => []),
    getTopCategories().catch(() => []),
    countOf('supportTickets'),
  ]);
  return { modules, users, reports, reviews: { count: 0, avg: 0 }, trend, topCategories, conversations };
}

export interface LogEntry { id: string; [key: string]: unknown; }

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

export async function setErrorResolved(id: string, resolved: boolean): Promise<void> {
  const uid = auth.currentUser?.uid ?? null;
  await updateDoc(doc(db, 'errorLog', id), {
    resolved,
    resolvedBy: resolved ? uid : null,
    resolvedAt: resolved ? serverTimestamp() : null,
  });
}
