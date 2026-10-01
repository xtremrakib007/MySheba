// Client side of user management. Permission checks remain server-side.
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot, limit, getCountFromServer } from 'firebase/firestore';
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

// Every list below was an UNBOUNDED live listener over users/. Each one
// streamed the whole collection and re-delivered on any write to any matching
// profile, so read cost, memory and render time all grew with the user base
// and a single admin screen could pull the entire user table.
//
// The cap bounds that. It is deliberately generous - these are management
// screens, not feeds - and callers are told when it bites so a partial list is
// never presented as a complete one.
//
// Why no orderBy: ordering would make the cap mean "the newest N" instead of
// an arbitrary N, but where('role', ...) + orderBy('createdAt') needs a
// composite index that does not exist, and the query throws without it.
// firestore.indexes.json now ships (role, createdAt) so that switch is a
// one-line change once the index is deployed - deploy the index first, then
// the query, never the other way round.
export const USER_LIST_CAP = 500;

/** How a bounded list reports itself to its caller. */
const listMeta = (snap) => ({ truncated: snap.size >= USER_LIST_CAP, cap: USER_LIST_CAP, shown: snap.size });

// Counts, not documents.
//
// This was subscribeAllUsers: a live listener over every user profile whose
// only consumer was AdminAnalyticsScreen, which used it for three numbers -
// total, new today, new this week. Streaming the entire collection to call
// .length on it is the most expensive possible way to count, and it is the one
// query here that must NOT be capped, because a cap would silently pin
// "Total Users" at the cap and report it as fact.
//
// getCountFromServer returns the count without transferring the documents, and
// analyticsService.js already uses it the same way.
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

export function subscribeDealers(callback, onError) {
  const q = query(collection(db, 'users'), where('role', '==', 'dealer'), limit(USER_LIST_CAP));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, name: d.data().name || '', phone: d.data().phone || '', role: 'dealer', userId: d.data().userId || '' }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    callback(list, listMeta(snap));
  }, onError);
}

export function subscribeResellers(callback, onError) {
  const q = query(collection(db, 'users'), where('role', '==', 'reseller'), limit(USER_LIST_CAP));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, name: d.data().name || '', phone: d.data().phone || '', role: 'reseller', userId: d.data().userId || '' }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    callback(list, listMeta(snap));
  }, onError);
}

export function subscribeManageableUsers(role, dealerScope, onUpdate, onError) {
  if (role === 'dealer') {
    if (!dealerScope) { onUpdate([]); return () => {}; }
    const fn = httpsCallable(functions, 'listManagedUsers');
    let stopped = false;
    const load = async () => {
      try {
        const { data } = await fn({});
        if (!stopped) onUpdate(Array.isArray(data?.results) ? data.results : []);
      } catch (err) {
        if (!stopped) onError?.(err);
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { stopped = true; clearInterval(timer); };
  }

  let q;
  if (role === 'superadmin') {
    q = query(collection(db, 'users'), where('role', 'in', ['admin', 'dealer', 'reseller', 'customer']), limit(USER_LIST_CAP));
  } else if (role === 'admin') {
    q = query(collection(db, 'users'), where('role', 'in', ['dealer', 'reseller', 'customer']), limit(USER_LIST_CAP));
  } else {
    onUpdate([]);
    return () => {};
  }

  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    onUpdate(list, listMeta(snap));
  }, onError);
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
  const q = query(collection(db, 'users'), where('role', '==', 'customer'), limit(USER_LIST_CAP));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => !u.dealerId);
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    onUpdate(list, listMeta(snap));
  }, onError);
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
