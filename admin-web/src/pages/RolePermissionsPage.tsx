import { useMemo } from 'react';
import { ShieldCheck, Lock, Users, SlidersHorizontal, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FEATURE_DEFS, ROLE_LABEL, subscribeFeatureAccess, type FeatureAccessMap } from '../services/toolAccessService';
import { useEffect, useState } from 'react';

const ROLE_ORDER = ['dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin'] as const;
const ROLE_COLORS: Record<string, string> = {
  support: 'bg-cyan-50 text-cyan-700',
  finance: 'bg-violet-50 text-violet-700',
  dealer: 'bg-blue-50 text-blue-700',
  reseller: 'bg-purple-50 text-purple-700',
  admin: 'bg-emerald-50 text-emerald-700',
  superadmin: 'bg-slate-900 text-white',
};

export default function RolePermissionsPage() {
  const { profile } = useAuth();
  const [access, setAccess] = useState<FeatureAccessMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeFeatureAccess(setAccess, (e) => setError(e.message)), []);

  const matrix = useMemo(() => {
    return FEATURE_DEFS.map((feature) => ({
      ...feature,
      roles: ROLE_ORDER.map((role) => role === 'superadmin' || (access?.[feature.key] ?? []).includes(role)),
    }));
  }, [access]);

  if (profile?.role !== 'superadmin') {
    return <div><h1 className="text-2xl font-bold">Role & Permissions</h1><div className="mt-6 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center"><Lock className="mx-auto" size={30}/><p className="mt-3 text-sm text-[var(--color-ink-soft)]">Superadmin only.</p></div></div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Role & Permission Center</h1><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Review the current staff access model and manage tool-level permissions safely.</p></div>
        <a href="/tool-access" className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"><SlidersHorizontal size={16}/> Manage Tool Access <ExternalLink size={14}/></a>
      </div>

      {error && <div className="mt-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {ROLE_ORDER.map((role) => <div key={role} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4"><div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${ROLE_COLORS[role]}`}>{role === 'superadmin' ? 'Superadmin' : ROLE_LABEL[role as keyof typeof ROLE_LABEL]}</div><p className="mt-3 text-xs text-[var(--color-ink-soft)]">{role === 'superadmin' ? 'Full administrative access.' : role === 'admin' ? 'Administrative tools controlled by Tool Access.' : 'Operational access controlled by Tool Access.'}</p></div>)}
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-[var(--color-primary)]/10 p-3 text-[var(--color-primary)]"><ShieldCheck size={20}/></div><div><h2 className="font-bold">Current tool permission matrix</h2><p className="text-xs text-[var(--color-ink-soft)]">Live from the shared feature-access settings document.</p></div></div>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] border-separate border-spacing-y-2"><thead><tr><th className="px-3 text-left text-xs text-[var(--color-ink-soft)]">Tool</th>{ROLE_ORDER.map((role) => <th key={role} className="px-3 text-center text-xs text-[var(--color-ink-soft)]">{role === 'superadmin' ? 'Superadmin' : ROLE_LABEL[role as keyof typeof ROLE_LABEL]}</th>)}</tr></thead><tbody>{matrix.map((row) => <tr key={row.key}><td className="rounded-l-xl border border-r-0 border-[var(--color-line)] px-3 py-3 font-semibold">{row.icon} {row.name}</td>{row.roles.map((enabled, i) => <td key={ROLE_ORDER[i]} className={`border border-l-0 border-[var(--color-line)] px-3 py-3 text-center ${i === row.roles.length - 1 ? 'rounded-r-xl' : ''}`}><span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${enabled ? 'bg-[var(--color-primary)] text-white' : 'bg-slate-100 text-slate-400'}`}>{enabled ? '✓' : '—'}</span></td>)}</tr>)}</tbody></table></div>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"><Users className="text-[var(--color-primary)]" size={20}/><h3 className="mt-3 font-bold">Role hierarchy</h3><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Superadmin remains the protected top tier. Staff tool access can be adjusted without changing customer module access.</p></div><div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"><Lock className="text-[var(--color-secondary)]" size={20}/><h3 className="mt-3 font-bold">Safety boundary</h3><p className="mt-1 text-sm text-[var(--color-ink-soft)]">This center is an access overview; the existing Tool Access screen is the control surface and remains Superadmin-only.</p></div></div>
    </div>
  );
}
