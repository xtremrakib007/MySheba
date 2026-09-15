import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Clock3, ExternalLink, Info, RefreshCw, Send, ShieldAlert, Users, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { subscribeAnnouncements, type AnnouncementLogEntry } from '../services/announcementService';
import { fetchOpsOverview, type OpsOverview } from '../services/reportsService';

export default function AlertIntelligencePage() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<AnnouncementLogEntry[]>([]);
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => { setRefreshing(true); setError(''); try { setOverview(await fetchOpsOverview()); } catch { setError('Unable to refresh operational alerts.'); } finally { setRefreshing(false); } };
  useEffect(() => { void refresh(); return subscribeAnnouncements(setAnnouncements, (e) => setError(e.message || 'Unable to load notification history.')); }, []);

  const alerts = useMemo(() => [
    { key: 'kyc', title: 'Pending KYC reviews', value: overview?.pendingVerifications, severity: 'warning', path: '/kyc-operations', icon: ShieldAlert },
    { key: 'support', title: 'Open support workload', value: overview?.openTickets, severity: 'warning', path: '/support-operations', icon: Bell },
    { key: 'marketplace', title: 'Marketplace reports', value: overview?.pendingMarketplaceReports, severity: 'critical', path: '/marketplace-moderation', icon: AlertTriangle },
    { key: 'chat', title: 'Chat reports', value: overview?.pendingChatReports, severity: 'critical', path: '/chat-reports', icon: XCircle },
  ].filter((a) => a.value !== null && Number(a.value) > 0), [overview]);

  const delivery = useMemo(() => { const matched = announcements.reduce((n, x) => n + Number(x.matchedCount || 0), 0); const sent = announcements.reduce((n, x) => n + Number(x.sentCount || 0), 0); return { matched, sent, failed: Math.max(0, matched - sent), rate: matched ? Math.round(sent / matched * 100) : 0 }; }, [announcements]);

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
    <div className="rounded-3xl bg-gradient-to-r from-[#0b2447] via-[#155e9c] to-[#00a99d] p-6 text-white shadow-lg md:p-8"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Operations Intelligence</p><h1 className="mt-2 text-2xl font-extrabold md:text-3xl">Notification & Alert Intelligence</h1><p className="mt-2 max-w-2xl text-sm text-white/75">One place to see operational attention items and notification delivery health.</p></div><button onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/25 disabled:opacity-50"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/> Refresh</button></div></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Active alerts</p><p className="mt-2 text-3xl font-extrabold">{alerts.length}</p></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Recipients matched</p><p className="mt-2 text-3xl font-extrabold">{delivery.matched.toLocaleString()}</p></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Notifications sent</p><p className="mt-2 text-3xl font-extrabold">{delivery.sent.toLocaleString()}</p></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">Delivery rate</p><p className="mt-2 text-3xl font-extrabold">{delivery.rate}%</p></div></div>
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-extrabold">Live operational alerts</h2><p className="mt-1 text-xs text-slate-500">Only metrics backed by existing admin data are shown.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase">Live overview</span></div><div className="mt-4 space-y-2">{alerts.length === 0 ? <div className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-700"><CheckCircle2 className="mb-2" size={20}/>No active operational alerts.</div> : alerts.map((a) => { const Icon = a.icon; return <button key={a.key} onClick={() => navigate(a.path)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left hover:border-blue-300"><span className="flex items-center gap-3"><span className={`rounded-xl p-2 ${a.severity === 'critical' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}><Icon size={18}/></span><span><b className="block text-sm">{a.title}</b><small className="text-slate-500">Requires operational review</small></span></span><b className="text-lg">{a.value}</b></button>; })}</div></section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-extrabold">Quick actions</h2><div className="mt-4 space-y-2">{[['Send announcement','/announcements',Send],['Delivery monitoring','/notifications',Send],['Support command center','/support-operations',Bell],['System health','/system-health',ActivityIcon]].map(([label,path,Icon]) => <button key={String(label)} onClick={() => navigate(String(path))} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left text-sm font-semibold hover:border-blue-300"><Icon size={17} className="text-blue-600"/>{label}<ExternalLink size={13} className="ml-auto text-slate-400"/></button>)}</div></section>
    </div>
    <section className="rounded-2xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-extrabold">Recent notification activity</h2><p className="mt-1 text-xs text-slate-500">Live broadcast records from the existing server-side announcement pipeline.</p></div><div className="divide-y">{announcements.slice(0, 10).map((item) => { const matched = Number(item.matchedCount || 0); const sent = Number(item.sentCount || 0); const ok = matched === 0 || sent >= matched; return <div key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><b className="block truncate text-sm">{item.title || 'Untitled announcement'}</b><span className="text-xs text-slate-500">{item.audience} · {item.createdAt || 'Time unavailable'}</span></div><span className="inline-flex items-center gap-1 text-xs font-semibold">{ok ? <CheckCircle2 size={15} className="text-emerald-600"/> : <XCircle size={15} className="text-red-600"/>}{sent.toLocaleString()} / {matched.toLocaleString()} sent</span></div>; })}{announcements.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No notification activity yet.</div>}</div></section>
    <div className="rounded-2xl border bg-slate-50 p-4 text-xs text-slate-500"><Info className="mr-2 inline" size={15}/>Alert counts are operational signals, not a new notification database. Broadcast sending, permission checks and delivery history remain server-side through the existing announcement pipeline.</div>
  </div>;
}

function ActivityIcon(props: { size?: number }) { return <Clock3 {...props} />; }
