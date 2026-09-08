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
} from '../services/toolAccessService';

export default function ToolAccessPage() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';

  const [access, setAccess] = useState<FeatureAccessMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeFeatureAccess(setAccess, (err) => setError(err.message));
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
      )}
    </div>
  );
}
