// Lightweight ops overview for the Reports/Dashboard pages.
//
// Uses Firestore's `getCountFromServer` (count-only aggregation, no
// document reads). Important constraint that bit the first version of
// this file: aggregation queries are NOT filtered per-document by
// security rules the way a normal list query is - the rule must allow
// the ENTIRE matched set, or the whole call throws permission-denied.
// `supportTickets` in particular is superadmin-blanket-read only (a
// plain admin can only read tickets assigned to them - see
// firestore.rules), so a plain admin's count() call on it always throws,
// even though they can read individual assigned tickets fine. Since the
// six counts below used to run in one Promise.all, that one throw used
// to take down the entire Dashboard/Reports overview for anyone who
// wasn't a superadmin. Each metric is now independent, so a restricted
// one shows "—" instead of blanking the whole page.

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

// Real status values confirmed against supportTicketService.js:
// 'open' | 'in_progress' | 'resolved' (the original version of this file
// had 'inProgress', which never matched anything).
async function countOpenTickets(): Promise<number | null> {
  const [open, inProgress] = await Promise.all([
    count('supportTickets', 'status', 'open'),
    count('supportTickets', 'status', 'in_progress'),
  ]);
  if (open === null && inProgress === null) return null;
  return (open ?? 0) + (inProgress ?? 0);
}

export async function fetchOpsOverview(): Promise<OpsOverview> {
  const [
    totalUsers,
    verifiedUsers,
    pendingVerifications,
    openTickets,
  ] = await Promise.all([
    count('users'),
    count('users', 'verified', true),
    count('verificationRequests', 'status', 'pending'),
    countOpenTickets(),
  ]);

  return {
    totalUsers,
    verifiedUsers,
    pendingVerifications,
    openTickets,
  };
}
