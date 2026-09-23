import { useEffect, useState } from 'react';
import {
  FEATURE_LABELS,
  fetchUsersPage,
  filterBySearch,
  updateUserFeatures,
  type AdminUserRow,
  type FeatureAccess,
} from '../services/userManagementService';

const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as (keyof FeatureAccess)[];

export default function FeatureAccessPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { rows: page } = await fetchUsersPage({ roleFilter: 'customer' });
        setRows(page);
      } catch (err) {
        console.error(err);
        setError('Could not load users.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleFeature(row: AdminUserRow, key: keyof FeatureAccess) {
    const savingKeyId = `${row.uid}:${key}`;
    setSavingKey(savingKeyId);
    const nextFeatures: FeatureAccess = { ...row.features, [key]: !row.features[key] };
    try {
      await updateUserFeatures(row.uid, nextFeatures);
      setRows((prev) =>
        prev.map((r) => (r.uid === row.uid ? { ...r, features: nextFeatures } : r))
      );
    } catch (err) {
      console.error(err);
      setError('Could not update feature access.');
    } finally {
      setSavingKey(null);
    }
  }

  const visibleRows = filterBySearch(rows, search);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Feature Access</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Turn individual modules on or off per customer account.
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone…"
          className="w-64 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
              <th className="px-5 py-3 font-semibold">Name</th>
              {FEATURE_KEYS.map((k) => (
                <th key={k} className="px-4 py-3 text-center font-semibold">
                  {FEATURE_LABELS[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.uid} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-5 py-3 font-medium">
                  {row.name}
                  <div className="text-xs font-normal text-[var(--color-ink-soft)]">
                    {row.phone ?? row.email ?? ''}
                  </div>
                </td>
                {FEATURE_KEYS.map((k) => {
                  const busy = savingKey === `${row.uid}:${k}`;
                  const on = row.features[k];
                  return (
                    <td key={k} className="px-4 py-3 text-center">
                      <button
                        disabled={busy}
                        onClick={() => toggleFeature(row, k)}
                        aria-pressed={on}
                        className={`h-5 w-9 rounded-full transition disabled:opacity-40 ${
                          on ? 'bg-[var(--color-primary)]' : 'bg-black/15'
                        }`}
                      >
                        <span
                          className={`block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition ${
                            on ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}

            {!loading && visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={FEATURE_KEYS.length + 1}
                  className="px-5 py-10 text-center text-sm text-[var(--color-ink-soft)]"
                >
                  No customer accounts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
        {loading ? 'Loading…' : `${visibleRows.length} customer account(s)`} · showing customer
        (role: user) accounts only — dealer/reseller/admin accounts aren't gated by these toggles.
      </p>
    </div>
  );
}
