import { useEffect, useState } from 'react';
import { fetchOpsOverview, type OpsOverview } from '../services/reportsService';

const CARDS: { key: keyof OpsOverview; label: string; tone?: 'warn' | 'danger' }[] = [
  { key: 'totalUsers', label: 'Total users' },
  { key: 'verifiedUsers', label: 'Verified users' },
  { key: 'pendingVerifications', label: 'Pending verifications', tone: 'warn' },
  { key: 'openTickets', label: 'Open support tickets', tone: 'warn' },
  { key: 'pendingMarketplaceReports', label: 'Pending marketplace reports', tone: 'danger' },
  { key: 'pendingChatReports', label: 'Open chat reports', tone: 'danger' },
];

export default function ReportsPage() {
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setOverview(await fetchOpsOverview());
      setLoading(false);
    })();
  }, []);

  const anyRestricted = overview && Object.values(overview).some((v) => v === null);

  return (
    <div>
      <h1 className="text-2xl font-bold">Reports</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        A live snapshot across the queues from earlier phases. Not historical trends — just
        what needs attention right now.
      </p>

      {anyRestricted && (
        <div className="mt-4 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-sm">
          Some metrics show "—" because your role doesn't have blanket read access to that queue
          (e.g. Support Tickets is superadmin-only for the full count).
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : overview ? (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          {CARDS.map(({ key, label, tone }) => {
            const value = overview[key];
            const flagged = tone && typeof value === 'number' && value > 0;
            return (
              <div
                key={key}
                className={`rounded-2xl border p-5 ${
                  flagged
                    ? tone === 'danger'
                      ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5'
                      : 'border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10'
                    : 'border-[var(--color-line)] bg-[var(--color-card)]'
                }`}
              >
                <p className="text-3xl font-bold font-[var(--font-display)]">
                  {value === null ? '—' : value}
                </p>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{label}</p>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
