import { useEffect, useMemo, useState } from 'react';
import {
  setBusinessProfileStatus,
  subscribeAllBusinessProfiles,
  subscribeAllUsersLite,
  type BusinessProfile,
  type UserLite,
} from '../services/businessProfileService';

export default function BusinessProfilesPage() {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [profiles, setProfiles] = useState<Record<string, BusinessProfile>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeAllUsersLite(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeAllBusinessProfiles(setProfiles, () => {});
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    // With no search, lead with everyone who already has a granted badge,
    // same "see current grants at a glance" ordering the mobile screen uses.
    const base = !term
      ? [...users].sort((a, b) => {
          const ag = profiles[a.uid]?.isBusinessProfile ? 1 : 0;
          const bg = profiles[b.uid]?.isBusinessProfile ? 1 : 0;
          return bg - ag;
        })
      : users.filter((u) => u.name.toLowerCase().includes(term) || u.phone.includes(term));
    return base.slice(0, 50);
  }, [users, profiles, search]);

  async function toggle(uid: string, granted: boolean) {
    setBusyUid(uid);
    setError(null);
    try {
      await setBusinessProfileStatus(uid, granted);
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Could not update this account.');
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Business Profiles</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Grant the Business Profile badge to a seller/property owner/service provider, or revoke it.
        No requests to review — just search and toggle.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or phone…"
        className="mt-4 w-full max-w-md rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
      />

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">No users match your search.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {filtered.map((u) => {
            const biz = profiles[u.uid];
            const granted = !!biz?.isBusinessProfile;
            const busy = busyUid === u.uid;
            return (
              <div
                key={u.uid}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-4"
              >
                <div>
                  <p className="font-semibold">{u.name || u.phone || u.uid}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {u.phone || '—'} · <span className="uppercase">{u.role}</span>
                    {biz?.businessName && ` · "${biz.businessName}"`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {granted && (
                    <span className="rounded-full bg-[var(--color-success)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
                      BUSINESS
                    </span>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => toggle(u.uid, !granted)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                      granted
                        ? 'border border-[var(--color-danger)]/40 text-[var(--color-danger)]'
                        : 'bg-[var(--color-primary)] text-white'
                    }`}
                  >
                    {granted ? 'Revoke' : 'Grant Business Profile'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
