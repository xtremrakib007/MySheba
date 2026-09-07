// Client side of user management. All the actual permission checks happen
// server-side in functions/userManagement.js (manageUser) - this file just
// calls it and gives the UI a friendly error message back.
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { functions, db } from './config';

// Mirrors ROLE_PERMISSIONS in functions/userManagement.js, so the UI can
// show/hide the right options without waiting on a round trip - the
// function re-checks all of this anyway before it does anything.
export const ROLE_PERMISSIONS = {
  dealer: { canCreate: ['customer'], canUpgradeTo: [] },
  admin: { canCreate: ['customer', 'dealer', 'reseller'], canUpgradeTo: ['dealer', 'reseller'] },
  superadmin: { canCreate: ['customer', 'dealer', 'admin', 'reseller'], canUpgradeTo: ['dealer', 'admin', 'reseller'] },
};

// Mirrors DOWNGRADE_PERMISSIONS in functions/userManagement.js - reverse of
// ROLE_PERMISSIONS.canUpgradeTo, so the UI knows which role a "Downgrade"
// button should offer for a given target's current role.
export const DOWNGRADE_PERMISSIONS = {
  dealer: { dealer: 'customer' },
  admin: { dealer: 'customer', reseller: 'customer' },
  superadmin: { dealer: 'customer', admin: 'dealer', reseller: 'customer' },
};

export function canManageUsers(role) {
  return !!ROLE_PERMISSIONS[role];
}

/** Live list of EVERY account, every role, no scoping - only admin/superadmin
 * can actually read this per firestore.rules (isAdmin() is the only unscoped
 * branch of the users/{uid} read rule). Used for platform-wide counts (see
 * AdminLogsScreen's stats header) - subscribeManageableUsers above is scoped
 * per-role and, for admin/superadmin, deliberately excludes dealer, so
 * it undercounts if you just want "how many accounts exist, period". */
export function subscribeAllUsers(onUpdate, onError) {
  const q = collection(db, 'users');
  return onSnapshot(
    q,
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Live list of every top-level dealer (not dealer) - used by the
 * "Appoint Dealer" picker on an admin's unassigned transactions
 * (AdminHomeScreen). A transaction's dealerId always points to a
 * top-level dealer (same as customer registration's dealer-code
 * resolution - see functions/customerRegistration.js), so dealers
 * aren't offered here. */
export function subscribeDealers(callback, onError) {
  const q = query(collection(db, 'users'), where('role', '==', 'dealer'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      callback(list);
    },
    onError
  );
}

/** Live list of every reseller - used by AssignResellerModal-style pickers
 * (e.g. admin's "Set Reseller" on a customer, RegisterScreen's optional
 * reseller-code lookup helpers) the same way subscribeDealers feeds
 * AssignDealerModal. */
export function subscribeResellers(callback, onError) {
  const q = query(collection(db, 'users'), where('role', '==', 'reseller'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      callback(list);
    },
    onError
  );
}

/** Live list of users this role is allowed to see/manage.
 * - dealer/dealer: their own dealer pool (dealers + customers scoped
 *   to them via dealerId) - unchanged, still the most specific view.
 * - admin: dealers + resellers + customers (so UserManagementScreen can
 *   show separate "Dealers", "Resellers" and "Customers" sections).
 * - superadmin: admins + dealers + resellers + customers (adds an "Admins"
 *   section on top of what admin sees).
 * Sorting is done client-side (not via Firestore orderBy) so this doesn't
 * require a composite index for the role-filtered queries. */
export function subscribeManageableUsers(role, dealerScope, onUpdate, onError) {
  let q;
  if (role === 'superadmin') {
    q = query(collection(db, 'users'), where('role', 'in', ['admin', 'dealer', 'reseller', 'customer']));
  } else if (role === 'admin') {
    q = query(collection(db, 'users'), where('role', 'in', ['dealer', 'reseller', 'customer']));
  } else {
    q = query(collection(db, 'users'), where('dealerId', '==', dealerScope));
  }

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      onUpdate(list);
    },
    onError
  );
}

export async function createManagedUser({ name, phone, pin, role, dealerId, resellerId }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'create', name, phone, pin, role, dealerId, resellerId });
  return data;
}

export async function upgradeUserRole({ targetUid, newRole }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'setRole', targetUid, newRole });
  return data;
}

/** Demotes a user back to the role below theirs (e.g. dealer -> customer,
 * admin -> dealer). See DOWNGRADE_PERMISSIONS above for who can downgrade
 * what - re-checked server-side regardless. */
export async function downgradeUserRole({ targetUid }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'downgradeRole', targetUid });
  return data;
}

/** Suspends (blocks sign-in) or reactivates an account. Superadmin only;
 * a superadmin account itself can never be suspended this way. */
export async function suspendUser({ targetUid, suspended }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'suspend', targetUid, suspended });
  return data;
}

/** Permanently deletes an account (Auth user + profile doc). Superadmin
 * only, irreversible, and a superadmin account itself can never be
 * deleted this way. */
export async function deleteManagedUser({ targetUid }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'delete', targetUid });
  return data;
}

/** Live list of customers with no dealer yet - self-registered without a
 * dealer code, or created by an admin/superadmin without picking one -
 * admin/superadmin only, so they have someone to actually pick when
 * assigning a dealer via assignDealer() below.
 * Filtered client-side rather than `where('dealerId', '==', null)`: that
 * only matches docs where the field is explicitly null, not docs where it
 * was never set at all (see createManagedUser / manageUser, which omits
 * the field entirely when no dealer was chosen) - so it would miss exactly
 * the accounts this is meant to surface. */
export function subscribeUnassignedCustomers(onUpdate, onError) {
  const q = query(collection(db, 'users'), where('role', '==', 'customer'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => !u.dealerId);
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      onUpdate(list);
    },
    onError
  );
}

/** Assigns (or reassigns) which dealer a customer belongs to. Admin/superadmin only. */
export async function assignDealer({ targetUid, dealerId }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'setDealer', targetUid, dealerId });
  return data;
}

/** Assigns (or reassigns) which reseller a customer's dealer-queue orders
 * route to first. Admin/superadmin only - mirrors assignDealer exactly. */
export async function assignReseller({ targetUid, resellerId }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'setReseller', targetUid, resellerId });
  return data;
}

/** Bans (or unbans) a user from posting new Marketplace content - see
 * MarketplaceModerationScreen. Scoped ban only (see firestore.rules'
 * isMarketplaceBanned()); does not disable the account or touch login.
 * Admin/superadmin only, and an admin can never ban another staff account. */
export async function setMarketplaceBan({ targetUid, banned, reason }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'setMarketplaceBan', targetUid, banned, reason });
  return data;
}
