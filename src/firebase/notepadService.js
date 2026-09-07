// Firestore access for the Notepad module (private per-user notes, plus
// credit/debit/loan money notes).
//
// Collection: notes/{noteId}, flat with a `userId` field - same convention
// as myDocuments/{id}, topups/{id}, etc. elsewhere in this app, rather
// than a users/{uid}/notes subcollection. Queries only filter on userId
// (no orderBy in the query itself) and sort by updatedAt client-side, so
// this never needs a composite index - the same pattern documentService.js
// uses.
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
import { NOTE_TYPES, MONEY_NOTE_TYPES, NOTE_STATUS } from '../data/notepadConstants';

function notesCollection() {
  return collection(db, 'notes');
}

function sortByUpdatedDesc(notes) {
  return notes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function listNotes(userId) {
  if (!userId) throw new Error('Not authenticated');
  const q = query(notesCollection(), where('userId', '==', userId));
  const snap = await getDocs(q);
  return sortByUpdatedDesc(snap.docs.map((d) => hydrate(d.id, d.data())));
}

/** Realtime listener - preferred for NotepadScreen's list. */
export function subscribeToNotes(userId, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  const q = query(notesCollection(), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => onChange(sortByUpdatedDesc(snap.docs.map((d) => hydrate(d.id, d.data())))),
    (err) => onError?.(err)
  );
}

export async function createNote(userId, draft) {
  if (!userId) throw new Error('Not authenticated');
  const isMoneyNote = MONEY_NOTE_TYPES.includes(draft.noteType);
  const ref = await addDoc(notesCollection(), {
    userId,
    noteType: draft.noteType || NOTE_TYPES.GENERAL,
    title: draft.title?.trim() || '',
    content: draft.content?.trim() || '',
    personName: isMoneyNote ? draft.personName?.trim() || '' : '',
    amount: isMoneyNote ? Number(draft.amount) || 0 : null,
    transactionDate: isMoneyNote ? draft.transactionDate ?? Date.now() : null,
    dueDate: isMoneyNote ? draft.dueDate ?? null : null,
    status: isMoneyNote ? draft.status || NOTE_STATUS.PENDING : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateNote(noteId, updates) {
  await updateDoc(doc(notesCollection(), noteId), { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteNoteRecord(noteId) {
  await deleteDoc(doc(notesCollection(), noteId));
}

function hydrate(id, data) {
  const toMillis = (v) => (v instanceof Timestamp ? v.toMillis() : v ?? null);
  return {
    id,
    userId: data.userId,
    noteType: data.noteType || NOTE_TYPES.GENERAL,
    title: data.title || '',
    content: data.content || '',
    personName: data.personName || '',
    amount: data.amount ?? null,
    transactionDate: toMillis(data.transactionDate),
    dueDate: toMillis(data.dueDate),
    status: data.status || null,
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    updatedAt: toMillis(data.updatedAt) ?? Date.now(),
  };
}
