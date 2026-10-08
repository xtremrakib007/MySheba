import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_PRICING,
  ROLE_PRICE_KEYS,
  ROLE_PRICE_ROLES,
  fetchPricing,
  updatePricing,
  updateRolePrice,
  saveCatalogProductPrice,
  deleteCatalogProductPrice,
  type CatalogProductPrice,
  type PricingSettings,
  type PricingRole,
  type RolePriceKey,
} from '../services/pricingService';

const ROLE_LABELS: Record<PricingRole, string> = {
  customer: 'Customer',
  retail: 'Retail',
  dealer: 'Dealer',
  reseller: 'Reseller',
  admin: 'Admin',
};

const ROLE_PRICE_LABELS: Record<RolePriceKey, string> = {
  webviewAccessCost: 'FOMEMA / Visa Status Check (pts)',
  webviewSubmitCost: 'Malaysia Arrival Card / Passport Submission (pts)',
  paymentSuccessCost: 'Bus / Train / MY e-SIM Purchase (pts)',
  notepadCost: 'Notepad (pts/month)',
  myDocumentsCost: 'My Documents (pts/month)',
  salaryOtCost: 'Salary & OT (pts/month)',
  rechargePointCostPerUnit: 'Recharge point cost per unit',
  internetPointCostPerUnit: 'Internet package point cost per unit',
  offerPacksPointCostPerUnit: 'Offer Packs point cost per unit',
  entertainmentPointCostPerUnit: 'Entertainment point cost per unit',
};

function FieldRow({ label, value, suffix, onSave }: { label: string; value: number; suffix?: string; onSave: (next: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(String(value)); }, [value]);
  async function save() {
    const num = Number(draft);
    if (!Number.isFinite(num) || num < 0) return;
    setSaving(true);
    try { await onSave(num); setEditing(false); } finally { setSaving(false); }
  }
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input autoFocus type="number" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className="w-24 rounded-lg border border-[var(--color-line)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]" />
          <button disabled={saving} onClick={save} className="rounded-lg bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">Save</button>
          <button disabled={saving} onClick={() => { setDraft(String(value)); setEditing(false); }} className="rounded-lg border border-[var(--color-line)] px-3 py-1 text-xs font-semibold">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-3"><span className="font-semibold">{value}{suffix}</span><button onClick={() => setEditing(true)} className="rounded-lg bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">Edit</button></div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"><h2 className="text-base font-bold">{title}</h2><div className="mt-2 divide-y divide-[var(--color-line)]">{children}</div></div>;
}

function RolePriceRow({ priceKey, pricing, onSave }: { priceKey: RolePriceKey; pricing: PricingSettings; onSave: (role: PricingRole, key: RolePriceKey, value: number) => Promise<void> }) {
  return <div className="py-3"><p className="text-sm font-semibold">{ROLE_PRICE_LABELS[priceKey]}</p><div className="mt-2 space-y-1">{ROLE_PRICE_ROLES.map((role) => { const override = pricing.rolePricing?.[role]?.[priceKey]; const isDefault = override == null; const displayValue = isDefault ? pricing[priceKey] : override; return <FieldRow key={role} label={ROLE_LABELS[role]} value={displayValue} suffix={isDefault ? ' pts (default)' : ' pts'} onSave={(next) => onSave(role, priceKey, next)} />; })}</div></div>;
}

