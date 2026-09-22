import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, KeyRound, RotateCcw, Search, UserCog } from 'lucide-react';
import {
  BUILT_IN_DEFAULTS,
  CAPABILITIES,
  CAPABILITY_INFO,
  CONFIGURABLE_ROLES,
  computeCapabilities,
  fetchAccessChanges,
  fetchStaff,
  saveRoleDefaults,
  saveUserOverride,
  subscribeOverride,
  subscribeRoleDefaults,
  type AccessChange,
  type AccessOverride,
  type Capability,
  type ConfigurableRole,
  type RoleDefaults,
  type StaffMember,
} from '../services/accessControlService';
import { ROLE_LABELS } from '../routes/navConfig';

type Mode = 'default' | 'grant' | 'revoke';

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

function RoleDefaultsRow({ role, current, onSaved }: { role: ConfigurableRole; current: Capability[]; onSaved: (msg: string) => void }) {
  const [draft, setDraft] = useState<Capability[]>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(current); }, [current]);
  const dirty = !same(draft, current);
  const isBuiltIn = same(current, BUILT_IN_DEFAULTS[role]);

  const toggle = (cap: Capability) =>
    setDraft((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : CAPABILITIES.filter((c) => c === cap || prev.includes(c))));

  async function save(next: Capability[]) {
    setSaving(true);
    setError(null);
    try {
      await saveRoleDefaults(role, next);
      onSaved(`${ROLE_LABELS[role]} defaults saved. Everyone with that role has the new access now.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-[var(--color-line)] last:border-0 align-top">
      <td className="px-3 py-3">
        <p className="font-semibold">{ROLE_LABELS[role]}</p>
        <p className="text-[11px] text-[var(--color-ink-soft)]">{isBuiltIn ? 'Role sheet defaults' : 'Customised'}</p>
        {error && <p className="mt-1 text-[11px] text-[var(--color-danger)]">{error}</p>}
      </td>
      {CAPABILITIES.map((cap) => (
        <td key={cap} className="px-3 py-3 text-center">
          <input type="checkbox" checked={draft.includes(cap)} onChange={() => toggle(cap)} className="h-4 w-4 accent-[var(--color-primary)]" aria-label={`${ROLE_LABELS[role]} ${CAPABILITY_INFO[cap].label}`} />
        </td>
      ))}
      <td className="px-3 py-3 text-right">
        <div className="inline-flex gap-2">
          {!isBuiltIn && !dirty && (
            <button disabled={saving} onClick={() => void save(BUILT_IN_DEFAULTS[role])} title="Back to the role sheet defaults" className="rounded-lg border border-[var(--color-line)] p-1.5 text-[var(--color-ink-soft)] disabled:opacity-40">
              <RotateCcw size={14} />
            </button>
          )}
          <button disabled={!dirty || saving} onClick={() => void save(draft)} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </td>
    </tr>
  );
}

function OverrideEditor({ member, defaults, onSaved }: { member: StaffMember; defaults: RoleDefaults; onSaved: (msg: string) => void }) {
  const [override, setOverride] = useState<AccessOverride>({ grant: [], revoke: [] });
  const [draft, setDraft] = useState<AccessOverride>({ grant: [], revoke: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeOverride(member.uid, (o) => { setOverride(o); setDraft(o); }, (e) => setError(e.message)), [member.uid]);

  const modeOf = (cap: Capability): Mode => (draft.grant.includes(cap) ? 'grant' : draft.revoke.includes(cap) ? 'revoke' : 'default');
  const setMode = (cap: Capability, mode: Mode) => setDraft((prev) => ({
    grant: mode === 'grant' ? [...prev.grant.filter((c) => c !== cap), cap] : prev.grant.filter((c) => c !== cap),
    revoke: mode === 'revoke' ? [...prev.revoke.filter((c) => c !== cap), cap] : prev.revoke.filter((c) => c !== cap),
  }));

  const roleDefault = defaults[member.role];
  const effective = computeCapabilities(member.role, defaults, draft);
  const dirty = !same(draft.grant, override.grant) || !same(draft.revoke, override.revoke);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveUserOverride(member.uid, draft);
      onSaved(`Access for ${member.name} saved. It applies to their next action.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{member.name}</p>
          <p className="text-xs text-[var(--color-ink-soft)]">{ROLE_LABELS[member.role]}{member.email ? ` · ${member.email}` : ''}</p>
        </div>
        <button disabled={!dirty || saving} onClick={() => void save()} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
          {saving ? 'Saving…' : 'Save access'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}

      <div className="mt-4 space-y-2">
        {CAPABILITIES.map((cap) => {
          const mode = modeOf(cap);
          const byDefault = roleDefault.includes(cap);
          const on = effective.includes(cap);
          return (
            <div key={cap} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] p-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-2 w-2 rounded-full ${on ? 'bg-[var(--color-success)]' : 'bg-black/15'}`} />
                  {CAPABILITY_INFO[cap].label}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--color-ink-soft)]">{CAPABILITY_INFO[cap].description}</p>
              </div>
              <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-line)] text-[11px] font-semibold">
                {(['default', 'grant', 'revoke'] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(cap, m)}
                    className={`px-2.5 py-1.5 ${mode === m
                      ? m === 'grant' ? 'bg-[var(--color-success)] text-white' : m === 'revoke' ? 'bg-[var(--color-danger)] text-white' : 'bg-[var(--color-primary)] text-white'
                      : 'bg-white text-[var(--color-ink-soft)]'}`}
                  >
                    {m === 'default' ? `Role default (${byDefault ? 'on' : 'off'})` : m === 'grant' ? 'Grant' : 'Restrict'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function describeChange(change: AccessChange, names: Map<string, string>): string {
  const d = change.details as { role?: string; before?: unknown; after?: unknown };
  const list = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join(', ') : 'nothing') : '');
  if (change.action === 'access_role_defaults_changed') {
    return `${ROLE_LABELS[d.role as ConfigurableRole] ?? d.role} defaults: ${list(d.before)} → ${list(d.after)}`;
  }
  const after = (d.after ?? {}) as { grant?: string[]; revoke?: string[] };
  const who = change.targetUid ? names.get(change.targetUid) ?? change.targetUid : 'someone';
  const parts = [after.grant?.length ? `granted ${after.grant.join(', ')}` : '', after.revoke?.length ? `restricted ${after.revoke.join(', ')}` : ''].filter(Boolean);
  return `${who}: ${parts.length ? parts.join('; ') : 'back to role defaults'}`;
}

export default function AccessControlPage() {
  const [defaults, setDefaults] = useState<RoleDefaults | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [search, setSearch] = useState('');
  const [changes, setChanges] = useState<AccessChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => subscribeRoleDefaults(setDefaults, (e) => setError(e.message)), []);

  const loadChanges = useCallback(async () => {
    try { setChanges(await fetchAccessChanges()); } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    fetchStaff().then(setStaff).catch((err) => { console.error(err); setError('Could not load staff accounts.'); });
    void loadChanges();
  }, [loadChanges]);

  const onSaved = (msg: string) => { setNotice(msg); void loadChanges(); };
  const names = useMemo(() => new Map(staff.map((m) => [m.uid, m.name])), [staff]);
  const visibleStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? staff.filter((m) => `${m.name} ${m.email ?? ''} ${m.role}`.toLowerCase().includes(q)) : staff;
  }, [staff, search]);

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-[var(--color-primary)]/10 p-3 text-[var(--color-primary)]"><KeyRound size={20} /></span>
        <div>
          <h1 className="text-2xl font-bold">Access Control</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            What each staff role can do by default, and per-person exceptions on top. Changes take effect immediately — in the panel, the app and the server — and every change is written to the audit log.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}
      {notice && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 px-4 py-3 text-sm text-[var(--color-success)]">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />{notice}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="text-base font-bold">Role defaults</h2>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Superadmins always have everything. Dealers, resellers and customers only ever see their own assigned work, so they are not listed.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                <th className="px-3 py-2 font-semibold">Role</th>
                {CAPABILITIES.map((cap) => (
                  <th key={cap} className="px-3 py-2 text-center font-semibold" title={CAPABILITY_INFO[cap].description}>{CAPABILITY_INFO[cap].label}</th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {defaults
                ? CONFIGURABLE_ROLES.map((role) => <RoleDefaultsRow key={role} role={role} current={defaults[role]} onSaved={onSaved} />)
                : <tr><td colSpan={CAPABILITIES.length + 2} className="px-3 py-6 text-center text-sm text-[var(--color-ink-soft)]">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4">
          <h2 className="flex items-center gap-2 text-base font-bold"><UserCog size={17} /> Staff</h2>
          <div className="relative mt-3">
            <Search size={15} className="absolute left-3 top-2.5 text-[var(--color-ink-soft)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or role" className="w-full rounded-lg border border-[var(--color-line)] py-2 pl-9 pr-3 text-sm" />
          </div>
          <div className="mt-3 max-h-[420px] space-y-1 overflow-y-auto">
            {visibleStaff.map((m) => (
              <button key={m.uid} onClick={() => setSelected(m)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected?.uid === m.uid ? 'bg-[var(--color-primary)]/10 font-semibold' : 'hover:bg-black/[0.03]'}`}>
                <span className="block truncate">{m.name}</span>
                <span className="block text-[11px] text-[var(--color-ink-soft)]">{ROLE_LABELS[m.role]}</span>
              </button>
            ))}
            {!visibleStaff.length && <p className="px-3 py-6 text-center text-xs text-[var(--color-ink-soft)]">No staff accounts.</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          {selected && defaults
            ? <OverrideEditor key={selected.uid} member={selected} defaults={defaults} onSaved={onSaved} />
            : <p className="py-16 text-center text-sm text-[var(--color-ink-soft)]">Pick a staff member to grant or restrict access for them alone.</p>}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="flex items-center gap-2 text-base font-bold"><History size={17} /> Recent access changes</h2>
        <div className="mt-3 divide-y divide-[var(--color-line)]">
          {changes.map((c) => (
            <div key={c.id} className="flex flex-wrap justify-between gap-2 py-2.5 text-sm">
              <span>{describeChange(c, names)}</span>
              <span className="text-xs text-[var(--color-ink-soft)]">{c.createdAt ?? ''}{c.performedBy ? ` · by ${names.get(c.performedBy) ?? 'superadmin'}` : ''}</span>
            </div>
          ))}
          {!changes.length && <p className="py-6 text-center text-xs text-[var(--color-ink-soft)]">No access changes recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
