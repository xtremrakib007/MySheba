// Staff access control: role defaults + per-user overrides.
//
// This is the permission model from the role sheet. Every staff role has a
// default set of capabilities; a superadmin can change a role's defaults, and
// can grant or revoke a capability for one person on top of them. The
// effective set is
//
//     (role defaults  ∪  user grants)  −  user revokes
//
// Superadmin always has everything and cannot be restricted. Dealers,
// resellers and customers are not in this model at all: their access is their
// own assigned orders and their own data, enforced by the existing role
// checks.
//
// Changes apply immediately - nothing is cached across requests, and the
// panel, the app and firestore.rules all read the same two documents - and
// every change is written to the audit log with its before and after.
//
//   settings/accessControl      { roleDefaults: { admin: [...], support: [...], finance: [...] } }
//   accessOverrides/{uid}       { grant: [...], revoke: [...] }
//
// firestore.rules mirrors BUILT_IN_DEFAULTS and the effective-set formula in
// its can() function; keep the two in step.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const CAPABILITIES = ['support', 'orders', 'finance', 'users', 'settings', 'reports'];

// Straight from the role sheet. Admin runs users, features, settings and
// reports, but has no finance access and no order management unless a
// superadmin grants it. Support works support; finance works money.
const BUILT_IN_DEFAULTS = {
  admin: ['support', 'users', 'settings', 'reports'],
  support: ['support'],
  finance: ['finance', 'reports'],
};

const CONFIGURABLE_ROLES = Object.keys(BUILT_IN_DEFAULTS);

function isActive(profile) {
  return profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto;
}

function cleanCapabilities(list) {
  const out = [];
  for (const cap of Array.isArray(list) ? list : []) {
    if (CAPABILITIES.includes(cap) && !out.includes(cap)) out.push(cap);
  }
  return out;
}

async function loadRoleDefaults(db) {
  const snap = await db.collection('settings').doc('accessControl').get();
  const stored = snap.exists ? (snap.data().roleDefaults || {}) : {};
  const defaults = {};
  for (const role of CONFIGURABLE_ROLES) {
    defaults[role] = Array.isArray(stored[role]) ? cleanCapabilities(stored[role]) : [...BUILT_IN_DEFAULTS[role]];
  }
  return defaults;
}

async function loadOverrides(db, uid) {
  const snap = await db.collection('accessOverrides').doc(uid).get();
  const data = snap.exists ? snap.data() : {};
  return { grant: cleanCapabilities(data.grant), revoke: cleanCapabilities(data.revoke) };
}

function computeCapabilities(role, roleDefaults, overrides) {
  if (role === 'superadmin') return [...CAPABILITIES];
  if (!CONFIGURABLE_ROLES.includes(role)) return [];
  const set = new Set([...(roleDefaults[role] || []), ...overrides.grant]);
  overrides.revoke.forEach((cap) => set.delete(cap));
  return CAPABILITIES.filter((cap) => set.has(cap));
}

/** Effective capabilities for one account, read fresh every call. */
async function getCapabilities(db, uid, profile) {
  if (!profile || !isActive(profile)) return [];
  if (profile.role === 'superadmin') return [...CAPABILITIES];
  if (!CONFIGURABLE_ROLES.includes(profile.role)) return [];
  const [roleDefaults, overrides] = await Promise.all([loadRoleDefaults(db), loadOverrides(db, uid)]);
  return computeCapabilities(profile.role, roleDefaults, overrides);
}

async function hasCapability(db, uid, profile, cap) {
  return (await getCapabilities(db, uid, profile)).includes(cap);
}

async function requireCapability(db, uid, profile, cap, message) {
  if (!(await hasCapability(db, uid, profile, cap))) {
    throw new HttpsError('permission-denied', message || 'Your account does not have access to this.');
  }
}

async function requireSuperadmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const snap = await db.collection('users').doc(request.auth.uid).get();
  const profile = snap.exists ? snap.data() : null;
  if (!profile || profile.role !== 'superadmin' || !isActive(profile)) {
    throw new HttpsError('permission-denied', 'Only a superadmin can change access.');
  }
  return { db, uid: request.auth.uid, profile };
}

/** Sets the default capabilities of one staff role. */
exports.setRoleDefaults = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const { db, uid, profile } = await requireSuperadmin(request);
  const role = String(request.data?.role || '');
  if (!CONFIGURABLE_ROLES.includes(role)) throw new HttpsError('invalid-argument', 'That role has no configurable access.');
  const capabilities = cleanCapabilities(request.data?.capabilities);

  const before = (await loadRoleDefaults(db))[role];
  await db.collection('settings').doc('accessControl').set({
    roleDefaults: { [role]: capabilities },
    updatedBy: uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await logAudit({
    action: 'access_role_defaults_changed',
    targetUid: null,
    performedBy: uid,
    performedByRole: profile.role,
    details: { role, before, after: capabilities },
  });
  return { role, capabilities };
});

/** Grants or revokes capabilities for one staff member on top of their role. */
exports.setUserAccessOverride = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const { db, uid, profile } = await requireSuperadmin(request);
  const targetUid = String(request.data?.targetUid || '').trim();
  if (!targetUid || targetUid.length > 128) throw new HttpsError('invalid-argument', 'targetUid is required.');
  if (targetUid === uid) throw new HttpsError('invalid-argument', 'You cannot change your own access.');

  const targetSnap = await db.collection('users').doc(targetUid).get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
  const target = targetSnap.data();
  if (!CONFIGURABLE_ROLES.includes(target.role)) {
    throw new HttpsError('failed-precondition', 'Access overrides apply to admin, support and finance accounts only.');
  }

  const grant = cleanCapabilities(request.data?.grant);
  const revoke = cleanCapabilities(request.data?.revoke).filter((cap) => !grant.includes(cap));
  const before = await loadOverrides(db, targetUid);

  const ref = db.collection('accessOverrides').doc(targetUid);
  if (!grant.length && !revoke.length) {
    await ref.delete();
  } else {
    await ref.set({ grant, revoke, role: target.role, updatedBy: uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  }

  await logAudit({
    action: 'access_override_changed',
    targetUid,
    performedBy: uid,
    performedByRole: profile.role,
    details: { role: target.role, before, after: { grant, revoke } },
  });
  return { targetUid, grant, revoke };
});

module.exports.CAPABILITIES = CAPABILITIES;
module.exports.BUILT_IN_DEFAULTS = BUILT_IN_DEFAULTS;
module.exports.getCapabilities = getCapabilities;
module.exports.hasCapability = hasCapability;
module.exports.requireCapability = requireCapability;
module.exports.computeCapabilities = computeCapabilities;
