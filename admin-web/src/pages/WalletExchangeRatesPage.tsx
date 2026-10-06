import { useEffect, useMemo, useState } from 'react';
import {
  WALLET_FX_CURRENCIES, REMITTANCE_FX_CURRENCIES,
  saveWalletFxPair, refreshWalletFx, subscribeWalletFx, setRemittanceRateMode,
} from '../services/walletExchangeRateService';
import { fetchRates, updateRate } from '../services/ratesService';
import { useAuth } from '../contexts/AuthContext';

type Pair = { buyRate?: number | string; sellRate?: number | string; liveRate?: number; active?: boolean };
const REMIT_KEYS: Record<string, string[]> = {
  BDT: ['remittanceBD_ACC', 'remittanceBD_CASH'],
  INR: ['remittanceIN'], NPR: ['remittanceNP'], PKR: ['remittancePK'],
  PHP: ['remittancePH'], IDR: ['remittanceID'], MMK: ['remittanceMM'],
};
const REMIT_LABELS: Record<string, string> = {
  remittanceBD_ACC: 'BDT — Bank Account',
  remittanceBD_CASH: 'BDT — Cash Pickup',
  remittanceIN: 'INR', remittanceNP: 'NPR', remittancePK: 'PKR',
  remittancePH: 'PHP', remittanceID: 'IDR', remittanceMM: 'MMK',
};
function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—';
}

