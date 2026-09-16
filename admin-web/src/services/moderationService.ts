import {
  collection,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------
// Identity Verification
// ---------------------------------------------------------------------
// Verification requests are stored as verificationRequests/{uid} and are
// reviewed through the dedicated server-only callables in
// kycVerificationService.ts. This service is intentionally read-only so
// the Admin Web client cannot bypass the server-side KYC review controls.

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
  [key: string]: unknown;
}

function formatTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toLocaleString();

  const candidate = value as { toDate?: () => Date };
  if (typeof candidate?.toDate === 'function') {
    try {
      return candidate.toDate().toLocaleString();
    } catch {
      return null;
    }
  }
  return String(value);
}

function mapVerification(
  d: QueryDocumentSnapshot<DocumentData>
): VerificationRequest {
  const data = d.data();
  return {
    id: d.id,
    uid: typeof data.uid === 'string' && data.uid ? data.uid : d.id,
    name: typeof data.name === 'string' ? data.name : '(no name)',
    phone: typeof data.phone === 'string' ? data.phone : null,
    documentType:
      typeof data.documentType === 'string' ? data.documentType : null,
    frontImageUrl:
      typeof data.frontImageUrl === 'string' ? data.frontImageUrl : null,
    backImageUrl:
      typeof data.backImageUrl === 'string' ? data.backImageUrl : null,
    selfieImageUrl:
      typeof data.selfieImageUrl === 'string' ? data.selfieImageUrl : null,
    submittedAt: formatTimestamp(data.submittedAt),
    status:
      data.status === 'approved' || data.status === 'rejected'
        ? data.status
        : 'pending',
    rejectionReason:
      typeof data.rejectionReason === 'string'
        ? data.rejectionReason
        : undefined,
    ...data,
  };
}

export async function fetchVerificationRequests(
  status: VerificationStatus = 'pending'
): Promise<VerificationRequest[]> {
  const ref = collection(db, 'verificationRequests');
  const snap = await getDocs(
    query(
      ref,
      where('status', '==', status),
      orderBy('submittedAt', 'desc'),
      fbLimit(PAGE_SIZE)
    )
  );
  return snap.docs.map(mapVerification);
}
