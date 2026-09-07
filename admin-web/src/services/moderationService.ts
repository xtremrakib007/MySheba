// Verification, marketplace, and chat-report moderation queues for
// MySheba Admin Web. Marketplace/Chat sections mirror real mobile-app
// schemas confirmed against marketplaceModerationService.js and
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
  limitToLast as fbLimitToLast,
  onSnapshot,
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

export async function reviewVerification(
  req: VerificationRequest,
  decision: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<void> {
  await updateDoc(doc(db, 'verificationRequests', req.id), {
    status: decision,
    ...(rejectionReason ? { rejectionReason } : {}),
  });
  // Mirror onto the user doc so the rest of the app (mobile included)
  // can gate verified-only features off a single field.
  await updateDoc(doc(db, 'users', req.uid), {
    verificationStatus: decision,
    verified: decision === 'approved',
  });
}

// ---------------------------------------------------------------------
// Marketplace Moderation — real schema confirmed against the mobile
// app's src/firebase/marketplaceModerationService.js. Five report kinds,
// each its own collection, unified into one feed the same way
// subscribeAllReports does on mobile. Each kind's underlying post lives
// in its own module collection (marketplaceListings/properties/
// roommateRequests/serviceProviders/communityPosts) with a uniform
// {status, updatedAt} shape - hide sets status:'hidden', restore sets
// status:'active', delete is a hard doc delete. This replaces an earlier
// version of this file that only handled 'listing' reports against a
// guessed listingPath/hidden-flag shape that didn't match reality.
// ---------------------------------------------------------------------

export type ReportKind = 'listing' | 'property' | 'roommate' | 'service' | 'community';
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
    collection: 'marketplaceReports',
    targetCollection: 'marketplaceListings',
    targetIdField: 'listingId',
    targetTitleField: 'listingTitle',
    ownerField: 'sellerId',
  },
  property: {
    label: 'Accommodation',
    collection: 'propertyReports',
    targetCollection: 'properties',
    targetIdField: 'propertyId',
    targetTitleField: 'propertyTitle',
    ownerField: 'ownerId',
  },
  roommate: {
    label: 'Room Sharing',
    collection: 'roommateReports',
    targetCollection: 'roommateRequests',
    targetIdField: 'requestId',
    targetTitleField: 'requestPosterName',
    ownerField: 'posterId',
  },
  service: {
    label: 'Local Services',
    collection: 'serviceProviderReports',
    targetCollection: 'serviceProviders',
    targetIdField: 'providerId',
    targetTitleField: 'providerName',
    ownerField: 'ownerId',
  },
  community: {
    label: 'Community',
    collection: 'communityReports',
    targetCollection: 'communityPosts',
    targetIdField: 'postId',
    targetTitleField: 'postTitle',
    ownerField: 'authorId',
  },
};

const MAX_PER_KIND = 200;

