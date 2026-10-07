import { useEffect, useMemo, useState } from 'react';
import {
  approveTransaction,
  assignDealer,
  archiveFinancialRecord,
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

// An order in `processing` is with its Operator, and only that Operator can
// finish it. This panel used to be a PIN box, a "Receipt URL" box and a
// Complete button, none of which could ever work from here:
// completeTransaction is gated on OPERATOR_ROLES (dealer/reseller) and on
// claimedBy === the caller, so every admin press returned permission-denied
// "Only the dealer/reseller Operator can complete an order." The receipt box
// was unusable for a second reason - the server only accepts a Firebase
// Storage URL under order-receipts/<txId>/ or remittance-receipts/<txId>/ in
// our own bucket, which the Operator's app produces by uploading the receipt.
// An admin has nothing to type there.
//
// So this says what is actually waiting to happen, rather than offering a
// button that fails.
function OperatorPendingNote({ tx }: { tx: Transaction }) {
  const needsPin = tx.service === 'Mobile Banking' || tx.service === 'Remittance';
  const operator = tx.claimedByName || 'the assigned Operator';

  return (
    <div className="rounded-lg bg-[var(--color-primary)]/5 px-3 py-2">
      <p className="text-xs font-semibold text-[var(--color-primary)]">Waiting on {operator} to complete this order</p>
      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
        {operator} completes it in the MySheba app after uploading the transfer receipt
        {needsPin ? ` and entering the ${tx.service} collection PIN the customer gives them` : ''}. Admins approve,
        appoint and reject orders; only the Operator who accepted an order can close it.
      </p>
    </div>
  );
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
  const [archivingId, setArchivingId] = useState<string | null>(null);

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
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Approve orders first. Dealers/resellers then accept them as the Operator and complete the order.</p>

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

                {tx.status === 'processing' && tx.approved && <div className="mt-4"><OperatorPendingNote tx={tx} /></div>}
                {!!tx.receiptUrl && <p className="mt-2 text-xs"><a href={tx.receiptUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--color-primary)] underline">View transfer receipt</a></p>}
                {tx.status === 'completed' && tx.rejected && <p className="mt-2 text-xs text-[var(--color-danger)]">Rejected: {tx.rejectReason}</p>}

                {archivingId === tx.id ? (
                  <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3">
                    <p className="text-xs font-semibold text-[var(--color-danger)]">Archive this financial record?</p>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">The record will not be physically deleted. Its status and audit history remain protected.</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        autoFocus
                        id={`archive-reason-${tx.id}`}
                        placeholder="Required reason…"
                        className="flex-1 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]"
                      />
                      <button
                        disabled={busy}
                        onClick={() => {
                          const input = document.getElementById(`archive-reason-${tx.id}`) as HTMLInputElement | null;
                          const reason = input?.value.trim() || '';
                          if (!reason) { setLoadError('A reason is required to archive a transaction.'); return; }
                          void run(tx.id, async () => {
                            await archiveFinancialRecord('transaction', tx.id, reason);
                            setArchivingId(null);
                          });
                        }}
                        className="rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >Confirm Archive</button>
                      <button type="button" onClick={() => setArchivingId(null)} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setArchivingId(tx.id)}
                    className="mt-4 rounded-lg border border-[var(--color-danger)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-40"
                  >Delete / Archive</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
