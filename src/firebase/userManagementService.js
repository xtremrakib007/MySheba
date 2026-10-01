// Client side of user management. Permission checks remain server-side.
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { functions, db } from './config';

export const ROLE_PERMISSIONS = {
  dealer: { canCreate: ['customer'], canUpgradeTo: [] },
  admin: { canCreate: ['customer', 'dealer', 'reseller'], canUpgradeTo: ['dealer', 'reseller'] },
  superadmin: { canCreate: ['customer', 'dealer', 'admin', 'reseller'], canUpgradeTo: ['dealer', 'admin', 'reseller'] },
};

export const DOWNGRADE_PERMISSIONS = {
  dealer: { dealer: 'customer' },
  admin: { dealer: 'customer', reseller: 'customer' },
  superadmin: { dealer: 'customer', admin: 'dealer', reseller: 'customer' },
};

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

export async function downgradeUserRole({ targetUid }) {
  const fn = httpsCallable(functions, 'manageUser');
  const { data } = await fn({ action: 'downgradeRole', targetUid });
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
