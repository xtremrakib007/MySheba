import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getIimmpactFullCatalogForSuperadmin, getIimmpactOptionsForSuperadmin } from '../services/apiProviderService';

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
  const [packageOptions, setPackageOptions] = useState<Record<string, any[]>>({});
  const [packageErrors, setPackageErrors] = useState<Record<string, string>>({});
  const [packageLoading, setPackageLoading] = useState<Record<string, boolean>>({});
  const isSuperadmin = profile?.role === 'superadmin';

  async function load() {
    if (!isSuperadmin) { setError('Superadmin access is required.'); return; }
    setLoading(true); setError('');
    try { setCatalog(await getIimmpactFullCatalogForSuperadmin(country)); }
    catch (e: any) { setError(e?.message || 'Could not load the provider-cost catalogue.'); }
    finally { setLoading(false); }
  }

  async function loadPackageOptions(code: string, product: Product) {
    const fields = Array.isArray(product.fields) ? product.fields : [];
    const pricingField = fields.find((f: any) => f?.role === 'pricing' && f?.id)
      || fields.find((f: any) => f?.type === 'select' && f?.id);
    if (!pricingField?.id) {
      setPackageErrors((prev) => ({ ...prev, [code]: 'No selectable pricing field is supplied for this product.' }));
      return;
    }
    setPackageLoading((prev) => ({ ...prev, [code]: true }));
    setPackageErrors((prev) => ({ ...prev, [code]: '' }));
    try {
      const result = await getIimmpactOptionsForSuperadmin({ country, productCode: code, fieldId: String(pricingField.id), limit: 25000 });
      setPackageOptions((prev) => ({ ...prev, [code]: Array.isArray(result.items) ? result.items : [] }));
      if (!Array.isArray(result.items) || result.items.length === 0) {
        setPackageErrors((prev) => ({ ...prev, [code]: 'IIMMPACT returned no package options. This product may require an account number or may not publish options for this field.' }));
      }
    } catch (e: any) {
      setPackageErrors((prev) => ({ ...prev, [code]: String(e?.message || 'Could not load package options.') }));
    } finally {
      setPackageLoading((prev) => ({ ...prev, [code]: false }));
    }
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
        const costRaw = p.providerCost ?? p.cost ?? p.cost_price ?? p.provider_cost;
        const cost = costRaw && typeof costRaw === 'object' ? (costRaw.amount ?? costRaw.value ?? null) : costRaw;
        const currency = p.providerCurrency || (costRaw && typeof costRaw === 'object' ? costRaw.currency : '') || p.cost_currency || p.currency || 'MYR';
        const rrpRaw = p.rrp ?? p.recommended_retail_price;
        const rrp = rrpRaw && typeof rrpRaw === 'object' ? (rrpRaw.amount ?? rrpRaw.value ?? rrpRaw) : rrpRaw;
        const sell = p.sellingPrice ?? p.sellPrice;
        const margin = cost != null && sell != null && Number.isFinite(Number(cost)) && Number.isFinite(Number(sell)) ? Number(sell)-Number(cost) : null;
        const details = p.providerDetails || {};
        const required = Array.isArray(details.requiredFields) ? details.requiredFields : (Array.isArray(p.fields)?p.fields:[]);
        return <article key={code} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{p.label || p.name || p.title || p.product_name || p.display_name || p.description || code}</h2><p className="text-xs text-[var(--color-ink-soft)]">Product code: {code} · Category: {display(p.category || p.type || p.product_type)}</p></div><span className="rounded-md bg-[var(--color-primary)]/10 px-2 py-1 text-xs">{display(p.is_active ?? p.active ?? 'Status not supplied')}</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['Provider cost',cost == null?'Not supplied':currency+' '+display(cost)],['Currency',currency],['Denomination / catalog price',display(p.denomination?.amount ?? p.denomination ?? details.denomination?.amount ?? details.denomination ?? p.price?.amount ?? p.price)],['Configured selling price',display(sell)],['RRP',display(rrp)],['Margin',margin == null?'Cannot calculate':currency+' '+margin.toFixed(2)],['Processing',display(details.processingTime ?? p.processing_time ?? p.processingTime)],['Fulfillment',display(details.fulfillment ?? p.fulfillment) ]].map(([label,value])=><div key={label} className="rounded-lg bg-[var(--color-page)] p-3"><p className="text-xs text-[var(--color-ink-soft)]">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>)}
          </div>
          <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Required fields ({required.length})</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Field</th><th className="p-2">ID</th><th className="p-2">Type</th><th className="p-2">Required</th><th className="p-2">Role / source</th></tr></thead><tbody>{required.map((f:any,i:number)=><tr key={String(f.id||f.name||i)} className="border-t border-[var(--color-line)]"><td className="p-2">{display(f.name||f.label||f.id)}</td><td className="p-2">{display(f.id||f.code)}</td><td className="p-2">{display(f.type)}</td><td className="p-2">{f.required===true?'Yes':'No / unspecified'}</td><td className="p-2">{display(f.role||f.dataSource||f.data_source)}</td></tr>)}</tbody></table></div></details>
          <div className="mt-4">
            <button type="button" onClick={() => loadPackageOptions(code, p)} disabled={Boolean(packageLoading[code])} className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm font-semibold disabled:opacity-50">
              {packageLoading[code] ? 'Loading package options…' : 'Load package options'}
            </button>
            {packageErrors[code] && <p role="alert" className="mt-2 text-xs text-amber-600">{packageErrors[code]}</p>}
            {packageOptions[code] && packageOptions[code].length > 0 && <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-line)]">
              <table className="w-full text-left text-xs">
                <thead><tr><th className="p-2">Package</th><th className="p-2">Option code</th><th className="p-2">Denomination / price</th><th className="p-2">Provider cost</th><th className="p-2">Currency</th><th className="p-2">Validity / data</th><th className="p-2">Loss risk</th></tr></thead>
                <tbody>{packageOptions[code].map((item: any, i: number) => {
                  const price = item.price?.amount ?? item.price ?? item.denomination;
                  const cost = item.cost?.amount ?? item.cost ?? item.provider_cost ?? item.cost_price;
                  const currency = item.cost?.currency || item.currency || item.price?.currency || 'Not supplied';
                  return <tr key={String(item.code || i)} className="border-t border-[var(--color-line)]">
                    <td className="p-2">{display(item.name || item.label || item.description || item.code)}</td>
                    <td className="p-2">{display(item.code)}</td><td className="p-2">{display(price)}</td>
                    <td className="p-2">{cost == null ? 'Not supplied' : display(cost)}</td><td className="p-2">{display(currency)}</td>
                    <td className="p-2">{display(item.validity || item.duration || item.data || item.volume)}</td>
                    <td className="p-2">{item.has_loss_risk === true ? 'Yes' : 'No / not supplied'}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
          </div>
          <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Full provider metadata</summary><pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-[var(--color-page)] p-3 text-xs">{JSON.stringify(p,null,2)}</pre></details>
        </article>;
      })}
      {!products.length && <p className="rounded-xl border border-[var(--color-line)] p-4 text-sm">No products were returned for this country.</p>}
    </section>}
  </main>;
}
