import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchTickets, type SupportTicket, type TicketStatus } from '../services/supportService';
import { subscribeAllChats, type ChatThread } from '../services/supportChatService';

export default function SupportOperationsPage() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTickets() {
    try {
      const rows = await fetchTickets('queue', { status: 'all' as TicketStatus | 'all' });
      setTickets(rows);
    } catch (err) {
      console.error(err);
      setError('Could not load support tickets.');
    }
  }

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeAllChats(setThreads, (err) => {
      console.error(err);
      setError('Could not load support chats.');
    });
    loadTickets().finally(() => setLoading(false));
    return unsub;
  }, []);

  const metrics = useMemo(() => ({
    open: tickets.filter((t) => t.status === 'open').length,
    inProgress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    unreadChats: threads.reduce((sum, t) => sum + Number(t.unreadForStaff || 0), 0),
    chats: threads.length,
  }), [tickets, threads]);

  const queue = tickets.filter((t) => t.status !== 'resolved').slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] p-6 text-white shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/75">Customer Care</p>
        <h1 className="mt-1 text-2xl font-bold">Support & Customer Care Command Center</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/85">Monitor the support queue and live customer conversations from one operational workspace.</p>
        <p className="mt-3 text-xs text-white/70">Signed in as {profile?.name || profile?.email || 'support administrator'}</p>
      </div>

      {error && <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Open tickets', metrics.open, 'Waiting for support'],
          ['In progress', metrics.inProgress, 'Being handled'],
          ['Resolved', metrics.resolved, 'Completed tickets'],
          ['Unread chat', metrics.unreadChats, 'Customer messages'],
          ['Live chats', metrics.chats, 'Support conversations'],
        ].map(([label, value, note]) => <div key={String(label)} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{label}</p><p className="mt-2 text-2xl font-bold">{loading ? '…' : value}</p><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{note}</p></div>)}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Priority Support Queue</h2><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Open and in-progress tickets requiring attention.</p></div><Link to="/support" className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white">Open Ticket Queue</Link></div>
          <div className="mt-4 space-y-2">
            {queue.map((ticket) => <Link key={ticket.id} to="/support" className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><div className="flex flex-wrap items-center justify-between gap-2"><b>{ticket.subject}</b><span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold">{ticket.status}</span></div><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{ticket.userName || 'Unknown'} · {ticket.userPhone || '—'} · {ticket.createdAt || '—'}</p><p className="mt-2 line-clamp-2 text-sm">{ticket.message}</p></Link>)}
            {queue.length === 0 && <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">No unresolved tickets.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="font-bold">Customer Care Tools</h2>
          <div className="mt-4 space-y-2">
            <Link to="/support" className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><b>Support Tickets</b><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Assign, work, resolve and reopen tickets.</p></Link>
            <Link to="/support-messages" className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><b>Live Support Chat</b><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Reply directly to customers.</p></Link>
            <Link to="/chat-reports" className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><b>Chat Reports</b><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Review reported conversations.</p></Link>
            <Link to="/users" className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><b>User Management</b><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Open account administration.</p></Link>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 text-sm"><b>Support boundary:</b> this center is an operational overview. Ticket assignment, resolution, reopening and live chat replies continue through the existing support controls and server-side rules.</div>
    </div>
  );
}
