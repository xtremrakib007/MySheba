import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Mail, MailCheck, MailX, RefreshCw } from 'lucide-react';
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_LABELS,
  fetchContactMessages,
  setContactStatus,
  type ContactMessage,
  type ContactStatus,
} from '../services/contactMessageService';

const STATUS_STYLES: Record<ContactStatus, string> = {
  new: 'bg-blue-50 text-blue-700',
  read: 'bg-slate-100 text-slate-700',
  replied: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-slate-100 text-slate-500',
};

export default function SupportMessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [filter, setFilter] = useState<ContactStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMessages(await fetchContactMessages(filter));
    } catch (err) {
      console.error(err);
      setError('Could not load contact messages. This queue needs admin read access to contactMessages.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    total: messages.length,
    unhandled: messages.filter((m) => m.status === 'new').length,
    undelivered: messages.filter((m) => m.emailStatus === 'failed').length,
  }), [messages]);

  async function changeStatus(message: ContactMessage, status: ContactStatus) {
    setBusyId(message.id);
    try {
      await setContactStatus(message.id, status);
      setMessages((prev) => (filter === 'all'
        ? prev.map((m) => (m.id === message.id ? { ...m, status } : m))
        : prev.filter((m) => m.id !== message.id)));
    } catch (err) {
      console.error(err);
      setError('Could not update that message.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Support Messages</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Messages sent from the mysheba.top contact forms. Replies go out from your own mail client — this queue tracks what has been handled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ContactStatus | 'all')}
            className="rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          >
            <option value="all">All messages</option>
            {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{CONTACT_STATUS_LABELS[s]}</option>)}
          </select>
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {([['Messages', counts.total, Mail], ['Awaiting handling', counts.unhandled, MailX], ['Email not delivered', counts.undelivered, MailCheck]] as const).map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
            <div className="flex items-center justify-between text-sm text-[var(--color-ink-soft)]"><span>{label}</span><Icon size={18} /></div>
            <p className="mt-2 text-2xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : messages.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center text-sm text-[var(--color-ink-soft)]">
          No contact messages in this view.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {messages.map((m) => (
            <article key={m.id} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{m.subjectLabel}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                    {m.name} · <a className="underline" href={`mailto:${m.email}`}>{m.email}</a>{m.phone ? ` · ${m.phone}` : ''} · {m.createdAt ?? 'Unknown date'} · {m.language.toUpperCase()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${STATUS_STYLES[m.status]}`}>{CONTACT_STATUS_LABELS[m.status]}</span>
                  {m.emailStatus === 'failed' && <span className="rounded-full bg-[var(--color-danger)]/10 px-2.5 py-1 text-[10px] font-bold uppercase text-[var(--color-danger)]" title={m.emailError ?? undefined}>Email failed</span>}
                  {m.emailStatus === 'pending' && <span className="rounded-full bg-[var(--color-warning)]/10 px-2.5 py-1 text-[10px] font-bold uppercase text-[var(--color-warning)]">Email pending</span>}
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-ink)]">{m.message}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subjectLabel}`)}`} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white">Reply by email</a>
                {CONTACT_STATUSES.filter((s) => s !== m.status).map((s) => (
                  <button
                    key={s}
                    disabled={busyId === m.id}
                    onClick={() => void changeStatus(m, s)}
                    className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    Mark {CONTACT_STATUS_LABELS[s].toLowerCase()}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
