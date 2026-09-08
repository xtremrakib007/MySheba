// Superadmin > Tool Access — real schema and behavior ported directly
// from the mobile app's src/firebase/featureAccessService.js. A single
// `settings/featureAccess` doc holds which roles can open each
// admin/dealer/reseller management tool. Named "Tool Access" here (not
// "Feature Access") to avoid colliding with this admin web app's
// existing Feature Access page, which is actually a different real
// feature - per-customer module toggles (settings/featureFlags).

import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const DOC_REF = doc(db, 'settings', 'featureAccess');

export const FEATURE_DEFS = [
  { key: 'userManagement', icon: '🧑‍💼', name: 'User Mgmt', defaultRoles: ['dealer', 'admin', 'superadmin'] },
  { key: 'transferPoints', icon: '💸', name: 'Transfer Pts', defaultRoles: ['dealer', 'subdealer', 'admin', 'superadmin'] },
  { key: 'marketplaceModeration', icon: '🛡️', name: 'Moderation', defaultRoles: ['admin', 'superadmin'] },
  { key: 'chatReports', icon: '🚩', name: 'Chat Reports', defaultRoles: ['admin', 'superadmin'] },
  { key: 'verificationManagement', icon: '🪪', name: 'Verify Requests', defaultRoles: ['admin', 'superadmin'] },
  { key: 'adminBusinessManagement', icon: '🏢', name: 'Business Profiles', defaultRoles: ['admin', 'superadmin'] },
  { key: 'adminAnalytics', icon: '📊', name: 'Analytics', defaultRoles: ['admin', 'superadmin'] },
] as const;

export type FeatureKey = (typeof FEATURE_DEFS)[number]['key'];

// superadmin excluded on purpose (always has full access, never
// toggleable off by accident); customer excluded (separate grid this
// screen never touches).
export const TOGGLEABLE_ROLES = ['subdealer', 'dealer', 'reseller', 'admin'] as const;
export type ToggleableRole = (typeof TOGGLEABLE_ROLES)[number];

export const ROLE_LABEL: Record<ToggleableRole, string> = {
  subdealer: 'Sub Dealer',
  dealer: 'Dealer',
  reseller: 'Reseller',
  admin: 'Admin',
};

export type FeatureAccessMap = Record<FeatureKey, string[]>;

function defaultAccessFor(key: FeatureKey): string[] {
  return [...(FEATURE_DEFS.find((f) => f.key === key)?.defaultRoles ?? [])];
}

export const DEFAULT_FEATURE_ACCESS: FeatureAccessMap = FEATURE_DEFS.reduce((acc, f) => {
  acc[f.key] = [...f.defaultRoles];
  return acc;
}, {} as FeatureAccessMap);

function mergeWithDefaults(data: any): FeatureAccessMap {
  const merged = { ...DEFAULT_FEATURE_ACCESS };
  FEATURE_DEFS.forEach((f) => {
    if (data && Array.isArray(data[f.key])) merged[f.key] = data[f.key];
  });
  return merged;
}

export function subscribeFeatureAccess(
  onUpdate: (access: FeatureAccessMap) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    DOC_REF,
    (snap) => onUpdate(snap.exists() ? mergeWithDefaults(snap.data()) : { ...DEFAULT_FEATURE_ACCESS }),
    (err) => onError(err as Error)
  );
}

/** Superadmin-only in the UI, and enforced the same way server-side -
 * see firestore.rules' settings/{id} match block, which requires
 * isSuperadmin() specifically to touch settings/featureAccess. */
export async function setFeatureAccessForRole(
  featureKey: FeatureKey,
  role: ToggleableRole,
  enabled: boolean
): Promise<void> {
  const snap = await getDoc(DOC_REF);
  const current: string[] =
    snap.exists() && Array.isArray(snap.data()[featureKey]) ? snap.data()[featureKey] : defaultAccessFor(featureKey);
  const next = enabled ? Array.from(new Set([...current, role])) : current.filter((r) => r !== role);
  await setDoc(DOC_REF, { [featureKey]: next, updatedAt: serverTimestamp() }, { merge: true });
}
