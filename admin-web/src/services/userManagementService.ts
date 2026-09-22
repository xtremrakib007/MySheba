// User & role management for MySheba Admin Web.
import {
  collection,
  doc,
  getDoc,
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
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import type { AdminRole } from '../contexts/AuthContext';

export type UserRole = 'customer' | 'dealer' | 'reseller' | AdminRole;
// Appointing staff is a superadmin act, matching functions/userManagement.js's
// ROLE_PERMISSIONS - an admin manages customers and operators only.
const SUPERADMIN_ONLY_ROLES: UserRole[] = ['support', 'finance', 'admin'];
export const ALL_ROLES: UserRole[] = ['customer', 'dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin'];
export const ROLE_RANK: Record<UserRole, number> = { customer: 0, dealer: 1, reseller: 2, support: 3, finance: 3, admin: 4, superadmin: 5 };

/** Older user documents wrote the customer role as 'user'. */
function normalizeRole(value: unknown): UserRole {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (role === 'user' || role === '') return 'customer';
  return (ALL_ROLES as string[]).includes(role) ? (role as UserRole) : 'customer';
}

export function assignableRoles(actingRole: AdminRole): UserRole[] {
  if (actingRole === 'superadmin') return ALL_ROLES.filter((r) => r !== 'superadmin');
  if (actingRole !== 'admin') return [];
  return ALL_ROLES.filter((r) => r !== 'superadmin' && !SUPERADMIN_ONLY_ROLES.includes(r));
}

export function canEditTarget(actingRole: AdminRole, targetRole: UserRole): boolean {
  return ROLE_RANK[targetRole] < ROLE_RANK[actingRole];
}

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'unknown';

export interface FeatureAccess {
  mobileBanking: boolean;
  recharge: boolean;
  remittance: boolean;
  travel: boolean;
  ticketReseller: boolean;
}

export const FEATURE_LABELS: Record<keyof FeatureAccess, string> = {
  mobileBanking: 'Mobile Banking', recharge: 'Recharge / Top-Up', remittance: 'Remittance',
  travel: 'Travel & Tickets', ticketReseller: 'Ticket Reseller',
};

// A user with no `features` map keeps every module; access is revoked by
// switching a module off, never by the field being absent.
const DEFAULT_FEATURES: FeatureAccess = {
  mobileBanking: true, recharge: true, remittance: true, travel: true, ticketReseller: true,
};

export interface AdminUserRow {
  uid: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  disabled: boolean;
  verificationStatus: VerificationStatus;
  dealerCode?: string;
  resellerCode?: string;
  features: FeatureAccess;
}

function mapDoc(d: QueryDocumentSnapshot<DocumentData>): AdminUserRow {
  const data = d.data();
  const rawVerification = data.verificationStatus ?? (data.verified === true ? 'approved' : undefined);
  return {
    uid: d.id,
    name: data.name ?? data.displayName ?? '(no name)',
    email: data.email ?? null,
    phone: data.phone ?? data.phoneNumber ?? null,
    role: normalizeRole(data.role),
    disabled: Boolean(data.disabled),
    verificationStatus: ['pending', 'approved', 'rejected'].includes(rawVerification) ? rawVerification : 'unknown',
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
  return { rows, nextCursor: snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null };
}

export function filterBySearch(rows: AdminUserRow[], search: string): AdminUserRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    r.name.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q) || r.phone?.toLowerCase().includes(q) ||
    r.uid.toLowerCase().includes(q) || r.dealerCode?.toLowerCase().includes(q) || r.resellerCode?.toLowerCase().includes(q)
  );
}

/** Role changes must go through the server-side permission matrix. */
export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  if (typeof uid !== 'string' || !uid || uid.length > 128) throw new Error('Invalid user ID.');
  const targetSnap = await getDoc(doc(db, 'users', uid));
  if (!targetSnap.exists()) throw new Error('That user does not exist.');
  const currentRole = normalizeRole(targetSnap.data().role);
  const callable = httpsCallable(functions, 'manageUser');

  if (role === currentRole) return;
  if (role === 'customer' && ['dealer', 'admin', 'reseller', 'support', 'finance'].includes(currentRole)) {
    await callable({ action: 'downgradeRole', targetUid: uid });
    return;
  }
  if (currentRole === 'customer' && ['dealer', 'admin', 'reseller', 'support', 'finance'].includes(role)) {
    await callable({ action: 'setRole', targetUid: uid, newRole: role });
    return;
  }
  if (currentRole === 'admin' && role === 'dealer') {
    await callable({ action: 'downgradeRole', targetUid: uid });
    return;
  }
  if (currentRole === 'dealer' && role === 'customer') {
    await callable({ action: 'downgradeRole', targetUid: uid });
    return;
  }
  if (currentRole === 'reseller' && role === 'customer') {
    await callable({ action: 'downgradeRole', targetUid: uid });
    return;
  }
  throw new Error(`Unsupported role change: ${currentRole} → ${role}.`);
}

/** Account suspension must use the Auth-backed server operation; the Firestore-only `disabled` flag is not an authoritative account lock. */
export async function updateUserDisabled(uid: string, disabled: boolean): Promise<void> {
  if (typeof uid !== 'string' || !uid || uid.length > 128) throw new Error('Invalid user ID.');
  const callable = httpsCallable(functions, 'manageUser');
  await callable({ action: 'suspend', targetUid: uid, suspended: Boolean(disabled) });
}

/** Feature flags are intentionally the only direct user-profile management write exposed here. */
export async function updateUserFeatures(uid: string, features: FeatureAccess): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { features });
}
