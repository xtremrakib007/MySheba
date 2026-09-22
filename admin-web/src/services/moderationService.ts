// Admin Web moderation service. Mirrors the mobile app's
// directChatModerationService.js; Identity Verification's collection
// name is still an inferred guess pending confirmation against real
// mobile source.

import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

const PAGE_SIZE = 25;

// Firestore 'in' queries cap at 10 values per query.
async function fetchUserInfoByUid(
  uids: string[]
): Promise<Record<string, { name: string; suspended: boolean }>> {
  const unique = [...new Set(uids.filter(Boolean))];
  const info: Record<string, { name: string; suspended: boolean }> = {};
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const snap = await getDocs(
      query(collection(db, 'users'), where(documentId(), 'in', chunk))
    );
    snap.docs.forEach((d) => {
      const data = d.data();
      info[d.id] = { name: (data.name as string | undefined) ?? d.id, suspended: !!data.suspended };
    });
  }
  return info;
}

// ---------------------------------------------------------------------
// Identity Verification — assumed collection: verificationRequests/{uid}
// mirrored to users/{uid}.verificationStatus for quick lookup elsewhere.
// ---------------------------------------------------------------------

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationRequest {
  id: string;
  uid: string;
  name: string;
  phone: string | null;
  documentType: string | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  selfieImageUrl: string | null;
  submittedAt: string | null;
  status: VerificationStatus;
  rejectionReason?: string;
}

function mapVerification(d: QueryDocumentSnapshot<DocumentData>): VerificationRequest {
  const data = d.data();
  return {
    id: d.id,
    uid: data.uid ?? d.id,
    name: data.name ?? '(no name)',
    phone: data.phone ?? null,
    documentType: data.documentType ?? null,
    frontImageUrl: data.frontImageUrl ?? null,
    backImageUrl: data.backImageUrl ?? null,
    selfieImageUrl: data.selfieImageUrl ?? null,
    submittedAt: data.submittedAt?.toDate?.().toLocaleString() ?? data.submittedAt ?? null,
    status: (data.status as VerificationStatus) ?? 'pending',
    rejectionReason: data.rejectionReason,
  };
}

export async function fetchVerificationRequests(
  status: VerificationStatus = 'pending'
): Promise<VerificationRequest[]> {
  const ref = collection(db, 'verificationRequests');
  const snap = await getDocs(
    query(ref, where('status', '==', status), orderBy('submittedAt', 'desc'), fbLimit(PAGE_SIZE))
  );
  return snap.docs.map(mapVerification);
}

/** Approves or rejects a KYC submission. The request document and the
 * mirrored users/{uid} verification fields are both server-owned
 * (firestore.rules denies client writes to them), so this goes through the
 * same Cloud Functions the mobile app's review flow uses; they write the
 * request, mirror `verified`/`verificationStatus` onto the user and record
 * the audit entry. */
