import { collection, doc, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { RECURRENCE_TYPES } from '../data/salaryConstants';
function deductionsCollection(userId) { return collection(db, 'users', userId, 'deductions'); }
export async function addDeduction(userId, deduction) { if (!userId) throw new Error('Not authenticated'); const { data } = await httpsCallable(functions, 'addDeduction')({ userId, item: deduction }); return data.id; }
export async function updateDeduction(userId, deductionId, updates) { if (!userId) throw new Error('Not authenticated'); await httpsCallable(functions, 'updateDeduction')({ userId, item: { ...updates, id: deductionId } }); }
export async function deleteDeduction(userId, deductionId) { if (!userId) throw new Error('Not authenticated'); await httpsCallable(functions, 'deleteDeduction')({ userId, id: deductionId }); }
export function subscribeDeductions(userId, onChange, onError) { if (!userId) { onError?.(new Error('Not authenticated')); return () => {}; } return onSnapshot(query(deductionsCollection(userId), orderBy('createdAt', 'desc')), snap => onChange(snap.docs.map(d => hydrate(d.id, d.data()))), err => onError?.(err)); }
export function subscribeRecurringDeductions(userId, onChange, onError) { if (!userId) { onError?.(new Error('Not authenticated')); return () => {}; } return onSnapshot(query(deductionsCollection(userId), where('recurrence', '==', RECURRENCE_TYPES.RECURRING)), snap => onChange(snap.docs.map(d => hydrate(d.id, d.data()))), err => onError?.(err)); }
function hydrate(id, data) { const toMillis = v => (v instanceof Timestamp ? v.toMillis() : v ?? null); return { id, name: data.name ?? '', amount: data.amount ?? 0, recurrence: data.recurrence ?? RECURRENCE_TYPES.RECURRING, createdAt: toMillis(data.createdAt), updatedAt: toMillis(data.updatedAt) }; }
