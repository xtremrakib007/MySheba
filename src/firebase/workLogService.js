// Firestore access for the Salary & OT module's daily Work Log (PRD
// sections 12-13).
//
// Collection: users/{userId}/workLogs/{workLogId} - subcollection, same
// convention as salarySettingsService.js (see that file's top note on why
// this module uses subcollections rather than the flat-collection
// convention used elsewhere in the app).
//
// Doc id is the date itself ('YYYY-MM-DD', see dateKey() below) rather
// than an auto-id, so "record today's work" is always a direct setDoc at
// a known path with no query-then-write race, and a given calendar day
// can only ever have one entry - exactly PRD section 13's "tap a date ->
// edit that day's record" model.
import { collection, doc, getDoc, setDoc, deleteDoc, getDocs, onSnapshot, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './config';
import { WORK_DAY_STATUS } from '../data/salaryConstants';
import { formatTimeNow, calculateHoursFromTimes } from '../utils/salaryCalculationService';

function workLogsCollection(userId) {
  return collection(db, 'users', userId, 'workLogs');
}

function workLogRef(userId, dateKeyStr) {
  return doc(workLogsCollection(userId), dateKeyStr);
}

/** 'YYYY-MM-DD' in local time (not UTC) so a day boundary matches what
 * the user sees on their own calendar, regardless of timezone. */
export function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getWorkLogEntry(userId, dateKeyStr) {
  if (!userId) throw new Error('Not authenticated');
  const snap = await getDoc(workLogRef(userId, dateKeyStr));
  return snap.exists() ? hydrate(snap.id, snap.data()) : null;
}

/**
 * Creates/overwrites one day's entry. merge:false (setDoc's default) is
 * fine here - unlike settings, a work log entry is always saved as a
 * complete record from WorkLogScreen's single form, never patched field
 * by field.
 */
export async function saveWorkLogEntry(userId, dateKeyStr, entry) {
  if (!userId) throw new Error('Not authenticated');
  await setDoc(workLogRef(userId, dateKeyStr), {
    date: dateKeyStr,
    status: entry.status || WORK_DAY_STATUS.WORKED,
    hoursWorked: Number(entry.hoursWorked) || 0,
    otHours: Number(entry.otHours) || 0,
    otType: entry.otType || null,
    // Start Work / End Work clock times ('08:00 AM' style, same format
    // TimeField/formatTimeNow produce) - optional, since manually-entered
    // days (no clock-in) never set these. Kept alongside hoursWorked/
    // otHours rather than replacing them, since a manual entry can still
    // exist with no times at all.
    startTime: entry.startTime || null,
    endTime: entry.endTime || null,
    // Unpaid break (e.g. lunch), in hours - subtracted from the
    // startTime/endTime span before the basic/OT split (see
    // calculateHoursFromTimes). Optional, same as startTime/endTime.
    breakHours: Number(entry.breakHours) || 0,
    clockedIn: !!entry.clockedIn,
    notes: (entry.notes || '').trim(),
    // Set once client-side rather than via a get-then-check round trip
    // (unlike salarySettingsService's createdAt patch) - a work log
    // entry's doc id is the date, so "was this the first save" doesn't
    // matter the way it does for a merged singleton; overwriting
    // createdAt on every edit of the same day is harmless here since nothing
    // reads it for ordering (workLogs are ordered by the `date` field/doc id).
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWorkLogEntry(userId, dateKeyStr) {
  if (!userId) throw new Error('Not authenticated');
  await deleteDoc(workLogRef(userId, dateKeyStr));
}

/**
 * "Start Work" - stamps today's entry with the current time as
 * startTime and marks it clockedIn, leaving hoursWorked/otHours at 0
 * until End Work computes them. Overwrites any existing entry for today
 * (same "always a complete record" contract as saveWorkLogEntry) so
 * tapping Start Work again just resets the clock-in time.
 */
export async function clockInNow(userId) {
  if (!userId) throw new Error('Not authenticated');
  const todayKey = dateKey(new Date());
  await saveWorkLogEntry(userId, todayKey, {
    status: WORK_DAY_STATUS.WORKED,
    hoursWorked: 0,
    otHours: 0,
    otType: null,
    startTime: formatTimeNow(),
    endTime: null,
    clockedIn: true,
  });
  return todayKey;
}

/**
 * "End Work" - stamps today's entry with the current time as endTime and
 * derives hoursWorked/otHours from the Start Work time using
 * calculateHoursFromTimes (normalHoursPerDay from SalarySettings, plus
 * any break hours logged for today - e.g. lunch). Throws if there's no
 * open clock-in for today, so the screen can show a clear "Start Work
 * first" message rather than silently writing zeros.
 *
 * If the net worked time comes out under MIN_HOURS_FOR_SALARY (see
 * calculateHoursFromTimes), the entry is still saved with the real clock
 * times/break so nothing is lost, but hoursWorked/otHours are 0 -
 * belowMinimum is returned so the screen can tell the user why.
 */
export async function clockOutNow(userId, normalHoursPerDay, breakHours = 0) {
  if (!userId) throw new Error('Not authenticated');
  const todayKey = dateKey(new Date());
  const existing = await getWorkLogEntry(userId, todayKey);
  if (!existing || !existing.startTime || !existing.clockedIn) {
    throw new Error('Tap Start Work first before ending work for today.');
  }
  const endTime = formatTimeNow();
  const { hoursWorked, otHours, totalHours, netHours, belowMinimum } = calculateHoursFromTimes(
    existing.startTime,
    endTime,
    normalHoursPerDay,
    breakHours
  );
  await saveWorkLogEntry(userId, todayKey, {
    ...existing,
    status: WORK_DAY_STATUS.WORKED,
    hoursWorked,
    otHours,
    otType: otHours > 0 ? 'normal' : null,
    breakHours,
    endTime,
    clockedIn: false,
  });
  return { hoursWorked, otHours, totalHours, netHours, breakHours, belowMinimum, startTime: existing.startTime, endTime };
}

/**
 * All entries with date >= startKey and <= endKey (inclusive), typically
 * one calendar month. Works because dateKey()'s 'YYYY-MM-DD' format sorts
 * lexicographically the same as chronologically. Single-field range query
 * on the doc id's mirrored `date` field - no composite index needed,
 * matching the rest of this app's query conventions.
 */
export async function listWorkLogEntriesInRange(userId, startKey, endKey) {
  if (!userId) throw new Error('Not authenticated');
  const q = query(workLogsCollection(userId), where('date', '>=', startKey), where('date', '<=', endKey));
  const snap = await getDocs(q);
  return snap.docs.map((d) => hydrate(d.id, d.data())).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Live version of listWorkLogEntriesInRange - used by WorkLogCalendarScreen
 * so an edit from the list view reflects immediately in the calendar. */
export function subscribeWorkLogEntriesInRange(userId, startKey, endKey, onChange, onError) {
  if (!userId) {
    onError?.(new Error('Not authenticated'));
    return () => {};
  }
  const q = query(workLogsCollection(userId), where('date', '>=', startKey), where('date', '<=', endKey));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => hydrate(d.id, d.data())).sort((a, b) => (a.date < b.date ? -1 : 1))),
    (err) => onError?.(err)
  );
}

function hydrate(id, data) {
  const toMillis = (v) => (v instanceof Timestamp ? v.toMillis() : v ?? null);
  return {
    id,
    date: data.date ?? id,
    status: data.status ?? WORK_DAY_STATUS.WORKED,
    hoursWorked: data.hoursWorked ?? 0,
    otHours: data.otHours ?? 0,
    otType: data.otType ?? null,
    startTime: data.startTime ?? null,
    endTime: data.endTime ?? null,
    breakHours: data.breakHours ?? 0,
    clockedIn: data.clockedIn ?? false,
    notes: data.notes ?? '',
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}
