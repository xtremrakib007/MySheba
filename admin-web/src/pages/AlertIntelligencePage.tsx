import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Clock3, ExternalLink, Info, RefreshCw, Send, ShieldAlert, Users, XCircle, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { subscribeAnnouncements, type AnnouncementLogEntry } from '../services/announcementService';
import { fetchOpsOverview, type OpsOverview } from '../services/reportsService';

type Severity = 'critical' | 'warning';
type OperationalAlert = { key: string; title: string; value: number; severity: Severity; path: string; icon: typeof AlertTriangle; description: string };
const ACK_KEY = 'mysheba.admin.alertAcknowledgements.v1';

export default function AlertIntelligencePage() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<AnnouncementLogEntry[]>([]);
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');

  useEffect(() => {
    try { setAcknowledged(JSON.parse(localStorage.getItem(ACK_KEY) || '[]')); } catch { setAcknowledged([]); }
  }, []);

  const refresh = async () => { setRefreshing(true); setError(''); try { setOverview(await fetchOpsOverview()); } catch { setError('Unable to refresh operational alerts.'); } finally { setRefreshing(false); } };
  useEffect(() => { void refresh(); return subscribeAnnouncements(setAnnouncements, (e) => setError(e.message || 'Unable to load notification history.')); }, []);

  const alerts = useMemo<OperationalAlert[]>(() => ([
    { key: 'kyc', title: 'Pending KYC reviews', value: Number(overview?.pendingVerifications || 0), severity: 'warning', path: '/kyc-operations', icon: ShieldAlert, description: 'Verification queue requires operational review.' },
    { key: 'support', title: 'Open support workload', value: Number(overview?.openTickets || 0), severity: 'warning', path: '/support-operations', icon: Bell, description: 'Customer support tickets remain open.' },
    { key: 'chat', title: 'Chat reports', value: Number(overview?.pendingChatReports || 0), severity: 'critical', path: '/chat-reports', icon: XCircle, description: 'Reported chat content needs review.' },
  ] as OperationalAlert[]).filter((a) => a.value > 0), [overview]);

  const visibleAlerts = alerts.filter((a) => severityFilter === 'all' || a.severity === severityFilter);
  const unreadAlerts = alerts.filter((a) => !acknowledged.includes(a.key));
  const criticalUnread = unreadAlerts.filter((a) => a.severity === 'critical').length;

  const acknowledge = (key: string) => {
    const next = Array.from(new Set([...acknowledged, key]));
    setAcknowledged(next);
    localStorage.setItem(ACK_KEY, JSON.stringify(next));
  };
  const clearAcknowledgements = () => { setAcknowledged([]); localStorage.removeItem(ACK_KEY); };

  const delivery = useMemo(() => { const matched = announcements.reduce((n, x) => n + Number(x.matchedCount || 0), 0); const sent = announcements.reduce((n, x) => n + Number(x.sentCount || 0), 0); return { matched, sent, failed: Math.max(0, matched - sent), rate: matched ? Math.round(sent / matched * 100) : 0 }; }, [announcements]);

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
    <div className="rounded-3xl bg-gradient-to-r from-[#0b2447] via-[#155e9c] to-[#00a99d] p-6 text-white shadow-lg md:p-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Operations Intelligence</p><h1 className="mt-2 text-2xl font-extrabold md:text-3xl">Admin Notification & Alert Command Center</h1><p className="mt-2 max-w-2xl text-sm text-white/75">Monitor operational alerts, acknowledge reviewed items, and jump directly to the action.</p></div><button onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/25 disabled:opacity-50"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/> Refresh</button></div></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Active alerts</p><p className="mt-2 text-3xl font-extrabold">{alerts.length}</p><p className="mt-1 text-xs text-slate-500">{unreadAlerts.length} unacknowledged</p></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Critical unread</p><p className="mt-2 text-3xl font-extrabold text-red-600">{criticalUnread}</p></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Notifications sent</p><p className="mt-2 text-3xl font-extrabold">{delivery.sent.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{delivery.failed.toLocaleString()} unmatched/failed estimate</p></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Delivery rate</p><p className="mt-2 text-3xl font-extrabold">{delivery.rate}%</p></div></div>
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold">Live operational alerts</h2><p className="mt-1 text-xs text-slate-500">Counts are backed by existing admin data. Acknowledgements are stored locally on this admin browser.</p></div><div className="flex items-center gap-2"><select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as 'all' | Severity)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold"><option value="all">All severity</option><option value="critical">Critical</option><option value="warning">Warning</option></select><button onClick={clearAcknowledgements} disabled={acknowledged.length === 0} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:border-blue-300 disabled:opacity-40">Reset ack</button></div></div><div className="mt-4 space-y-2">{visibleAlerts.length === 0 ? <div className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-700"><CheckCircle2 className="mb-2" size={20}/>{alerts.length ? 'No alerts match this filter.' : 'No active operational alerts.'}</div> : visibleAlerts.map((a) => { const Icon = a.icon; const isAck = acknowledged.includes(a.key); return <div key={a.key} className={`rounded-xl border p-4 ${isAck ? 'border-slate-200 bg-slate-50/70' : a.severity === 'critical' ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40'}`}><div className="flex items-center justify-between gap-3"><button onClick={() => navigate(a.path)} className="flex min-w-0 items-center gap-3 text-left"><span className={`rounded-xl p-2 ${a.severity === 'critical' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}><Icon size={18}/></span><span className="min-w-0"><b className="block text-sm">{a.title}</b><small className="block truncate text-slate-500">{a.description}</small></span></button><div className="flex items-center gap-2"><b className="text-lg">{a.value}</b><button onClick={() => acknowledge(a.key)} title={isAck ? 'Acknowledged' : 'Acknowledge'} className={`rounded-lg p-2 ${isAck ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 hover:text-blue-600'}`}>{isAck ? <EyeOff size={16}/> : <Eye size={16}/>}</button><button onClick={() => navigate(a.path)} className="hidden rounded-lg bg-white px-2.5 py-2 text-xs font-bold text-blue-600 sm:block">Open</button></div></div><div className="mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide"><span className={a.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}>{a.severity}</span><span className={isAck ? 'text-emerald-600' : 'text-slate-400'}>{isAck ? 'Acknowledged' : 'Needs review'}</span></div></div>; })}</div></section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-extrabold">Quick actions</h2><div className="mt-4 space-y-2">{([['Send announcement','/announcements',Send],['Delivery monitoring','/notification-delivery',Send],['Support command center','/support-operations',Bell],['System health','/system-health',ActivityIcon]] as const).map(([label,path,Icon]) => <button key={String(label)} onClick={() => navigate(String(path))} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left text-sm font-semibold hover:border-blue-300"><Icon size={17} className="text-blue-600"/>{label}<ExternalLink size={13} className="ml-auto text-slate-400"/></button>)}</div><div className="mt-5 rounded-xl bg-blue-50 p-4 text-xs text-blue-800"><Users size={15} className="mr-1 inline"/>Alert acknowledgement is an admin-browser workflow aid; it does not alter the underlying KYC, support, moderation, chat, or notification records.</div></section>
    </div>
    <section className="rounded-2xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-extrabold">Recent notification activity</h2><p className="mt-1 text-xs text-slate-500">Live broadcast records from the existing server-side announcement pipeline.</p></div><div className="divide-y">{announcements.slice(0, 10).map((item) => { const matched = Number(item.matchedCount || 0); const sent = Number(item.sentCount || 0); const ok = matched === 0 || sent >= matched; return <div key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><b className="block truncate text-sm">{item.title || 'Untitled announcement'}</b><span className="text-xs text-slate-500">{item.audience} · {item.createdAt || 'Time unavailable'}</span></div><span className="inline-flex items-center gap-1 text-xs font-semibold">{ok ? <CheckCircle2 size={15} className="text-emerald-600"/> : <XCircle size={15} className="text-red-600"/>}{sent.toLocaleString()} / {matched.toLocaleString()} sent</span></div>; })}{announcements.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No notification activity yet.</div>}</div></section>
    <div className="rounded-2xl border bg-slate-50 p-4 text-xs text-slate-500"><Info className="mr-2 inline" size={15}/>Alert counts are operational signals, not a new notification database. Broadcast sending, permission checks and delivery history remain server-side through the existing announcement pipeline.</div>
  </div>;
}

function ActivityIcon(props: { size?: number }) { return <Clock3 {...props} />; }
