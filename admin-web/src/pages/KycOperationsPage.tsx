import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CheckCircle2, Clock3, FileSearch, RefreshCw, ShieldX } from 'lucide-react';
import { fetchVerificationRequests, type VerificationRequest } from '../services/moderationService';

export default function KycOperationsPage() {
  const [rows, setRows] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() { setLoading(true); setError(''); try { setRows(await fetchVerificationRequests('pending')); } catch (e) { console.error(e); setError('Could not load the KYC queue.'); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); if (!q) return rows; return rows.filter((r) => [r.name, r.phone, r.documentType, r.id].some((v) => String(v ?? '').toLowerCase().includes(q))); }, [rows, search]);

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="rounded-3xl bg-gradient-to-r from-[#00a99d] to-[#1a73e8] p-6 text-white shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm font-semibold opacity-90"><BadgeCheck size={18}/> KYC Operations</div><h1 className="text-2xl font-bold sm:text-3xl">Identity Verification Center</h1><p className="mt-2 text-sm opacity-90">Central queue for pending identity verification reviews.</p></div><button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b2447] disabled:opacity-60"><RefreshCw size={16}/> Refresh</button></div></div>
    <div className="grid gap-4 sm:grid-cols-3"><Stat icon={Clock3} label="Pending review" value={rows.length}/><Stat icon={FileSearch} label="Visible in search" value={filtered.length}/><Stat icon={ShieldX} label="Queue action" value={rows.length ? 'Review required' : 'Clear'}/></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search applicant, phone, document type or request ID…" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#00a99d]"/></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-[#0b2447]">Pending verification queue</h2><p className="mt-1 text-sm text-slate-500">Review and approve/reject submissions from Identity Verification.</p></div><div className="divide-y divide-slate-100">{loading ? <div className="p-8 text-center text-sm text-slate-500">Loading KYC queue…</div> : filtered.length===0 ? <div className="p-10 text-center"><CheckCircle2 className="mx-auto" size={30}/><p className="mt-3 text-sm font-semibold text-[#0b2447]">No pending requests</p><p className="mt-1 text-xs text-slate-500">The current pending verification queue is clear.</p></div> : filtered.map((r)=><div key={r.id} className="p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold text-[#0b2447]">{r.name}</p><p className="mt-1 text-sm text-slate-500">{r.phone || 'No phone'} · {r.documentType || 'Document type unknown'}</p><p className="mt-1 font-mono text-xs text-slate-400">{r.id}</p></div><a href="/verification" className="rounded-xl border border-slate-200 px-4 py-2 text-center text-xs font-semibold text-[#0b2447] hover:border-[#00a99d]">Open review</a></div></div>)}</div></div>
  </div>;
}
function Stat({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string | number }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><Icon size={19}/></div><div className="mt-2 text-2xl font-bold text-[#0b2447]">{typeof value==='number'?value.toLocaleString():value}</div></div>; }
