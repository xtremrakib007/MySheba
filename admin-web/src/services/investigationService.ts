// Read-only data access for the Admin Search & Investigation Center.
// Every query here targets a collection the admin panel is already allowed
// to read (see firestore.rules); sections an account's role cannot read
// degrade to an empty list rather than failing the whole investigation.

import {
  collection,
  doc,
  endAt,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  startAt,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import { ALL_ROLES, type AdminUserRow, type UserRole, type VerificationStatus } from './userManagementService';

const MAX_ROWS = 50;
const SEARCH_LIMIT = 10;
/** A single transaction at or above this value is worth a second look. */
export const HIGH_VALUE_THRESHOLD = 10_000;

function timestampMsOf(value: unknown): number | null {
  const ts = value as { toDate?: () => Date; seconds?: number } | undefined;
  if (ts?.toDate) return ts.toDate().getTime();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function dateLabelOf(value: unknown): string | null {
  const ms = timestampMsOf(value);
  return ms === null ? null : new Date(ms).toLocaleString();
}

function normalizeRole(value: unknown): UserRole {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (role === 'user' || role === '') return 'customer';
  return (ALL_ROLES as string[]).includes(role) ? (role as UserRole) : 'customer';
}

/** Runs a query and swallows a permission/index failure so one restricted
 * section cannot blank out the rest of the investigation. */
async function safeDocs(collectionName: string, constraints: QueryConstraint[]) {
  try {
    const snap = await getDocs(query(collection(db, collectionName), ...constraints));
    return snap.docs;
  } catch (err) {
    console.warn(`Investigation: could not read ${collectionName}:`, err);
    return [] as QueryDocumentSnapshot<DocumentData>[];
  }
}

function mapUser(d: QueryDocumentSnapshot<DocumentData>): AdminUserRow {
  const data = d.data();
  const rawVerification = data.verificationStatus ?? (data.verified === true ? 'approved' : undefined);
  return {
    uid: d.id,
    name: data.name ?? data.displayName ?? '(no name)',
    email: data.email ?? null,
    phone: data.phone ?? data.phoneNumber ?? null,
    role: normalizeRole(data.role),
    disabled: Boolean(data.disabled),
    verificationStatus: (['pending', 'approved', 'rejected'].includes(rawVerification)
      ? rawVerification
      : 'unknown') as VerificationStatus,
    dealerCode: data.dealerCode,
    resellerCode: data.resellerCode,
    features: {
      mobileBanking: true, recharge: true, remittance: true, travel: true, ticketReseller: true,
      ...(data.features ?? {}),
    },
  };
}

/** Prefix search over the fields an investigator actually types: name,
 * email and phone. Firestore has no substring operator, so each field is a
 * range query on its own single-field index; results are merged and
 * de-duplicated by uid. */
export async function searchInvestigationUsers(term: string): Promise<AdminUserRow[]> {
  const raw = term.trim();
  if (!raw) return [];

  // Investigation search uses a privileged callable rather than direct
  // collection queries. This fixes phone/email lookup across legacy formats,
  // avoids client-side Firestore rule/index differences, and keeps email
  // visible only to authorized staff.
  const fn = httpsCallable<{ query: string }, {
    results: Array<{
      uid: string;
      name?: string;
      email?: string;
      phone?: string;
      phoneE164?: string;
      role?: string;
      userId?: string;
      disabled?: boolean;
    }>;
  }>(functions, 'searchInvestigationUsers');

  const { data } = await fn({ query: raw.slice(0, 150) });
  return (data.results || []).map((u) => ({
    uid: u.uid,
    name: u.name || '(no name)',
    email: u.email || null,
    phone: u.phone || u.phoneE164 || null,
    role: normalizeRole(u.role),
    disabled: Boolean(u.disabled),
    verificationStatus: 'unknown' as VerificationStatus,
    features: {
      mobileBanking: true, recharge: true, remittance: true, travel: true, ticketReseller: true,
    },
  }));
}

export interface InvestigationTransaction {
  id: string;
  service: string;
  details: string;
  total: number;
  status: string;
  rejected: boolean;
  createdAt: string | null;
  timestampMs: number | null;
}

export async function getInvestigationTransactions(uid: string): Promise<InvestigationTransaction[]> {
  const docs = await safeDocs('transactions', [
    where('customerId', '==', uid), orderBy('createdAt', 'desc'), fbLimit(MAX_ROWS),
  ]);
  return docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      service: data.service ?? 'Transaction',
      details: data.details ?? '',
      total: Number(data.total ?? data.amount ?? 0),
      status: (data.status as string) ?? 'pending',
      rejected: data.rejected === true,
      createdAt: dateLabelOf(data.createdAt),
      timestampMs: timestampMsOf(data.createdAt),
    };
  });
}

