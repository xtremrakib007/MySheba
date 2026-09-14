import { useEffect, useMemo, useState } from 'react';
import {
  approveTransaction,
  assignDealer,
  completeTransaction,
  rejectTransaction,
  subscribeDealerOptions,
  subscribeTransactions,
  type DealerOption,
  type Transaction,
} from '../services/transactionService';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-[var(--color-warning)]/15 text-[#8a6d00]',
  processing: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
  completed: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
};

function CompleteControl({ tx, busy, onComplete }: { tx: Transaction; busy: boolean; onComplete: (pin?: string, receiptUrl?: string) => void }) {
  const [pin, setPin] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');

  if (tx.service === 'Mobile Banking') {
    return (
      <div className="flex gap-2">
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit PIN" className="w-28 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
        <button disabled={busy || pin.length !== 4} onClick={() => onComplete(pin)} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">✓ Complete</button>
      </div>
    );
  }

  if (tx.service === 'Remittance') {
    return (
      <div className="flex gap-2">
        <input value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="Receipt URL" className="flex-1 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
        <button disabled={busy || !receiptUrl.trim()} onClick={() => onComplete(undefined, receiptUrl.trim())} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">✓ Complete</button>
      </div>
    );
  }

  return <button disabled={busy} onClick={() => onComplete()} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">✓ Complete</button>;
}

export default function TransactionsPage() {
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => subscribeTransactions(setTxs, (err) => setLoadError(err.message)), []);
  useEffect(() => subscribeDealerOptions(setDealers, () => {}), []);

  const visible = useMemo(() => (tab === 'all' ? txs : txs.filter((t) => t.status === 'pending')), [txs, tab]);

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try { await fn(); } catch (err) { console.error(err); setLoadError((err as Error).message || 'Could not update this order.'); } finally { setBusyId(null); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Transactions</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Approve orders first. Dealers/resellers then accept them as the Operator and complete them.</p>

      <div className="mt-4 flex gap-2">
        {(['all', 'pending'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === t ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-line)] text-[var(--color-ink-soft)]'}`}>{t === 'all' ? 'All Tx' : 'Pending'}</button>
        ))}
      </div>

      {loadError && <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{loadError}</div>}

      {visible.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center"><p className="text-sm text-[var(--color-ink-soft)]">Nothing here.</p></div>
      ) : (
        <div className="mt-6 space-y-3">
          {visible.map((tx) => {
            const busy = busyId === tx.id;
            return (
              <div key={tx.id} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{tx.service}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[tx.status]}`}>{tx.status}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tx.approved ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-warning)]/15 text-[#8a6d00]'}`}>{tx.approved ? 'APPROVED' : 'AWAITING APPROVAL'}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">👤 {tx.customerPhone || 'Unknown'} · {tx.createdAt ?? '—'}</p>
                <p className="mt-1 text-sm">📝 {tx.details}</p>
                <p className="mt-2 font-semibold">MYR {tx.total.toFixed(2)}</p>

                {tx.approved && tx.approvedByName && <p className="mt-2 text-xs">✓ Approved By: {tx.approvedByName} ({tx.approvedByRole || 'admin'})</p>}
                {tx.claimedByName && <p className="mt-1 text-xs">👤 Operator: {tx.claimedByName} ({tx.claimedByRole || 'staff'})</p>}
                {tx.completedByName && <p className="mt-1 text-xs">✓ Completed By: {tx.completedByName}</p>}

                {!tx.dealerId && (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-[var(--color-danger)]/5 px-3 py-2">
                    <span className="text-xs text-[var(--color-danger)]">⚠️ No dealer assigned</span>
                    <button onClick={() => setAssigningId(tx.id)} className="rounded-lg border border-[var(--color-danger)]/40 px-3 py-1 text-xs font-semibold text-[var(--color-danger)]">🧑‍💼 Appoint Dealer</button>
                  </div>
                )}

                {assigningId === tx.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dealers.map((dl) => (
                      <button key={dl.id} disabled={busy} onClick={() => run(tx.id, async () => { await assignDealer(tx.id, dl.id); setAssigningId(null); })} className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs hover:border-[var(--color-primary)] disabled:opacity-40">{dl.name || dl.phone}</button>
                    ))}
                    {dealers.length === 0 && <p className="text-xs text-[var(--color-ink-soft)]">No dealers found.</p>}
                  </div>
                )}

                {tx.status === 'pending' && (
                  <div className="mt-4 flex gap-2">
                    {!tx.approved && <button disabled={busy} onClick={() => run(tx.id, () => approveTransaction(tx.id))} className="rounded-lg bg-[var(--color-success)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">✓ Approve</button>}
                    <button disabled={busy} onClick={() => setRejectingId(tx.id)} className="rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">✕ Reject</button>
                  </div>
                )}

                {rejectingId === tx.id && (
                  <div className="mt-2 flex gap-2">
                    <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejecting…" className="flex-1 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
                    <button disabled={busy || !rejectReason.trim()} onClick={() => run(tx.id, async () => { await rejectTransaction(tx.id, rejectReason.trim(), tx.service); setRejectingId(null); setRejectReason(''); })} className="rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Confirm</button>
                  </div>
                )}

                {tx.status === 'processing' && tx.approved && <div className="mt-4"><CompleteControl tx={tx} busy={busy} onComplete={(pin, receiptUrl) => run(tx.id, () => completeTransaction(tx.id, pin, receiptUrl))} /></div>}
                {tx.status === 'completed' && !!tx.pin && <p className="mt-2 text-xs">🔐 Collection PIN: {tx.pin}</p>}
                {tx.status === 'completed' && tx.rejected && <p className="mt-2 text-xs text-[var(--color-danger)]">Rejected: {tx.rejectReason}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
