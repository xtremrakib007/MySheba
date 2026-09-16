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

/**
 * Review identity verification through the server-only callables.
 * The Functions perform the verification request + user mirror update
 * atomically and enforce admin authorization.
 */
export async function reviewVerification(
  req: VerificationRequest,
  decision: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<void> {
  if (!req.uid) throw new Error('Verification request has no target user.');

  if (decision === 'approved') {
    const fn = httpsCallable<{ targetUid: string }, { ok: boolean }>(
      functions,
      'approveVerification'
    );
    await fn({ targetUid: req.uid });
    return;
  }

  const reason = String(rejectionReason ?? '').trim().slice(0, 500);
  if (!reason) throw new Error('A rejection reason is required.');

  const fn = httpsCallable<
    { targetUid: string; reason: string },
    { ok: boolean }
  >(functions, 'rejectVerification');
  await fn({ targetUid: req.uid, reason });
}

// ---------------------------------------------------------------------
// Moderation/report helpers continue below. Their target collections are
// separate from identity verification and retain their existing behavior.
// ---------------------------------------------------------------------

export type ReportStatus = 'open' | 'resolved';

interface ReportKindConfig {
  label: string;
  collection: string;
  targetCollection: string;
  targetIdField: string;
  targetTitleField: string;
  ownerField: string;
}
