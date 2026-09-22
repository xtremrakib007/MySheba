// Staff access for the admin panel: role defaults + per-user overrides.
//
// Mirrors functions/accessControl.js and the can() function in
// firestore.rules - keep all three in step. The panel only uses this to decide
// what to show; the Cloud Functions and rules are what actually enforce it.

import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import type { AdminRole } from '../contexts/AuthContext';

export const CAPABILITIES = ['support', 'orders', 'finance', 'users', 'settings', 'reports'] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_INFO: Record<Capability, { label: string; description: string }> = {
  support: { label: 'Support', description: 'Tickets, contact messages, inquiries, chat reports and announcements.' },
  orders: { label: 'Order management', description: 'Approve, reject and route service orders; issue recharge PINs.' },
  finance: { label: 'Finance', description: 'Transactions, top-up review, point top-ups, settlement and risk.' },
  users: { label: 'User management', description: 'Accounts, KYC review, business profiles and customer feature access.' },
  settings: { label: 'Settings', description: 'Rates, pricing, banners, billers and other platform configuration.' },
  reports: { label: 'Reports', description: 'Reports, analytics, growth and executive overviews.' },
};

export type ConfigurableRole = 'admin' | 'support' | 'finance';
export const CONFIGURABLE_ROLES: ConfigurableRole[] = ['admin', 'support', 'finance'];

// Built-in defaults. A superadmin can change them in Access Control.
export const BUILT_IN_DEFAULTS: Record<ConfigurableRole, Capability[]> = {
  admin: ['support', 'orders', 'users', 'settings', 'reports'],
  support: ['support'],
  finance: ['finance', 'reports'],
};

export type RoleDefaults = Record<ConfigurableRole, Capability[]>;
export interface AccessOverride { grant: Capability[]; revoke: Capability[] }

const isCapability = (value: unknown): value is Capability =>
  typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value);

function clean(list: unknown): Capability[] {
  return Array.isArray(list) ? CAPABILITIES.filter((cap) => list.some((v) => v === cap)) : [];
}

export function normalizeRoleDefaults(raw: Record<string, unknown> | undefined): RoleDefaults {
  const stored = (raw?.roleDefaults ?? {}) as Record<string, unknown>;
  const out = {} as RoleDefaults;
  for (const role of CONFIGURABLE_ROLES) {
    out[role] = Array.isArray(stored[role]) ? clean(stored[role]) : [...BUILT_IN_DEFAULTS[role]];
  }
  return out;
}

export function normalizeOverride(raw: Record<string, unknown> | undefined): AccessOverride {
  return { grant: clean(raw?.grant), revoke: clean(raw?.revoke) };
}

export function computeCapabilities(role: AdminRole | undefined, defaults: RoleDefaults, override: AccessOverride): Capability[] {
  if (role === 'superadmin') return [...CAPABILITIES];
  if (!role || !(CONFIGURABLE_ROLES as string[]).includes(role)) return [];
  const set = new Set<Capability>([...defaults[role as ConfigurableRole], ...override.grant]);
  override.revoke.forEach((cap) => set.delete(cap));
  return CAPABILITIES.filter((cap) => set.has(cap));
}

/**
 * Live effective capabilities for the signed-in staff member. Listens to both
 * documents, so a superadmin's change reaches an open panel without a reload.
 */
export function subscribeMyCapabilities(
  uid: string,
  role: AdminRole,
  onChange: (capabilities: Capability[]) => void,
): () => void {
  if (role === 'superadmin') {
    onChange([...CAPABILITIES]);
    return () => {};
  }
  let defaults: RoleDefaults | null = null;
  let override: AccessOverride | null = null;
  const emit = () => { if (defaults && override) onChange(computeCapabilities(role, defaults, override)); };

  const stopDefaults = onSnapshot(
    doc(db, 'settings', 'accessControl'),
    (snap) => { defaults = normalizeRoleDefaults(snap.exists() ? snap.data() : undefined); emit(); },
    () => { defaults = normalizeRoleDefaults(undefined); emit(); },
  );
  const stopOverride = onSnapshot(
    doc(db, 'accessOverrides', uid),
    (snap) => { override = normalizeOverride(snap.exists() ? snap.data() : undefined); emit(); },
    () => { override = { grant: [], revoke: [] }; emit(); },
  );
  return () => { stopDefaults(); stopOverride(); };
}

export function subscribeRoleDefaults(onChange: (d: RoleDefaults) => void, onError: (e: Error) => void) {
  return onSnapshot(
    doc(db, 'settings', 'accessControl'),
    (snap) => onChange(normalizeRoleDefaults(snap.exists() ? snap.data() : undefined)),
    (err) => onError(err as Error),
  );
}

export function subscribeOverride(uid: string, onChange: (o: AccessOverride) => void, onError: (e: Error) => void) {
  return onSnapshot(
    doc(db, 'accessOverrides', uid),
    (snap) => onChange(normalizeOverride(snap.exists() ? snap.data() : undefined)),
    (err) => onError(err as Error),
  );
}

export async function saveRoleDefaults(role: ConfigurableRole, capabilities: Capability[]): Promise<void> {
  await httpsCallable(functions, 'setRoleDefaults')({ role, capabilities: capabilities.filter(isCapability) });
}

export async function saveUserOverride(targetUid: string, override: AccessOverride): Promise<void> {
  await httpsCallable(functions, 'setUserAccessOverride')({ targetUid, grant: override.grant, revoke: override.revoke });
}

export interface StaffMember { uid: string; name: string; email: string | null; role: ConfigurableRole }

/** Every admin, support and finance account - the people overrides apply to. */
export async function fetchStaff(): Promise<StaffMember[]> {
  const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', CONFIGURABLE_ROLES)));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return { uid: d.id, name: data.name ?? data.displayName ?? '(no name)', email: data.email ?? null, role: data.role as ConfigurableRole };
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}

export interface AccessChange {
  id: string;
  action: string;
  targetUid: string | null;
  performedBy: string;
  details: Record<string, unknown>;
  createdAt: string | null;
}

/** The audit trail of access changes (rule 6 on the role sheet). */
export async function fetchAccessChanges(max = 30): Promise<AccessChange[]> {
  const snap = await getDocs(query(
    collection(db, 'userAuditLog'),
    where('action', 'in', ['access_role_defaults_changed', 'access_override_changed']),
    orderBy('createdAt', 'desc'),
    limit(max),
  ));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      action: data.action,
      targetUid: data.targetUid ?? null,
      performedBy: data.performedBy ?? '',
      details: (data.details ?? {}) as Record<string, unknown>,
      createdAt: data.createdAt?.toDate?.().toLocaleString() ?? null,
    };
  });
}
