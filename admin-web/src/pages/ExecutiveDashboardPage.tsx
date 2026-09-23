import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, BarChart3, BadgeCheck, Headphones, RefreshCw, Users, WalletCards } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchOpsOverview, type OpsOverview } from '../services/reportsService';
import { subscribeTransactions, type Transaction } from '../services/transactionService';

function money(value: number) { return `RM ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function ExecutiveDashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function refresh() {
    setLoading(true);
    try { setOverview(await fetchOpsOverview()); setLastUpdated(new Date()); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void refresh();
    const unsub = subscribeTransactions(setTransactions, () => {});
    return unsub;
  }, []);

  const financial = useMemo(() => {
    const completed = transactions.filter((t) => t.status === 'completed');
    const pending = transactions.filter((t) => !['completed', 'rejected'].includes(t.status));
    const value = (rows: Transaction[]) => rows.reduce((sum, t) => sum + Number(t.total ?? t.amount ?? 0), 0);
    return { completedValue: value(completed), pendingValue: value(pending), completedCount: completed.length, pendingCount: pending.length };
  }, [transactions]);

  const attention = [
    ['Pending KYC', overview?.pendingVerifications ?? null, '/verification', BadgeCheck],
    ['Open support', overview?.openTickets ?? null, '/support', Headphones],
    ['Chat reports', overview?.pendingChatReports ?? null, '/chat-reports', AlertTriangle],
  ].filter((x) => x[1] !== null && Number(x[1]) > 0) as [string, number, string, typeof AlertTriangle][];

  const cards = ([
    ['Users', overview?.totalUsers, 'Registered accounts', Users, '/users'],
    ['Verified', overview?.verifiedUsers, 'Identity verified', BadgeCheck, '/users'],
    ['KYC Queue', overview?.pendingVerifications, 'Awaiting review', BadgeCheck, '/kyc-operations'],
    ['Support', overview?.openTickets, 'Open / in progress', Headphones, '/support-operations'],
    ['Completed Value', money(financial.completedValue), 'Loaded transactions', WalletCards, '/financial'],
    ['Pending Value', money(financial.pendingValue), `${financial.pendingCount} transactions`, Activity, '/transactions'],
  ] as const);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <div className="overflow-hidden rounded-[24px] bg-gradient-to-r from-slate-900 via-blue-900 to-teal-700 p-6 text-white shadow-lg md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Executive View</p><h1 className="mt-2 text-2xl font-extrabold md:text-3xl">Business Command Dashboard</h1><p className="mt-2 max-w-2xl text-sm text-white/75">A high-level operational snapshot across users, finance, KYC, support and platform risk.</p></div>
          <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold backdrop-blur hover:bg-white/25 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
        <p className="mt-5 text-xs text-white/55">{profile?.name || profile?.email || 'Administrator'} · {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading live data'}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, note, Icon, path]) => <button key={String(label)} onClick={() => navigate(String(path))} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span><span className="rounded-xl bg-blue-50 p-2 text-blue-600"><Icon size={17} /></span></div><p className="mt-3 truncate text-xl font-extrabold text-slate-900">{loading ? '…' : value ?? '—'}</p><p className="mt-1 text-[11px] text-slate-500">{note}</p></button>)}
      </div>

      {attention.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5"><div className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-600" /><h2 className="font-extrabold">Requires Executive Attention</h2></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{attention.map(([label, value, path, Icon]) => <button key={label} onClick={() => navigate(path)} className="flex items-center justify-between rounded-xl bg-white p-3 text-left shadow-sm"><span className="flex items-center gap-2 text-sm font-semibold"><Icon size={16} className="text-amber-600" />{label}</span><b>{value}</b></button>)}</div></section>}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-extrabold">Financial Snapshot</h2><p className="mt-1 text-xs text-slate-500">Based on transactions currently available to the admin console.</p></div><button onClick={() => navigate('/financial')} className="text-xs font-bold text-blue-600">Open Finance</button></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Completed value</p><p className="mt-1 text-lg font-extrabold">{money(financial.completedValue)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Pending value</p><p className="mt-1 text-lg font-extrabold">{money(financial.pendingValue)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Completed transactions</p><p className="mt-1 text-lg font-extrabold">{financial.completedCount}</p></div></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><BarChart3 size={18} className="text-blue-600" /><h2 className="font-extrabold">Command Links</h2></div><div className="mt-4 space-y-2">{[['Analytics','/analytics'],['Fraud & Risk','/fraud-risk'],['System Health','/system-health'],['Audit & Compliance','/audit']].map(([label,path]) => <button key={label} onClick={() => navigate(path)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold hover:border-blue-300">{label}<span className="float-right text-slate-400">→</span></button>)}</div></section>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500"><b className="text-slate-700">Data boundary:</b> this dashboard aggregates data already exposed to the admin console. It does not invent wallet balances, settlement figures, revenue, fraud scores or service uptime when those authoritative backend metrics are not available.</div>
    </div>
  );
}
