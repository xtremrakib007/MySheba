import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { subscribeAllTransfers, type PointTransfer } from '../services/pointTransferService';

function money(value: number) {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', maximumFractionDigits: 2 }).format(value);
}

export default function WalletSettlementPage() {
  const { profile } = useAuth();
  const [transfers, setTransfers] = useState<PointTransfer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeAllTransfers(setTransfers, (err) => setError(err.message));
    return unsub;
  }, []);

  const stats = useMemo(() => {
    const total = transfers.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const todayKey = new Date().toDateString();
    const today = transfers.filter((t) => t.createdAt && new Date(t.createdAt).toDateString() === todayKey)
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const senders = new Set(transfers.map((t) => t.fromUid).filter(Boolean)).size;
    const recipients = new Set(transfers.map((t) => t.toUid).filter(Boolean)).size;
    return { total, today, senders, recipients };
  }, [transfers]);

  const cards = [
    { label: 'Points transferred', value: stats.total.toLocaleString(), note: 'Platform transfer history' },
    { label: 'Transferred today', value: stats.today.toLocaleString(), note: 'Based on recorded timestamps' },
    { label: 'Active senders', value: stats.senders.toLocaleString(), note: 'Unique transfer sources' },
    { label: 'Recipients', value: stats.recipients.toLocaleString(), note: 'Unique transfer targets' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] p-6 text-white shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/75">Financial Operations</p>
        <h1 className="mt-1 text-2xl font-bold">Wallet & Settlement Control Center</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/85">
          Monitor wallet-point movement, settlement activity and the operational tools used to manage balances.
        </p>
        <p className="mt-3 text-xs text-white/70">Signed in as {profile?.name || profile?.email || 'administrator'}</p>
      </div>

      {error && <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{card.label}</p>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Recent Point Movement</h2>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Live platform-wide transfer records.</p>
            </div>
            <Link to="/transfer-points" className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white">Transfer Points</Link>
          </div>
          <div className="mt-4 space-y-2">
            {transfers.slice(0, 10).map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] px-3 py-3 text-sm">
                <div><span className="font-semibold">{t.fromName || t.fromUid}</span> → <span className="font-semibold">{t.toName || t.toUid}</span><p className="text-xs text-[var(--color-ink-soft)]">{t.createdAt || '—'}</p></div>
                <span className="font-bold">{Number(t.amount || 0).toLocaleString()} pts</span>
              </div>
            ))}
            {transfers.length === 0 && <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">No point transfers recorded.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="font-bold">Settlement Tools</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Use the existing operational controls rather than duplicating balance-changing logic.</p>
          <div className="mt-4 space-y-2">
            <Link to="/transfer-points" className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><b>Transfer Points</b><p className="text-xs text-[var(--color-ink-soft)]">Move points between manageable accounts.</p></Link>
            {profile?.role === 'superadmin' && <Link to="/topup" className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><b>Recharge / Top-up</b><p className="text-xs text-[var(--color-ink-soft)]">Superadmin balance operations.</p></Link>}
            <Link to="/financial" className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><b>Financial Control</b><p className="text-xs text-[var(--color-ink-soft)]">Transaction approvals and operational alerts.</p></Link>
            <Link to="/transactions" className="block rounded-xl border border-[var(--color-line)] p-3 hover:border-[var(--color-primary)]"><b>Transactions</b><p className="text-xs text-[var(--color-ink-soft)]">Review and process service transactions.</p></Link>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-300/40 bg-amber-50 p-5 text-sm text-amber-900">
        <b>Reconciliation boundary:</b> this dashboard reports recorded point transfers and links to the existing server-side financial controls. It does not invent wallet balances or perform client-side balance mutations.
      </div>

      <div className="text-xs text-[var(--color-ink-soft)]">Live updates are sourced from the existing point-transfer history.</div>
      <span className="hidden">{money(0)}</span>
    </div>
  );
}
