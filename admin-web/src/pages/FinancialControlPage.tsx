import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, TrendingUp, WalletCards } from 'lucide-react';
import { subscribeTransactions, type Transaction } from '../services/transactionService';

export default function FinancialControlPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setError(null);
    return subscribeTransactions(setTxs, (err) => setError(err.message || 'Could not load financial data.'));
  }, [refreshKey]);

  const stats = useMemo(() => {
    const total = txs.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    const completed = txs.filter((t) => t.status === 'completed' && !t.rejected);
    const completedValue = completed.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
    const pending = txs.filter((t) => t.status === 'pending');
    const processing = txs.filter((t) => t.status === 'processing');
    const rejected = txs.filter((t) => t.rejected);
    return { total, completedValue, pending, processing, rejected };
  }, [txs]);

  const cards = [
    { label: 'Transaction Value', value: `MYR ${stats.total.toFixed(2)}`, icon: WalletCards },
    { label: 'Completed Value', value: `MYR ${stats.completedValue.toFixed(2)}`, icon: TrendingUp },
    { label: 'Pending Approval', value: stats.pending.length, icon: Clock3 },
    { label: 'Processing', value: stats.processing.length, icon: RefreshCw },
    { label: 'Rejected', value: stats.rejected.length, icon: AlertTriangle },
    { label: 'Completed', value: txs.filter((t) => t.status === 'completed' && !t.rejected).length, icon: CheckCircle2 },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Financial Control Center</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Monitor transaction flow, value and operational exceptions in one place.</p>
        </div>
        <button onClick={() => setRefreshKey((v) => v + 1)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-semibold hover:border-[var(--color-primary)]"><RefreshCw size={14} /> Refresh</button>
      </div>

      {error && <div className="mt-4 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4 shadow-sm">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold text-[var(--color-ink-soft)]">{label}</span><Icon size={17} className="text-[var(--color-primary)]" /></div>
            <p className="mt-3 text-xl font-extrabold tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="font-bold">Operational Alerts</h2>
          <div className="mt-4 space-y-3">
            {stats.pending.length > 0 && <div className="flex items-center justify-between rounded-xl bg-[var(--color-warning)]/10 px-4 py-3 text-sm"><span>Transactions awaiting approval</span><b>{stats.pending.length}</b></div>}
            {stats.processing.length > 0 && <div className="flex items-center justify-between rounded-xl bg-[var(--color-primary)]/10 px-4 py-3 text-sm"><span>Transactions currently processing</span><b>{stats.processing.length}</b></div>}
            {stats.rejected.length > 0 && <div className="flex items-center justify-between rounded-xl bg-[var(--color-danger)]/10 px-4 py-3 text-sm"><span>Rejected transactions</span><b>{stats.rejected.length}</b></div>}
            {!stats.pending.length && !stats.processing.length && !stats.rejected.length && <div className="flex items-center gap-2 rounded-xl bg-[var(--color-success)]/10 px-4 py-3 text-sm"><CheckCircle2 size={16} /> No outstanding transaction alerts.</div>}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="font-bold">Recent Transaction Activity</h2>
          <div className="mt-4 space-y-2">
            {txs.slice(0, 6).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-xs">
                <div className="min-w-0"><p className="truncate font-semibold">{tx.service || 'Transaction'}</p><p className="text-[var(--color-ink-soft)]">{tx.customerPhone || 'Unknown'} · {tx.createdAt || '—'}</p></div>
                <div className="text-right"><p className="font-bold">MYR {(Number(tx.total) || 0).toFixed(2)}</p><p className="capitalize text-[var(--color-ink-soft)]">{tx.rejected ? 'rejected' : tx.status}</p></div>
              </div>
            ))}
            {!txs.length && <p className="text-sm text-[var(--color-ink-soft)]">No transactions available.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
