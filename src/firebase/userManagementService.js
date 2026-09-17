// Client side of user management. Permission checks remain server-side.
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
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

export function subscribeAllUsers(onUpdate, onError) {
  const q = collection(db, 'users');
  return onSnapshot(q, (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export function subscribeDealers(callback, onError) {
  const q = query(collection(db, 'users'), where('role', '==', 'dealer'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, name: d.data().name || '', phone: d.data().phone || '', role: 'dealer', userId: d.data().userId || '' }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    callback(list);
  }, onError);
}

export function subscribeResellers(callback, onError) {
  const q = query(collection(db, 'users'), where('role', '==', 'reseller'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, name: d.data().name || '', phone: d.data().phone || '', role: 'reseller', userId: d.data().userId || '' }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    callback(list);
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
    q = query(collection(db, 'users'), where('role', 'in', ['admin', 'dealer', 'reseller', 'customer']));
  } else if (role === 'admin') {
    q = query(collection(db, 'users'), where('role', 'in', ['dealer', 'reseller', 'customer']));
  } else {
    onUpdate([]);
    return () => {};
  }

  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    onUpdate(list);
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
  const q = query(collection(db, 'users'), where('role', '==', 'customer'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => !u.dealerId);
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    onUpdate(list);
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
