// A single `settings/featureAccess` document holds which roles are allowed
// to open each admin/dealer/reseller management tool (User Mgmt, Transfer
// Points, Moderation, etc). Same one-doc pattern as settings/pricing (see
// settingsService.js) - Superadmin > Feature Access and every Features
// screen (AdminFeaturesScreen/DealerFeaturesScreen/ResellerFeaturesScreen)
// can subscribe with a single read.
//
// This is the single source of truth for those tool tiles - several tools
// (userManagement/transferPoints) used to be duplicated as separate arrays
// on AdminFeaturesScreen and DealerFeaturesScreen; now both screens filter
// this ONE list by role instead.
//
// Customer-facing features (ServiceGrid's Quick Services grid) are
// deliberately NOT part of this file - those stay identical for every
// role, per product requirement, and are never superadmin-toggleable.
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const FEATURE_ACCESS_DOC = doc(db, 'settings', 'featureAccess');
export const USER_FEATURE_OVERRIDES_KEY = 'userOverrides';

// Master list of role-gated management tools. `defaultRoles` is the
// behavior every install ships with (identical to the old hardcoded
// ADMIN_TOOL_DEFS/DEALER_TOOL_DEFS `roles` arrays) - a superadmin only
// needs to touch Feature Access if they want to deviate from these.
export const FEATURE_DEFS = [
  { key: 'userManagement', icon: '🧑‍💼', bg: '#E3F2FD', name: 'User Mgmt', defaultRoles: ['admin', 'superadmin'] },
  { key: 'transferPoints', icon: '💸', bg: '#E8F5E9', name: 'Transfer Pts', defaultRoles: ['admin', 'superadmin'] },
  { key: 'verificationManagement', icon: '🪪', bg: '#E0F7FA', name: 'Verify Requests', defaultRoles: ['admin', 'superadmin'] },
  { key: 'adminAnalytics', icon: '📊', bg: '#FFF3E0', name: 'Analytics', defaultRoles: ['admin', 'superadmin', 'finance'] },
];

// Roles a superadmin can check/uncheck per feature on the Feature Access
// screen. superadmin is left out on purpose - always has full access, not
// something that should be toggleable off by accident. customer is left
// out too - customer features are a separate grid (ServiceGrid) that this
// screen never touches.
// Operators only. Staff access (admin, support, finance) is role defaults +
// per-user overrides in Access Control - see accessControlService.js.
export const TOGGLEABLE_ROLES = ['dealer', 'reseller'];

export const ROLE_LABEL = { dealer: 'Dealer', reseller: 'Reseller' };

function defaultAccessFor(key) {
  const def = FEATURE_DEFS.find((f) => f.key === key);
  return def ? [...def.defaultRoles] : [];
}

export const DEFAULT_FEATURE_ACCESS = FEATURE_DEFS.reduce((acc, f) => {
  acc[f.key] = [...f.defaultRoles];
  return acc;
}, {});

function mergeWithDefaults(data) {
  const merged = { ...DEFAULT_FEATURE_ACCESS, [USER_FEATURE_OVERRIDES_KEY]: {} };
  FEATURE_DEFS.forEach((f) => {
    if (data && Array.isArray(data[f.key])) merged[f.key] = data[f.key];
  });
  if (data?.[USER_FEATURE_OVERRIDES_KEY] && typeof data[USER_FEATURE_OVERRIDES_KEY] === 'object') merged[USER_FEATURE_OVERRIDES_KEY] = data[USER_FEATURE_OVERRIDES_KEY];
  return merged;
}

/** Whether `role` can open feature `key` - a superadmin-set override if one
 * exists for that feature, otherwise the feature's built-in default roles.
 * superadmin can always access every tool, override or not. */
export function canAccessFeature(featureAccess, key, role, uid) {
  if (!role) return false;
  if (role === 'superadmin') return true;
  const overrides = featureAccess?.[USER_FEATURE_OVERRIDES_KEY]?.[uid];
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key] === true;
  const roles = (featureAccess && featureAccess[key]) || defaultAccessFor(key);
  return roles.includes(role);
}

/** Ensures the settings doc exists (first run) then returns current values -
 * one array of allowed roles per feature key. */
export async function ensureFeatureAccess() {
  const snap = await getDoc(FEATURE_ACCESS_DOC);
  if (!snap.exists()) {
    await setDoc(FEATURE_ACCESS_DOC, { ...DEFAULT_FEATURE_ACCESS, updatedAt: serverTimestamp() });
    return { ...DEFAULT_FEATURE_ACCESS };
  }
  return mergeWithDefaults(snap.data());
}

export function subscribeFeatureAccess(callback, onError) {
  return onSnapshot(
    FEATURE_ACCESS_DOC,
    (snap) => callback(snap.exists() ? mergeWithDefaults(snap.data()) : { ...DEFAULT_FEATURE_ACCESS }),
    onError
  );
}

/** Grants or revokes one role's access to one feature - the checkbox
 * handler on the Feature Access screen. superadmin-only in the UI and
 * enforced the same way server-side (see firestore.rules'
 * settings/featureAccess match block). */
export async function setFeatureAccessForRole(featureKey, role, enabled) {
  if (!FEATURE_DEFS.some((f) => f.key === featureKey)) throw new Error('Unknown feature.');
  if (!TOGGLEABLE_ROLES.includes(role)) throw new Error('Unknown role.');
  const snap = await getDoc(FEATURE_ACCESS_DOC);
  const current = (snap.exists() && Array.isArray(snap.data()[featureKey]))
    ? snap.data()[featureKey]
    : defaultAccessFor(featureKey);
  const next = enabled
    ? Array.from(new Set([...current, role]))
    : current.filter((r) => r !== role);
  await setDoc(FEATURE_ACCESS_DOC, { [featureKey]: next, updatedAt: serverTimestamp() }, { merge: true });
}

export async function setFeatureAccessForUser(uid, featureKey, enabled) {
  if (!uid || !FEATURE_DEFS.some((f) => f.key === featureKey)) throw new Error('Invalid user or feature.');
  const snap = await getDoc(FEATURE_ACCESS_DOC);
  const data = snap.exists() ? snap.data() : {};
  const current = data[USER_FEATURE_OVERRIDES_KEY]?.[uid] || {};
  const next = { ...current, [featureKey]: Boolean(enabled) };
  await setDoc(FEATURE_ACCESS_DOC, { [USER_FEATURE_OVERRIDES_KEY]: { ...(data[USER_FEATURE_OVERRIDES_KEY] || {}), [uid]: next }, updatedAt: serverTimestamp() }, { merge: true });
}
