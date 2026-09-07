// Firestore access for the Salary & OT module's Deductions (PRD section
// 10). Collection: users/{userId}/deductions/{deductionId} - subcollection,
// same convention as salarySettingsService.js. Mirrors allowanceService.js
// exactly (opposite side of the same ledger - see
// salaryCalculationService.js's sumLineItems, used for both).
//
// PRD section 10: "Do not assume every foreign worker has the same
// deductions" - so, same as allowances, this is a freeform Add Deduction
// list (EPF/SOCSO/EIS/etc. are suggested names only, not a fixed enum -
// see SUGGESTED_DEDUCTIONS in salaryConstants.js).
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './config';
import { RECURRENCE_TYPES } from '../data/salaryConstants';

function deductionsCollection(userId) {
  return collection(db, 'users', userId, 'deductions');
}

export async function addDeduction(userId, deduction) {
  if (!userId) throw new Error('Not authenticated');
  const ref = await addDoc(deductionsCollection(userId), {
    name: (deduction.name || '').trim(),
    amount: Number(deduction.amount) || 0,
    recurrence: deduction.recurrence || RECURRENCE_TYPES.RECURRING,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDeduction(userId, deductionId, updates) {
  if (!userId) throw new Error('Not authenticated');
  await updateDoc(doc(deductionsCollection(userId), deductionId), { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteDeduction(userId, deductionId) {
  if (!userId) throw new Error('Not authenticated');
  await deleteDoc(doc(deductionsCollection(userId), deductionId));
}

/** Live list, most recently added first - used by DeductionScreen and to
 * prefill MonthlySummaryScreen's recurring total. */
export function subscribeDeductions(userId, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  const q = query(deductionsCollection(userId), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => hydrate(d.id, d.data()))),
    (err) => onError?.(err)
  );
}

/** Just the recurring ones - what MonthlySummaryScreen prefills a new
 * month's record with (one-time entries don't carry forward). */
export function subscribeRecurringDeductions(userId, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  const q = query(deductionsCollection(userId), where('recurrence', '==', RECURRENCE_TYPES.RECURRING));
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
