const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Keep Firestore access lazy because secureIndexV2 requires index.js before
// firebase-admin is initialized there.
const db = {
  collection: (...args) => admin.firestore().collection(...args),
  runTransaction: (...args) => admin.firestore().runTransaction(...args),
};

const PAY_FREQUENCIES = ['monthly', 'weekly', 'daily', 'hourly'];
const RECURRENCE_TYPES = ['recurring', 'oneTime', 'one-time'];
const OT_METHODS = ['mysheba_default', 'custom_employer_rate', 'default', 'custom'];
const OT_MULTIPLIERS = { normal: 1.5, restDay: 2, publicHoliday: 3 };
const OT_VERSION = 'v1';
const MAX_HOURS = 24;
const MAX_OT_HOURS = 16;

function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return uid;
}

async function actor(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Account not found.');
  return snap.data() || {};
}

function assertOwnerOrAdmin(uid, targetUid, profile) {
  if (uid !== targetUid && !['admin', 'superadmin'].includes(profile.role)) {
    throw new HttpsError('permission-denied', 'You can only change your own salary records.');
  }
}

function cleanText(value, max = 120) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw new HttpsError('invalid-argument', 'Text value is too long.');
  return text;
}

function money(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000000 || Math.round(n * 100) !== n * 100) {
    throw new HttpsError('invalid-argument', `Invalid ${field}.`);
  }
  return Math.round(n * 100) / 100;
}

function hours(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_HOURS || Math.round(n * 100) !== n * 100) {
    throw new HttpsError('invalid-argument', `Invalid ${field}.`);
  }
  return Math.round(n * 100) / 100;
}

