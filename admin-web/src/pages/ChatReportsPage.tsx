import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchChatReports,
  setChatReportStatus,
  type ChatReport,
  type ChatReportTab,
} from '../services/moderationService';
import { updateUserDisabled } from '../services/userManagementService';
import { useAuth } from '../contexts/AuthContext';

const TABS: { key: ChatReportTab; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

export default function ChatReportsPage() {
  const { firebaseUser, profile } = useAuth();
  const canSuspend = profile?.role === 'superadmin';
  const navigate = useNavigate();
  const [tab, setTab] = useState<ChatReportTab>('open');
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(t: ChatReportTab) {
    setLoading(true);
    setError(null);
    try {
      setReports(await fetchChatReports(t));
    } catch (err) {
      console.error(err);
      setError('Could not load chat reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleSetStatus(report: ChatReport, status: 'open' | 'resolved') {
    if (!firebaseUser) return;
    setBusyId(report.id);
    try {
      await setChatReportStatus(report, status, firebaseUser.uid);
      setReports((prev) =>
        tab === 'all' ? prev.map((r) => (r.id === report.id ? { ...r, status } : r)) : prev.filter((r) => r.id !== report.id)
      );
    } catch (err) {
      console.error(err);
      setError(`Could not ${status === 'resolved' ? 'resolve' : 'reopen'} this report.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSuspendUser(report: ChatReport) {
    if (!report.reportedUid || !firebaseUser) return;
    setBusyId(report.id);
    try {
      await updateUserDisabled(report.reportedUid, true);
      await setChatReportStatus(report, 'resolved', firebaseUser.uid);
      setReports((prev) =>
        tab === 'all'
          ? prev.map((r) => (r.id === report.id ? { ...r, status: 'resolved', reportedSuspended: true } : r))
          : prev.filter((r) => r.id !== report.id)
      );
    } catch (err) {
      console.error(err);
      setError('Could not suspend the reported user — check your role permissions.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Chat Reports</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Reported conversations from direct chat.
      </p>

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              tab === t.key
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-line)] text-[var(--color-ink-soft)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : reports.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">No {tab === 'all' ? '' : tab} chat reports.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {reports.map((report) => {
            const busy = busyId === report.id;
            const resolved = report.status === 'resolved';
            return (
              <div
                key={report.id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"
              >
                <div>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      resolved
                        ? 'bg-black/10 text-[var(--color-ink-soft)]'
                        : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                    }`}
                  >
                    {resolved ? 'Resolved' : 'Open'}
                  </span>
                  <p className="mt-2">
                    <span className="text-xs text-[var(--color-ink-soft)]">Reported: </span>
                    <span className="font-semibold">{report.reportedName ?? 'Unknown user'}</span>
                    {report.reportedSuspended && (
                      <span className="ml-2 text-xs text-[var(--color-danger)]">🚫 Suspended</span>
                    )}
                  </p>
                  <p>
                    <span className="text-xs text-[var(--color-ink-soft)]">Reported by: </span>
                    <span className="font-semibold">{report.reporterName ?? 'a user'}</span>
                  </p>
                  <p className="mt-2 text-sm">🚩 {report.reason}</p>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{report.createdAt ?? '—'}</p>
                </div>

                <div className="flex shrink-0 gap-2">
                  {resolved ? (
                    <button
                      disabled={busy}
                      onClick={() => handleSetStatus(report, 'open')}
                      className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-xs font-semibold hover:border-[var(--color-primary)] disabled:opacity-40"
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => handleSetStatus(report, 'resolved')}
                      className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-xs font-semibold hover:border-[var(--color-primary)] disabled:opacity-40"
                    >
                      Dismiss
                    </button>
                  )}
                  {canSuspend && !report.reportedSuspended && (
                    <button
                      disabled={busy || !report.reportedUid}
                      onClick={() => handleSuspendUser(report)}
                      title={!report.reportedUid ? 'No user reference on this report' : undefined}
                      className="rounded-lg bg-[var(--color-danger)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Suspend User
                    </button>
                  )}
                  {canSuspend && !resolved && report.chatId && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const q = new URLSearchParams();
                        if (report.reportedUid) q.set('reportedUid', report.reportedUid);
                        if (report.reportedName) q.set('reportedName', report.reportedName);
                        navigate(`/chat-reports/investigate/${report.chatId}?${q.toString()}`);
                      }}
                      className="rounded-lg border border-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary)] disabled:opacity-40"
                    >
                      🔍 Investigate
                    </button>
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
