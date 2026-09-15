import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { subscribeAllBusinessProfiles, type BusinessProfile } from '../services/businessProfileService';
import { fetchAllMarketplaceReports, type MarketplaceReport } from '../services/moderationService';

export default function MarketplaceOperationsPage() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<Record<string, BusinessProfile>>({});
  const [reports, setReports] = useState<MarketplaceReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadReports() {
    try {
      setReports(await fetchAllMarketplaceReports());
    } catch (err) {
      console.error(err);
      setError('Could not load marketplace reports.');
    }
  }

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeAllBusinessProfiles(setProfiles, (err) => {
      console.error(err);
      setError('Could not load business profiles.');
      setLoading(false);
    });
    loadReports().finally(() => setLoading(false));
    return unsub;
  }, []);

  const metrics = useMemo(() => {
    const all = Object.values(profiles);
    return {
      businessProfiles: all.filter((p) => p.isBusinessProfile).length,
      openReports: reports.filter((r) => r.status !== 'resolved').length,
      resolvedReports: reports.filter((r) => r.status === 'resolved').length,
      totalReports: reports.length,
    };
  }, [profiles, reports]);

  const reportKinds = useMemo(() => {
    const counts = new Map<string, number>();
    reports.filter((r) => r.status !== 'resolved').forEach((r) => counts.set(r.kindLabel, (counts.get(r.kindLabel) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [reports]);

  const modules = [
    ['Business Profiles', 'Verified business/profile badge management', '/business-profiles'],
    ['Moderation', 'Reported marketplace content and enforcement', '/marketplace-moderation'],
    ['Categories', 'Manage marketplace category lists', '/config/categories'],
    ['Analytics', 'Marketplace activity and platform performance', '/analytics'],
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] p-6 text-white shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/75">Marketplace Operations</p>
        <h1 className="mt-1 text-2xl font-bold">Marketplace & Business Operations Center</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/85">One operational view for business profiles, reported marketplace content, categories and marketplace health.</p>
        <p className="mt-3 text-xs text-white/70">Signed in as {profile?.name || profile?.email || 'administrator'}</p>
      </div>

      {error && <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Business profiles', metrics.businessProfiles, 'Granted profile badges'],
          ['Open reports', metrics.openReports, 'Content needing review'],
          ['Resolved reports', metrics.resolvedReports, 'Completed moderation'],
          ['Total reports', metrics.totalReports, 'Loaded report history'],
        ].map(([label, value, note]) => (
          <div key={String(label)} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{label}</p>
            <p className="mt-2 text-2xl font-bold">{loading ? '…' : value}</p>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Marketplace Health</h2><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Open moderation workload by report type.</p></div><Link to="/marketplace-moderation" className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white">Review Reports</Link></div>
          <div className="mt-5 space-y-3">
            {reportKinds.map(([kind, count]) => <div key={kind}><div className="flex justify-between text-sm"><span>{kind}</span><b>{count}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${Math.min(100, count / Math.max(1, metrics.openReports) * 100)}%` }} /></div></div>)}
            {reportKinds.length === 0 && <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">No open marketplace reports.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="font-bold">Operational Modules</h2>
          <div className="mt-4 space-y-2">
            {modules.map(([name, description, path]) => <Link key={path} to={path} className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><b>{name}</b><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{description}</p></Link>)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="font-bold">Recommended workflow</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Open reports → review target → hide, restore, delete or ban when appropriate. Business Profile grants remain a separate account-level control.</p>
      </div>
    </div>
  );
}
