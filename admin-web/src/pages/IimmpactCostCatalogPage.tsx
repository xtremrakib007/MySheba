import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getIimmpactFullCatalogForSuperadmin } from '../services/apiProviderService';

type Product = Record<string, any>;

function display(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return '[details unavailable]'; }
  }
  return String(value);
}

export default function IimmpactCostCatalogPage() {
  const { profile } = useAuth();
  const [country, setCountry] = useState('MY');
  const [catalog, setCatalog] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isSuperadmin = profile?.role === 'superadmin';

  async function load() {
    if (!isSuperadmin) { setError('Superadmin access is required.'); return; }
    setLoading(true); setError('');
    try { setCatalog(await getIimmpactFullCatalogForSuperadmin(country)); }
    catch (e: any) { setError(e?.message || 'Could not load the provider-cost catalogue.'); }
    finally { setLoading(false); }
  }

  if (!isSuperadmin) return <section className="rounded-2xl border border-[var(--color-line)] p-6"><h1 className="text-xl font-bold">Access restricted</h1><p className="mt-2 text-sm">This catalogue is available to superadmin accounts only.</p></section>;

  const products: [string, Product][] = Object.entries(catalog?.products || {});
  return <main className="space-y-5">
    <header><h1 className="text-2xl font-bold">IIMMPACT Provider Cost Catalog</h1><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Live provider-side product details, costs and fulfillment requirements. Superadmin only.</p></header>
    <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4">
      <label className="text-xs font-semibold">Country
        <select value={country} onChange={e=>setCountry(e.target.value)} className="mt-1 block rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm">
          {['MY','SG','ID','IN','PH','NP','PK','MM','KH','TH','BD'].map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <button onClick={load} disabled={loading} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading?'Loading…':'Load live catalog'}</button>
      {catalog?.fetchedAt && <span className="text-xs text-[var(--color-ink-soft)]">Fetched {new Date(catalog.fetchedAt).toLocaleString()} · {products.length} products</span>}
    </section>
    {error && <p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-600">{error}</p>}
    {!catalog && !loading && <p className="text-sm text-[var(--color-ink-soft)]">Choose a country and load the live catalogue to inspect provider details.</p>}
    {catalog && <section className="space-y-3">
      {products.map(([code,p])=>{
        const cost = p.providerCost ?? p.cost ?? p.cost_price ?? p.provider_cost;
        const currency = p.providerCurrency || p.cost_currency || p.currency || 'MYR';
        const rrp = p.rrp ?? p.recommended_retail_price;
        const sell = p.sellingPrice ?? p.sellPrice;
        const margin = cost != null && sell != null && Number.isFinite(Number(cost)) && Number.isFinite(Number(sell)) ? Number(sell)-Number(cost) : null;
        const details = p.providerDetails || {};
        const required = Array.isArray(details.requiredFields) ? details.requiredFields : (Array.isArray(p.fields)?p.fields:[]);
        return <article key={code} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{p.label || p.name || p.title || code}</h2><p className="text-xs text-[var(--color-ink-soft)]">Product code: {code} · Category: {display(p.category || p.type || p.product_type)}</p></div><span className="rounded-md bg-[var(--color-primary)]/10 px-2 py-1 text-xs">{display(p.is_active ?? p.active ?? 'Status not supplied')}</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['Provider cost',cost == null?'Not supplied':currency+' '+display(cost)],['Currency',currency],['Denomination / catalog price',display(p.denomination ?? details.denomination ?? p.price)],['Configured selling price',display(sell)],['RRP',display(rrp)],['Margin',margin == null?'Cannot calculate':currency+' '+margin.toFixed(2)],['Processing',display(details.processingTime ?? p.processing_time ?? p.processingTime)],['Fulfillment',display(details.fulfillment ?? p.fulfillment) ]].map(([label,value])=><div key={label} className="rounded-lg bg-[var(--color-page)] p-3"><p className="text-xs text-[var(--color-ink-soft)]">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>)}
          </div>
          <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Required fields ({required.length})</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Field</th><th className="p-2">ID</th><th className="p-2">Type</th><th className="p-2">Required</th><th className="p-2">Role / source</th></tr></thead><tbody>{required.map((f:any,i:number)=><tr key={String(f.id||f.name||i)} className="border-t border-[var(--color-line)]"><td className="p-2">{display(f.name||f.label||f.id)}</td><td className="p-2">{display(f.id||f.code)}</td><td className="p-2">{display(f.type)}</td><td className="p-2">{f.required===true?'Yes':'No / unspecified'}</td><td className="p-2">{display(f.role||f.dataSource||f.data_source)}</td></tr>)}</tbody></table></div></details>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Full provider metadata</summary><pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-[var(--color-page)] p-3 text-xs">{JSON.stringify(p,null,2)}</pre></details>
        </article>;
      })}
      {!products.length && <p className="rounded-xl border border-[var(--color-line)] p-4 text-sm">No products were returned for this country.</p>}
    </section>}
  </main>;
}
