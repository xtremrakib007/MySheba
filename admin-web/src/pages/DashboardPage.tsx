import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, BadgeCheck, Banknote, BellRing, Building2, CheckCircle2,
  CreditCard, FileText, Globe2, Headphones, LayoutGrid, Plane, Search, Settings2,
  ShieldCheck, Smartphone, Ticket, TrainFront, UserRoundCog, Users, XCircle,
  Activity, FileSearch, Megaphone, WalletCards, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchOpsOverview, type OpsOverview } from '../services/reportsService';

type Feature = { key: string; label: string; path: string; icon: typeof Users; tone: string; superadminOnly?: boolean };
type Shortcut = { label: string; description: string; path: string; icon: typeof Activity; superadminOnly?: boolean };

const FEATURES: Feature[] = [
  { key: 'financial', label: 'Financial\nManagement', path: '/transactions', icon: Banknote, tone: 'teal' },
  { key: 'reports', label: 'Reports &\nAnalytics', path: '/reports', icon: BarChart3, tone: 'blue' },
  { key: 'users', label: 'User\nManagement', path: '/users', icon: UserRoundCog, tone: 'indigo' },
  { key: 'kyc', label: 'KYC\nManagement', path: '/verification', icon: BadgeCheck, tone: 'green' },
  { key: 'support', label: 'Support\nInbox', path: '/support', icon: Headphones, tone: 'cyan' },
  { key: 'recharge', label: 'Recharge', path: '/topup', icon: CreditCard, tone: 'violet', superadminOnly: true },
  { key: 'remittance', label: 'Remittance', path: '/config/rates', icon: Globe2, tone: 'sky' },
  { key: 'banking', label: 'Mobile\nBanking', path: '/transactions', icon: Building2, tone: 'gold' },
  { key: 'internet', label: 'Internet', path: '/config/modules', icon: Globe2, tone: 'azure' },
  { key: 'flight', label: 'Flight', path: '/inquiries', icon: Plane, tone: 'blue' },
  { key: 'bus', label: 'Bus', path: '/inquiries', icon: Ticket, tone: 'orange' },
  { key: 'train', label: 'Train', path: '/inquiries', icon: TrainFront, tone: 'slate' },
  { key: 'visa', label: 'Visa', path: '/inquiries', icon: FileText, tone: 'deepblue' },
  { key: 'arrival', label: 'Malaysia\nArrival Card', path: '/inquiries', icon: Smartphone, tone: 'lightblue' },
  { key: 'passport', label: 'Passport', path: '/inquiries', icon: ShieldCheck, tone: 'navy' },
  { key: 'more', label: 'More Features', path: '/feature-access', icon: LayoutGrid, tone: 'purple' },
];

const SHORTCUTS: Shortcut[] = [
  { label: 'Executive Overview', description: 'Platform-wide KPIs and priorities', path: '/executive', icon: Activity },
  { label: 'Alert Center', description: 'Review active operational alerts', path: '/alerts', icon: AlertTriangle },
  { label: 'Investigation Center', description: 'Trace a user across platform records', path: '/investigation', icon: FileSearch },
  { label: 'Communications', description: 'Broadcast and monitor notifications', path: '/communications', icon: Megaphone },
  { label: 'Wallet Settlement', description: 'Review point-transfer operations', path: '/wallet-settlement', icon: WalletCards },
  { label: 'System Governance', description: 'Superadmin controls and oversight', path: '/governance', icon: ShieldCheck, superadminOnly: true },
];

const toneClasses: Record<string, string> = {
  teal: 'from-teal-50 to-cyan-100 text-teal-600', blue: 'from-blue-50 to-blue-100 text-blue-600',
  indigo: 'from-indigo-50 to-indigo-100 text-indigo-600', green: 'from-emerald-50 to-green-100 text-emerald-600',
  cyan: 'from-cyan-50 to-sky-100 text-cyan-600', violet: 'from-violet-50 to-purple-100 text-violet-600',
  sky: 'from-sky-50 to-blue-100 text-sky-600', gold: 'from-amber-50 to-yellow-100 text-amber-600',
  azure: 'from-blue-50 to-cyan-100 text-blue-600', orange: 'from-orange-50 to-amber-100 text-orange-600',
  slate: 'from-slate-50 to-blue-100 text-slate-600', deepblue: 'from-blue-100 to-indigo-100 text-blue-700',
  lightblue: 'from-sky-50 to-blue-100 text-sky-600', navy: 'from-slate-100 to-indigo-100 text-indigo-800',
  purple: 'from-purple-50 to-fuchsia-100 text-purple-600',
};

