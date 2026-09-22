import { useMemo, useState } from 'react';
import { Activity, Search, ShieldCheck, UserCog, UserX, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ALL_ROLES, fetchUsersPage, filterBySearch, type AdminUserRow, type UserRole } from '../services/userManagementService';

export default function UserOperationsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { const result = await fetchUsersPage({ roleFilter: role }); setRows(result.rows); }
    catch (e) { console.error(e); setError('Could not load users. Check Firestore access and connection.'); }
    finally { setLoading(false); }
  }

  const visible = useMemo(() => filterBySearch(rows, query), [rows, query]);
  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => !r.disabled).length,
    disabled: rows.filter((r) => r.disabled).length,
    privileged: rows.filter((r) => r.role === 'admin' || r.role === 'superadmin').length,
  }), [rows]);

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="rounded-3xl bg-gradient-to-r from-[#0b2447] to-[#1a73e8] p-6 text-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-semibold opacity-90"><UserCog size={18}/> User Operations</div><h1 className="text-2xl font-bold sm:text-3xl">Account Operations Center</h1><p className="mt-2 text-sm opacity-90">Search, review and monitor the first page of user accounts available to your role.</p></div>
        <button onClick={load} disabled={loading} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b2447] disabled:opacity-60">{loading ? 'Loading…' : 'Load users'}</button>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {([[Users,'Loaded accounts',stats.total],[ShieldCheck,'Active',stats.active],[UserX,'Disabled',stats.disabled],[UserCog,'Privileged',stats.privileged]] as const).map(([Icon,label,value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><Icon size={19}/></div><div className="mt-2 text-2xl font-bold text-[#0b2447]">{Number(value).toLocaleString()}</div></div>)}
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search size={17} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search loaded users by name, email or phone…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#00a99d]"/></div><select value={role} onChange={(e)=>setRole(e.target.value as UserRole|'all')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">All roles</option>{ALL_ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></div></div>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-[#0b2447]">Account directory</h2><p className="mt-1 text-sm text-slate-500">Role and account changes remain governed by the existing User Management permission rules.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase text-slate-500"><th className="px-5 py-3">User</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Account ID</th></tr></thead><tbody>{visible.map(r=><tr key={r.uid} className="border-b border-slate-100 last:border-0"><td className="px-5 py-3 font-medium text-[#0b2447]">{r.name}</td><td className="px-5 py-3 text-slate-500"><div>{r.email || '—'}</div><div className="text-xs">{r.phone || ''}</div></td><td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize">{r.role}</span></td><td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.disabled?'bg-red-50 text-red-700':'bg-emerald-50 text-emerald-700'}`}>{r.disabled?'Disabled':'Active'}</span></td><td className="px-5 py-3 font-mono text-xs text-slate-400">{r.uid}</td></tr>)}{!loading&&visible.length===0&&<tr><td colSpan={5} className="p-10 text-center text-sm text-slate-500">No loaded accounts match the current filters. Click “Load users” to query Firestore.</td></tr>}</tbody></table></div></div>

    <div className="flex items-center gap-2 text-xs text-slate-500"><Activity size={15}/> Signed in as <strong>{profile?.role || 'admin'}</strong>. This center is read-only; use User Management for authorized account changes.</div>
  </div>;
}
