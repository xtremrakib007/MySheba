import { useState } from 'react';
import {
  MARKUP_SERVICES,
  MARKUP_SERVICE_LABELS,
  updatePricing,
  type MarkupRule,
  type MarkupService,
  type Markups,
  type PricingSettings,
} from '../services/pricingService';

// MySheba's markup on top of the provider's price, for every product service.
// Price = provider price × (1 + percent/100) + fixed. A product rule beats a
// country rule, which beats the service rule. Remittance and mobile banking
// are payouts with their own fees and are never marked up.

type Row = { key: string; percent: string; fixed: string };

const input = 'mt-1 w-full rounded-lg border border-[var(--color-line)] px-2 py-2 text-sm';
const toRule = (percent: string, fixed: string): MarkupRule => ({ percent: Number(percent) || 0, fixed: Number(fixed) || 0 });
const fromRules = (rules: Record<string, MarkupRule>): Row[] =>
  Object.entries(rules).map(([key, r]) => ({ key, percent: String(r.percent || 0), fixed: String(r.fixed || 0) }));

function example(rule: MarkupRule) {
  const price = 10 * (1 + rule.percent / 100) + rule.fixed;
  return `RM 10.00 → RM ${price.toFixed(2)}`;
}

export default function MarkupSection({ markups, onSaved }: { markups: Markups; onSaved: (next: Markups) => void }) {
  // Initialised once from the saved markups: the page draws this section only
  // after pricing has loaded, so there is nothing to sync in an effect.
  const [services, setServices] = useState<Record<string, { percent: string; fixed: string }>>(() =>
    Object.fromEntries(MARKUP_SERVICES.map((s) => [s, {
      percent: String(markups.services?.[s]?.percent ?? 0),
      fixed: String(markups.services?.[s]?.fixed ?? 0),
    }])));
  const [countries, setCountries] = useState<Row[]>(() => fromRules(markups.countries || {}));
  const [products, setProducts] = useState<Row[]>(() => fromRules(markups.products || {}));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    // Set prices are kept as they are: the markups field is saved whole, so
    // leaving them out here would delete every one.
    const next: Markups = { services: {}, countries: {}, products: {}, prices: markups.prices || {} };
    for (const s of MARKUP_SERVICES) next.services[s as MarkupService] = toRule(services[s]?.percent || '0', services[s]?.fixed || '0');
    for (const r of countries) if (r.key.trim()) next.countries[r.key.trim()] = toRule(r.percent, r.fixed);
    for (const r of products) if (r.key.trim()) next.products[r.key.trim()] = toRule(r.percent, r.fixed);
    setSaving(true); setMessage('');
    try {
      await updatePricing('markups', next as unknown as PricingSettings['markups']);
      onSaved(next);
      setMessage('Saved. New prices apply to the next purchase.');
    } catch (err: any) {
      setMessage(err?.message || 'Could not save markups.');
    } finally {
      setSaving(false);
    }
  }

  const ruleRows = (rows: Row[], setRows: (r: Row[]) => void, keyLabel: string, placeholder: string) => (
    <div className="mt-2 space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-4 gap-2">
          <input value={r.key} placeholder={placeholder} aria-label={keyLabel} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} className={input} />
          <input type="number" min="0" step="0.01" value={r.percent} aria-label="Percent" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} className={input} />
          <input type="number" min="0" step="0.01" value={r.fixed} aria-label="Fixed RM" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, fixed: e.target.value } : x)))} className={input} />
          <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="mt-1 rounded-lg border px-2 py-1 text-xs">Remove</button>
        </div>
      ))}
      <button onClick={() => setRows([...rows, { key: '', percent: '0', fixed: '0' }])} className="rounded-lg border px-3 py-1 text-xs">Add rule</button>
    </div>
  );

  return (
    <div>
      <p className="pb-3 text-xs text-[var(--color-ink-soft)]">
        Customer price = provider price × (1 + %) + RM fixed. The provider is still paid its own price; the difference is MySheba&apos;s margin.
        A product rule overrides a country rule, which overrides the service rule. Remittance and Mobile Banking are not marked up.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {MARKUP_SERVICES.map((s) => (
          <div key={s} className="rounded-xl border border-[var(--color-line)] p-3">
            <p className="text-sm font-semibold">{MARKUP_SERVICE_LABELS[s]}</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold">Markup %<input type="number" min="0" max="100" step="0.01" value={services[s]?.percent ?? '0'} onChange={(e) => setServices((d) => ({ ...d, [s]: { ...d[s], percent: e.target.value } }))} className={input} /></label>
              <label className="text-xs font-semibold">Fixed RM<input type="number" min="0" step="0.01" value={services[s]?.fixed ?? '0'} onChange={(e) => setServices((d) => ({ ...d, [s]: { ...d[s], fixed: e.target.value } }))} className={input} /></label>
            </div>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{example(toRule(services[s]?.percent || '0', services[s]?.fixed || '0'))}</p>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <p className="text-xs font-bold">Per-country rules</p>
        <p className="text-xs text-[var(--color-ink-soft)]">Key is service:COUNTRY, e.g. <code>recharge:ID</code> for International Topup to Indonesia. Columns: key, %, fixed RM.</p>
        {ruleRows(countries, setCountries, 'Service:Country', 'recharge:ID')}
      </div>
      <div className="mt-5">
        <p className="text-xs font-bold">Per-product rules</p>
        <p className="text-xs text-[var(--color-ink-soft)]">Key is the IIMMPACT product code. Columns: product code, %, fixed RM.</p>
        {ruleRows(products, setProducts, 'Product code', 'YESPIN')}
      </div>
      <button disabled={saving} onClick={save} className="mt-4 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save Markups'}</button>
      {!!message && <p className="mt-2 text-xs text-[var(--color-ink-soft)]">{message}</p>}
    </div>
  );
}
