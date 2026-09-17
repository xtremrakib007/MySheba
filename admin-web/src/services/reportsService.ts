// Lightweight ops overview for the Reports/Dashboard pages.
// Each metric is queried independently so a restricted metric does not
// prevent the rest of the overview from loading.

import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface OpsOverview {
  totalUsers: number | null;
  verifiedUsers: number | null;
  pendingVerifications: number | null;
  openTickets: number | null;
}

async function count(coll: string, field?: string, value?: unknown): Promise<number | null> {
  try {
    const ref = collection(db, coll);
    const q = field ? query(ref, where(field, '==', value)) : query(ref);
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (err) {
    console.warn(`Could not count ${coll}${field ? ` where ${field}==${value}` : ''}:`, err);
    return null;
  }
}

async function countOpenTickets(): Promise<number | null> {
  const [open, inProgress] = await Promise.all([
    count('supportTickets', 'status', 'open'),
    count('supportTickets', 'status', 'in_progress'),
  ]);
  if (open === null && inProgress === null) return null;
  return (open ?? 0) + (inProgress ?? 0);
}

export async function fetchOpsOverview(): Promise<OpsOverview> {
  const [totalUsers, verifiedUsers, pendingVerifications, openTickets] = await Promise.all([
    count('users'),
    count('users', 'verified', true),
    count('verificationRequests', 'status', 'pending'),
    countOpenTickets(),
  ]);

  return { totalUsers, verifiedUsers, pendingVerifications, openTickets };
}