export interface InvestigationTicket {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string | null;
  timestampMs: number | null;
}

export async function getInvestigationTickets(uid: string): Promise<InvestigationTicket[]> {
  const docs = await safeDocs('supportTickets', [
    where('userId', '==', uid), orderBy('createdAt', 'desc'), fbLimit(MAX_ROWS),
  ]);
  return docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      subject: data.subject ?? data.title ?? 'Support ticket',
      message: data.message ?? data.body ?? '',
      status: (data.status as string) ?? 'open',
      createdAt: dateLabelOf(data.createdAt),
      timestampMs: timestampMsOf(data.createdAt),
    };
  });
}

export interface InvestigationKyc {
  id: string;
  documentType: string | null;
  status: string;
  rejectionReason: string | null;
  submittedAt: string | null;
  timestampMs: number | null;
}

function mapKyc(id: string, data: DocumentData): InvestigationKyc {
  return {
    id,
    documentType: data.documentType ?? null,
    status: (data.status as string) ?? 'pending',
    rejectionReason: data.rejectionReason ?? null,
    submittedAt: dateLabelOf(data.submittedAt),
    timestampMs: timestampMsOf(data.submittedAt),
  };
}

/** verificationRequests is keyed by uid (firestore.rules), with a uid field
 * on the document for installs that keyed it by request id instead. */
export async function getInvestigationKyc(uid: string): Promise<InvestigationKyc[]> {
  try {
    const snap = await getDoc(doc(db, 'verificationRequests', uid));
    if (snap.exists()) return [mapKyc(snap.id, snap.data())];
  } catch (err) {
    console.warn('Investigation: could not read verificationRequests:', err);
  }
  const docs = await safeDocs('verificationRequests', [where('uid', '==', uid), fbLimit(MAX_ROWS)]);
  return docs
    .map((d) => mapKyc(d.id, d.data()))
    .sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0));
}

export interface InvestigationLog {
  id: string;
  type: 'audit' | 'activity';
  summary: string;
  createdAt: string | null;
  timestampMs: number | null;
}

function summaryOf(data: DocumentData): string {
  const value = data.action ?? data.event ?? data.type ?? data.operation ?? data.message ?? 'Logged event';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** activityLog and userAuditLog are superadmin-readable only, so an admin
 * simply sees no log section rather than an error. */
export async function getInvestigationLogs(uid: string): Promise<InvestigationLog[]> {
  const [activity, audit] = await Promise.all([
    safeDocs('activityLog', [where('userId', '==', uid), orderBy('createdAt', 'desc'), fbLimit(MAX_ROWS)]),
    safeDocs('userAuditLog', [where('targetUid', '==', uid), orderBy('createdAt', 'desc'), fbLimit(MAX_ROWS)]),
  ]);
  const rows: InvestigationLog[] = [
    ...activity.map((d) => ({ id: d.id, type: 'activity' as const, summary: summaryOf(d.data()), createdAt: dateLabelOf(d.data().createdAt), timestampMs: timestampMsOf(d.data().createdAt) })),
    ...audit.map((d) => ({ id: d.id, type: 'audit' as const, summary: summaryOf(d.data()), createdAt: dateLabelOf(d.data().createdAt), timestampMs: timestampMsOf(d.data().createdAt) })),
  ];
  return rows.sort((a, b) => (b.timestampMs ?? 0) - (a.timestampMs ?? 0));
}

export interface InvestigationSummary {
  totalValue: number;
  pendingValue: number;
  completedValue: number;
  rejectedValue: number;
  rejectedTransactions: number;
  highValueTransactions: number;
  openTickets: number;
  kycStatus: string;
}

/** Derived entirely from the records already on screen — "visible value",
 * not a platform-wide total. */
export function buildInvestigationSummary(
  transactions: InvestigationTransaction[],
  tickets: InvestigationTicket[],
  kyc: InvestigationKyc[]
): InvestigationSummary {
  let totalValue = 0;
  let pendingValue = 0;
  let completedValue = 0;
  let rejectedValue = 0;
  let rejectedTransactions = 0;
  let highValueTransactions = 0;

  for (const tx of transactions) {
    totalValue += tx.total;
    if (tx.rejected) {
      rejectedValue += tx.total;
      rejectedTransactions += 1;
    } else if (tx.status === 'completed') {
      completedValue += tx.total;
    } else {
      pendingValue += tx.total;
    }
    if (tx.total >= HIGH_VALUE_THRESHOLD) highValueTransactions += 1;
  }

  return {
    totalValue,
    pendingValue,
    completedValue,
    rejectedValue,
    rejectedTransactions,
    highValueTransactions,
    openTickets: tickets.filter((t) => t.status !== 'resolved').length,
    kycStatus: kyc[0]?.status ?? 'none',
  };
}
