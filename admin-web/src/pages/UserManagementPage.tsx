import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  ALL_ROLES,
  assignableRoles,
  canEditTarget,
  fetchUsersPage,
  filterBySearch,
  updateUserDisabled,
  updateUserRole,
  type AdminUserRow,
  type UserRole,
} from '../services/userManagementService';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

const ROLE_STYLES: Record<UserRole, string> = {
  user: 'bg-black/5 text-[var(--color-ink-soft)]',
  dealer: 'bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]',
  reseller: 'bg-[var(--color-warning)]/15 text-[#8a6d00]',
  admin: 'bg-[var(--color-primary)]/10 text-[var(--color-primary-dark)]',
  superadmin: 'bg-[var(--color-navy)]/10 text-[var(--color-navy)]',
};

export default function UserManagementPage() {
  const { profile } = useAuth();
  const actingRole = profile!.role;

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [savingUid, setSavingUid] = useState<string | null>(null);

  async function loadFirstPage(filter: UserRole | 'all') {
    setLoading(true);
    setError(null);
    try {
      const { rows: page, nextCursor } = await fetchUsersPage({ roleFilter: filter });
      setRows(page);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
    } catch (err) {
      console.error(err);
      setError('Could not load users. Check Firestore rules / connection.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFirstPage(roleFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    try {
      const { rows: page, nextCursor } = await fetchUsersPage({ roleFilter, cursor });
      setRows((prev) => [...prev, ...page]);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
    } catch (err) {
      console.error(err);
      setError('Could not load more users.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(uid: string, newRole: UserRole) {
    setSavingUid(uid);
    try {
      await updateUserRole(uid, newRole);
      setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, role: newRole } : r)));
      setEditingUid(null);
    } catch (err) {
      console.error(err);
      setError('Role update failed — check your permissions in Firestore rules.');
    } finally {
      setSavingUid(null);
    }
  }

  async function handleToggleDisabled(row: AdminUserRow) {
    setSavingUid(row.uid);
    try {
      await updateUserDisabled(row.uid, !row.disabled);
      setRows((prev) =>
        prev.map((r) => (r.uid === row.uid ? { ...r, disabled: !r.disabled } : r))
      );
    } catch (err) {
      console.error(err);
      setError('Could not update account status.');
    } finally {
      setSavingUid(null);
    }
  }

  const visibleRows = filterBySearch(rows, search);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            View accounts, change roles, and enable/disable access.
          </p>
        </div>

        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-64 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          >
            <option value="all">All roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Contact</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const editable = canEditTarget(actingRole, row.role);
              const isEditing = editingUid === row.uid;
              const isSaving = savingUid === row.uid;

              return (
                <tr key={row.uid} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-5 py-3 font-medium">{row.name}</td>
                  <td className="px-5 py-3 text-[var(--color-ink-soft)]">
                    <div>{row.email ?? '—'}</div>
                    <div className="text-xs">{row.phone ?? ''}</div>
                  </td>
                  <td className="px-5 py-3">
                    {isEditing ? (
                      <select
                        autoFocus
                        defaultValue={row.role}
                        disabled={isSaving}
                        onChange={(e) => handleRoleChange(row.uid, e.target.value as UserRole)}
                        onBlur={() => setEditingUid(null)}
                        className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1 text-xs"
                      >
                        {assignableRoles(actingRole)
                          .concat(row.role) // always allow keeping current value in the list
                          .filter((r, i, arr) => arr.indexOf(r) === i)
                          .map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${ROLE_STYLES[row.role]}`}
                      >
                        {row.role}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {row.disabled ? (
                      <span className="rounded-full bg-[var(--color-danger)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-danger)]">
                        Disabled
                      </span>
                    ) : (
                      <span className="rounded-full bg-[var(--color-success)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-success)]">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {editable ? (
                      <div className="inline-flex gap-3">
                        {!isEditing && (
                          <button
                            onClick={() => setEditingUid(row.uid)}
                            className="text-xs font-semibold text-[var(--color-primary-dark)] hover:underline"
                          >
                            Change role
                          </button>
                        )}
                        <button
                          disabled={isSaving}
                          onClick={() => handleToggleDisabled(row)}
                          className="text-xs font-semibold text-[var(--color-danger)] hover:underline disabled:opacity-40"
                        >
                          {row.disabled ? 'Enable' : 'Disable'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--color-ink-soft)]/50">
                        No permission
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-[var(--color-ink-soft)]">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-[var(--color-ink-soft)]">
          {loading ? 'Loading…' : `Showing ${visibleRows.length} of ${rows.length} loaded`}
        </p>
        {hasMore && !search && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-lg border border-[var(--color-line)] bg-white px-4 py-2 text-xs font-semibold hover:border-[var(--color-primary)] disabled:opacity-50"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
