import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, RefreshCw, ShieldAlert, UserX } from 'lucide-react';
import { subscribeTransactions, type Transaction } from '../services/transactionService';
import { fetchUsersPage, type AdminUserRow } from '../services/userManagementService';

export default function FraudRiskPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => subscribeTransactions(setTxs, (e) => setError(e.message)), []);
  async function loadUsers() { setLoadingUsers(true); try { setUsers((await fetchUsersPage({})).rows); } catch (e) { console.error(e); setError('Could not load account risk data.'); } finally { setLoadingUsers(false); } }
  useEffect(() => { loadUsers(); }, []);

  const risks = useMemo(() => {
    const rejected = txs.filter(t => String(t.status).toLowerCase() === 'rejected' || t.rejected === true);
    const pending = txs.filter(t => String(t.status).toLowerCase() === 'pending' && !t.approved);
    const highValue = txs.filter(t => Number(t.total ?? t.amount ?? 0) >= 10000);
    const failedByCustomer = new Map<string, number>();
    rejected.forEach(t => { const key = t.customerId || t.customerPhone || 'unknown'; failedByCustomer.set(key, (failedByCustomer.get(key) || 0) + 1); });
    const repeatRejects = [...failedByCustomer.entries()].filter(([, n]) => n >= 3).length;
    const disabled = users.filter(u => u.disabled).length;
    return { rejected, pending, highValue, repeatRejects, disabled };
  }, [txs, users]);

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="rounded-3xl bg-gradient-to-r from-[#0b2447] to-[#1a73e8] p-6 text-white shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold opacity-90"><ShieldAlert size={18}/> Fraud & Risk Control</div><h1 className="text-2xl font-bold sm:text-3xl">Risk Operations Center</h1><p className="mt-2 text-sm opacity-90">Surface transaction and account signals that may need investigation.</p></div><button onClick={loadUsers} disabled={loadingUsers} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b2447] disabled:opacity-60"><RefreshCw size={16}/> Refresh</button></div></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Risk icon={AlertTriangle} label="Rejected transactions" value={risks.rejected.length} tone="danger"/><Risk icon={ShieldAlert} label="Pending approvals" value={risks.pending.length} tone="warn"/><Risk icon={Ban} label="High-value transactions" value={risks.highValue.length} tone="info"/><Risk icon={UserX} label="Disabled accounts" value={risks.disabled} tone="danger"/></div>
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-[#0b2447]">Investigation signals</h2><p className="mt-1 text-sm text-slate-500">Heuristics only — these are review signals, not automatic fraud decisions.</p></div><div className="space-y-3 p-5"><Signal label="Customers with 3+ rejected transactions" value={risks.repeatRejects}/><Signal label="Transactions ≥ RM10,000" value={risks.highValue.length}/><Signal label="Pending transactions awaiting approval" value={risks.pending.length}/></div></section><section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-[#0b2447]">Recommended response</h2></div><div className="space-y-3 p-5 text-sm text-slate-600"><p>• Review repeated rejected transactions before account action.</p><p>• Inspect high-value activity against the transaction's service and customer context.</p><p>• Use User Management for account disable/role changes and Transactions for operational actions.</p><a href="/transactions" className="inline-block rounded-xl bg-[#0b2447] px-4 py-2 text-xs font-semibold text-white">Open Transactions</a><a href="/users" className="ml-2 inline-block rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-[#0b2447]">Open Users</a></div></section></div>
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-[#0b2447]">Recent risk candidates</h2></div><div className="divide-y divide-slate-100">{risks.highValue.slice(0, 10).map(t=><div key={t.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-[#0b2447]">{t.service || 'Transaction'}</p><p className="text-xs text-slate-500">{t.customerPhone || t.customerId || 'Unknown customer'} · {t.status}</p></div><span className="font-semibold">RM {Number(t.total ?? t.amount ?? 0).toLocaleString(undefined,{minimumFractionDigits:2})}</span></div>)}{!risks.highValue.length && <div className="p-10 text-center"><CheckCircle2 className="mx-auto" size={30}/><p className="mt-3 text-sm font-semibold">No high-value candidates</p></div>}</div></div>
  </div>;
}
function Risk({icon:Icon,label,value,tone}:{icon:typeof AlertTriangle;label:string;value:number;tone:'danger'|'warn'|'info'}) { const cls=tone==='danger'?'text-red-600':tone==='warn'?'text-amber-600':'text-blue-600'; return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><Icon size={19} className={cls}/></div><div className="mt-2 text-2xl font-bold text-[#0b2447]">{value.toLocaleString()}</div></div>; }
function Signal({label,value}:{label:string;value:number}) { return <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4"><span className="text-sm text-slate-600">{label}</span><span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-[#0b2447]">{value.toLocaleString()}</span></div>; }
