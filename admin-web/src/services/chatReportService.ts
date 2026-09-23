// Reported direct-chat content. Reports are filed by the mobile app into
// `chatReports` and are only ever resolved from here — the admin panel
// never edits the reported conversation itself.

import {
  collection,
  doc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const COLLECTION = 'chatReports';
const PAGE_SIZE = 100;

export type ChatReportStatus = 'open' | 'resolved' | 'dismissed';
export const CHAT_REPORT_STATUS_LABELS: Record<ChatReportStatus, string> = {
  open: 'Open', resolved: 'Resolved', dismissed: 'Dismissed',
};

export interface ChatReport {
  id: string;
  chatId: string | null;
  reporterId: string | null;
  reporterName: string;
  reportedUserId: string | null;
  reportedUserName: string;
  reason: string;
  details: string | null;
  messagePreview: string | null;
  status: ChatReportStatus;
  createdAt: string | null;
}

function mapReport(d: QueryDocumentSnapshot<DocumentData>): ChatReport {
  const data = d.data();
  return {
    id: d.id,
    chatId: data.chatId ?? data.conversationId ?? null,
    reporterId: data.reporterId ?? data.reportedBy ?? null,
    reporterName: data.reporterName ?? 'Unknown reporter',
    reportedUserId: data.reportedUserId ?? data.targetUid ?? null,
    reportedUserName: data.reportedUserName ?? 'Unknown account',
    reason: data.reason ?? 'No reason given',
    details: data.details ?? null,
    messagePreview: data.messagePreview ?? data.message ?? null,
    status: (data.status as ChatReportStatus) ?? 'open',
    createdAt: data.createdAt?.toDate?.().toLocaleString() ?? data.createdAt ?? null,
  };
}

export async function fetchChatReports(status: ChatReportStatus | 'all' = 'open'): Promise<ChatReport[]> {
  const ref = collection(db, COLLECTION);
  const q = status === 'all'
    ? query(ref, orderBy('createdAt', 'desc'), fbLimit(PAGE_SIZE))
    : query(ref, where('status', '==', status), orderBy('createdAt', 'desc'), fbLimit(PAGE_SIZE));
  return (await getDocs(q)).docs.map(mapReport);
}

export async function setChatReportStatus(id: string, status: ChatReportStatus): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status,
    reviewedBy: auth.currentUser?.uid ?? null,
    reviewedAt: serverTimestamp(),
  });
}
