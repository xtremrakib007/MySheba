// Firestore access for the Salary & OT module's per-user settings
// (basic salary, pay frequency, working hours, OT calculation method).
//
// Collection: users/{userId}/salarySettings/{settingsId} - a subcollection
// under the user's own account doc, per the Salary & OT PRD's section 22
// data model. This is a deliberate departure from the flat
// collection-with-a-userId-field convention used by every other private
// per-user collection in this app (myDocuments, topups, etc. - see
// firestore.rules' note on myDocuments/{documentId}); it was chosen
// explicitly for this module rather than defaulted into.
//
// Effectively a singleton per user - a person has exactly one active
// salary configuration, not a list - so this always reads/writes the
// fixed doc id SETTINGS_DOC_ID rather than querying. That keeps setup
// (PRD section 4) a single setDoc with no "does a settings doc already
// exist" race.
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './config';
import { PAY_FREQUENCIES, OT_CALCULATION_METHODS } from '../data/salaryConstants';

const SETTINGS_DOC_ID = 'current';

function settingsRef(userId) {
  return doc(db, 'users', userId, 'salarySettings', SETTINGS_DOC_ID);
}

export async function getSalarySettings(userId) {
  if (!userId) throw new Error('Not authenticated');
  const snap = await getDoc(settingsRef(userId));
  return snap.exists() ? hydrate(snap.data()) : null;
}

/** Live listener - preferred for SalaryDashboardScreen, so a settings
 * change (e.g. from another device) reflects immediately. */
export function subscribeSalarySettings(userId, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  return onSnapshot(
    settingsRef(userId),
    (snap) => onChange(snap.exists() ? hydrate(snap.data()) : null),
    (err) => onError?.(err)
  );
}

/**
 * Creates or overwrites the user's settings (PRD section 4's "Save
 * Salary Settings" and section 9's later edits from SalarySettingsScreen).
 * merge:true so an edit that only changes, say, customOtRate doesn't
 * require the caller to resend every other field.
 */
export async function saveSalarySettings(userId, settings) {
  if (!userId) throw new Error('Not authenticated');
  await setDoc(
    settingsRef(userId),
    {
      basicSalary: Number(settings.basicSalary) || 0,
      payFrequency: settings.payFrequency || PAY_FREQUENCIES.MONTHLY,
      normalHoursPerDay: Number(settings.normalHoursPerDay) || 8,
      workingDaysPerWeek: Number(settings.workingDaysPerWeek) || 6,
      restDay: settings.restDay ?? null,
      employmentType: settings.employmentType ?? null,
      currency: settings.currency || 'RM',
      country: settings.country || 'Malaysia',
      otCalculationMethod: settings.otCalculationMethod || OT_CALCULATION_METHODS.DEFAULT,
      customOtRate: settings.customOtRate != null ? Number(settings.customOtRate) : null,
      remindersEnabled: settings.remindersEnabled ?? true,
      updatedAt: serverTimestamp(),
      // createdAt is only set on first write - see the merge logic below.
    },
    { merge: true }
  );
  // setDoc with merge won't set createdAt on first write unless we ask it
  // to; a plain merge:true write also can't tell "first write" from
  // "later edit" itself, so check once and patch it in only if missing.
  const existing = await getDoc(settingsRef(userId));
  if (existing.exists() && !existing.data().createdAt) {
    await setDoc(settingsRef(userId), { createdAt: serverTimestamp() }, { merge: true });
  }
}

function hydrate(data) {
  const toMillis = (v) => (v instanceof Timestamp ? v.toMillis() : v ?? null);
  return {
    basicSalary: data.basicSalary ?? 0,
    payFrequency: data.payFrequency ?? PAY_FREQUENCIES.MONTHLY,
    normalHoursPerDay: data.normalHoursPerDay ?? 8,
    workingDaysPerWeek: data.workingDaysPerWeek ?? 6,
    restDay: data.restDay ?? null,
    employmentType: data.employmentType ?? null,
    currency: data.currency ?? 'RM',
    country: data.country ?? 'Malaysia',
    otCalculationMethod: data.otCalculationMethod ?? OT_CALCULATION_METHODS.DEFAULT,
    customOtRate: data.customOtRate ?? null,
    remindersEnabled: data.remindersEnabled ?? true,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}