export default function PricingPage() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commissionDraft, setCommissionDraft] = useState(pricing.commissionRules);
  const [catalogDraft, setCatalogDraft] = useState<CatalogProductPrice>({
    id: '',
    service: 'Bill Payment',
    country: 'MY',
    operator: '',
    productId: '',
    productName: '',
    costPrice: 0,
    currency: 'MYR',
    active: true,
    prices: { customer: 0, retail: 0, reseller: 0, dealer: 0, admin: 0 },
    commissions: { customer: { type: 'fixed', value: 0 }, retail: { type: 'fixed', value: 0 }, reseller: { type: 'fixed', value: 0 }, dealer: { type: 'fixed', value: 0 }, admin: { type: 'fixed', value: 0 } },
  });
  async function load() {
    setLoading(true); setError(null);
    try { const next = await fetchPricing(); setPricing(next); setCommissionDraft(next.commissionRules); } catch (err) { console.error(err); setError('Could not load pricing settings.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function save(key: keyof PricingSettings, value: number) { await updatePricing(key, value); setPricing((prev) => ({ ...prev, [key]: value })); }
  async function saveRolePrice(role: PricingRole, key: RolePriceKey, value: number) { await updateRolePrice(role, key, value); setPricing((prev) => ({ ...prev, rolePricing: { ...prev.rolePricing, [role]: { ...prev.rolePricing?.[role], [key]: value } } })); }
  async function saveCatalog() {
    if (!isSuperadmin || !catalogDraft.operator.trim() || !catalogDraft.productId.trim() || !catalogDraft.productName.trim()) return;
    const entry = { ...catalogDraft, id: catalogDraft.id || `catalog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    await saveCatalogProductPrice(entry);
    setPricing((prev) => ({ ...prev, catalogProductPricing: [...prev.catalogProductPricing.filter((x) => x.id !== entry.id), entry] }));
    setCatalogDraft({ id: '', service: catalogDraft.service, country: catalogDraft.country, operator: '', productId: '', productName: '', costPrice: 0, currency: catalogDraft.currency, active: true, prices: { customer: 0, retail: 0, reseller: 0, dealer: 0, admin: 0 } });
  }
  async function saveCommissionRules() { await updatePricing('commissionRules' as keyof PricingSettings, commissionDraft as any); setPricing((prev) => ({ ...prev, commissionRules: commissionDraft })); }
  async function removeCatalog(id: string) {
    await deleteCatalogProductPrice(id);
    setPricing((prev) => ({ ...prev, catalogProductPricing: prev.catalogProductPricing.filter((x) => x.id !== id) }));
  }
  if (loading) return <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>;
  return (
    <div>
      <h1 className="text-2xl font-bold">Pricing</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Platform-wide money rules — dealer earnings, point costs, and margins. Changes apply immediately across the app.</p>
      {error && <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
      <div className="mt-6 space-y-6">
        <Section title="Earning & Margin Settings">
          <FieldRow label="Dealer Earning on Customer Transfer (%)" value={pricing.dealerEarningPercent} suffix="%" onSave={(v) => save('dealerEarningPercent', v)} />
          <FieldRow label="Mobile Recharge Cost (%)" value={pricing.rechargeCostPercent} suffix="%" onSave={(v) => save('rechargeCostPercent', v)} />
          <FieldRow label="Mobile Recharge Profit (%)" value={pricing.rechargeProfitPercent} suffix="%" onSave={(v) => save('rechargeProfitPercent', v)} />
        </Section>
        <Section title="Point Feature Costs">
          <FieldRow label="FOMEMA / Visa Status Check (pts)" value={pricing.webviewAccessCost} suffix=" pts" onSave={(v) => save('webviewAccessCost', v)} />
          <FieldRow label="Malaysia Arrival Card / Passport Submission (pts)" value={pricing.webviewSubmitCost} suffix=" pts" onSave={(v) => save('webviewSubmitCost', v)} />
          <FieldRow label="Bus / Train / MY e-SIM Purchase (pts)" value={pricing.paymentSuccessCost} suffix=" pts" onSave={(v) => save('paymentSuccessCost', v)} />
          <FieldRow label="FOMEMA / Visa Free Access Window (hours)" value={pricing.webviewAccessWindowHours} suffix=" hrs" onSave={(v) => save('webviewAccessWindowHours', v)} />
        </Section>
        <Section title="Notepad / Documents / Salary & OT">
          <FieldRow label="Notepad (pts/month)" value={pricing.notepadCost} suffix=" pts" onSave={(v) => save('notepadCost', v)} />
          <FieldRow label="My Documents (pts/month)" value={pricing.myDocumentsCost} suffix=" pts" onSave={(v) => save('myDocumentsCost', v)} />
          <FieldRow label="Salary & OT (pts/month)" value={pricing.salaryOtCost} suffix=" pts" onSave={(v) => save('salaryOtCost', v)} />
          <FieldRow label="Subscription Cycle Length (days)" value={pricing.moduleSubscriptionDays} suffix=" days" onSave={(v) => save('moduleSubscriptionDays', v)} />
        </Section>\n        {isSuperadmin ? <Section title="Bills, Vouchers & Marketplace — Product Pricing (superadmin only)">
          <p className="pb-3 text-xs text-[var(--color-ink-soft)]">Create an independent price for every biller/operator, voucher, Marketplace product, game, eSIM, entertainment package, transportation item, and other catalog product. Each role has its own selling price.</p>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ['service','Service / Category', 'Bill Payment'],
              ['country','Country (ISO)', 'MY'],
              ['operator','Operator / Biller / Brand', 'TNB'],
              ['productId','Product / Voucher ID', 'product-code'],
              ['productName','Product / Package Name', 'Example 10GB'],
              ['costPrice','Provider Cost', '0'],
              ['currency','Currency', 'MYR'],
            ].map(([key,label,placeholder]) => <label key={key} className="text-xs font-semibold">{label}<input value={String((catalogDraft as any)[key])} placeholder={placeholder} type={key === 'costPrice' ? 'number' : 'text'} onChange={(e) => setCatalogDraft((d) => ({ ...d, [key]: key === 'costPrice' ? Number(e.target.value) : e.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-2 py-2 text-sm" /></label>)}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            {ROLE_PRICE_ROLES.map((role) => <label key={role} className="text-xs font-semibold">{ROLE_LABELS[role]} Price<input type="number" value={catalogDraft.prices?.[role] ?? 0} onChange={(e) => setCatalogDraft((d) => ({ ...d, prices: { ...d.prices, [role]: Number(e.target.value) } }))} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-2 py-2 text-sm" /></label>)}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            {ROLE_PRICE_ROLES.map((role) => <label key={role} className="text-xs font-semibold">{ROLE_LABELS[role]} Commission<input type="number" min="0" step="0.01" value={catalogDraft.commissions?.[role]?.value ?? 0} onChange={(e) => setCatalogDraft((d) => ({ ...d, commissions: { ...d.commissions, [role]: { type: d.commissions?.[role]?.type || 'fixed', value: Number(e.target.value) } } }))} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-2 py-2 text-sm" /><select value={catalogDraft.commissions?.[role]?.type || 'fixed'} onChange={(e) => setCatalogDraft((d) => ({ ...d, commissions: { ...d.commissions, [role]: { type: e.target.value as 'fixed' | 'percent', value: d.commissions?.[role]?.value || 0 } } }))} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-2 py-1 text-xs"><option value="fixed">RM fixed</option><option value="percent">% percent</option></select></label>)}
          </div>
          <button onClick={saveCatalog} className="mt-4 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">Save Product Pricing</button>
          <div className="mt-5 space-y-2">
            {pricing.catalogProductPricing.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] p-3 text-sm">
              <div><b>{item.productName}</b><div className="text-xs text-[var(--color-ink-soft)]">{item.service} · {item.country} · {item.operator} · {item.productId} · cost {item.currency} {item.costPrice}</div></div>
              <div className="flex flex-wrap gap-2 text-xs">{ROLE_PRICE_ROLES.map((role) => <span key={role} className="rounded-md bg-[var(--color-primary)]/10 px-2 py-1">{ROLE_LABELS[role]}: {item.prices?.[role] ?? '—'}</span>)}<button onClick={() => removeCatalog(item.id)} className="rounded-md border px-2 py-1">Delete</button></div>
            </div>)}
            {!pricing.catalogProductPricing.length && <p className="text-xs text-[var(--color-ink-soft)]">No product overrides configured yet.</p>}
          </div>
        </Section> : null}
        {isSuperadmin ? <Section title="Commission & Fee Rules (superadmin only)">
          <p className="pb-3 text-xs text-[var(--color-ink-soft)]">Provider prices remain unchanged. These rules only determine commissions or the special Touch ’n Go fee.</p>
          <div className="grid gap-3 md:grid-cols-3">
            {(['recharge','internet'] as const).map((service) => <label key={service} className="text-xs font-semibold">{service === 'recharge' ? 'Recharge' : 'Internet'} commission<input type="number" min="0" step="0.01" value={commissionDraft[service].value} onChange={(e) => setCommissionDraft((d) => ({ ...d, [service]: { ...d[service], value: Number(e.target.value) } }))} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-2 py-2 text-sm" /><select value={commissionDraft[service].type} onChange={(e) => setCommissionDraft((d) => ({ ...d, [service]: { ...d[service], type: e.target.value as 'fixed' | 'percent' } }))} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-2 py-1 text-xs"><option value="fixed">RM fixed per transaction</option><option value="percent">% of transaction</option></select></label>)}
            <label className="text-xs font-semibold">Touch ’n Go fee (%)<input type="number" min="0" step="0.01" value={commissionDraft.touchNGoFeePercent} onChange={(e) => setCommissionDraft((d) => ({ ...d, touchNGoFeePercent: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-[var(--color-line)] px-2 py-2 text-sm" /></label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div><p className="text-xs font-bold">Bill commission tiers</p>{commissionDraft.billTiers.map((t,i)=><div key={i} className="mt-2 grid grid-cols-3 gap-2"><input type="number" value={t.minAmount} onChange={e=>setCommissionDraft(d=>({...d,billTiers:d.billTiers.map((x,j)=>j===i?{...x,minAmount:Number(e.target.value)}:x)}))} placeholder="Min" className="rounded-lg border px-2 py-1 text-xs"/><input type="number" value={t.maxAmount ?? ''} onChange={e=>setCommissionDraft(d=>({...d,billTiers:d.billTiers.map((x,j)=>j===i?{...x,maxAmount:e.target.value===''?null:Number(e.target.value)}:x)}))} placeholder="Max (blank = no limit)" className="rounded-lg border px-2 py-1 text-xs"/><input type="number" step="0.01" value={t.fee} onChange={e=>setCommissionDraft(d=>({...d,billTiers:d.billTiers.map((x,j)=>j===i?{...x,fee:Number(e.target.value)}:x)}))} placeholder="Fee RM" className="rounded-lg border px-2 py-1 text-xs"/></div>)}<button onClick={()=>setCommissionDraft(d=>({...d,billTiers:[...d.billTiers,{minAmount:0,maxAmount:null,fee:0}]}))} className="mt-2 rounded-lg border px-3 py-1 text-xs">Add tier</button></div>
            <div><p className="text-xs font-bold">Remittance fee tiers</p>{commissionDraft.remittanceTiers.map((t,i)=><div key={i} className="mt-2 grid grid-cols-3 gap-2"><input type="number" value={t.minAmount} onChange={e=>setCommissionDraft(d=>({...d,remittanceTiers:d.remittanceTiers.map((x,j)=>j===i?{...x,minAmount:Number(e.target.value)}:x)}))} placeholder="Min" className="rounded-lg border px-2 py-1 text-xs"/><input type="number" value={t.maxAmount ?? ''} onChange={e=>setCommissionDraft(d=>({...d,remittanceTiers:d.remittanceTiers.map((x,j)=>j===i?{...x,maxAmount:e.target.value===''?null:Number(e.target.value)}:x)}))} placeholder="Max" className="rounded-lg border px-2 py-1 text-xs"/><input type="number" step="0.01" value={t.fee} onChange={e=>setCommissionDraft(d=>({...d,remittanceTiers:d.remittanceTiers.map((x,j)=>j===i?{...x,fee:Number(e.target.value)}:x)}))} placeholder="Fee RM" className="rounded-lg border px-2 py-1 text-xs"/></div>)}<button onClick={()=>setCommissionDraft(d=>({...d,remittanceTiers:[...d.remittanceTiers,{minAmount:0,maxAmount:null,fee:0}]}))} className="mt-2 rounded-lg border px-3 py-1 text-xs">Add tier</button></div>
          </div><button onClick={saveCommissionRules} className="mt-4 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">Save Commission & Fee Rules</button>
        </Section> : null}
        {isSuperadmin ? <Section title="Role-Based Pricing (superadmin only)">{ROLE_PRICE_KEYS.map((key) => <RolePriceRow key={key} priceKey={key} pricing={pricing} onSave={saveRolePrice} />)}</Section> : <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-5 text-sm text-[var(--color-ink-soft)]">Role-Based Pricing is visible to superadmin accounts only.</div>}
      </div>
    </div>
  );
}
