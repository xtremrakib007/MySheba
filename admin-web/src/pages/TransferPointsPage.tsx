import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeAllTransfers,
  subscribeTransferRecipients,
  transferPoints,
  type PointTransfer,
  type RecipientOption,
} from '../services/pointTransferService';

export default function TransferPointsPage() {
  const { profile } = useAuth();
  const role = profile?.role === 'superadmin' ? 'superadmin' : 'admin';

  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<RecipientOption | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<PointTransfer[]>([]);

  useEffect(() => {
    const unsub = subscribeTransferRecipients(role, setRecipients, () => {});
    return unsub;
  }, [role]);

  useEffect(() => {
    const unsub = subscribeAllTransfers(setHistory, (err) => setError(err.message));
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients.slice(0, 20);
    return recipients.filter((r) => r.name.toLowerCase().includes(q) || r.phone.includes(q)).slice(0, 20);
  }, [recipients, search]);

  async function handleSend() {
    if (!selected) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      await transferPoints({ toUid: selected.id, amount: amt, note });
      setResult(`Sent ${amt} points to ${selected.name || selected.phone}.`);
      setSelected(null);
      setAmount('');
      setNote('');
      setSearch('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Transfer Points</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Move wallet points to an account you manage. The balance change happens server-side, in one
        atomic transaction.
      </p>

      <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="text-base font-bold">New Transfer</h2>

        {!selected ? (
          <div className="mt-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient by name or phone…"
              className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[var(--color-line)]">
              {filtered.length === 0 ? (
                <p className="p-3 text-sm text-[var(--color-ink-soft)]">No matching accounts.</p>
              ) : (
                filtered.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="flex w-full items-center justify-between border-b border-[var(--color-line)] px-3 py-2 text-left text-sm last:border-0 hover:bg-black/5"
                  >
                    <span>{r.name || r.phone}</span>
                    <span className="text-xs uppercase text-[var(--color-ink-soft)]">{r.role}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-black/5 px-3 py-2 text-sm">
              <span>
                To: <span className="font-semibold">{selected.name || selected.phone}</span>{' '}
                <span className="text-xs uppercase text-[var(--color-ink-soft)]">({selected.role})</span>
              </span>
              <button onClick={() => setSelected(null)} className="text-xs font-semibold text-[var(--color-primary)]">
                Change
              </button>
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (points)"
              className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        )}

        {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
        {result && <p className="mt-3 text-sm text-[var(--color-success)]">{result}</p>}

        <button
          disabled={sending || !selected || !amount}
          onClick={handleSend}
          className="mt-4 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {sending ? 'Sending…' : '💸 Send Points'}
        </button>
      </div>

      <h2 className="mt-8 text-lg font-bold">Transfer History</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">No transfers yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {history.map((t) => (
            <div key={t.id} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-4">
              <p className="text-sm">
                <span className="font-semibold">{t.fromName || t.fromUid}</span> →{' '}
                <span className="font-semibold">{t.toName || t.toUid}</span> · {t.amount} pts
              </p>
              {t.note && <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{t.note}</p>}
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{t.createdAt ?? '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
