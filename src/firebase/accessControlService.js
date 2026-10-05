// Staff access in the app: role defaults + per-user overrides.
//
// Mirrors functions/accessControl.js, admin-web's accessControlService.ts and
// the can() function in firestore.rules - keep all four in step. The app only
// uses this to decide what to show; the Cloud Functions and rules enforce it.
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './config';

// 'review' reads orders and nothing else - see functions/accessControl.js for
// why it exists. It must never appear in a write rule.
export const CAPABILITIES = ['support', 'orders', 'review', 'finance', 'users', 'settings', 'reports'];

// Built-in defaults; a superadmin can change them in Access Control.
export const BUILT_IN_DEFAULTS = {
  admin: ['support', 'orders', 'review', 'finance', 'users', 'settings', 'reports'],
  support: ['support', 'review', 'reports'],
  finance: ['finance', 'orders', 'reports'],
};

const CONFIGURABLE_ROLES = Object.keys(BUILT_IN_DEFAULTS);

const clean = (list) => (Array.isArray(list) ? CAPABILITIES.filter((cap) => list.includes(cap)) : []);

export function computeCapabilities(role, roleDefaults, override) {
  if (role === 'superadmin') return [...CAPABILITIES];
  if (!CONFIGURABLE_ROLES.includes(role)) return [];
  const base = Array.isArray(roleDefaults?.[role]) ? clean(roleDefaults[role]) : BUILT_IN_DEFAULTS[role];
  const set = new Set([...base, ...clean(override?.grant)]);
  clean(override?.revoke).forEach((cap) => set.delete(cap));
  return CAPABILITIES.filter((cap) => set.has(cap));
}

/**
 * Live effective capabilities for the signed-in staff member, so a
 * superadmin's change reaches an open app without signing out.
 * Dealers, resellers and customers get [] - they are not in the staff model.
 */
export function subscribeMyCapabilities(uid, role, onChange) {
  if (role === 'superadmin') { onChange([...CAPABILITIES]); return () => {}; }
  if (!uid || !CONFIGURABLE_ROLES.includes(role)) { onChange([]); return () => {}; }

  let roleDefaults;
  let override;
  const emit = () => {
    if (roleDefaults !== undefined && override !== undefined) onChange(computeCapabilities(role, roleDefaults, override));
  };
  const stopDefaults = onSnapshot(
    doc(db, 'settings', 'accessControl'),
    (snap) => { roleDefaults = snap.exists() ? (snap.data().roleDefaults || {}) : {}; emit(); },
    () => { roleDefaults = {}; emit(); },
  );
  const stopOverride = onSnapshot(
    doc(db, 'accessOverrides', uid),
    (snap) => { override = snap.exists() ? snap.data() : {}; emit(); },
    () => { override = {}; emit(); },
  );
  return () => { stopDefaults(); stopOverride(); };
}
