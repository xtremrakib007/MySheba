import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  assignTicket,
  fetchTickets,
  markTicketInProgress,
  reopenTicket,
  resolveTicket,
  STATUS_LABELS,
  subscribeAssignableStaff,
  unassignTicket,
  type AssignableStaff,
  type SupportTicket,
  type TicketStatus,
} from '../services/supportService';

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  in_progress: 'bg-[var(--color-warning)]/15 text-[#8a6d00]',
  resolved: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
};

export default function SupportTicketsPage() {
  const { firebaseUser, profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';

  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('open');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [staff, setStaff] = useState<AssignableStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = isSuperadmin
        ? await fetchTickets('queue', { status: statusFilter })
        : await fetchTickets('assigned', { myUid: firebaseUser?.uid });
      setTickets(rows);
    } catch (err) {
      console.error(err);
      setError('Could not load support tickets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, isSuperadmin, firebaseUser?.uid]);

  useEffect(() => {
    if (!isSuperadmin) return;
    const unsub = subscribeAssignableStaff(setStaff, () => {});
    return unsub;
  }, [isSuperadmin]);

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      console.error(err);
      setError('Could not update this ticket.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Support Tickets</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {isSuperadmin
              ? 'The full incoming queue — every new ticket lands here first.'
              : 'Tickets a superadmin has assigned to you.'}
          </p>
        </div>
        {isSuperadmin && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TicketStatus | 'all')}
            className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="all">All tickets</option>
          </select>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : tickets.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">Nothing here.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {tickets.map((ticket) => {
            const busy = busyId === ticket.id;
            const canReassign = isSuperadmin;
            return (
              <div key={ticket.id} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{ticket.subject}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[ticket.status]}`}>
                    {STATUS_LABELS[ticket.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                  {ticket.userName || 'Unknown'} · {ticket.userPhone || '—'} · {ticket.userRole} ·{' '}
                  {ticket.createdAt ?? '—'}
                </p>
                <p className="mt-3 text-sm">{ticket.message}</p>

                {ticket.assignedToName && (
                  <p className="mt-2 text-xs text-[var(--color-primary)]">
                    Assigned to {ticket.assignedToName} ({ticket.assignedToRole})
                  </p>
                )}

                {ticket.status === 'resolved' && ticket.adminNote && (
                  <div className="mt-3 rounded-lg bg-black/5 px-3 py-2 text-sm">
                    <span className="font-semibold">Resolution note: </span>
                    {ticket.adminNote}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {ticket.status === 'open' && (
                    <button
                      disabled={busy}
                      onClick={() => run(ticket.id, () => markTicketInProgress(ticket.id))}
                      className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--color-primary)] disabled:opacity-40"
                    >
                      Start working on it
                    </button>
                  )}

                  {ticket.status !== 'resolved' ? (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const note = noteDrafts[ticket.id] ?? '';
                        run(ticket.id, () => resolveTicket(ticket.id, note));
                      }}
                      className="rounded-lg bg-[var(--color-success)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Resolve
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => run(ticket.id, () => reopenTicket(ticket.id))}
                      className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--color-primary)] disabled:opacity-40"
                    >
                      Reopen
                    </button>
                  )}

                  {ticket.status !== 'resolved' && (
                    <input
                      value={noteDrafts[ticket.id] ?? ''}
                      onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                      placeholder="Resolution note (optional)"
                      className="min-w-[220px] flex-1 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]"
                    />
                  )}

                  {canReassign && (
                    <select
                      disabled={busy}
                      value={ticket.assignedToUid}
                      onChange={(e) => {
                        const staffMember = staff.find((s) => s.id === e.target.value);
                        if (!staffMember) {
                          run(ticket.id, () => unassignTicket(ticket.id));
                        } else {
                          run(ticket.id, () => assignTicket(ticket.id, staffMember));
                        }
                      }}
                      className="rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-xs"
                    >
                      <option value="">Unassigned</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.role})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
