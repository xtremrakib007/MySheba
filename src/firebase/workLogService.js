import { collection, doc, getDoc, getDocs, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { WORK_DAY_STATUS } from '../data/salaryConstants';

function workLogsCollection(userId) { return collection(db, 'users', userId, 'workLogs'); }
function workLogRef(userId, dateKeyStr) { return doc(workLogsCollection(userId), dateKeyStr); }
function call(name, data) { return httpsCallable(functions, name)(data); }

/** 'YYYY-MM-DD' in the device's local calendar. */
export function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getWorkLogEntry(userId, dateKeyStr) {
  if (!userId) throw new Error('Not authenticated');
  const snap = await getDoc(workLogRef(userId, dateKeyStr));
  return snap.exists() ? hydrate(snap.id, snap.data()) : null;
}

/** All work-log mutations are server-authorized. */
export async function saveWorkLogEntry(userId, dateKeyStr, entry) {
  if (!userId) throw new Error('Not authenticated');
  await call('saveWorkLogEntry', {
    date: dateKeyStr,
    status: entry.status || WORK_DAY_STATUS.WORKED,
    hoursWorked: entry.hoursWorked,
    otHours: entry.otHours,
    otType: entry.otType || null,
    startTime: entry.startTime || null,
    endTime: entry.endTime || null,
    breakHours: entry.breakHours,
    clockedIn: !!entry.clockedIn,
    notes: entry.notes || '',
  });
}

export async function deleteWorkLogEntry(userId, dateKeyStr) {
  if (!userId) throw new Error('Not authenticated');
  await call('deleteWorkLogEntry', { date: dateKeyStr });
}

export async function clockInNow(userId) {
  if (!userId) throw new Error('Not authenticated');
  const { data } = await call('clockInNow', {});
  return data.date;
}

export async function clockOutNow(userId) {
  if (!userId) throw new Error('Not authenticated');
  const { data } = await call('clockOutNow', {});
  return data;
}

export async function listWorkLogEntriesInRange(userId, startKey, endKey) {
  if (!userId) throw new Error('Not authenticated');
  const q = query(workLogsCollection(userId), where('date', '>=', startKey), where('date', '<=', endKey));
  const snap = await getDocs(q);
  return snap.docs.map((d) => hydrate(d.id, d.data())).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function subscribeWorkLogEntriesInRange(userId, startKey, endKey, onChange, onError) {
  if (!userId) { onError?.(new Error('Not authenticated')); return () => {}; }
  const q = query(workLogsCollection(userId), where('date', '>=', startKey), where('date', '<=', endKey));
  return onSnapshot(q,
    (snap) => onChange(snap.docs.map((d) => hydrate(d.id, d.data())).sort((a, b) => (a.date < b.date ? -1 : 1))),
    (err) => onError?.(err)
  );
}

function hydrate(id, data) {
  const toMillis = (v) => (v instanceof Timestamp ? v.toMillis() : v ?? null);
  return {
    id, date: data.date ?? id, status: data.status ?? WORK_DAY_STATUS.WORKED,
    hoursWorked: data.hoursWorked ?? 0, otHours: data.otHours ?? 0, otType: data.otType ?? null,
    startTime: data.startTime ?? null, endTime: data.endTime ?? null, breakHours: data.breakHours ?? 0,
    clockedIn: data.clockedIn ?? false, notes: data.notes ?? '',
    createdAt: toMillis(data.createdAt), updatedAt: toMillis(data.updatedAt),
  };
}
