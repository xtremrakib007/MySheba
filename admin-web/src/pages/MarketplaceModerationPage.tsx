import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  REPORT_KINDS,
  deleteTarget,
  fetchAllMarketplaceReports,
  fetchTargetStatus,
  hideTarget,
  restoreTarget,
  setMarketplaceBan,
  setMarketplaceReportStatus,
  type MarketplaceReport,
  type ReportKind,
  type TargetStatus,
} from '../services/moderationService';

const KIND_TABS: { key: ReportKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  ...(Object.entries(REPORT_KINDS) as [ReportKind, { label: string }][]).map(([key, cfg]) => ({
    key,
    label: cfg.label,
  })),
];

function TargetControls({
  report,
  onChanged,
}: {
  report: MarketplaceReport;
  onChanged: () => void;
}) {
  const [target, setTarget] = useState<TargetStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTargetStatus(report).then(setTarget).catch(() => setTarget(null));
  }, [report]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError((err as Error).message || 'Could not complete this action.');
    } finally {
      setBusy(false);
    }
  }

  if (!target) return <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Loading post status…</p>;
  if (!target.exists) return <p className="mt-2 text-xs text-[var(--color-ink-soft)]">This post no longer exists.</p>;

  return (
    <div className="mt-2">
      <p className="text-xs text-[var(--color-ink-soft)]">
        Post status: <span className="font-semibold">{target.status ?? 'unknown'}</span>
      </p>
      {error && <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {target.status !== 'hidden' ? (
          <button
            disabled={busy}
            onClick={() => run(() => hideTarget(report))}
            className="rounded-lg border border-[var(--color-warning)]/50 px-3 py-1.5 text-xs font-semibold text-[#8a6d00] disabled:opacity-40"
          >
            Hide post
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => run(() => restoreTarget(report))}
            className="rounded-lg border border-[var(--color-success)]/50 px-3 py-1.5 text-xs font-semibold text-[var(--color-success)] disabled:opacity-40"
          >
            Restore post
          </button>
        )}
        {!confirmingDelete ? (
          <button
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            className="rounded-lg border border-[var(--color-danger)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-40"
          >
            Delete post
          </button>
        ) : (
          <>
            <span className="text-xs text-[var(--color-danger)]">Delete permanently?</span>
            <button
              disabled={busy}
              onClick={() => run(() => deleteTarget(report))}
              className="rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Confirm delete
            </button>
            <button
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
              className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold"
            >
              Cancel
            </button>
          </>
        )}
        {target.ownerId && (
          <button
            disabled={busy}
            onClick={() => run(() => setMarketplaceBan(target.ownerId!, true, `Report: ${report.reason}`))}
            className="rounded-lg border border-[var(--color-danger)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-40"
          >
            Ban poster from Marketplace
          </button>
        )}
      </div>
    </div>
  );
}

export default function MarketplaceModerationPage() {
  const { firebaseUser } = useAuth();
  const [tab, setTab] = useState<ReportKind | 'all'>('all');
  const [reports, setReports] = useState<MarketplaceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setReports(await fetchAllMarketplaceReports());
    } catch (err) {
      console.error(err);
      setError('Could not load marketplace reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const open = reports.filter((r) => r.status !== 'resolved');
    return tab === 'all' ? open : open.filter((r) => r.kind === tab);
  }, [reports, tab]);

  async function handleDismiss(report: MarketplaceReport) {
    if (!firebaseUser) return;
    setBusyId(report.id);
    try {
      await setMarketplaceReportStatus(report, 'resolved', firebaseUser.uid);
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status: 'resolved' } : r)));
    } catch (err) {
      console.error(err);
      setError('Could not dismiss this report.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Marketplace Moderation</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Reported posts across Buy & Sell, Accommodation, Room Sharing, Local Services, and
        Community.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {KIND_TABS.map((t) => (
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
      ) : visible.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">No open reports.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {visible.map((report) => {
            const busy = busyId === report.id;
            const expanded = expandedId === report.id;
            return (
              <div
                key={report.id}
                className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase">
                      {report.kindLabel}
                    </span>
                    <p className="mt-2 font-semibold">{report.targetTitle}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      Reported by {report.reporterId ?? 'a user'} · {report.createdAt ?? '—'}
                    </p>
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">Reason: </span>
                      {report.reason}
                    </p>
                    {report.details && (
                      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{report.details}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      disabled={busy}
                      onClick={() => handleDismiss(report)}
                      className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-xs font-semibold hover:border-[var(--color-primary)] disabled:opacity-40"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => setExpandedId(expanded ? null : report.id)}
                      className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white"
                    >
                      {expanded ? 'Hide options' : 'Review post'}
                    </button>
                  </div>
                </div>

                {expanded && <TargetControls report={report} onChanged={load} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
