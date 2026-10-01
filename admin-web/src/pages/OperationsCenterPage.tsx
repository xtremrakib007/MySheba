import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchTickets, type SupportTicket } from '../services/supportService';

export default function OperationsCenterPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const isSuperadmin = profile?.role === 'superadmin';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTickets(isSuperadmin ? 'queue' : 'assigned', isSuperadmin ? { status: 'all' } : {})
      .then((rows) => { if (alive) setTickets(rows); })
      .catch((err) => { if (alive) setError(err.message || 'Could not load operations.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isSuperadmin, refresh]);

  const counts = useMemo(() => ({
    open: tickets.filter((t) => t.status === 'open').length,
    progress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
  }), [tickets]);

  const actions = [
    { title: 'Open Support', value: counts.open, text: 'Tickets waiting for action', icon: AlertCircle, path: '/support', tone: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10' },
    { title: 'In Progress', value: counts.progress, text: 'Tickets being handled', icon: Clock3, path: '/support', tone: 'text-[#8a6d00] bg-[var(--color-warning)]/15' },
    { title: 'KYC Queue', value: 'Review', text: 'Identity verification workflow', icon: ShieldCheck, path: '/verification', tone: 'text-[var(--color-primary)] bg-[var(--color-primary)]/10' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Operations Center</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">A single action queue for the issues that need attention.</p>
        </div>
        <button onClick={() => setRefresh((v) => v + 1)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-semibold hover:border-[var(--color-primary)]"><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div className="mt-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map(({ title, value, text, icon: Icon, path, tone }) => (
          <button key={title} onClick={() => navigate(path)} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between"><div className={`rounded-xl p-3 ${tone}`}><Icon size={21} /></div><ArrowRight size={17} className="text-slate-300" /></div>
            <p className="mt-4 text-sm font-bold">{title}</p><p className="mt-1 text-2xl font-extrabold">{value}</p><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{text}</p>
          </button>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">Latest Support Queue</h2><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{loading ? 'Loading…' : `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} loaded`}</p></div><button onClick={() => navigate('/support')} className="text-xs font-bold text-[var(--color-primary)]">Open full queue</button></div>
        <div className="mt-4 space-y-2">
          {tickets.filter((t) => t.status !== 'resolved').slice(0, 8).map((ticket) => (
            <button key={ticket.id} onClick={() => navigate('/support')} className="flex w-full items-center gap-3 rounded-xl border border-[var(--color-line)] px-3 py-3 text-left hover:border-[var(--color-primary)]">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{ticket.subject}</p><p className="mt-0.5 truncate text-xs text-[var(--color-ink-soft)]">{ticket.userName || 'Unknown'} · {ticket.createdAt || '—'}</p></div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold capitalize">{ticket.status.replace('_', ' ')}</span><ArrowRight size={15} className="text-slate-300" />
            </button>
          ))}
          {!loading && tickets.filter((t) => t.status !== 'resolved').length === 0 && <div className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-success)]/10 px-4 py-6 text-sm"><CheckCircle2 size={17} /> No unresolved support tickets.</div>}
        </div>
      </section>
    </div>
  );
}