function recordId(value) {
  const id = String(value || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid salary record month.');
  return id;
}

function round2(value) { return Math.round((Number(value) || 0) * 100) / 100; }

function normalizeOtMethod(value) {
  if (value === 'custom' || value === 'custom_employer_rate') return 'custom_employer_rate';
  return 'mysheba_default';
}

function calculateBasicPay(basicSalary, workingDaysInPeriod, daysWorked) {
  const salary = Number(basicSalary) || 0;
  const denom = Number(workingDaysInPeriod) || 0;
  const worked = Number(daysWorked) || 0;
  if (denom <= 0) return 0;
  return round2((salary / denom) * worked);
}

function deriveHourlyRate(basicSalary, normalHoursPerDay, workingDaysPerWeek) {
  const salary = Number(basicSalary) || 0;
  const hoursPerDay = Number(normalHoursPerDay) || 0;
  const daysPerWeek = Number(workingDaysPerWeek) || 0;
  if (hoursPerDay <= 0 || daysPerWeek <= 0) return 0;
  const monthlyHours = hoursPerDay * daysPerWeek * (52 / 12);
  if (monthlyHours <= 0) return 0;
  return round2(salary / monthlyHours);
}

function calculateOtForPeriod(entries, method, hourlyRate, customOtRate) {
  const normalized = normalizeOtMethod(method);
  return (entries || []).reduce((totals, entry) => {
    const otHours = Number(entry.otHours) || 0;
    if (otHours <= 0) return totals;
    let rate = 0;
    if (normalized === 'custom_employer_rate') {
      rate = Number(customOtRate) || 0;
    } else {
      const multiplier = OT_MULTIPLIERS[entry.otType] ?? OT_MULTIPLIERS.normal;
      rate = round2(hourlyRate * multiplier);
    }
    totals.otPay = round2(totals.otPay + otHours * rate);
    totals.otHours = round2(totals.otHours + otHours);
    return totals;
  }, { otPay: 0, otHours: 0 });
}

async function getMonthlyCalculation(targetUid, year, month) {
  const settingsSnap = await db.collection('users').doc(targetUid).collection('salarySettings').doc('current').get();
  if (!settingsSnap.exists) throw new HttpsError('failed-precondition', 'Salary settings are not configured yet.');
  const settings = settingsSnap.data() || {};

  const startKey = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endKey = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const workSnap = await db.collection('users').doc(targetUid).collection('workLogs').get();
  const workLogEntries = workSnap.docs
    .filter(d => d.id >= startKey && d.id <= endKey)
    .map(d => ({ id: d.id, ...(d.data() || {}) }));

  // Match the existing dashboard formula exactly: only status="worked"
  // counts as a worked day, and working days/month is derived from the
  // configured weekly working days. This remains an estimate, not payroll law.
  const daysWorked = workLogEntries.filter(e => e.status === 'worked').length;
  const workingDaysInMonth = Math.round((Number(settings.workingDaysPerWeek) || 6) * (52 / 12));
  const hourlyRate = deriveHourlyRate(settings.basicSalary, settings.normalHoursPerDay, settings.workingDaysPerWeek);
  const ot = calculateOtForPeriod(workLogEntries, settings.otCalculationMethod, hourlyRate, settings.customOtRate);

  const [allowanceSnap, deductionSnap] = await Promise.all([
    db.collection('users').doc(targetUid).collection('allowances').get(),
    db.collection('users').doc(targetUid).collection('deductions').get(),
  ]);
  const allowances = round2(allowanceSnap.docs.reduce((sum, d) => {
    const item = d.data() || {};
    return RECURRENCE_TYPES.includes(item.recurrence) && item.recurrence !== 'one-time'
      ? sum + (Number(item.amount) || 0) : sum;
  }, 0));
  const deductions = round2(deductionSnap.docs.reduce((sum, d) => {
    const item = d.data() || {};
    return RECURRENCE_TYPES.includes(item.recurrence) && item.recurrence !== 'one-time'
      ? sum + (Number(item.amount) || 0) : sum;
  }, 0));

  const basicPay = calculateBasicPay(settings.basicSalary, workingDaysInMonth, daysWorked);
  const estimatedGross = round2(basicPay + ot.otPay + allowances);
  const estimatedTakeHome = round2(estimatedGross - deductions);
  return {
    year,
    month,
    daysWorked,
    otHours: ot.otHours,
    basicPay,
    otPay: ot.otPay,
    allowances,
    deductions,
    estimatedGross,
    estimatedTakeHome,
    otCalculationMethod: normalizeOtMethod(settings.otCalculationMethod),
    otCalculationVersion: OT_VERSION,
    hourlyRate,
  };
}

exports.saveSalarySettings = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await actor(uid);
  const targetUid = String(request.data?.userId || uid);
  assertOwnerOrAdmin(uid, targetUid, profile);
  const s = request.data?.settings || {};
  const data = {
    basicSalary: money(s.basicSalary, 'basic salary'),
    payFrequency: PAY_FREQUENCIES.includes(s.payFrequency) ? s.payFrequency : 'monthly',
    normalHoursPerDay: hours(s.normalHoursPerDay ?? 8, 'normal hours per day'),
    workingDaysPerWeek: hours(s.workingDaysPerWeek ?? 6, 'working days per week'),
    restDay: s.restDay == null ? null : cleanText(s.restDay, 20),
    employmentType: s.employmentType == null ? null : cleanText(s.employmentType, 40),
    currency: cleanText(s.currency || 'RM', 8),
    country: cleanText(s.country || 'Malaysia', 60),
    otCalculationMethod: normalizeOtMethod(s.otCalculationMethod),
    customOtRate: s.customOtRate == null ? null : money(s.customOtRate, 'custom OT rate'),
    remindersEnabled: s.remindersEnabled !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = db.collection('users').doc(targetUid).collection('salarySettings').doc('current');
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    tx.set(ref, { ...data, createdAt: snap.exists && snap.data().createdAt ? snap.data().createdAt : admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
  return { ok: true };
});

async function mutateLineItem(request, kind) {
  const uid = requireAuth(request);
  const profile = await actor(uid);
  const targetUid = String(request.data?.userId || uid);
  assertOwnerOrAdmin(uid, targetUid, profile);
  const item = request.data?.item || {};
  const name = cleanText(item.name, 100);
  if (!name) throw new HttpsError('invalid-argument', `${kind} name is required.`);
  const amount = money(item.amount, `${kind} amount`);
  const recurrence = RECURRENCE_TYPES.includes(item.recurrence) ? item.recurrence : 'recurring';
  const col = db.collection('users').doc(targetUid).collection(kind === 'allowance' ? 'allowances' : 'deductions');
  const ref = item.id ? col.doc(cleanText(item.id, 128)) : col.doc();
  const data = { name, amount, recurrence, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (!item.id) data.createdAt = admin.firestore.FieldValue.serverTimestamp();
  await ref.set(data, { merge: true });
  return { id: ref.id };
}

exports.addAllowance = onCall(request => mutateLineItem(request, 'allowance'));
exports.updateAllowance = onCall(request => mutateLineItem(request, 'allowance'));
exports.addDeduction = onCall(request => mutateLineItem(request, 'deduction'));
exports.updateDeduction = onCall(request => mutateLineItem(request, 'deduction'));

async function deleteLineItem(request, kind) {
  const uid = requireAuth(request);
  const profile = await actor(uid);
  const targetUid = String(request.data?.userId || uid);
  assertOwnerOrAdmin(uid, targetUid, profile);
  const id = cleanText(request.data?.id, 128);
  if (!id) throw new HttpsError('invalid-argument', 'Item ID is required.');
  await db.collection('users').doc(targetUid).collection(kind === 'allowance' ? 'allowances' : 'deductions').doc(id).delete();
  return { ok: true };
}

exports.deleteAllowance = onCall(request => deleteLineItem(request, 'allowance'));
exports.deleteDeduction = onCall(request => deleteLineItem(request, 'deduction'));

exports.saveSalaryEstimate = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await actor(uid);
  const targetUid = String(request.data?.userId || uid);
  assertOwnerOrAdmin(uid, targetUid, profile);
  const id = recordId(request.data?.recordId);
  const [yearText, monthText] = id.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  // SECURITY: the client may request a month, but every calculated field is
  // derived here from server-owned settings/work logs/line items. Client
  // supplied basicPay/otPay/allowances/deductions/gross/take-home values are
  // intentionally ignored.
  const calculated = await getMonthlyCalculation(targetUid, year, month);
  const ref = db.collection('users').doc(targetUid).collection('salaryRecords').doc(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : {};
    tx.set(ref, {
      ...calculated,
      createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { ok: true, calculation: calculated };
});

exports.recordActualSalary = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await actor(uid);
  const targetUid = String(request.data?.userId || uid);
  assertOwnerOrAdmin(uid, targetUid, profile);
  const id = recordId(request.data?.recordId);
  const actual = money(request.data?.actualSalaryReceived, 'actual salary');
  const ref = db.collection('users').doc(targetUid).collection('salaryRecords').doc(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Salary record not found. Save the monthly estimate first.');
    const d = snap.data() || {};
    const estimated = Number(d.estimatedTakeHome) || 0;
    tx.update(ref, { actualSalaryReceived: actual, difference: round2(actual - estimated), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

exports.attachSalaryPayslip = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await actor(uid);
  const targetUid = String(request.data?.userId || uid);
  assertOwnerOrAdmin(uid, targetUid, profile);
  const id = recordId(request.data?.recordId);
  const fileReference = cleanText(request.data?.fileReference, 500);
  if (!fileReference) throw new HttpsError('invalid-argument', 'Payslip file reference is required.');
  const ref = db.collection('users').doc(targetUid).collection('salaryRecords').doc(id);
  await ref.set({ payslipFileReference: fileReference, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

exports.deleteSalaryRecord = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await actor(uid);
  const targetUid = String(request.data?.userId || uid);
  assertOwnerOrAdmin(uid, targetUid, profile);
  await db.collection('users').doc(targetUid).collection('salaryRecords').doc(recordId(request.data?.recordId)).delete();
  return { ok: true };
});
