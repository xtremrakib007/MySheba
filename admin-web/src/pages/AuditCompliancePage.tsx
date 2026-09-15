import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RefreshCw, Search, AlertTriangle, Activity, LockKeyhole } from 'lucide-react';
import { subscribeActivityLog, subscribeAuditLog, subscribeErrorLog, type LogEntry } from '../services/analyticsService';

type Tab = 'audit' | 'activity' | 'errors';

function text(v: unknown) { return v == null ? '' : String(v); }
function Row({ e }: { e: LogEntry }) {
  const { id, createdAt, ...rest } = e;
  const action = text(rest.action || rest.event || rest.context || rest.type || id);
  const actor = text(rest.userName || rest.email || rest.userId || rest.uid || 'System');
  return <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="truncate text-sm font-bold">{action}</p><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Actor: {actor}</p></div>
      <span className="shrink-0 text-xs text-[var(--color-ink-soft)]">{text(createdAt) || '—'}</span>
    </div>
    <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-[var(--color-secondary)]">View event details</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-[11px] text-[var(--color-ink-soft)]">{JSON.stringify(rest, null, 2)}</pre></details>
  </div>;
}

export default function AuditCompliancePage() {
  const [tab, setTab] = useState<Tab>('audit');
  const [audit, setAudit] = useState<LogEntry[]>([]), [activity, setActivity] = useState<LogEntry[]>([]), [errors, setErrors] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => { const e = (x: Error) => setError(x.message); const a = subscribeAuditLog(setAudit, e); const b = subscribeActivityLog(setActivity, e); const c = subscribeErrorLog(setErrors, e); return () => { a(); b(); c(); }; }, []);
  const source = tab === 'audit' ? audit : tab === 'activity' ? activity : errors;
  const rows = useMemo(() => { const q = filter.trim().toLowerCase(); return q ? source.filter(e => JSON.stringify(e).toLowerCase().includes(q)) : source; }, [source, filter]);
  const cards = [{ label: 'Audit events', value: audit.length, icon: LockKeyhole }, { label: 'Activity events', value: activity.length, icon: Activity }, { label: 'Client errors', value: errors.length, icon: AlertTriangle }];
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Audit & Compliance Center</h1><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Superadmin visibility into security, administrative and application events.</p></div><button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-semibold"><RefreshCw size={14}/> Refresh</button></div>
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">{cards.map(({label,value,icon:Icon}) => <div key={label} className="rounded-2xl border border-[var(--color-line)] bg-white p-5"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[var(--color-ink-soft)]">{label}</span><Icon size={18} className="text-[var(--color-primary)]"/></div><p className="mt-3 text-2xl font-extrabold">{value}</p><p className="mt-1 text-[10px] text-[var(--color-ink-soft)]">Latest 100 events</p></div>)}</div>
    <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-white p-4"><div className="flex flex-wrap gap-2">{(['audit','activity','errors'] as Tab[]).map(t => <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-2 text-xs font-bold ${tab === t ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-line)]'}`}>{t === 'audit' ? '🔒 Audit' : t === 'activity' ? '📈 Activity' : '⚠️ Errors'}</button>)}<label className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs"><Search size={14} className="absolute left-3 top-2.5 text-slate-400"/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter events..." className="w-full rounded-xl border border-[var(--color-line)] py-2 pl-9 pr-3 text-xs outline-none focus:border-[var(--color-primary)]"/></label></div></div>
    {error && <div className="mt-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
    <div className="mt-4 space-y-2">{rows.length ? rows.map(e => <Row key={e.id} e={e}/>) : <div className="rounded-2xl border border-dashed border-[var(--color-line)] p-10 text-center text-sm text-[var(--color-ink-soft)]">No events match this filter.</div>}</div>
    <div className="mt-5 flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-slate-50 px-4 py-3 text-xs text-[var(--color-ink-soft)]"><ShieldCheck size={16}/> This center is read-only. It does not alter audit records.</div>
  </div>;
}