export async function reviewVerification(
  req: VerificationRequest,
  decision: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<void> {
  const fn = httpsCallable(functions, decision === 'approved' ? 'approveVerification' : 'rejectVerification');
  await fn(decision === 'approved'
    ? { targetUid: req.uid }
    : { targetUid: req.uid, reason: rejectionReason?.trim() || '' });
}

// ---------------------------------------------------------------------
// Content reports — Buy & Sell, Property, Room Sharing, Local Services
// and Community posts. Reports for each surface are filed into their own
// collection, unified into one feed the same way
// subscribeAllReports does on mobile. Each kind's underlying post lives
// in its own collection too, and every one of them uses the same
// {status, updatedAt} shape - hide sets status:'hidden', restore sets
// status:'active', delete is a hard doc delete. This replaces an earlier
// version of this file that only handled 'listing' reports against a
// guessed listingPath/hidden-flag shape that didn't match reality.
// ---------------------------------------------------------------------

export type ReportKind = 'listing' | 'property' | 'roomshare' | 'service' | 'post';

export type ReportStatus = 'open' | 'resolved';

interface ReportKindConfig {
  label: string;
  collection: string;
  targetCollection: string;
  targetIdField: string;
  targetTitleField: string;
  ownerField: string;
}

export const REPORT_KINDS: Record<ReportKind, ReportKindConfig> = {
  listing: {
    label: 'Buy & Sell',
    collection: 'listingReports',
    targetCollection: 'listings',
    targetIdField: 'listingId',
    targetTitleField: 'listingTitle',
    ownerField: 'sellerId',
  },
  property: {
    label: 'Property',
    collection: 'propertyReports',
    targetCollection: 'properties',
    targetIdField: 'propertyId',
    targetTitleField: 'propertyTitle',
    ownerField: 'ownerId',
  },
  roomshare: {
    label: 'Room Sharing',
    collection: 'roomshareReports',
    targetCollection: 'roomshareRequests',
    targetIdField: 'requestId',
    targetTitleField: 'requestPosterName',
    ownerField: 'posterId',
  },
  service: {
    label: 'Local Services',
    collection: 'serviceReports',
    targetCollection: 'serviceProviders',
    targetIdField: 'providerId',
    targetTitleField: 'providerName',
    ownerField: 'ownerId',
  },
  post: {
    label: 'Community',
    collection: 'postReports',
    targetCollection: 'posts',
    targetIdField: 'postId',
    targetTitleField: 'postTitle',
    ownerField: 'authorId',
  },
};

const MAX_PER_KIND = 200;

export interface Report {
  id: string;
  kind: ReportKind;
  kindLabel: string;
  targetId: string | null;
  targetTitle: string;
  reason: string;
  details: string | null;
  reporterId: string | null;
  createdAt: string | null;
  status: ReportStatus;
}

function mapReport(kind: ReportKind, d: QueryDocumentSnapshot<DocumentData>): Report {
  const cfg = REPORT_KINDS[kind];
  const data = d.data();
  return {
    id: d.id,
    kind,
    kindLabel: cfg.label,
    targetId: data[cfg.targetIdField] ?? null,
    targetTitle: data[cfg.targetTitleField] ?? '(untitled)',
    reason: data.reason ?? 'No reason given',
    details: data.details ?? null,
    reporterId: data.reporterId ?? null,
    createdAt: data.createdAt?.toDate?.().toLocaleString() ?? data.createdAt ?? null,
    // Reports filed before the status field existed have none at all -
    // implicitly open, same fallback subscribeAllReports uses.
    status: (data.status as ReportStatus) ?? 'open',
  };
}

/** One-time fetch (not live - moderation doesn't need live target
 * updates) across all five report collections, merged and sorted newest
 * first, same shape subscribeAllReports produces on mobile. */
export async function fetchReports(): Promise<Report[]> {
  const kinds = Object.keys(REPORT_KINDS) as ReportKind[];
  const results = await Promise.all(
    kinds.map(async (kind) => {
      const cfg = REPORT_KINDS[kind];
      try {
        const snap = await getDocs(
          query(collection(db, cfg.collection), orderBy('createdAt', 'desc'), fbLimit(MAX_PER_KIND))
        );
        return snap.docs.map((d) => mapReport(kind, d));
      } catch (err) {
        console.warn(`Could not load ${cfg.collection}:`, err);
        return [];
      }
    })
  );
  return results.flat().sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/** Marks a report resolved (or reopens it) without touching the
 * underlying post. */
export async function setReportStatus(
  report: Report,
  status: ReportStatus,
  resolvedByUid: string
): Promise<void> {
  await updateDoc(doc(db, REPORT_KINDS[report.kind].collection, report.id), {
    status,
    resolvedBy: resolvedByUid,
    resolvedAt: new Date(),
  });
}

export interface TargetStatus {
  status: string | null;
  ownerId: string | null;
  exists: boolean;
}

/** Current status/owner of the reported post itself - fetched
 * separately since the report doc only has a title snapshot from when
 * it was filed, not the post's live state. */
export async function fetchTargetStatus(report: Report): Promise<TargetStatus> {
  if (!report.targetId) return { status: null, ownerId: null, exists: false };
  const cfg = REPORT_KINDS[report.kind];
  const snap = await getDoc(doc(db, cfg.targetCollection, report.targetId));
  if (!snap.exists()) return { status: null, ownerId: null, exists: false };
  const data = snap.data();
  return { status: data.status ?? null, ownerId: data[cfg.ownerField] ?? null, exists: true };
}

/** Hides the reported post from every surface that lists it. */
export async function hideTarget(report: Report): Promise<void> {
  if (!report.targetId) throw new Error('No post reference on this report.');
  const cfg = REPORT_KINDS[report.kind];
  await updateDoc(doc(db, cfg.targetCollection, report.targetId), { status: 'hidden', updatedAt: new Date() });
}

/** Puts a previously hidden post back on the public surfaces. */
export async function restoreTarget(report: Report): Promise<void> {
  if (!report.targetId) throw new Error('No post reference on this report.');
  const cfg = REPORT_KINDS[report.kind];
  await updateDoc(doc(db, cfg.targetCollection, report.targetId), { status: 'active', updatedAt: new Date() });
}

/** Permanently removes the reported post. */
export async function deleteTarget(report: Report): Promise<void> {
  if (!report.targetId) throw new Error('No post reference on this report.');
  const cfg = REPORT_KINDS[report.kind];
  await deleteDoc(doc(db, cfg.targetCollection, report.targetId));
}

/** Suspends the account behind a report. Routes through the same
 * `manageUser` Cloud Function userManagementService.ts uses for
 * role/disable changes, which is Auth-backed and audit-logged — there is no
 * per-surface posting ban, so this locks the whole account. */
export async function suspendReportedUser(uid: string, suspended: boolean): Promise<void> {
  const fn = httpsCallable(functions, 'manageUser');
  await fn({ action: 'suspend', targetUid: uid, suspended: Boolean(suspended) });
}

/** Names and suspension state for the accounts behind a set of reports,
 * so the moderation queue can show who filed and who owns each post. */
export async function fetchReportUsers(
  reports: Report[]
): Promise<Record<string, { name: string; suspended: boolean }>> {
  return fetchUserInfoByUid(reports.map((r) => r.reporterId ?? '').filter(Boolean));
}