export interface MarketplaceReport {
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

function mapReport(kind: ReportKind, d: QueryDocumentSnapshot<DocumentData>): MarketplaceReport {
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
export async function fetchAllMarketplaceReports(): Promise<MarketplaceReport[]> {
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
export async function setMarketplaceReportStatus(
  report: MarketplaceReport,
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
export async function fetchTargetStatus(report: MarketplaceReport): Promise<TargetStatus> {
  if (!report.targetId) return { status: null, ownerId: null, exists: false };
  const cfg = REPORT_KINDS[report.kind];
  const snap = await getDoc(doc(db, cfg.targetCollection, report.targetId));
  if (!snap.exists()) return { status: null, ownerId: null, exists: false };
  const data = snap.data();
  return { status: data.status ?? null, ownerId: data[cfg.ownerField] ?? null, exists: true };
}

export async function hideTarget(report: MarketplaceReport): Promise<void> {
  if (!report.targetId) throw new Error('No post reference on this report.');
  const cfg = REPORT_KINDS[report.kind];
  await updateDoc(doc(db, cfg.targetCollection, report.targetId), { status: 'hidden', updatedAt: new Date() });
}

export async function restoreTarget(report: MarketplaceReport): Promise<void> {
  if (!report.targetId) throw new Error('No post reference on this report.');
  const cfg = REPORT_KINDS[report.kind];
  await updateDoc(doc(db, cfg.targetCollection, report.targetId), { status: 'active', updatedAt: new Date() });
}

export async function deleteTarget(report: MarketplaceReport): Promise<void> {
  if (!report.targetId) throw new Error('No post reference on this report.');
  const cfg = REPORT_KINDS[report.kind];
  await deleteDoc(doc(db, cfg.targetCollection, report.targetId));
}

/** Bans/unbans a person from posting to Marketplace - a lighter action
 * than suspending their whole account. Routes through the same
 * `manageUser` Cloud Function userManagementService.ts already uses for
 * role/disable changes. */
export async function setMarketplaceBan(targetUid: string, banned: boolean, reason?: string): Promise<void> {
  const fn = httpsCallable(functions, 'manageUser');
  await fn({ action: 'setMarketplaceBan', targetUid, banned, reason: reason || '' });
}

// ---------------------------------------------------------------------
// Chat Reports — real collection: directChatReports/{id}
// (fields confirmed against src/firebase/directChatService.js's
// reportConversation() and directChatModerationService.js: chatId,
// reporterId, reportedUid, reason, status ('open' | 'resolved'),
// createdAt, resolvedBy, resolvedAt. There is no denormalized reporter/
// reported display name or message snippet stored on the report doc
// itself - only the raw uids/chatId - so this shows uids until/unless a
// lookup against users/{uid} is added.)
// ---------------------------------------------------------------------

export type ChatReportStatus = 'open' | 'resolved';
export type ChatReportTab = 'open' | 'resolved' | 'all';

export interface ChatReport {
  id: string;
  chatId: string | null;
  reportedUid: string | null;
  reportedName: string | null;
  reportedSuspended: boolean;
  reporterId: string | null;
  reporterName: string | null;
  reason: string;
  createdAt: string | null;
  status: ChatReportStatus;
}

function mapChatReport(d: QueryDocumentSnapshot<DocumentData>): Omit<
  ChatReport,
  'reportedName' | 'reporterName' | 'reportedSuspended'
> {
  const data = d.data();
  return {
    id: d.id,
    chatId: data.chatId ?? null,
    reportedUid: data.reportedUid ?? null,
    reporterId: data.reporterId ?? null,
    reason: data.reason ?? 'No reason given',
    createdAt: data.createdAt?.toDate?.().toLocaleString() ?? data.createdAt ?? null,
    status: (data.status as ChatReportStatus) ?? 'open',
  };
}

// Mirrors ChatReportsScreen.js's tabs: 'open' = anything not resolved
// (not a strict status=='open' match), 'resolved' = status=='resolved',
// 'all' = everything. Names + suspended state are resolved client-side
// against `users` the same way the mobile screen does (subscribeAllUsers
// + usersByUid) since the report doc itself only stores uids.
export async function fetchChatReports(tab: ChatReportTab = 'open'): Promise<ChatReport[]> {
  const ref = collection(db, 'directChatReports');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc'), fbLimit(PAGE_SIZE)));
  const rows = snap.docs.map(mapChatReport);
  const visible = rows.filter((r) => {
    if (tab === 'all') return true;
    if (tab === 'open') return r.status !== 'resolved';
    return r.status === 'resolved';
  });
  const info = await fetchUserInfoByUid(visible.flatMap((r) => [r.reportedUid, r.reporterId].filter((v): v is string => !!v)));
  return visible.map((r) => ({
    ...r,
    reportedName: r.reportedUid ? (info[r.reportedUid]?.name ?? r.reportedUid) : null,
    reportedSuspended: r.reportedUid ? !!info[r.reportedUid]?.suspended : false,
    reporterName: r.reporterId ? (info[r.reporterId]?.name ?? r.reporterId) : null,
  }));
}

// firestore.rules only allows an admin update to touch status/resolvedBy/
// resolvedAt on directChatReports - matches setChatReportStatus in
// directChatModerationService.js exactly, which also supports flipping a
// resolved report back to 'open' (the mobile screen's "Reopen" button),
// so this takes the target status instead of always writing 'resolved'.
export async function setChatReportStatus(
  report: ChatReport,
  status: ChatReportStatus,
  adminUid: string
): Promise<void> {
  await updateDoc(doc(db, 'directChatReports', report.id), {
    status,
    resolvedBy: status === 'resolved' ? adminUid : null,
    resolvedAt: status === 'resolved' ? new Date() : null,
  });
}

// ---------------------------------------------------------------------
// Investigate Conversation — read-only view of a reported chat's
// messages. Mirrors directChatModerationService.js's
// subscribeInvestigationMessages() exactly: only works while
// directChats/{chatId}.underInvestigation is true, which Cloud Functions
// (not this client) set/clear based on whether the chat has an open
// report against it. Only a superadmin can pass the rules check.
// ---------------------------------------------------------------------

export interface InvestigationMessage {
  id: string;
  senderId: string | null;
  senderName: string | null;
  text: string;
  type: string | null;
  createdAt: string | null;
}

export function subscribeInvestigationMessages(
  chatId: string,
  onUpdate: (messages: InvestigationMessage[]) => void,
  onError: (err: Error) => void
) {
  const q = query(
    collection(db, 'directChats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
    fbLimitToLast(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            senderId: data.senderId ?? null,
            senderName: data.senderName ?? null,
            text: data.text ?? '',
            type: data.type ?? null,
            createdAt:
              data.createdAt?.toDate?.().toLocaleString() ?? data.createdAt ?? null,
          };
        })
      );
    },
    (err) => onError(err as Error)
  );
}
