// Client side of user management. Permission checks remain server-side.
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { functions, db } from './config';

// This mirrors ROLE_PERMISSIONS in functions/userManagement.js, which is what
// actually decides. The backend has allowed support and finance all along;
// this copy did not offer them, so neither role could be created or upgraded
// to from the app - the accounts the staff home exists for could not exist.
// scripts/test-user-roles.js fails if the two drift again.
export const ROLE_PERMISSIONS = {
  dealer: { canCreate: ['customer'], canUpgradeTo: [] },
  admin: { canCreate: ['customer', 'dealer', 'reseller', 'support', 'finance'], canUpgradeTo: ['dealer', 'reseller', 'support', 'finance'] },
  superadmin: { canCreate: ['customer', 'dealer', 'admin', 'reseller', 'support', 'finance'], canUpgradeTo: ['dealer', 'admin', 'reseller', 'support', 'finance'] },
  support: { canCreate: [], canUpgradeTo: [] },
  finance: { canCreate: [], canUpgradeTo: [] },
};

// Mirrors DOWNGRADABLE / ROLE_RANK / downgradeTargetsFor in
// functions/userManagement.js, which is what actually decides.
//
// WHO may downgrade whom is unchanged from the fixed map this replaced. Only
// the TARGET is a choice now, drawn from what the caller may assign anyway, so
// the choice can never hand out a role they could not otherwise create.
export const DOWNGRADABLE = {
  dealer: ['dealer'],
  admin: ['dealer', 'reseller', 'support', 'finance'],
  superadmin: ['dealer', 'admin', 'reseller', 'support', 'finance'],
};

export const ROLE_RANK = { customer: 0, dealer: 1, reseller: 1, support: 1, finance: 1, admin: 2, superadmin: 3 };

export function downgradeTargetsFor(callerRole, targetRole) {
  const perms = ROLE_PERMISSIONS[callerRole];
  const mayDowngrade = DOWNGRADABLE[callerRole] || [];
  const targetRank = ROLE_RANK[targetRole];
  if (!perms || targetRank == null || !mayDowngrade.includes(targetRole)) return [];
  const assignable = new Set([...(perms.canUpgradeTo || []), 'customer']);
  return [...assignable]
    .filter((r) => r !== targetRole && ROLE_RANK[r] != null && ROLE_RANK[r] <= targetRank)
    .sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a] || a.localeCompare(b));
}

export function canManageUsers(role) { return !!ROLE_PERMISSIONS[role]; }

const DIRECTORY_PAGE_SIZE = 500;
const DIRECTORY_REFRESH_MS = 30000;
const LOG_DIRECTORY_REFRESH_MS = 60000;

async function loadAllDirectoryPages(type, stoppedRef) {
  const fn = httpsCallable(functions, 'listUserDirectory');
  const results = [];
  let cursor = null;

  do {
    if (stoppedRef()) return null;

    const { data } = await fn({
      type,
      pageSize: DIRECTORY_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });

    const page = Array.isArray(data?.results) ? data.results : [];
    results.push(...page);

    cursor = data?.hasMore && data?.nextPageCursor
      ? data.nextPageCursor
      : null;
  } while (cursor);

  return results;
}

function subscribeDirectory(type, onUpdate, onError, refreshMs = DIRECTORY_REFRESH_MS, transform = (list) => list) {
  let stopped = false;
  let loading = false;

  const load = async () => {
    if (stopped || loading) return;
    loading = true;
    try {
      const list = await loadAllDirectoryPages(type, () => stopped);
      if (!stopped && list) onUpdate(transform(list));
    } catch (err) {
      if (!stopped) onError?.(err);
    } finally {
      loading = false;
    }
  };

  load();
  const timer = setInterval(load, refreshMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export function subscribeAllUsers(onUpdate, onError) {
  return subscribeDirectory('all', onUpdate, onError, LOG_DIRECTORY_REFRESH_MS);
}

export function subscribeDealers(callback, onError) {
  return subscribeDirectory(
    'dealers',
    callback,
    onError,
    DIRECTORY_REFRESH_MS,
    (list) => list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  );
}

export function subscribeResellers(callback, onError) {
  return subscribeDirectory(
    'resellers',
    callback,
    onError,
    DIRECTORY_REFRESH_MS,
    (list) => list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  );
}

export function subscribeManageableUsers(role, dealerScope, onUpdate, onError) {
  if (role === 'dealer') {
    if (!dealerScope) {
      onUpdate([]);
      return () => {};
    }

    return subscribeManagedUsers(
      'dealer',
      onUpdate,
      onError,
    );
  }

  if (role === 'superadmin' || role === 'admin') {
    return subscribeDirectory('managed', onUpdate, onError);
  }

  onUpdate([]);
  return () => {};
}

function subscribeManagedUsers(role, onUpdate, onError) {
  let stopped = false;
  let loading = false;

  const fn = httpsCallable(functions, 'listManagedUsers');

  const load = async () => {
    if (stopped || loading) return;
    loading = true;

    try {
      const results = [];
      let cursor = null;

      do {
        if (stopped) return;

        const { data } = await fn({
          pageSize: DIRECTORY_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        });

        const page = Array.isArray(data?.results) ? data.results : [];
        results.push(...page);

        cursor = data?.hasMore && data?.nextPageCursor
          ? data.nextPageCursor
          : null;
      } while (cursor);

      if (!stopped) onUpdate(results);
    } catch (err) {
      if (!stopped) onError?.(err);
    } finally {
      loading = false;
    }
  };

  load();
  const timer = setInterval(load, DIRECTORY_REFRESH_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
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

export async function downgradeUserRole({ targetUid, newRole }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'downgradeRole', targetUid, newRole });
  return data;
}

export async function suspendUser({ targetUid, suspended }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'suspend', targetUid, suspended });
  return data;
}

export async function deleteManagedUser({ targetUid }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'delete', targetUid });
  return data;
}

export function subscribeUnassignedCustomers(onUpdate, onError) {
  return subscribeDirectory('unassigned', onUpdate, onError);
}

export async function assignDealer({ targetUid, dealerId }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'setDealer', targetUid, dealerId });
  return data;
}

export async function assignReseller({ targetUid, resellerId }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'setReseller', targetUid, resellerId });
  return data;
}

/**
 * Dashboard totals, counted on the server.
 *
 * getCountFromServer returns a single number per query rather than the
 * documents, so this stays compatible with the directory pagination above: no
 * unbounded client read, and the whole users collection is never shipped to a
 * device to be counted with .length.
 */
export async function fetchUserStats({ since = {} } = {}) {
  const users = collection(db, 'users');
  const countOf = async (...constraints) =>
    (await getCountFromServer(constraints.length ? query(users, ...constraints) : users)).data().count;
  const [total, newToday, newThisWeek] = await Promise.all([
    countOf(),
    since.today ? countOf(where('createdAt', '>=', since.today)) : Promise.resolve(0),
    since.weekAgo ? countOf(where('createdAt', '>=', since.weekAgo)) : Promise.resolve(0),
  ]);
  return { total, newToday, newThisWeek };
}
