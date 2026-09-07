import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getDashboard,
  setErrorResolved,
  subscribeActivityLog,
  subscribeAuditLog,
  subscribeErrorLog,
  type AnalyticsDashboard,
  type LogEntry,
} from '../services/analyticsService';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <p className="text-3xl font-bold font-[var(--font-display)]">{value}</p>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{label}</p>
    </div>
  );
}

function Overview() {
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setData(await getDashboard());
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>;
  if (!data) return null;

  return (
    <div className="mt-6 space-y-8">
      <div>
        <h2 className="text-lg font-bold">Overview</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Registered users" value={data.users.total} />
          <StatCard label="Verified users" value={data.users.verified} />
          <StatCard label="Conversations" value={data.conversations} />
          <StatCard label="Open reports" value={data.reports.open} />
          <StatCard label="Avg. rating" value={data.reviews.avg > 0 ? data.reviews.avg.toFixed(1) : '—'} />
          <StatCard label="Total reviews" value={data.reviews.count} />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold">New Posts — Last 7 Days</h2>
        <div className="mt-3 flex items-end gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          {data.trend.map((t) => {
            const max = Math.max(1, ...data.trend.map((x) => x.count));
            return (
              <div key={t.label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-[var(--color-primary)]/70"
                  style={{ height: `${Math.max(4, (t.count / max) * 80)}px` }}
                />
                <span className="text-[10px] text-[var(--color-ink-soft)]">{t.count}</span>
                <span className="text-[10px] text-[var(--color-ink-soft)]">{t.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold">Marketplace Modules</h2>
        <div className="mt-3 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
          {data.modules.map((m) => (
            <div key={m.key} className="flex items-center justify-between px-5 py-3">
              <span>
                {m.icon} {m.label}
              </span>
              <span className="text-sm text-[var(--color-ink-soft)]">
                {m.active} active
                {m.closedLabel ? ` · ${m.closed} ${m.closedLabel.toLowerCase()}` : ''} · {m.total} total ·{' '}
                <span className="text-[var(--color-success)]">+{m.newThisWeek} this wk</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {data.topCategories.length > 0 && (
        <div>
          <h2 className="text-lg font-bold">Top Categories</h2>
          <div className="mt-3 divide-y divide-[var(--color-line)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
            {data.topCategories.map((c) => (
              <div key={c.category} className="flex items-center justify-between px-5 py-3">
                <span>{c.category}</span>
                <span className="text-sm text-[var(--color-ink-soft)]">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LogRow({ entry, resolvable, onResolve }: { entry: LogEntry; resolvable?: boolean; onResolve?: (resolved: boolean) => void }) {
  const { id, createdAt, ...rest } = entry;
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{String(rest.action ?? rest.context ?? id)}</p>
        <span className="text-xs text-[var(--color-ink-soft)]">{createdAt as string}</span>
      </div>
      {'message' in rest && <p className="mt-1 text-sm text-[var(--color-danger)]">{String(rest.message)}</p>}
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-xs text-[var(--color-ink-soft)]">
        {JSON.stringify(rest, null, 1)}
      </pre>
      {resolvable && (
        <button
          onClick={() => onResolve?.(!rest.resolved)}
          className={`mt-2 rounded-lg px-3 py-1 text-xs font-semibold ${
            rest.resolved
              ? 'border border-[var(--color-line)] text-[var(--color-ink-soft)]'
              : 'bg-[var(--color-success)] text-white'
          }`}
        >
          {rest.resolved ? 'Mark unresolved' : 'Mark resolved'}
        </button>
      )}
    </div>
  );
}

function ActivityLogs() {
  const [subtab, setSubtab] = useState<'activity' | 'errors' | 'audit'>('activity');
  const [activity, setActivity] = useState<LogEntry[]>([]);
  const [errors, setErrors] = useState<LogEntry[]>([]);
  const [audit, setAudit] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeActivityLog(setActivity, (err) => setError(err.message));
    return unsub;
  }, []);
  useEffect(() => {
    const unsub = subscribeErrorLog(setErrors, (err) => setError(err.message));
    return unsub;
  }, []);
  useEffect(() => {
    const unsub = subscribeAuditLog(setAudit, (err) => setError(err.message));
    return unsub;
  }, []);

  const list = subtab === 'activity' ? activity : subtab === 'errors' ? errors : audit;

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        {(['activity', 'errors', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              subtab === t ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-line)] text-[var(--color-ink-soft)]'
            }`}
          >
            {t === 'activity' ? '📈 Activity' : t === 'errors' ? '⚠️ Errors' : '🔒 Audit'}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {list.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Nothing here.</p>
        ) : (
          list.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              resolvable={subtab === 'errors'}
              onResolve={subtab === 'errors' ? (resolved) => setErrorResolved(entry.id, resolved) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';
  const [tab, setTab] = useState<'overview' | 'logs'>('overview');

  return (
    <div>
      <h1 className="text-2xl font-bold">Analytics</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Live platform metrics, computed from the same collections every other module writes to.
      </p>

      {isSuperadmin && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setTab('overview')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              tab === 'overview' ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-line)] text-[var(--color-ink-soft)]'
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              tab === 'logs' ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-line)] text-[var(--color-ink-soft)]'
            }`}
          >
            🗂️ Activity Logs
          </button>
        </div>
      )}

      {tab === 'overview' || !isSuperadmin ? <Overview /> : <ActivityLogs />}
    </div>
  );
}
