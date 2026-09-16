import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, ServerCog, ShieldCheck, XCircle, Zap } from 'lucide-react';
import { getDashboard, subscribeActivityLog, subscribeErrorLog, type LogEntry } from '../services/analyticsService';

type ServiceState = 'checking' | 'healthy' | 'degraded' | 'error';

interface ServiceCheck {
  name: string;
  description: string;
  state: ServiceState;
  detail: string;
}

function stateLabel(state: ServiceState) {
  if (state === 'checking') return 'Checking';
  if (state === 'healthy') return 'Healthy';
  if (state === 'degraded') return 'Degraded';
  return 'Error';
}

function StateIcon({ state }: { state: ServiceState }) {
  if (state === 'healthy') return <CheckCircle2 className="h-5 w-5" />;
  if (state === 'error') return <XCircle className="h-5 w-5" />;
  if (state === 'degraded') return <AlertTriangle className="h-5 w-5" />;
  return <RefreshCw className="h-5 w-5 animate-spin" />;
}

export default function SystemHealthPage() {
  const [services, setServices] = useState<ServiceCheck[]>([
    { name: 'Firebase / Firestore', description: 'Admin data access and live collections', state: 'checking', detail: 'Checking connectivity…' },
    { name: 'Analytics data', description: 'Dashboard aggregate queries', state: 'checking', detail: 'Checking queries…' },
    { name: 'Activity logging', description: 'Operational activity stream', state: 'checking', detail: 'Waiting for live stream…' },
    { name: 'Error logging', description: 'Client error stream', state: 'checking', detail: 'Waiting for live stream…' },
  ]);
  const [errors, setErrors] = useState<LogEntry[]>([]);
  const [activity, setActivity] = useState<LogEntry[]>([]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkError, setCheckError] = useState('');

  const runHealthCheck = useCallback(async () => {
    setRefreshing(true);
    setCheckError('');
    setServices((current) => current.map((s) => ({ ...s, state: 'checking', detail: 'Checking…' })));
    try {
      const dashboard = await getDashboard();
      const dataLooksAvailable = dashboard.modules.length > 0 || dashboard.users.total > 0 || dashboard.reports.total > 0 || dashboard.trend.length > 0;
      setServices((current) => current.map((s) => {
        if (s.name === 'Firebase / Firestore') return { ...s, state: 'healthy', detail: 'Firestore queries responded successfully' };
        if (s.name === 'Analytics data') return { ...s, state: dataLooksAvailable ? 'healthy' : 'degraded', detail: dataLooksAvailable ? 'Dashboard aggregates returned data' : 'Queries responded but returned no measurable data' };
        return s;
      }));
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : 'Health check failed');
      setServices((current) => current.map((s) => s.name === 'Firebase / Firestore' || s.name === 'Analytics data'
        ? { ...s, state: 'error', detail: 'The admin health query failed' }
        : s));
    } finally {
      setLastChecked(new Date());
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribeActivity = subscribeActivityLog(
      (list) => {
        setActivity(list);
        setServices((current) => current.map((s) => s.name === 'Activity logging'
          ? { ...s, state: 'healthy', detail: `${list.length} recent events available` }
          : s));
      },
      (err) => setServices((current) => current.map((s) => s.name === 'Activity logging'
        ? { ...s, state: 'error', detail: err.message || 'Activity stream unavailable' }
        : s))
    );
    const unsubscribeErrors = subscribeErrorLog(
      (list) => {
        setErrors(list);
        const recentUnresolved = list.filter((entry) => entry.resolved !== true).length;
        setServices((current) => current.map((s) => s.name === 'Error logging'
          ? { ...s, state: recentUnresolved > 0 ? 'degraded' : 'healthy', detail: recentUnresolved > 0 ? `${recentUnresolved} unresolved recent errors` : `${list.length} recent errors checked; none unresolved` }
          : s));
      },
      (err) => setServices((current) => current.map((s) => s.name === 'Error logging'
        ? { ...s, state: 'error', detail: err.message || 'Error stream unavailable' }
        : s))
    );
    runHealthCheck();
    return () => { unsubscribeActivity(); unsubscribeErrors(); };
  }, [runHealthCheck]);

  const unresolvedErrors = useMemo(() => errors.filter((entry) => entry.resolved !== true).length, [errors]);
  const recentActivity = activity.slice(0, 8);
  const overall: ServiceState = services.some((s) => s.state === 'error') ? 'error' : services.some((s) => s.state === 'degraded') ? 'degraded' : services.some((s) => s.state === 'checking') ? 'checking' : 'healthy';

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-teal-800 px-5 py-7 text-white sm:px-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-200"><ServerCog className="h-4 w-4" /> Superadmin Monitoring</div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">System Health Center</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-200">Live operational checks based on the services and Firestore streams this admin console can actually measure.</p>
            </div>
            <button onClick={runHealthCheck} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/25 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh checks
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Overall status</div><div className="mt-2 flex items-center gap-2 text-lg font-extrabold text-slate-900"><StateIcon state={overall} /> {stateLabel(overall)}</div></div>
          <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Unresolved errors</div><div className="mt-2 text-2xl font-extrabold text-slate-900">{unresolvedErrors}</div></div>
          <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Last checked</div><div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-900"><Clock3 className="h-4 w-4" /> {lastChecked ? lastChecked.toLocaleTimeString() : '—'}</div></div>
        </div>
      </section>

      {checkError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">Health check warning: {checkError}</div>}

      <section className="grid gap-4 sm:grid-cols-2">
        {services.map((service) => (
          <div key={service.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="font-extrabold text-slate-900">{service.name}</h2><p className="mt-1 text-sm text-slate-500">{service.description}</p></div>
              <div className={`rounded-xl p-2 ${service.state === 'healthy' ? 'bg-emerald-50 text-emerald-600' : service.state === 'error' ? 'bg-red-50 text-red-600' : service.state === 'degraded' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}><StateIcon state={service.state} /></div>
            </div>
            <div className="mt-4 text-sm font-semibold text-slate-700">{stateLabel(service.state)}</div>
            <div className="mt-1 text-xs text-slate-500">{service.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-extrabold text-slate-900"><AlertTriangle className="h-5 w-5 text-amber-500" /> Recent errors</h2><p className="mt-1 text-xs text-slate-500">Latest entries from the live error log.</p></div><span className="rounded-full bg-red-50 px-3 py-1 text-xs font-extrabold text-red-600">{unresolvedErrors} unresolved</span></div>
          <div className="space-y-2">
            {errors.slice(0, 8).map((entry) => <div key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-bold text-slate-800">{String(entry.message ?? entry.error ?? entry.type ?? 'Error event')}</span><span className="shrink-0 text-[11px] font-semibold text-slate-400">{String(entry.createdAt ?? '')}</span></div><div className="mt-1 text-xs text-slate-500">{entry.resolved === true ? 'Resolved' : 'Needs attention'}</div></div>)}
            {errors.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No recent error events returned.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-extrabold text-slate-900"><Activity className="h-5 w-5 text-blue-600" /> Recent activity</h2><p className="mt-1 text-xs text-slate-500">Live operational activity from the admin logging stream.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-600">{activity.length} loaded</span></div>
          <div className="space-y-2">
            {recentActivity.map((entry) => <div key={entry.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"><div className="text-sm font-bold text-slate-800">{String(entry.action ?? entry.type ?? entry.event ?? 'Activity event')}</div><div className="mt-1 text-xs text-slate-500">{String(entry.createdAt ?? '')}</div></div>)}
            {recentActivity.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No recent activity events returned.</div>}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-teal-50 p-2 text-teal-600"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-extrabold text-slate-900">Monitoring boundary</h2><p className="mt-1 text-sm leading-6 text-slate-600">This page intentionally reports only measurable application signals. It does not pretend to verify Firebase billing, Cloud Functions uptime, FCM delivery, or external provider availability unless the app has a real health signal for those services.</p></div></div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><Database className="h-5 w-5 text-blue-600" /><div className="mt-2 text-sm font-extrabold">Firestore telemetry</div><div className="text-xs text-slate-500">Query-backed health signal</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><Zap className="h-5 w-5 text-amber-500" /><div className="mt-2 text-sm font-extrabold">Live streams</div><div className="text-xs text-slate-500">Activity and error listeners</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><Activity className="h-5 w-5 text-teal-600" /><div className="mt-2 text-sm font-extrabold">Operational signals</div><div className="text-xs text-slate-500">Recent measurable events</div></div>
      </div>
    </div>
  );
}
