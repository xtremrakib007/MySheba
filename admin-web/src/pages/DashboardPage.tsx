import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchOpsOverview, type OpsOverview } from '../services/reportsService';

const CARDS: { key: keyof OpsOverview; label: string; path: string; tone?: 'warn' | 'danger' }[] = [
  { key: 'totalUsers', label: 'Total users', path: '/users' },
  { key: 'verifiedUsers', label: 'Verified users', path: '/users' },
  { key: 'pendingVerifications', label: 'Pending verifications', path: '/verification', tone: 'warn' },
  { key: 'openTickets', label: 'Open support tickets', path: '/support', tone: 'warn' },
  { key: 'pendingMarketplaceReports', label: 'Pending marketplace reports', path: '/marketplace-moderation', tone: 'danger' },
  { key: 'pendingChatReports', label: 'Open chat reports', path: '/chat-reports', tone: 'danger' },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setOverview(await fetchOpsOverview());
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Welcome back{profile?.name ? `, ${profile.name}` : ''}</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Signed in as {profile?.email} · <span className="capitalize">{profile?.role}</span>
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : overview ? (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          {CARDS.map(({ key, label, path, tone }) => {
            const value = overview[key];
            const flagged = tone && typeof value === 'number' && value > 0;
            return (
              <button
                key={key}
                onClick={() => navigate(path)}
                title={value === null ? "Your role doesn't have full read access to this queue" : undefined}
                className={`rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 ${
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
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
