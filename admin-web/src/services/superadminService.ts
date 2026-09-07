// Superadmin-only tools for MySheba Admin Web — Phase 6 (final phase).
//
// Point Top-Up credits the mobile app's real `walletBalance` field on
// `users/{uid}` (NOT a separate `pointsBalance` field, which doesn't
// exist anywhere else in the app) via the adminTopUpPoints Cloud
// Function (functions/walletService.js), not a direct client write -
// walletBalance is deliberately frozen against direct client writes in
// firestore.rules (see the users/{uid} update rule there), since every
// other balance change in the app already goes through a Cloud
// Function for the same reason. adminTopUpPoints writes the
// pointTopUps/{id} audit-trail doc that fetchRecentTopUps() below
// reads.
//
// Device Sessions has no separate "sessions" collection to read either -
// this app enforces single-device-login, so there is only ever ONE active
// device per account at a time, tracked directly on
// users/{uid}.activeSessionId/activeDeviceId (see the doc comment at the
// top of functions/deviceSessionService.js). fetchActiveDeviceSessions
// below queries users/{uid} docs that currently have one set. forceLogout
// calls the adminForceLogout Cloud Function, which clears those fields
// server-side - the exact same write the mobile app's own AppContext.js
// live-listener already watches for to sign a displaced device out
// immediately, so this actually takes effect on-device, unlike a
// `revoked` flag nothing reads.

import {
  collection,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

// ---------------------------------------------------------------------
// Point Top-Up
// ---------------------------------------------------------------------

export interface TopUpTargetUser {
  uid: string;
  name: string;
  phone: string | null;
  role: string;
  walletBalance: number;
}

function mapTopUpUser(d: QueryDocumentSnapshot<DocumentData>): TopUpTargetUser {
  const data = d.data();
  return {
    uid: d.id,
    name: data.name ?? data.displayName ?? '(no name)',
    phone: data.phone ?? data.phoneNumber ?? null,
    role: data.role ?? 'user',
    walletBalance: data.walletBalance ?? 0,
  };
}

// Dealers and resellers are the accounts that carry a points/wallet
// balance in this app; searched client-side same as User Management.
export async function searchTopUpTargets(search: string): Promise<TopUpTargetUser[]> {
  const ref = collection(db, 'users');
  const snap = await getDocs(query(ref, where('role', 'in', ['dealer', 'reseller'])));
  const all = snap.docs.map(mapTopUpUser);
  const q = search.trim().toLowerCase();
  if (!q) return all;
  return all.filter((u) => u.name.toLowerCase().includes(q) || u.phone?.includes(q));
}

export interface TopUpRecord {
  id: string;
  userName: string;
  amount: number;
  note: string | null;
  adminName: string;
  createdAt: string | null;
}

function mapTopUpRecord(d: QueryDocumentSnapshot<DocumentData>): TopUpRecord {
  const data = d.data();
  return {
    id: d.id,
    userName: data.userName ?? 'Unknown',
    amount: data.amount ?? 0,
    note: data.note ?? null,
    adminName: data.adminName ?? 'Admin',
    createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null,
  };
}

export async function fetchRecentTopUps(limitCount = 20): Promise<TopUpRecord[]> {
  const ref = collection(db, 'pointTopUps');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc'), fbLimit(limitCount)));
  return snap.docs.map(mapTopUpRecord);
}

// Calls adminTopUpPoints (functions/walletService.js) rather than writing
// Firestore directly - see the top-of-file comment for why walletBalance
// can't be a direct client write. The Cloud Function does the balance
// credit + pointTopUps audit doc together, inside one transaction.
export async function topUpPoints(
  target: TopUpTargetUser,
  amount: number,
  note: string
): Promise<void> {
  if (amount <= 0) throw new Error('Amount must be positive');

  const adminTopUpPoints = httpsCallable(functions, 'adminTopUpPoints');
  await adminTopUpPoints({ targetUid: target.uid, amount, note: note || null });
}

// ---------------------------------------------------------------------
// Device Sessions
// ---------------------------------------------------------------------

export interface DeviceSession {
  // This app has one active device per account, so the account's own uid
  // doubles as the row id - there's no separate session id to key on.
  uid: string;
  userName: string;
  role: string;
  lastActiveAt: string | null;
}

function mapActiveUser(d: QueryDocumentSnapshot<DocumentData>): DeviceSession {
  const data = d.data();
  return {
    uid: d.id,
    userName: data.name ?? data.displayName ?? 'Unknown user',
    role: data.role ?? 'user',
    lastActiveAt: data.lastLoginAt?.toDate?.().toLocaleString() ?? null,
  };
}

export async function fetchActiveDeviceSessions(): Promise<DeviceSession[]> {
  const ref = collection(db, 'users');
  const snap = await getDocs(
    query(ref, where('activeDeviceId', '!=', null), orderBy('activeDeviceId'), orderBy('lastLoginAt', 'desc'))
  );
  return snap.docs.map(mapActiveUser);
}

export async function forceLogout(targetUid: string): Promise<void> {
  const adminForceLogout = httpsCallable(functions, 'adminForceLogout');
  await adminForceLogout({ targetUid });
}