export default function WalletExchangeRatesPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<any>({ pairs: {}, liveRates: {} });
  const [drafts, setDrafts] = useState<Record<string, Pair>>({});
  const [remitRates, setRemitRates] = useState<Record<string, number>>({});
  const [remitMode, setRemitMode] = useState<'live' | 'manual'>('manual');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => subscribeWalletFx((next) => {
    setData(next);
    setDrafts((prev) => {
      const out = { ...prev };
      for (const [currency] of WALLET_FX_CURRENCIES) {
        const pair = next.pairs?.[currency] || {};
        out[currency] = out[currency] || { buyRate: pair.buyRate ?? '', sellRate: pair.sellRate ?? '', active: pair.active !== false };
      }
      return out;
    });
  }), []);

  useEffect(() => {
    fetchRates().then((rates) => {
      setRemitRates(rates);
      setRemitMode(String(rates.remittanceRateMode) === 'live' ? 'live' : 'manual');
    }).catch(() => {});
  }, []);

  const liveUpdated = useMemo(() => {
    const ts = data.liveUpdatedAt;
    return ts?.toDate?.().toLocaleString?.() || (ts ? String(ts) : 'Not refreshed yet');
  }, [data.liveUpdatedAt]);

  async function handleRefresh() {
    setRefreshing(true); setMessage('');
    try {
      const result = await refreshWalletFx();
      setMessage(result?.remittanceMode === 'live'
        ? 'Live wallet and remittance reference rates refreshed.'
        : 'Live wallet reference rates refreshed. Remittance is still in manual mode.');
      const rates = await fetchRates(); setRemitRates(rates);
    } catch (err: any) { setMessage(err?.message || 'Could not refresh live rates.'); }
    finally { setRefreshing(false); }
  }

  async function handleSave(currency: string) {
    const draft = drafts[currency] || {};
    setBusy(true); setMessage('');
    try {
      await saveWalletFxPair(currency, { buyRate: Number(draft.buyRate), sellRate: Number(draft.sellRate), active: draft.active !== false });
      setMessage(currency + ' wallet rates saved.');
    } catch (err: any) { setMessage(err?.message || 'Could not save rates.'); }
    finally { setBusy(false); }
  }

  function applyLiveRate(currency: string) {
    const live = Number(data.liveRates?.[currency]);
    if (!Number.isFinite(live) || live <= 0) return;
    setDrafts((prev) => ({ ...prev, [currency]: { ...(prev[currency] || {}), buyRate: live, sellRate: live } }));
  }

  async function changeRemittanceMode(mode: 'live' | 'manual') {
    setBusy(true); setMessage('');
    try {
      await setRemittanceRateMode(mode);
      const rates = await fetchRates();
      setRemitRates(rates);
      setRemitMode(mode);
      setMessage(mode === 'live'
        ? 'Remittance now uses the latest live FX reference rates.'
        : 'Remittance switched to manual rates. Your manually configured values remain available.');
    } catch (err: any) { setMessage(err?.message || 'Could not change remittance FX mode.'); }
    finally { setBusy(false); }
  }

  async function saveRemittance(key: string) {
    const value = Number(remitRates[key]);
    if (!Number.isFinite(value) || value <= 0) { setMessage('Enter a valid positive remittance rate.'); return; }
    setBusy(true); setMessage('');
    try {
      await updateRate(key, value, profile?.role);
      const rates = await fetchRates(); setRemitRates(rates);
      setMessage(REMIT_LABELS[key] + ' manual rate saved.');
    } catch (err: any) { setMessage(err?.message || 'Could not save remittance rate.'); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Wallet & Remittance Exchange Rates</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-ink-soft)]">
            Wallet FX supports live reference rates plus Superadmin-controlled buy/sell rates. Remittance can independently use live FX or your existing manual rates.
          </p>
        </div>
        <button disabled={refreshing} onClick={handleRefresh} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {refreshing ? 'Refreshing…' : 'Refresh Live Rates'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-4 text-xs text-[var(--color-ink-soft)]">
        Live provider: {data.provider || 'Not set'} · Last wallet FX refresh: {liveUpdated}
      </div>
      {message && <div className="mt-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-3 text-sm">{message}</div>}

      <section className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="text-lg font-bold">Remittance FX Mode</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Choose Live for provider reference rates or Manual to keep full control over your remittance payout rates. Switching to Live does not delete your manual values.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button disabled={busy} onClick={() => changeRemittanceMode('live')} className={remitMode === 'live' ? 'rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white' : 'rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm font-semibold'}>
            Live FX
          </button>
          <button disabled={busy} onClick={() => changeRemittanceMode('manual')} className={remitMode === 'manual' ? 'rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white' : 'rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm font-semibold'}>
            Manual Rates
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]"><th className="px-3 py-3">Destination</th><th className="px-3 py-3">Live reference</th><th className="px-3 py-3">Active remittance rate</th><th className="px-3 py-3 text-right">Manual action</th></tr></thead>
            <tbody>
              {REMITTANCE_FX_CURRENCIES.map(([currency, country]) => {
                const live = Number(data.liveRates?.[currency]);
                const keys = REMIT_KEYS[currency] || [];
                return <tr key={currency} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="px-3 py-3 font-semibold">{currency}<div className="text-xs font-normal text-[var(--color-ink-soft)]">{country} · 1 MYR</div></td>
                  <td className="px-3 py-3">{fmt(live)}</td>
                  <td className="px-3 py-3">{keys.map((key) => <div key={key} className="mb-1">{REMIT_LABELS[key]}: <b>{fmt(remitRates[key])}</b></div>)}</td>
                  <td className="px-3 py-3 text-right">{keys.map((key) => <div key={key} className="mb-1 flex items-center justify-end gap-2"><input type="number" step="0.000001" disabled={remitMode === 'live'} value={remitRates[key] ?? ''} onChange={(e) => setRemitRates((p) => ({ ...p, [key]: Number(e.target.value) }))} className="w-32 rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5 disabled:opacity-50"/><button disabled={busy || remitMode === 'live'} onClick={() => saveRemittance(key)} className="text-xs font-semibold text-[var(--color-primary-dark)] disabled:opacity-40">Save</button></div>)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">For Bangladesh, Bank Account and Cash Pickup keep separate manual rates. Live mode uses the same live BDT reference for both until you switch back to Manual.</p>
      </section>

      <section className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead><tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]"><th className="px-4 py-3">Currency</th><th className="px-4 py-3">Live reference</th><th className="px-4 py-3">Buy rate</th><th className="px-4 py-3">Sell rate</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
          <tbody>
            {WALLET_FX_CURRENCIES.map(([currency, country]) => {
              const pair = drafts[currency] || {}; const live = data.liveRates?.[currency];
              return <tr key={currency} className="border-b border-[var(--color-line)] last:border-0">
                <td className="px-4 py-3 font-semibold">{currency}<div className="text-xs font-normal text-[var(--color-ink-soft)]">{country} · 1 MYR</div></td>
                <td className="px-4 py-3">{fmt(live)}</td>
                <td className="px-4 py-3"><input type="number" step="0.000001" value={pair.buyRate ?? ''} onChange={(e) => setDrafts((p) => ({ ...p, [currency]: { ...p[currency], buyRate: e.target.value } }))} className="w-32 rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5" /></td>
                <td className="px-4 py-3"><input type="number" step="0.000001" value={pair.sellRate ?? ''} onChange={(e) => setDrafts((p) => ({ ...p, [currency]: { ...p[currency], sellRate: e.target.value } }))} className="w-32 rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5" /></td>
                <td className="px-4 py-3"><select value={pair.active === false ? 'false' : 'true'} onChange={(e) => setDrafts((p) => ({ ...p, [currency]: { ...p[currency], active: e.target.value === 'true' } }))} className="rounded-md border border-[var(--color-line)] bg-white px-2 py-1.5"><option value="true">Active</option><option value="false">Inactive</option></select></td>
                <td className="px-4 py-3 text-right"><button onClick={() => applyLiveRate(currency)} className="mr-3 text-xs font-semibold text-[var(--color-primary-dark)] hover:underline">Use live</button><button disabled={busy} onClick={() => handleSave(currency)} className="text-xs font-semibold text-[var(--color-primary-dark)] hover:underline disabled:opacity-50">Save</button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </section>
      <p className="mt-4 text-xs text-[var(--color-ink-soft)]">Manual wallet buy/sell rates remain independent from the live reference. Completed transactions keep their rate snapshot.</p>
    </div>
  );
}
