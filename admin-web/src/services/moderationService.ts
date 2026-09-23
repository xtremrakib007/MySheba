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

// Identity verification requests are read-only from Admin Web. All review
// mutations go through the server-only approve/reject callables.
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationRequest {
  id: string;
  uid: string;
  name: string;
  phone: string | null;
  documentType: string | null;
  documentNumber: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  passportExpiryDate: string | null;
  frontImageUrl: string | null;
  frontDocumentUrl: string | null;
  documentUrl: string | null;
  backImageUrl: string | null;
  backDocumentUrl: string | null;
  selfieImageUrl: string | null;
  selfieUrl: string | null;
  liveFaceVerified: boolean;
  faceVerificationMethod: string | null;
  faceVerificationModel: string | null;
  submittedAt: string | null;
  status: VerificationStatus;
  rejectionReason?: string;
}

function formatTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toLocaleString();
  const candidate = value as { toDate?: () => Date };
  if (typeof candidate?.toDate === 'function') {
    try { return candidate.toDate().toLocaleString(); } catch { return null; }
  }
  return String(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapVerification(d: QueryDocumentSnapshot<DocumentData>): VerificationRequest {
  const data = d.data();
  return {
    id: d.id,
    uid: typeof data.uid === 'string' && data.uid ? data.uid : d.id,
    name: typeof data.name === 'string' ? data.name : '(no name)',
    phone: stringValue(data.phone),
    documentType: stringValue(data.documentType),
    documentNumber: stringValue(data.documentNumber),
    nationality: stringValue(data.nationality),
    dateOfBirth: stringValue(data.dateOfBirth),
    gender: stringValue(data.gender),
    address: stringValue(data.address),
    passportExpiryDate: stringValue(data.passportExpiryDate),
    frontImageUrl: stringValue(data.frontImageUrl),
    frontDocumentUrl: stringValue(data.frontDocumentUrl),
    documentUrl: stringValue(data.documentUrl),
    backImageUrl: stringValue(data.backImageUrl),
    backDocumentUrl: stringValue(data.backDocumentUrl),
    selfieImageUrl: stringValue(data.selfieImageUrl),
    selfieUrl: stringValue(data.selfieUrl),
    liveFaceVerified: data.liveFaceVerified === true,
    faceVerificationMethod: stringValue(data.faceVerificationMethod),
    faceVerificationModel: stringValue(data.faceVerificationModel),
    submittedAt: formatTimestamp(data.submittedAt),
    status: data.status === 'approved' || data.status === 'rejected' ? data.status : 'pending',
    rejectionReason: stringValue(data.rejectionReason) || undefined,
  };
}

export async function fetchVerificationRequests(status: VerificationStatus = 'pending'): Promise<VerificationRequest[]> {
  const ref = collection(db, 'verificationRequests');
  const snap = await getDocs(query(ref, where('status', '==', status), orderBy('submittedAt', 'desc'), fbLimit(PAGE_SIZE)));
  return snap.docs.map(mapVerification);
}
