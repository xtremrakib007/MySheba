import { collection, doc, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { RECURRENCE_TYPES } from '../data/salaryConstants';
function allowancesCollection(userId) { return collection(db, 'users', userId, 'allowances'); }
export async function addAllowance(userId, allowance) { if (!userId) throw new Error('Not authenticated'); const { data } = await httpsCallable(functions, 'addAllowance')({ userId, item: allowance }); return data.id; }
export async function updateAllowance(userId, allowanceId, updates) { if (!userId) throw new Error('Not authenticated'); await httpsCallable(functions, 'updateAllowance')({ userId, item: { ...updates, id: allowanceId } }); }
export async function deleteAllowance(userId, allowanceId) { if (!userId) throw new Error('Not authenticated'); await httpsCallable(functions, 'deleteAllowance')({ userId, id: allowanceId }); }
export function subscribeAllowances(userId, onChange, onError) { if (!userId) { onError?.(new Error('Not authenticated')); return () => {}; } return onSnapshot(query(allowancesCollection(userId), orderBy('createdAt', 'desc')), snap => onChange(snap.docs.map(d => hydrate(d.id, d.data()))), err => onError?.(err)); }
export function subscribeRecurringAllowances(userId, onChange, onError) { if (!userId) { onError?.(new Error('Not authenticated')); return () => {}; } return onSnapshot(query(allowancesCollection(userId), where('recurrence', '==', RECURRENCE_TYPES.RECURRING)), snap => onChange(snap.docs.map(d => hydrate(d.id, d.data()))), err => onError?.(err)); }
function hydrate(id, data) { const toMillis = v => (v instanceof Timestamp ? v.toMillis() : v ?? null); return { id, name: data.name ?? '', amount: data.amount ?? 0, recurrence: data.recurrence ?? RECURRENCE_TYPES.RECURRING, createdAt: toMillis(data.createdAt), updatedAt: toMillis(data.updatedAt) }; }
