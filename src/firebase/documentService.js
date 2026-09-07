// Firestore access for the My Documents module (passport, visa, work
// permit, etc. - a private per-user document vault).
//
// Collection: myDocuments/{documentId}, flat with a `userId` field - same
// convention as topups/{id}, supportTickets/{id}, etc. elsewhere in this
// app, rather than a users/{uid}/documents subcollection. Queries only
// filter on userId (no orderBy in the query itself) and sort by
// updatedAt client-side, so this never needs a composite index - the
// same pattern used throughout the rest of the codebase.
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { DEFAULT_REMINDER_OFFSETS, DOCUMENT_STATUS } from '../data/documentConstants';

const DAY_MS = 24 * 60 * 60 * 1000;

function documentsCollection() {
  return collection(db, 'myDocuments');
}

/**
 * Pure function - status is recomputed rather than trusted from storage,
 * so a stale `status` field never misleads the UI.
 *
 * `hasRecord` distinguishes "no real document exists yet" (the catalog
 * placeholder case) from "a document exists but has no expiry date"
 * (Expiry Date is optional on AddDocumentScreen). Both used to collapse
 * to NOT_ADDED, which made successfully-uploaded documents without an
 * expiry date disappear into the "Not Added" bucket on MyDocumentsScreen.
 * Callers operating on a real Firestore record (createDocument,
 * updateDocument, hydrate) keep the default `true` and don't need
 * changes; only an explicit catalog placeholder should pass `false`.
 * @param {number|null|undefined} expiryDate
 * @param {boolean} [hasRecord]
 * @returns {string} one of DOCUMENT_STATUS
 */
export function computeStatus(expiryDate, hasRecord = true) {
  if (!hasRecord) return DOCUMENT_STATUS.NOT_ADDED;
  if (!expiryDate) return DOCUMENT_STATUS.VALID;
  const daysRemaining = Math.floor((expiryDate - Date.now()) / DAY_MS);
  if (daysRemaining < 0) return DOCUMENT_STATUS.EXPIRED;
  if (daysRemaining <= 30) return DOCUMENT_STATUS.EXPIRING_SOON;
  return DOCUMENT_STATUS.VALID;
}

export function daysRemainingLabel(expiryDate) {
  if (!expiryDate) return '';
  const days = Math.floor((expiryDate - Date.now()) / DAY_MS);
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} day${days === 1 ? '' : 's'} remaining`;
}

function sortByUpdatedDesc(docs) {
  return docs.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function listDocuments(userId) {
  if (!userId) throw new Error('Not authenticated');
  const q = query(documentsCollection(), where('userId', '==', userId));
  const snap = await getDocs(q);
  return sortByUpdatedDesc(snap.docs.map((d) => hydrate(d.id, d.data())));
}

/** Realtime listener - preferred for MyDocumentsScreen's list. */
export function subscribeToDocuments(userId, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  const q = query(documentsCollection(), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => onChange(sortByUpdatedDesc(snap.docs.map((d) => hydrate(d.id, d.data())))),
    (err) => onError?.(err)
  );
}

export async function createDocument(userId, draft, files) {
  if (!userId) throw new Error('Not authenticated');
  const status = computeStatus(draft.expiryDate);
  const ref = await addDoc(documentsCollection(), {
    userId,
    documentType: draft.documentType,
    documentName: draft.documentName,
    documentNumber: draft.documentNumber ?? null,
    issueDate: draft.issueDate ?? null,
    expiryDate: draft.expiryDate ?? null,
    notes: draft.notes ?? '',
    files,
    reminderSettings: draft.reminderSettings ?? {
      enabled: true,
      offsets: DEFAULT_REMINDER_OFFSETS,
    },
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDocument(documentId, updates) {
  const payload = { ...updates, updatedAt: serverTimestamp() };
  if (updates.expiryDate !== undefined) {
    payload.status = computeStatus(updates.expiryDate);
  }
  await updateDoc(doc(documentsCollection(), documentId), payload);
}

/** Replace: keeps the same Firestore record, swaps files + refreshed fields. */
export async function replaceDocumentFiles(documentId, newFiles, updates) {
  await updateDocument(documentId, { files: newFiles, ...(updates ?? {}) });
}

export async function deleteDocumentRecord(documentId) {
  await deleteDoc(doc(documentsCollection(), documentId));
  // Caller is responsible for also deleting the underlying Storage files
  // via documentStorageService.deleteFiles() - see
  // DocumentDetailsScreen.js's confirmDelete().
}

function hydrate(id, data) {
  const toMillis = (v) => (v instanceof Timestamp ? v.toMillis() : v ?? null);
  return {
    id,
    userId: data.userId,
    documentType: data.documentType,
    documentName: data.documentName,
    documentNumber: data.documentNumber ?? undefined,
    issueDate: toMillis(data.issueDate),
    expiryDate: toMillis(data.expiryDate),
    files: data.files ?? [],
    notes: data.notes ?? '',
    reminderSettings: data.reminderSettings ?? { enabled: true, offsets: DEFAULT_REMINDER_OFFSETS },
    status: computeStatus(toMillis(data.expiryDate)),
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    updatedAt: toMillis(data.updatedAt) ?? Date.now(),
  };
}
