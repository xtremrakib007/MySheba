import { useEffect, useState } from 'react';
import {
  fetchActiveDeviceSessions,
  forceLogout,
  type DeviceSession,
} from '../services/superadminService';

export default function DeviceSessionsPage() {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSessions(await fetchActiveDeviceSessions());
    } catch (err) {
      console.error(err);
      setError(`Could not load active sessions. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleForceLogout(session: DeviceSession) {
    setBusyUid(session.uid);
    setError(null);
    try {
      await forceLogout(session.uid);
      setSessions((prev) => prev.filter((s) => s.uid !== session.uid));
    } catch (err) {
      console.error(err);
      setError('Could not sign this device out.');
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Device Sessions</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        MySheba only allows one active device per account, so this lists accounts currently
        signed in and where. Force sign-out clears that device's session immediately - the
        app's own listener signs it out on its next connection. Superadmin only.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : sessions.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">No accounts currently signed in.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Last active</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.uid} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-5 py-3 font-medium">{s.userName}</td>
                  <td className="px-5 py-3 capitalize">{s.role}</td>
                  <td className="px-5 py-3 text-[var(--color-ink-soft)]">
                    {s.lastActiveAt ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      disabled={busyUid === s.uid}
                      onClick={() => handleForceLogout(s)}
                      className="text-xs font-semibold text-[var(--color-danger)] hover:underline disabled:opacity-40"
                    >
                      Force sign out
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
