// Firestore access for the Salary & OT module's monthly Salary Records
// (PRD sections 14-18) - the Monthly Summary / Salary History data.
//
// Collection: users/{userId}/salaryRecords/{recordId} - subcollection,
// same convention as salarySettingsService.js. Doc id is 'YYYY-MM' (see
// recordId() below), same reasoning as workLogService's date-keyed doc
// id: one record per calendar month, so opening "August 2026" is always a
// direct getDoc/setDoc at a known path, never a query, and there's no way
// to accidentally create two records for the same month.
//
// A record is built from calculateTakeHomePay() output
// (salaryCalculationService.js) plus the actual salary the user later
// enters (PRD section 15) - this service only persists numbers; it never
// computes them itself.
import { collection, doc, getDoc, setDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, limit, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './config';

function recordsCollection(userId) {
  return collection(db, 'users', userId, 'salaryRecords');
}

function recordRef(userId, recordIdStr) {
  return doc(recordsCollection(userId), recordIdStr);
}

/** 'YYYY-MM' for a given year+month (1-12), e.g. recordId(2026, 8) ->
 * '2026-08'. Sorts lexicographically the same as chronologically, same
 * trick as workLogService.dateKey(). */
export function recordId(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export async function getSalaryRecord(userId, recordIdStr) {
  if (!userId) throw new Error('Not authenticated');
  const snap = await getDoc(recordRef(userId, recordIdStr));
  return snap.exists() ? hydrate(snap.id, snap.data()) : null;
}

/** Live single-record subscription - used by MonthlySummaryScreen so an
 * edit (e.g. entering actual salary) reflects immediately without a
 * manual refetch. */
export function subscribeSalaryRecord(userId, recordIdStr, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  return onSnapshot(
    recordRef(userId, recordIdStr),
    (snap) => onChange(snap.exists() ? hydrate(snap.id, snap.data()) : null),
    (err) => onError?.(err)
  );
}

/**
 * Creates or fully replaces a month's estimate breakdown (basic/OT/
 * allowances/deductions/gross/take-home + which OT calculation method and
 * version produced it - PRD section 33 "Store the calculation version").
 * Deliberately does NOT touch actualSalaryReceived/difference/
 * payslipFileReference - call recordActualSalary / attachPayslip for
 * those, so re-running the estimate (e.g. after editing a work log entry)
 * never accidentally wipes out an actual-salary entry or payslip the user
 * already saved for that month.
 */
export async function saveSalaryEstimate(userId, recordIdStr, { year, month, breakdown, otCalculationMethod, otCalculationVersion, daysWorked, otHours }) {
  if (!userId) throw new Error('Not authenticated');
  const existing = await getDoc(recordRef(userId, recordIdStr));
  await setDoc(
    recordRef(userId, recordIdStr),
    {
      year,
      month,
      daysWorked: Number(daysWorked) || 0,
      otHours: Number(otHours) || 0,
      basicPay: breakdown.basicPay,
      otPay: breakdown.otPay,
      allowances: breakdown.allowances,
      deductions: breakdown.deductions,
      estimatedGross: breakdown.grossPay,
      estimatedTakeHome: breakdown.takeHomePay,
      otCalculationMethod,
      otCalculationVersion,
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Records what the user actually received and the resulting difference
 * (PRD section 15). Callers should compute `difference` via
 * salaryCalculationService.calculateDifference() beforehand - this
 * function just persists it. */
export async function recordActualSalary(userId, recordIdStr, actualSalaryReceived, difference) {
  if (!userId) throw new Error('Not authenticated');
  await setDoc(
    recordRef(userId, recordIdStr),
    { actualSalaryReceived: Number(actualSalaryReceived) || 0, difference, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Attaches an already-uploaded payslip file's Storage reference (PRD
 * section 16) - call salaryStorageService.uploadPayslip() first to get
 * fileReference. */
export async function attachPayslip(userId, recordIdStr, fileReference) {
  if (!userId) throw new Error('Not authenticated');
  await setDoc(recordRef(userId, recordIdStr), { payslipFileReference: fileReference, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteSalaryRecord(userId, recordIdStr) {
  if (!userId) throw new Error('Not authenticated');
  await deleteDoc(recordRef(userId, recordIdStr));
  // Caller is responsible for also deleting the payslip Storage file, if
  // any, via salaryStorageService.deletePayslip() - same division of
  // responsibility as documentService.deleteDocumentRecord().
}

/** Every record, most recent month first - Salary History (PRD section
 * 18). limit(24) (two years) keeps this a single unbounded-growth-safe
 * read; SalaryHistoryScreen can raise the limit if a "load more" is added
 * later. */
export async function listSalaryHistory(userId, historyLimit = 24) {
  if (!userId) throw new Error('Not authenticated');
  const q = query(recordsCollection(userId), orderBy('year', 'desc'), orderBy('month', 'desc'), limit(historyLimit));
  const snap = await getDocs(q);
  return snap.docs.map((d) => hydrate(d.id, d.data()));
}

/** Live version of listSalaryHistory - used by SalaryHistoryScreen. */
export function subscribeSalaryHistory(userId, onChange, onError, historyLimit = 24) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  const q = query(recordsCollection(userId), orderBy('year', 'desc'), orderBy('month', 'desc'), limit(historyLimit));
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
    year: data.year,
    month: data.month,
    daysWorked: data.daysWorked ?? 0,
    otHours: data.otHours ?? 0,
    basicPay: data.basicPay ?? 0,
    otPay: data.otPay ?? 0,
    allowances: data.allowances ?? 0,
    deductions: data.deductions ?? 0,
    estimatedGross: data.estimatedGross ?? 0,
    estimatedTakeHome: data.estimatedTakeHome ?? 0,
    otCalculationMethod: data.otCalculationMethod ?? null,
    otCalculationVersion: data.otCalculationVersion ?? null,
    actualSalaryReceived: data.actualSalaryReceived ?? null,
    difference: data.difference ?? null,
    payslipFileReference: data.payslipFileReference ?? null,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}
