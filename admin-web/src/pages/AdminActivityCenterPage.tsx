import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, FileClock, RefreshCw, Search, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { subscribeActivityLog, subscribeAuditLog, subscribeErrorLog, type LogEntry } from '../services/analyticsService';

const tabs = ['all', 'activity', 'audit', 'errors'] as const;
type Tab = typeof tabs[number];

function textOf(value: unknown): string { if (value === null || value === undefined) return ''; if (typeof value === 'object') { try { return JSON.stringify(value); } catch { return ''; } } return String(value); }
function titleOf(item: LogEntry, type: string) { return textOf(item.action || item.event || item.type || item.operation || item.title || `${type} event`) || `${type} event`; }
function detailOf(item: LogEntry) { return textOf(item.message || item.description || item.reason || item.details || item.error || 'No additional details'); }

export default function AdminActivityCenterPage() {
  const navigate = useNavigate();
  const [activity, setActivity] = useState<LogEntry[]>([]);
  const [audit, setAudit] = useState<LogEntry[]>([]);
  const [errors, setErrors] = useState<LogEntry[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onError = (e: Error) => setError(e.message || 'Unable to load activity logs.');
    const a = subscribeActivityLog(setActivity, onError);
    const b = subscribeAuditLog(setAudit, onError);
    const c = subscribeErrorLog(setErrors, onError);
    return () => { a(); b(); c(); };
  }, []);

  const rows = useMemo(() => {
    const all = [
      ...activity.map((x) => ({ ...x, _type: 'activity' })),
      ...audit.map((x) => ({ ...x, _type: 'audit' })),
      ...errors.map((x) => ({ ...x, _type: 'errors' })),
    ];
    const needle = query.trim().toLowerCase();
    return all.filter((x) => (tab === 'all' || x._type === tab) && (!needle || `${titleOf(x, x._type)} ${detailOf(x)} ${textOf(x.uid || x.userId || x.email)}`.toLowerCase().includes(needle))).sort((a, b) => textOf(b.createdAt).localeCompare(textOf(a.createdAt))).slice(0, 150);
  }, [activity, audit, errors, tab, query]);

  const stats = { activity: activity.length, audit: audit.length, errors: errors.length };

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
    <div className="rounded-3xl bg-gradient-to-r from-[#0b2447] via-[#155e9c] to-[#00a99d] p-6 text-white shadow-lg md:p-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Governance & Operations</p><h1 className="mt-2 text-2xl font-extrabold md:text-3xl">Admin Activity Command Center</h1><p className="mt-2 max-w-2xl text-sm text-white/75">A unified live view of activity, audit events, and system errors already recorded by MySheba.</p></div><button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/25"><RefreshCw size={16}/> Refresh</button></div></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Some live log feeds could not be loaded: {error}</div>}
    <div className="grid gap-4 sm:grid-cols-3"><button onClick={() => setTab('activity')} className="rounded-2xl border bg-white p-5 text-left shadow-sm hover:border-blue-300"><Activity className="text-blue-600" size={20}/><p className="mt-3 text-xs font-bold uppercase text-slate-500">Activity events</p><p className="text-3xl font-extrabold">{stats.activity}</p></button><button onClick={() => setTab('audit')} className="rounded-2xl border bg-white p-5 text-left shadow-sm hover:border-blue-300"><ShieldCheck className="text-emerald-600" size={20}/><p className="mt-3 text-xs font-bold uppercase text-slate-500">Audit events</p><p className="text-3xl font-extrabold">{stats.audit}</p></button><button onClick={() => setTab('errors')} className="rounded-2xl border bg-white p-5 text-left shadow-sm hover:border-red-300"><XCircle className="text-red-600" size={20}/><p className="mt-3 text-xs font-bold uppercase text-slate-500">Error events</p><p className="text-3xl font-extrabold">{stats.errors}</p></button></div>
    <section className="rounded-2xl border bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-5 md:flex-row md:items-center md:justify-between"><div className="flex flex-wrap gap-2">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${tab === item ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item}</button>)}</div><div className="relative w-full md:w-80"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events, users, messages..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400"/></div></div><div className="divide-y">{rows.map((item) => { const type = item._type; return <div key={`${type}-${item.id}`} className="p-4 hover:bg-slate-50"><div className="flex items-start gap-3"><div className={`mt-0.5 rounded-xl p-2 ${type === 'errors' ? 'bg-red-50 text-red-600' : type === 'audit' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{type === 'errors' ? <AlertTriangle size={17}/> : type === 'audit' ? <ShieldCheck size={17}/> : <Activity size={17}/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm break-all">{titleOf(item, type)}</b><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500">{type}</span></div><p className="mt-1 break-words text-xs text-slate-600">{detailOf(item)}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400"><span><FileClock size={12} className="mr-1 inline"/>{textOf(item.createdAt) || 'Time unavailable'}</span>{(item.uid || item.userId || item.email) && <span><UserRound size={12} className="mr-1 inline"/>{textOf(item.uid || item.userId || item.email)}</span>}</div></div></div></div>})}{rows.length === 0 && <div className="p-12 text-center text-sm text-slate-500">No matching log events.</div>}</div></section>
    <div className="flex flex-wrap gap-2"><button onClick={() => navigate('/audit')} className="rounded-xl border bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-blue-300">Audit & Compliance</button><button onClick={() => navigate('/system-health')} className="rounded-xl border bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-blue-300">System Health</button><button onClick={() => navigate('/alerts')} className="rounded-xl border bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-blue-300">Alert Center</button></div>
    <div className="rounded-2xl border bg-slate-50 p-4 text-xs text-slate-500">This center is read-only. It combines the existing activityLog, userAuditLog, and errorLog feeds; it does not create a second audit system or alter existing records.</div>
  </div>;
}
