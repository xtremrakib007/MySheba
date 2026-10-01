// Firestore access for the Create Payslip module (PRD sections 17, 24,
// 26).
//
// Collection: users/{userId}/payslips/{payslipId} - a subcollection
// under the user's own account doc, same convention as the Salary & OT
// module (salaryRecordService.js, salarySettingsService.js) rather than
// the flat-collection-with-a-userId-field convention used by myDocuments/
// topups/etc. Payslips are financial + personal data derived from Salary
// & OT, so they follow that module's precedent - see firestore.rules'
// note on users/{uid}/salarySettings for why that split exists.
//
// A generated PDF itself is NOT stored here - "Save to My Documents"
// (PRD section 17) reuses the existing My Documents vault
// (documentService.js / documentStorageService.js) with documentType
// PAYSLIP, per "Do NOT create a second document storage system." This
// service only persists the payslip's structured data, plus a pointer
// (fileReference) to that My Documents record once saved.
import { collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, Timestamp, limit, query } from 'firebase/firestore';
import { db } from './config';
import { calculatePayslipTotals } from '../utils/payslipCalculationService';
import { PAYSLIP_TEMPLATES, CURRENCY } from '../data/payslipConstants';

function payslipsCollection(userId) {
  return collection(db, 'users', userId, 'payslips');
}

function payslipRef(userId, payslipId) {
  return doc(payslipsCollection(userId), payslipId);
}

function settingsRef(userId) {
  // Singleton default-employer doc, same "fixed doc id, no query" shape
  // as salarySettingsService.js's SETTINGS_DOC_ID.
  return doc(db, 'users', userId, 'payslipSettings', 'current');
}

export async function listPayslips(userId) {
  if (!userId) throw new Error('Not authenticated');
  const snap = await getDocs(query(payslipsCollection(userId), limit(100)));
  return sortByPeriodDesc(snap.docs.map((d) => hydrate(d.id, d.data())));
}

/** Live version of listPayslips - used by PayslipHistoryScreen. No
 * Firestore orderBy here on purpose: sorting by two nested fields
 * (payPeriod.year, payPeriod.month) would need a composite index that
 * isn't provisioned. Same "query unordered, sort client-side" approach
 * documentService.js uses for its own listing - a user's own payslip
 * count is small, so this is cheap and needs no index deploy. */
export function subscribePayslips(userId, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  return onSnapshot(
    query(payslipsCollection(userId), limit(100)),
    (snap) => onChange(sortByPeriodDesc(snap.docs.map((d) => hydrate(d.id, d.data())))),
    (err) => onError?.(err)
  );
}

export async function getPayslip(userId, payslipId) {
  if (!userId) throw new Error('Not authenticated');
  const snap = await getDoc(payslipRef(userId, payslipId));
  return snap.exists() ? hydrate(snap.id, snap.data()) : null;
}

/** PRD section 24 - Duplicate Handling: same employee + same pay period.
 * Client-side filter over the already-loaded list (payslip counts per
 * user are small, same reasoning as documentService's flat-list
 * filtering) rather than a composite-index query. */
export function findPayslipForPeriod(payslips, employeeName, year, month, excludeId) {
  return (payslips || []).find(
    (p) =>
      p.id !== excludeId &&
      p.payPeriod.year === year &&
      p.payPeriod.month === month &&
      (p.employee.name || '').trim().toLowerCase() === (employeeName || '').trim().toLowerCase()
  );
}

/** Creates a new payslip. Totals are always recomputed here from
 * earnings/deductions (never trusted from the caller) so a saved record
 * can never drift from calculatePayslipTotals(). */
