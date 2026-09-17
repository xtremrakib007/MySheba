const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const db = admin.firestore();
const PAY_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];
const RECURRENCE_TYPES = ['recurring', 'one-time'];
const OT_METHODS = ['default', 'custom'];
const WORK_STATUSES = ['worked', 'rest_day', 'leave'];
const OT_TYPES = ['normal', 'rest_day', 'public_holiday'];

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
  if (!Number.isFinite(n) || n < 0 || n > 24 || Math.round(n * 100) !== n * 100) {
    throw new HttpsError('invalid-argument', `Invalid ${field}.`);
  }
  return Math.round(n * 100) / 100;
}

function recordId(value) {
  const id = String(value || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid salary record month.');
  return id;
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
    otCalculationMethod: OT_METHODS.includes(s.otCalculationMethod) ? s.otCalculationMethod : 'default',
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
    const difference = Math.round((actual - estimated) * 100) / 100;
    tx.update(ref, { actualSalaryReceived: actual, difference, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

exports.deleteSalaryRecord = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await actor(uid);
  const targetUid = String(request.data?.userId || uid);
  assertOwnerOrAdmin(uid, targetUid, profile);
  const id = recordId(request.data?.recordId);
  await db.collection('users').doc(targetUid).collection('salaryRecords').doc(id).delete();
  return { ok: true };
});

exports.saveSalaryEstimate = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await actor(uid);
  const targetUid = String(request.data?.userId || uid);
  assertOwnerOrAdmin(uid, targetUid, profile);
  const id = recordId(request.data?.recordId);
  const data = request.data?.data || {};
  const ref = db.collection('users').doc(targetUid).collection('salaryRecords').doc(id);
  const numeric = ['daysWorked','otHours','basicPay','otPay','allowances','deductions','estimatedGross','estimatedTakeHome'];
  const safe = {};
  for (const field of numeric) {
    const n = Number(data[field] ?? 0);
    if (!Number.isFinite(n) || n < 0 || n > 100000000) throw new HttpsError('invalid-argument', `Invalid ${field}.`);
    safe[field] = Math.round(n * 100) / 100;
  }
  safe.year = Number(data.year);
  safe.month = Number(data.month);
  if (!Number.isInteger(safe.year) || safe.year < 2000 || safe.year > 2100 || !Number.isInteger(safe.month) || safe.month < 1 || safe.month > 12) throw new HttpsError('invalid-argument', 'Invalid salary record date.');
  safe.otCalculationMethod = cleanText(data.otCalculationMethod, 40);
  safe.otCalculationVersion = cleanText(data.otCalculationVersion, 40);
  safe.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : {};
    tx.set(ref, { ...safe, createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
  return { ok: true };
});