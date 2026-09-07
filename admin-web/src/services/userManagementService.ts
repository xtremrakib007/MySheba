// User & role management for MySheba Admin Web — Phase 2.
//
// Mirrors the mobile app's `users` collection and role model. The exact
// role-rank rules here are inferred from the app's role usage (dealer /
// reseller / admin / superadmin) since the mobile app's
// userManagementService.js wasn't included in this drop — adjust
// ROLE_RANK / ASSIGNABLE_ROLES below if the real rules differ.

import {
  collection,
  doc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { AdminRole } from '../contexts/AuthContext';

export type UserRole = 'user' | 'dealer' | 'reseller' | AdminRole;

export const ALL_ROLES: UserRole[] = ['user', 'dealer', 'reseller', 'admin', 'superadmin'];

// Higher number = more privileged. Used to decide what the signed-in
// admin is allowed to assign, and whose role they're allowed to touch.
export const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  dealer: 1,
  reseller: 2,
  admin: 3,
  superadmin: 4,
};

// A caller can assign any role strictly below their own rank. Superadmins
// can additionally hand out the admin role (but not superadmin, to avoid
// silent self-service privilege escalation via the console — that stays a
// backend/console-only action).
export function assignableRoles(actingRole: AdminRole): UserRole[] {
  return ALL_ROLES.filter((r) => {
    if (actingRole === 'superadmin') return r !== 'superadmin';
    return ROLE_RANK[r] < ROLE_RANK.admin; // plain admins: user/dealer/reseller only
  });
}

// A caller can only edit accounts whose current role is strictly below
// their own rank (so an admin can't touch another admin, and nobody but
// a superadmin can touch a superadmin).
export function canEditTarget(actingRole: AdminRole, targetRole: UserRole): boolean {
  return ROLE_RANK[targetRole] < ROLE_RANK[actingRole];
}

export interface FeatureAccess {
  mobileBanking: boolean;
  recharge: boolean;
  remittance: boolean;
  travel: boolean;
  marketplace: boolean;
  ticketReseller: boolean;
}

export const FEATURE_LABELS: Record<keyof FeatureAccess, string> = {
  mobileBanking: 'Mobile Banking',
  recharge: 'Recharge / Top-Up',
  remittance: 'Remittance',
  travel: 'Travel Inquiries',
  marketplace: 'Marketplace',
  ticketReseller: 'Ticket Reseller',
};

const DEFAULT_FEATURES: FeatureAccess = {
  mobileBanking: true,
  recharge: true,
  remittance: true,
  travel: true,
  marketplace: true,
  ticketReseller: false,
};

export interface AdminUserRow {
  uid: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  disabled: boolean;
  dealerCode?: string;
  resellerCode?: string;
  features: FeatureAccess;
}

function mapDoc(d: QueryDocumentSnapshot<DocumentData>): AdminUserRow {
  const data = d.data();
  return {
    uid: d.id,
    name: data.name ?? data.displayName ?? '(no name)',
    email: data.email ?? null,
    phone: data.phone ?? data.phoneNumber ?? null,
    role: (data.role as UserRole) ?? 'user',
    disabled: Boolean(data.disabled),
    dealerCode: data.dealerCode,
    resellerCode: data.resellerCode,
    features: { ...DEFAULT_FEATURES, ...(data.features ?? {}) },
  };
}

const PAGE_SIZE = 25;

export async function fetchUsersPage(opts: {
  roleFilter?: UserRole | 'all';
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<{ rows: AdminUserRow[]; nextCursor: QueryDocumentSnapshot<DocumentData> | null }> {
  const { roleFilter = 'all', cursor = null } = opts;
  const usersRef = collection(db, 'users');

  const constraints = [];
  if (roleFilter !== 'all') constraints.push(where('role', '==', roleFilter));
  constraints.push(orderBy('name'));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(fbLimit(PAGE_SIZE));

  const snap = await getDocs(query(usersRef, ...constraints));
  const rows = snap.docs.map(mapDoc);
  const nextCursor = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null;
  return { rows, nextCursor };
}

// Client-side search over name/email/phone. Firestore doesn't do
// substring text search natively; for a small-to-mid admin user base this
// keeps things simple. Swap for Algolia/Typesense if the list grows large.
export function filterBySearch(rows: AdminUserRow[], search: string): AdminUserRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.phone?.toLowerCase().includes(q)
  );
}

export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { role });
}

export async function updateUserDisabled(uid: string, disabled: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { disabled });
}

export async function updateUserFeatures(uid: string, features: FeatureAccess): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { features });
}