export async function createPayslip(userId, draft) {
  if (!userId) throw new Error('Not authenticated');
  const payload = buildPayload(draft);
  const ref = await addDoc(payslipsCollection(userId), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** PRD section 23 - Edit Payslip. Full replace of the editable fields;
 * fileReference/savedToSalaryHistory are left untouched here (see
 * attachFileReference/markSavedToSalaryHistory) so re-saving edited
 * numbers doesn't silently detach an already-saved PDF. */
export async function updatePayslip(userId, payslipId, draft) {
  if (!userId) throw new Error('Not authenticated');
  const payload = buildPayload(draft);
  await updateDoc(payslipRef(userId, payslipId), { ...payload, updatedAt: serverTimestamp() });
}

/** Called after "Save to My Documents" succeeds (PRD section 17), so the
 * payslip record keeps a pointer to its generated file. */
export async function attachFileReference(userId, payslipId, fileReference) {
  if (!userId) throw new Error('Not authenticated');
  await updateDoc(payslipRef(userId, payslipId), { fileReference, updatedAt: serverTimestamp() });
}

/** Called after "Save to Salary History" is accepted (PRD section 18). */
export async function markSavedToSalaryHistory(userId, payslipId) {
  if (!userId) throw new Error('Not authenticated');
  await updateDoc(payslipRef(userId, payslipId), { savedToSalaryHistory: true, updatedAt: serverTimestamp() });
}

export async function deletePayslip(userId, payslipId) {
  if (!userId) throw new Error('Not authenticated');
  await deleteDoc(payslipRef(userId, payslipId));
  // Caller is responsible for also deleting the underlying My Documents
  // file, if any - same division of responsibility as
  // documentService.deleteDocumentRecord() / salaryRecordService's note
  // on deleteSalaryRecord().
}

// ---- Default employer (PRD section 5 "Save as Default Employer") ----

export async function getDefaultEmployer(userId) {
  if (!userId) throw new Error('Not authenticated');
  const snap = await getDoc(settingsRef(userId));
  return snap.exists() ? snap.data().employer ?? null : null;
}

export async function saveDefaultEmployer(userId, employer) {
  if (!userId) throw new Error('Not authenticated');
  await setDoc(settingsRef(userId), { employer, updatedAt: serverTimestamp() }, { merge: true });
}

// ---- helpers ----

function sortByPeriodDesc(payslips) {
  return payslips.slice().sort((a, b) => {
    if (b.payPeriod.year !== a.payPeriod.year) return b.payPeriod.year - a.payPeriod.year;
    if (b.payPeriod.month !== a.payPeriod.month) return b.payPeriod.month - a.payPeriod.month;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function buildPayload(draft) {
  const earnings = (draft.earnings || []).filter((e) => e.description && e.description.trim());
  const deductions = (draft.deductions || []).filter((d) => d.description && d.description.trim());
  const { grossSalary, totalDeductions, netSalary } = calculatePayslipTotals(earnings, deductions);

  return {
    employer: draft.employer,
    employee: draft.employee,
    payPeriod: draft.payPeriod,
    paymentDate: draft.paymentDate ?? null,
    earnings: earnings.map((e) => ({ description: e.description.trim(), amount: Number(e.amount) || 0 })),
    deductions: deductions.map((d) => ({ description: d.description.trim(), amount: Number(d.amount) || 0 })),
    grossSalary,
    totalDeductions,
    netSalary,
    currency: draft.currency || CURRENCY,
    template: draft.template || PAYSLIP_TEMPLATES.STANDARD,
    sourceSalaryRecordId: draft.sourceSalaryRecordId ?? null,
  };
}

function hydrate(id, data) {
  const toMillis = (v) => (v instanceof Timestamp ? v.toMillis() : v ?? null);
  return {
    id,
    employer: data.employer ?? {},
    employee: data.employee ?? {},
    payPeriod: data.payPeriod ?? {},
    paymentDate: data.paymentDate ?? null,
    earnings: data.earnings ?? [],
    deductions: data.deductions ?? [],
    grossSalary: data.grossSalary ?? 0,
    totalDeductions: data.totalDeductions ?? 0,
    netSalary: data.netSalary ?? 0,
    currency: data.currency || CURRENCY,
    template: data.template || PAYSLIP_TEMPLATES.STANDARD,
    sourceSalaryRecordId: data.sourceSalaryRecordId ?? null,
    fileReference: data.fileReference ?? null,
    savedToSalaryHistory: data.savedToSalaryHistory ?? false,
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    updatedAt: toMillis(data.updatedAt) ?? Date.now(),
  };
}
