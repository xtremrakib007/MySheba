import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  FEATURE_DEFS,
  ROLE_LABEL,
  TOGGLEABLE_ROLES,
  setFeatureAccessForRole,
  subscribeFeatureAccess,
  type FeatureAccessMap,
  type FeatureKey,
  type ToggleableRole,
  setFeatureAccessForUser,
  canAccessUserFeature,
  STAFF_ROLES,
} from '../services/toolAccessService';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function ToolAccessPage() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';

  const [access, setAccess] = useState<FeatureAccessMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [users, setUsers] = useState<Array<{uid:string;name:string;role:string}>>([]);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    const unsub = subscribeFeatureAccess(setAccess, (err) => setError(err.message));
    getDocs(query(collection(db, 'users'), orderBy('name'))).then(snap => setUsers(snap.docs.map(d => ({ uid:d.id, name:d.data().name ?? d.data().displayName ?? '(no name)', role:d.data().role ?? 'customer' })))).catch(err => setError(err.message || 'Could not load users.'));
    return unsub;
  }, []);

  async function toggle(key: FeatureKey, role: ToggleableRole, enabled: boolean) {
    const cell = `${key}:${role}`;
    setBusyCell(cell);
    setError(null);
    try {
      await setFeatureAccessForRole(key, role, enabled);
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Could not update this permission.');
    } finally {
      setBusyCell(null);
    }
  }

  async function toggleUser(uid: string, key: FeatureKey, enabled: boolean) {
    const cell = `user:${uid}:${key}`;
    setBusyCell(cell); setError(null);
    try { await setFeatureAccessForUser(uid, key, enabled); }
    catch (err) { setError((err as Error).message || 'Could not update user permission.'); }
    finally { setBusyCell(null); }
  }

  const staffUsers = users.filter(u => (STAFF_ROLES as readonly string[]).includes(u.role) && `${u.name} ${u.role} ${u.uid}`.toLowerCase().includes(userSearch.trim().toLowerCase()));

  if (!isSuperadmin) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Tool Access</h1>
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">Superadmin only.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Tool Access</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Choose which roles can see and open each tool below. Customer features are the same for
        everyone and aren't listed here — superadmin always has full access.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {!access ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : (
        <>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[600px] border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-[var(--color-ink-soft)]"></th>
                {TOGGLEABLE_ROLES.map((role) => (
                  <th key={role} className="px-3 text-xs font-semibold text-[var(--color-ink-soft)]">
                    {ROLE_LABEL[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_DEFS.map((f) => (
                <tr key={f.key} className="rounded-2xl bg-[var(--color-card)]">
                  <td className="rounded-l-2xl border border-r-0 border-[var(--color-line)] px-4 py-3 font-semibold">
                    {f.icon} {f.name}
                  </td>
                  {TOGGLEABLE_ROLES.map((role, i) => {
                    const checked = access[f.key]?.includes(role) ?? false;
                    const busy = busyCell === `${f.key}:${role}`;
                    const isLast = i === TOGGLEABLE_ROLES.length - 1;
                    return (
                      <td
                        key={role}
                        className={`border border-l-0 border-[var(--color-line)] px-3 py-3 text-center ${
                          isLast ? 'rounded-r-2xl' : ''
                        }`}
                      >
                        <button
                          disabled={busy}
                          onClick={() => toggle(f.key, role, !checked)}
                          className={`h-6 w-6 rounded-md text-sm font-bold disabled:opacity-40 ${
                            checked
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'border border-[var(--color-line)] bg-white'
                          }`}
                        >
                          {checked ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4">
          <h2 className="text-lg font-bold">Individual user access</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Override tool access for a specific staff user. Superadmin always has full access.</p>
          <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search staff user…" className="mt-4 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm" />
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr><th className="p-2 text-left">User</th>{FEATURE_DEFS.map(f => <th key={f.key} className="p-2 text-center">{f.name}</th>)}</tr></thead><tbody>{staffUsers.map(u => <tr key={u.uid} className="border-t border-[var(--color-line)]"><td className="p-2"><b>{u.name}</b><div className="text-xs text-[var(--color-ink-soft)]">{u.role}</div></td>{FEATURE_DEFS.map(f => { const override = access.userOverrides?.[u.uid]?.[f.key]; const checked = typeof override === 'boolean' ? override : canAccessUserFeature(access, f.key, u.role, u.uid); const busy = busyCell === `user:${u.uid}:${f.key}`; return <td key={f.key} className="p-2 text-center"><button disabled={busy} onClick={() => toggleUser(u.uid, f.key, !checked)} className={`h-6 w-10 rounded-full ${checked ? 'bg-[var(--color-primary)]' : 'bg-black/15'} disabled:opacity-40`}>{checked ? '✓' : ''}</button></td>; })}</tr>)}</tbody></table></div>
        </div>
        </>
      )}
    </div>
  );
}
