import { useEffect, useMemo, useState } from 'react';
import {
  WALLET_FX_CURRENCIES,
  saveWalletFxPair,
  refreshWalletFx,
  subscribeWalletFx,
} from '../services/walletExchangeRateService';

type Pair = { buyRate?: number; sellRate?: number; liveRate?: number; active?: boolean };

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—';
}

export default function WalletExchangeRatesPage() {
  const [data, setData] = useState<any>({ pairs: {}, liveRates: {} });
  const [drafts, setDrafts] = useState<Record<string, Pair>>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => subscribeWalletFx((next) => {
    setData(next);
    setDrafts((prev) => {
      const out = { ...prev };
      for (const [currency] of WALLET_FX_CURRENCIES) {
        const pair = next.pairs?.[currency] || {};
        out[currency] = out[currency] || {
          buyRate: pair.buyRate ?? '',
          sellRate: pair.sellRate ?? '',
          active: pair.active !== false,
        };
      }
      return out;
    });
  }), []);

  const liveUpdated = useMemo(() => {
    const ts = data.liveUpdatedAt;
    return ts?.toDate?.().toLocaleString?.() || (ts ? String(ts) : 'Not refreshed yet');
  }, [data.liveUpdatedAt]);

  async function handleRefresh() {
    setRefreshing(true);
    setMessage('');
    try {
      await refreshWalletFx();
      setMessage('Live reference rates refreshed successfully.');
    } catch (err: any) {
      setMessage(err?.message || 'Could not refresh live rates.');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSave(currency: string) {
    const draft = drafts[currency] || {};
    setBusy(true);
    setMessage('');
    try {
      await saveWalletFxPair(currency, {
        buyRate: Number(draft.buyRate),
        sellRate: Number(draft.sellRate),
        active: draft.active !== false,
      });
      setMessage(`${currency} rates saved.`);
    } catch (err: any) {
      setMessage(err?.message || 'Could not save rates.');
    } finally {
      setBusy(false);
    }
  }

  function useLive(currency: string) {
    const live = Number(data.liveRates?.[currency]);
    if (!Number.isFinite(live) || live <= 0) return;
    setDrafts((prev) => ({
      ...prev,
      [currency]: { ...(prev[currency] || {}), buyRate: live, sellRate: live },
    }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Wallet Exchange Rates</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-ink-soft)]">
            Local-currency wallet FX. Live rates are reference rates; Superadmin controls the actual customer buy and sell rates.
          </p>
        </div>
        <button
          disabled={refreshing}
          onClick={handleRefresh}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh Live Rates'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-4 text-xs text-[var(--color-ink-soft)]">
        Provider: {data.provider || 'Not set'} · Last live refresh: {liveUpdated}
      </div>

      {message && (
        <div className="mt-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
              <th className="px-4 py-3">Currency</th>
              <th className="px-4 py-3">Live reference</th>
              <th className="px-4 py-3">Buy rate</th>
              <th className="px-4 py-3">Sell rate</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {WALLET_FX_CURRENCIES.map(([currency, country]) => {
              const pair = drafts[currency] || {};
              const live = data.liveRates?.[currency];
              return (
                <tr key={currency} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-4 py-3 font-semibold">{currency}<div className="text-xs font-normal text-[var(--color-ink-soft)]">{country} · 1 MYR</div></td>
                  <td className="px-4 py-3">{fmt(live)}</td>
                  <td className="px-4 py-3">
                    <input type="number" step="0.000001" value={pair.buyRate ?? ''} onChange={(e) => setDrafts((p) => ({ ...p, [currency]: { ...p[currency], buyRate: e.target.value as any } }))} className="w-32 rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" step="0.000001" value={pair.sellRate ?? ''} onChange={(e) => setDrafts((p) => ({ ...p, [currency]: { ...p[currency], sellRate: e.target.value as any } }))} className="w-32 rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5" />
                  </td>
                  <td className="px-4 py-3">
                    <select value={pair.active === false ? 'false' : 'true'} onChange={(e) => setDrafts((p) => ({ ...p, [currency]: { ...p[currency], active: e.target.value === 'true' } }))} className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5">
                      <option value="true">Active</option><option value="false">Inactive</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => useLive(currency)} className="mr-3 text-xs font-semibold text-[var(--color-primary-dark)] hover:underline">Use live</button>
                    <button disabled={busy} onClick={() => handleSave(currency)} className="text-xs font-semibold text-[var(--color-primary-dark)] hover:underline disabled:opacity-50">Save</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-[var(--color-ink-soft)]">
        Buy and sell rates are stored with the wallet FX configuration. Transaction code should snapshot the selected rate at confirmation time; changing rates later must not rewrite completed transactions.
      </p>
    </div>
  );
}
