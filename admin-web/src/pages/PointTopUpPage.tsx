import { useEffect, useState } from 'react';
import {
  fetchRecentTopUps,
  searchTopUpTargets,
  topUpPoints,
  type TopUpRecord,
  type TopUpTargetUser,
} from '../services/superadminService';

export default function PointTopUpPage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<TopUpTargetUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TopUpTargetUser | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [recent, setRecent] = useState<TopUpRecord[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  async function loadRecent() {
    setRecentLoading(true);
    try {
      setRecent(await fetchRecentTopUps());
    } catch (err) {
      console.error(err);
    } finally {
      setRecentLoading(false);
    }
  }

  useEffect(() => {
    loadRecent();
  }, []);

  async function runSearch() {
    setSearching(true);
    setError(null);
    try {
      setResults(await searchTopUpTargets(search));
    } catch (err) {
      console.error(err);
      setError('Search failed.');
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTopUp() {
    if (!selected) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await topUpPoints(selected, amt, note);
      setSuccess(`Added ${amt} funds to ${selected.name}.`);
      setSelected((prev) => (prev ? { ...prev, walletBalance: prev.walletBalance + amt } : prev));
      setResults((prev) =>
        prev.map((u) =>
          u.uid === selected.uid ? { ...u, walletBalance: u.walletBalance + amt } : u
        )
      );
      setAmount('');
      setNote('');
      loadRecent();
    } catch (err) {
      console.error(err);
      setError('Top-up failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Wallet Top-Up</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Add funds to a dealer or reseller's wallet balance. Superadmin only.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 px-4 py-3 text-sm text-[var(--color-success)]">
          {success}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <p className="font-semibold">Find dealer / reseller</p>
          <div className="mt-3 flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="Search name or phone…"
              className="flex-1 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <button
              onClick={runSearch}
              disabled={searching}
              className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-xs font-semibold hover:border-[var(--color-primary)]"
            >
              Search
            </button>
          </div>

          <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
            {results.map((u) => (
              <button
                key={u.uid}
                onClick={() => {
                  setSelected(u);
                  setSuccess(null);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  selected?.uid === u.uid
                    ? 'bg-[var(--color-primary)]/10'
                    : 'hover:bg-black/[0.03]'
                }`}
              >
                <span>
                  {u.name}
                  <span className="ml-2 text-xs capitalize text-[var(--color-ink-soft)]">
                    {u.role}
                  </span>
                </span>
                <span className="text-xs text-[var(--color-ink-soft)]">
                  {u.walletBalance} pts
                </span>
              </button>
            ))}
            {!searching && results.length === 0 && (
              <p className="px-3 py-2 text-sm text-[var(--color-ink-soft)]">No matches.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <p className="font-semibold">Top up</p>
          {!selected ? (
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
              Select a dealer or reseller from the list.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-sm font-medium">{selected.name}</p>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  {selected.phone ?? '—'} · current balance: {selected.walletBalance} pts
                </p>
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              />
              <button
                disabled={busy}
                onClick={handleTopUp}
                className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Add points
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <p className="font-semibold">Recent top-ups</p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Note</th>
                <th className="px-4 py-3 font-semibold">By</th>
                <th className="px-4 py-3 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-4 py-3">{r.userName}</td>
                  <td className="px-4 py-3">+{r.amount}</td>
                  <td className="px-4 py-3 text-[var(--color-ink-soft)]">{r.note ?? '—'}</td>
                  <td className="px-4 py-3">{r.adminName}</td>
                  <td className="px-4 py-3 text-[var(--color-ink-soft)]">{r.createdAt ?? '—'}</td>
                </tr>
              ))}
              {!recentLoading && recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-ink-soft)]">
                    No top-ups yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
