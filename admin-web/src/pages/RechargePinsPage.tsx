import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Ticket, Upload } from 'lucide-react';
import {
  fetchPinStock,
  parsePinLines,
  uploadPins,
  type PinStockRow,
  type UploadResult,
} from '../services/rechargePinService';

const COUNTRIES = [
  { code: 'MY', label: 'Malaysia', currency: 'MYR' },
  { code: 'BD', label: 'Bangladesh', currency: 'BDT' },
  { code: 'IN', label: 'India', currency: 'INR' },
  { code: 'NP', label: 'Nepal', currency: 'NPR' },
  { code: 'PK', label: 'Pakistan', currency: 'PKR' },
  { code: 'ID', label: 'Indonesia', currency: 'IDR' },
  { code: 'PH', label: 'Philippines', currency: 'PHP' },
  { code: 'MM', label: 'Myanmar', currency: 'MMK' },
  { code: 'KH', label: 'Cambodia', currency: 'KHR' },
];

const LOW_STOCK = 5;

export default function RechargePinsPage() {
  const [stock, setStock] = useState<PinStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [saving, setSaving] = useState(false);

  const [country, setCountry] = useState('MY');
  const [operator, setOperator] = useState('');
  const [denomination, setDenomination] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [pinText, setPinText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStock(await fetchPinStock());
    } catch (err) {
      console.error(err);
      setError('Could not load PIN stock.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const parsed = useMemo(() => parsePinLines(pinText), [pinText]);
  const currency = COUNTRIES.find((c) => c.code === country)?.currency ?? 'MYR';
  const canUpload = Boolean(operator.trim()) && Number(denomination) > 0 && parsed.length > 0 && !saving;

  const totals = useMemo(() => ({
    available: stock.reduce((n, r) => n + r.available, 0),
    expired: stock.reduce((n, r) => n + r.expired, 0),
    lines: stock.length,
  }), [stock]);

  async function submit() {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await uploadPins({
        country,
        operator: operator.trim(),
        currency,
        denomination: Number(denomination),
        expiresAt: expiresAt || null,
        pins: parsed,
      });
      setResult(outcome);
      setPinText('');
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not upload those PINs.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Recharge PINs</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Prepaid operator reload codes. The app hands one out when a Recharge order is fulfilled — codes are stored server-side and are never readable from a browser, so this screen shows counts only.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}
      {result && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 px-4 py-3 text-sm text-[var(--color-success)]">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          Added {result.added} PIN{result.added === 1 ? '' : 's'}
          {result.duplicates > 0 && ` · skipped ${result.duplicates} already in stock`}.
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {([['In stock', totals.available, Ticket], ['Expired', totals.expired, AlertTriangle], ['Operator / amount lines', totals.lines, Upload]] as const).map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
            <div className="flex items-center justify-between text-sm text-[var(--color-ink-soft)]"><span>{label}</span><Icon size={18} /></div>
            <p className="mt-2 text-2xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="text-base font-bold">Upload a batch</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
            One PIN per line. Add the operator's serial after a comma if you have it: <code className="rounded bg-black/5 px-1">123456789012,SN-0001</code>
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-xs font-semibold text-[var(--color-ink-soft)]">Country</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm">
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold text-[var(--color-ink-soft)]">Operator</span>
              <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="e.g. Celcom" className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold text-[var(--color-ink-soft)]">Denomination ({currency})</span>
              <input type="number" step="any" value={denomination} onChange={(e) => setDenomination(e.target.value)} placeholder="e.g. 10" className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold text-[var(--color-ink-soft)]">Expires (optional)</span>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm" />
            </label>
          </div>

          <textarea
            value={pinText}
            onChange={(e) => setPinText(e.target.value)}
            rows={8}
            placeholder={'123456789012\n234567890123,SN-0002'}
            className="mt-3 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--color-primary)]"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--color-ink-soft)]">{parsed.length} PIN{parsed.length === 1 ? '' : 's'} detected</span>
            <button onClick={() => void submit()} disabled={!canUpload} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? 'Uploading…' : 'Upload PINs'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="text-base font-bold">Stock on hand</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                  <th className="px-2 py-2 font-semibold">Country</th>
                  <th className="px-2 py-2 font-semibold">Operator</th>
                  <th className="px-2 py-2 text-right font-semibold">Value</th>
                  <th className="px-2 py-2 text-right font-semibold">Available</th>
                  <th className="px-2 py-2 text-right font-semibold">Expired</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((row) => (
                  <tr key={`${row.country}-${row.operator}-${row.denomination}`} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="px-2 py-3">{row.country}</td>
                    <td className="px-2 py-3">{row.operator}</td>
                    <td className="px-2 py-3 text-right">{row.currency} {row.denomination}</td>
                    <td className="px-2 py-3 text-right">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.available <= LOW_STOCK ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]'}`}>
                        {row.available}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right text-[var(--color-ink-soft)]">{row.expired || '—'}</td>
                  </tr>
                ))}
                {!loading && stock.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-10 text-center text-sm text-[var(--color-ink-soft)]">No PINs in stock yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {loading && <p className="mt-3 text-xs text-[var(--color-ink-soft)]">Loading…</p>}
        </section>
      </div>
    </div>
  );
}
