// Firestore access for the Salary & OT module's Allowances (PRD section
// 9). Collection: users/{userId}/allowances/{allowanceId} - subcollection,
// same convention as salarySettingsService.js.
//
// "Recurring" allowances (housing, transport, etc.) are the standing list
// a user maintains once and reuses every month; MonthlySummaryScreen
// reads this list to prefill a new month's record rather than making the
// user re-enter the same three allowances every month. "One-time" entries
// are still stored here (not inline on the record) so the same Add/Edit/
// Delete UI and sumLineItems() math work for both - see
// salaryCalculationService.js.
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './config';
import { RECURRENCE_TYPES } from '../data/salaryConstants';

function allowancesCollection(userId) {
  return collection(db, 'users', userId, 'allowances');
}

export async function addAllowance(userId, allowance) {
  if (!userId) throw new Error('Not authenticated');
  const ref = await addDoc(allowancesCollection(userId), {
    name: (allowance.name || '').trim(),
    amount: Number(allowance.amount) || 0,
    recurrence: allowance.recurrence || RECURRENCE_TYPES.RECURRING,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAllowance(userId, allowanceId, updates) {
  if (!userId) throw new Error('Not authenticated');
  await updateDoc(doc(allowancesCollection(userId), allowanceId), { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteAllowance(userId, allowanceId) {
  if (!userId) throw new Error('Not authenticated');
  await deleteDoc(doc(allowancesCollection(userId), allowanceId));
}

/** Live list, most recently added first - used by AllowanceScreen and to
 * prefill MonthlySummaryScreen's recurring total. */
export function subscribeAllowances(userId, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  const q = query(allowancesCollection(userId), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => hydrate(d.id, d.data()))),
    (err) => onError?.(err)
  );
}

/** Just the recurring ones - what MonthlySummaryScreen prefills a new
 * month's record with (one-time entries don't carry forward). */
export function subscribeRecurringAllowances(userId, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  const q = query(allowancesCollection(userId), where('recurrence', '==', RECURRENCE_TYPES.RECURRING));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => hydrate(d.id, d.data()))),
    (err) => onError?.(err)
  );
}

function hydrate(id, data) {
  const toMillis = (v) => (v instanceof Timestamp ? v.toMillis() : v ?? null);
  return {
    id,
    name: data.name ?? '',
    amount: data.amount ?? 0,
    recurrence: data.recurrence ?? RECURRENCE_TYPES.RECURRING,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}
