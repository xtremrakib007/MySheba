import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, MessageCircle, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  CHAT_REPORT_STATUS_LABELS,
  fetchChatReports,
  setChatReportStatus,
  type ChatReport,
  type ChatReportStatus,
} from '../services/chatReportService';

const FILTERS: (ChatReportStatus | 'all')[] = ['open', 'resolved', 'dismissed', 'all'];

export default function ChatReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [filter, setFilter] = useState<ChatReportStatus | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReports(await fetchChatReports(filter));
    } catch (err) {
      console.error(err);
      setReports([]);
      setError('Chat reports are not readable with this account. Check that the chatReports collection exists and that admins are allowed to read it.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function review(report: ChatReport, status: ChatReportStatus) {
    setBusyId(report.id);
    try {
      await setChatReportStatus(report.id, status);
      setReports((prev) => (filter === 'all'
        ? prev.map((r) => (r.id === report.id ? { ...r, status } : r))
        : prev.filter((r) => r.id !== report.id)));
    } catch (err) {
      console.error(err);
      setError('Could not update that report.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Chat Reports</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Direct-chat content reported by users. Reviewing a report records the decision; account-level action is taken from User Operations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value as ChatReportStatus | 'all')} className="rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-sm">
            {FILTERS.map((f) => <option key={f} value={f}>{f === 'all' ? 'All reports' : CHAT_REPORT_STATUS_LABELS[f]}</option>)}
          </select>
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />{error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : reports.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <ShieldCheck className="mx-auto text-[var(--color-success)]" size={28} />
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]">No chat reports in this view.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {reports.map((r) => (
            <article key={r.id} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold"><MessageCircle size={16} className="text-[var(--color-secondary)]" />{r.reason}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                    Reported {r.reportedUserName} · by {r.reporterName} · {r.createdAt ?? 'Unknown date'}
                  </p>
                </div>
                <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-bold uppercase">{CHAT_REPORT_STATUS_LABELS[r.status]}</span>
              </div>

              {r.details && <p className="mt-3 whitespace-pre-wrap text-sm">{r.details}</p>}
              {r.messagePreview && (
                <blockquote className="mt-3 rounded-xl border-l-4 border-[var(--color-line)] bg-[var(--color-bg)] p-3 text-sm italic text-[var(--color-ink-soft)]">
                  {r.messagePreview}
                </blockquote>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {r.status !== 'resolved' && <button disabled={busyId === r.id} onClick={() => void review(r, 'resolved')} className="rounded-lg bg-[var(--color-success)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Mark resolved</button>}
                {r.status !== 'dismissed' && <button disabled={busyId === r.id} onClick={() => void review(r, 'dismissed')} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Dismiss</button>}
                {r.status !== 'open' && <button disabled={busyId === r.id} onClick={() => void review(r, 'open')} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Reopen</button>}
                <button onClick={() => navigate('/user-operations')} className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold"><UserRound size={13} /> Account controls</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