const STAT_CARDS: { key: keyof OpsOverview; label: string; path: string; icon: typeof Users }[] = [
  { key: 'totalUsers', label: 'Total Users', path: '/users', icon: Users },
  { key: 'verifiedUsers', label: 'Verified Users', path: '/users', icon: CheckCircle2 },
  { key: 'pendingVerifications', label: 'Pending KYC', path: '/verification', icon: BadgeCheck },
  { key: 'openTickets', label: 'Open Tickets', path: '/support', icon: Headphones },
];

const REFRESH_INTERVAL_MS = 30_000;

export default function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refreshOverview = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { setOverview(await fetchOpsOverview()); setLastUpdated(new Date()); }
    catch { setOverview(null); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    void refreshOverview();
    let intervalId: number | undefined;
    const startPolling = () => {
      if (document.visibilityState !== 'visible' || intervalId !== undefined) return;
      intervalId = window.setInterval(() => void refreshOverview(), REFRESH_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
      intervalId = undefined;
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshOverview();
        startPolling();
      } else stopPolling();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    startPolling();
    return () => { stopPolling(); document.removeEventListener('visibilitychange', handleVisibility); };
  }, []);

  const isSuperadmin = profile?.role === 'superadmin';
  const visibleFeatures = FEATURES.filter((feature) => !feature.superadminOnly || isSuperadmin);
  const visibleShortcuts = SHORTCUTS.filter((shortcut) => !shortcut.superadminOnly || isSuperadmin);
  const filteredFeatures = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return visibleFeatures;
    return visibleFeatures.filter((feature) => feature.label.replaceAll('\\n', ' ').toLowerCase().includes(normalized));
  }, [query, isSuperadmin]);

  const attentionItems = [
    { label: 'Pending KYC verifications', value: overview?.pendingVerifications, path: '/verification', danger: false },
    { label: 'Open support tickets', value: overview?.openTickets, path: '/support', danger: false },
  ].filter((item) => item.value !== null && (item.value ?? 0) > 0);
  const attentionCount = attentionItems.reduce((total, item) => total + (item.value ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1500px] pb-10">
      <div className="mb-5 overflow-hidden rounded-[22px] bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-600 px-4 py-4 text-white shadow-lg shadow-blue-100 sm:px-5 sm:py-5 md:px-7 md:py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3"><div className="shrink-0 rounded-2xl bg-white/20 p-2.5 backdrop-blur-sm sm:p-3"><Settings2 size={26} strokeWidth={2.2} className="sm:h-[29px] sm:w-[29px]" /></div><div className="min-w-0"><h1 className="text-lg font-extrabold tracking-tight text-white sm:text-xl md:text-2xl">MySheba</h1><p className="truncate text-xs font-medium text-white/85 sm:text-sm md:text-base">{isSuperadmin ? 'Superadmin Control Center' : 'Admin Control Center'}</p></div></div>
          <div className="hidden items-center gap-3 sm:flex"><button onClick={() => navigate('/announcements')} className="rounded-full bg-white/15 p-2.5 transition hover:bg-white/25" title="Announcements"><BellRing size={19} /></button><div className="text-right"><p className="text-xs text-white/70">Signed in as</p><p className="max-w-[220px] truncate text-sm font-semibold">{profile?.name || profile?.email}</p></div></div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3">
        {STAT_CARDS.map(({ key, label, path, icon: Icon }) => <button key={key} onClick={() => navigate(path)} className="group flex min-h-[76px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md sm:min-h-0 sm:gap-2.5 sm:px-3 sm:py-3 md:px-4"><div className="shrink-0 rounded-xl bg-blue-50 p-2 text-blue-600 sm:p-2.5"><Icon size={17} className="sm:h-[18px] sm:w-[18px]" /></div><div className="min-w-0"><p className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px] md:text-[11px]">{label}</p><p className="text-lg font-extrabold text-slate-900 sm:text-xl md:text-2xl">{overview?.[key] ?? '—'}</p></div></button>)}
      </div>

      {attentionItems.length > 0 && <div className="mb-6 rounded-[20px] border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-3.5 shadow-sm sm:p-4 md:p-5"><div className="mb-3 flex items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2"><AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-600" /><div><h2 className="text-base font-extrabold text-slate-900">Requires Your Attention</h2><p className="text-[11px] leading-4 text-slate-500">{attentionCount} active item{attentionCount === 1 ? '' : 's'} across operational queues</p></div></div><span className="hidden shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-700 xs:inline-flex sm:inline-flex">Action Center</span></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{attentionItems.map((item) => <button key={item.label} onClick={() => navigate(item.path)} className="flex min-h-[44px] items-center justify-between rounded-xl border border-white bg-white/80 px-3 py-2.5 text-left shadow-sm transition hover:border-amber-300 hover:bg-white"><span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700"><span className={item.danger ? 'text-red-500' : 'text-amber-500'}>{item.danger ? <XCircle size={15} /> : <AlertTriangle size={15} />}</span><span className="truncate">{item.label}</span></span><span className="ml-2 text-sm font-extrabold text-slate-900">{item.value}</span></button>)}</div></div>}

      <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4 md:p-5"><div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-base font-extrabold text-slate-900 md:text-lg">Command Shortcuts</h2><p className="truncate text-xs text-slate-500">Jump directly into the operational areas you use most.</p></div><span className="hidden shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:inline-flex">{isSuperadmin ? 'Superadmin' : 'Admin'}</span></div><div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">{visibleShortcuts.map(({ label, description, path, icon: Icon }) => <button key={label} onClick={() => navigate(path)} className="group min-h-[104px] rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white hover:shadow-md"><div className="mb-2 flex items-center justify-between"><span className="rounded-xl bg-white p-2 text-blue-600 shadow-sm group-hover:bg-blue-50"><Icon size={18} /></span><span className="text-slate-300 transition group-hover:text-blue-400">→</span></div><p className="text-xs font-extrabold text-slate-800">{label}</p><p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-500">{description}</p></button>)}</div></div>

      <div className="mb-5 flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="shrink-0 rounded-xl bg-blue-100 p-2 text-blue-600"><Settings2 size={23} /></div><div className="min-w-0"><h2 className="text-xl font-extrabold text-slate-900 md:text-2xl">{isSuperadmin ? 'Superadmin Control Center' : 'Admin Control Center'}</h2><p className="text-xs text-slate-500 md:text-sm">Manage your MySheba platform from one place</p></div></div><div className="relative w-full sm:w-64"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search features..." aria-label="Search dashboard features" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:py-2.5" /></div></div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 xl:gap-4">{filteredFeatures.map(({ key, label, path, icon: Icon, tone }) => <button key={key} onClick={() => navigate(path)} className="group flex min-h-[132px] flex-col items-center justify-center rounded-[20px] border-2 border-blue-500/90 bg-white px-1.5 py-3.5 text-center shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-600 hover:shadow-lg active:scale-[0.98] sm:min-h-[145px] sm:px-2 sm:py-4 md:min-h-[174px] md:rounded-[24px]"><div className={`mb-2.5 rounded-2xl bg-gradient-to-br p-3 shadow-sm transition group-hover:scale-105 sm:mb-3 sm:p-3.5 md:p-4 ${toneClasses[tone]}`}><Icon size={33} strokeWidth={1.8} className="sm:h-[37px] sm:w-[37px] md:h-11 md:w-11" /></div><span className="whitespace-pre-line text-[13px] font-bold leading-5 text-slate-900 sm:text-[15px] md:text-[17px] md:leading-6">{label}</span></button>)}</div>
      {filteredFeatures.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No matching features found.</div>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"><div className="flex items-center gap-1.5">{lastUpdated ? <span className="flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span><CheckCircle2 size={14} className="text-emerald-500" /> Live overview updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> : 'Loading platform overview...'}</div><button disabled={refreshing} onClick={() => void refreshOverview()} className="flex min-h-[36px] items-center gap-1.5 font-semibold text-blue-600 hover:text-blue-700 disabled:cursor-wait disabled:opacity-50"><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Refreshing...' : 'Refresh data'}</button></div>
    </div>
  );
}
