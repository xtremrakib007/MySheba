import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, ExternalLink, RefreshCw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { subscribeAnnouncements, type AnnouncementLogEntry } from '../services/announcementService';
import { useAuth } from '../contexts/AuthContext';
import { canAccess } from '../routes/navConfig';
import { fetchOpsOverview, type OpsOverview } from '../services/reportsService';

const READ_KEY = 'mysheba-admin-notification-read';
const MAX_READ_IDS = 200;
type AlertItem = { key: string; title: string; value: number; severity: 'critical' | 'warning'; path: string };

function readIds(): string[] { try { const value = JSON.parse(localStorage.getItem(READ_KEY) || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; } }

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { access } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AnnouncementLogEntry[]>([]);
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [read, setRead] = useState<string[]>(readIds);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => subscribeAnnouncements(setItems, () => setError(true)), []);
  useEffect(() => { localStorage.setItem(READ_KEY, JSON.stringify(read.slice(-MAX_READ_IDS))); }, [read]);
  useEffect(() => { const load = async () => { try { setOverview(await fetchOpsOverview()); } catch { /* announcements remain available */ } }; void load(); const timer = window.setInterval(() => void load(), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const handler = () => setOpen(true); window.addEventListener('mysheba:notifications', handler); return () => window.removeEventListener('mysheba:notifications', handler); }, []);

  const alerts = useMemo<AlertItem[]>(() => ([
    { key: 'kyc', title: 'Pending KYC reviews', value: Number(overview?.pendingVerifications || 0), severity: 'warning', path: '/kyc-operations' },
    { key: 'support', title: 'Open support workload', value: Number(overview?.openTickets || 0), severity: 'warning', path: '/support-operations' },
  ] as AlertItem[]).filter((item) => item.value > 0 && canAccess(item.path, access)), [overview, access]);
  const unreadItems = useMemo(() => items.filter((item) => !read.includes(item.id)), [items, read]);
  const unreadCount = unreadItems.length + alerts.length;
  const markRead = (id: string) => setRead((current) => current.includes(id) ? current : [...current, id].slice(-MAX_READ_IDS));
  const markAllRead = () => setRead((current) => Array.from(new Set([...current, ...items.map((item) => item.id)])).slice(-MAX_READ_IDS));
  const refresh = async () => { setRefreshing(true); try { setOverview(await fetchOpsOverview()); } catch { setError(true); } finally { setRefreshing(false); } };

  return <div className="relative">
    <button onClick={() => setOpen((v) => !v)} className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-blue-300 hover:text-blue-600" title="Notifications and operational alerts" aria-label={`Notifications${unreadCount ? `, ${unreadCount} need attention` : ''}`}><Bell size={18}/>{unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>
    {open && <><button className="fixed inset-0 z-40 cursor-default" aria-label="Close notifications" onClick={() => setOpen(false)}/><div className="absolute right-0 z-50 mt-2 w-[min(410px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><div className="flex items-center gap-2"><p className="font-semibold text-slate-900">Notifications & Alerts</p>{unreadCount > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">{unreadCount}</span>}</div><p className="text-xs text-slate-500">Live operational signals and announcements</p></div><div className="flex items-center gap-1"><button onClick={() => void refresh()} disabled={refreshing} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600" title="Refresh"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/></button><button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={17}/></button></div></div>
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 flex items-center justify-between"><span className="text-[11px] font-semibold text-slate-500">{alerts.length} active alert{alerts.length === 1 ? '' : 's'}</span>{unreadItems.length > 0 && <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] font-bold text-blue-600"><CheckCheck size={14}/> Mark announcements read</button>}</div>
      <div className="max-h-[480px] overflow-y-auto">{error && <div className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-700">Some notification data is temporarily unavailable.</div>}
        {alerts.map((item) => <button key={item.key} onClick={() => { setOpen(false); navigate(item.path); }} className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"><span className={`mt-0.5 rounded-lg p-2 ${item.severity === 'critical' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}><AlertTriangle size={16}/></span><span className="min-w-0 flex-1"><b className="block text-sm text-slate-800">{item.title}</b><span className="mt-0.5 block text-xs text-slate-500">{item.value.toLocaleString()} item{item.value === 1 ? '' : 's'} require review</span></span><ExternalLink size={14} className="mt-1 shrink-0 text-slate-400"/></button>)}
        {unreadItems.slice(0, 10).map((item) => <button key={item.id} onClick={() => markRead(item.id)} className="block w-full border-b border-slate-100 bg-blue-50/50 px-4 py-3 text-left hover:bg-blue-50"><div className="flex items-start gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"/><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold text-slate-800">{item.title}</span><span className="shrink-0 text-[10px] text-slate-400">{item.createdAt ?? ''}</span></span><span className="mt-1 block line-clamp-3 text-xs leading-5 text-slate-500">{item.body}</span><span className="mt-2 block text-[10px] font-medium uppercase tracking-wide text-blue-500">{item.audience}</span></span></div></button>)}
        {alerts.length === 0 && unreadItems.length === 0 && <div className="px-4 py-10 text-center"><CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28}/><p className="text-sm font-medium text-slate-700">You’re all caught up</p><p className="mt-1 text-xs text-slate-400">No active operational alerts or unread announcements.</p></div>}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2.5"><button onClick={() => { setOpen(false); navigate('/alerts'); }} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Open Alert Center</button><button onClick={() => { setOpen(false); navigate('/announcements'); }} className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-800">Communications <ExternalLink size={12}/></button></div>
    </div></>}
  </div>;
}
