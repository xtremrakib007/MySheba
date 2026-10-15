import { useEffect, useMemo, useState } from 'react';
import {
  ROLE_LABELS,
  saveCommissionRules,
  commissionPayload,
  type CommissionRule,
  type CommissionRules,
  type PricingRole,
} from '../services/pricingService';
import { commissionProductGroups, loadCatalog } from '../services/catalogMirror';

// Who earns commission, and how much - the same rules as the superadmin app's
// "Commission by role & product" card (src/components/CommissionByRoleCard.js),
// resolved by functions/commissionService.js:
//   1. a product's rule for the role (commissionRules.products), any service
//      but payouts, and the only commission vouchers earn;
//   2. the role's rule for the service (commissionRules.byRole);
//   3. the general rule - except a customer, who earns nothing.

const ROLES: PricingRole[] = ['customer', 'retail', 'reseller', 'dealer', 'admin'];
const SERVICES = [
  { key: 'recharge', label: 'Recharge (%)', type: 'percent' },
  { key: 'internet', label: 'Internet (%)', type: 'percent' },
  { key: 'billpayment', label: 'Bill (RM)', type: 'fixed' },
] as const;
type ProductRow = { code: string; type: 'percent' | 'fixed'; roles: Partial<Record<PricingRole, string>> };

const input = 'w-full rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-sm';
const str = (r?: CommissionRule) => (r && r.value !== undefined ? String(r.value) : '');

export default function CommissionByRoleSection({ rules, onSaved }: { rules: CommissionRules; onSaved: (next: CommissionRules) => void }) {
  const [table, setTable] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(ROLES.map((role) => [role, Object.fromEntries(SERVICES.map((s) => [s.key, str(rules.byRole?.[role]?.[s.key])]))])));
  const [products, setProducts] = useState<ProductRow[]>(() => Object.entries(rules.products || {}).map(([code, byRole]) => {
    const first = Object.values(byRole || {})[0];
    return { code, type: first?.type === 'fixed' ? 'fixed' : 'percent', roles: Object.fromEntries(Object.entries(byRole || {}).map(([r, rule]) => [r, str(rule)])) };
  }));
  const [catalog, setCatalog] = useState<any>(null);
  const [catalogError, setCatalogError] = useState('');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { loadCatalog().then(setCatalog).catch(() => setCatalogError('Could not load the product catalogue.')); }, []);
  const isSet = (row?: ProductRow) => !!row && Object.values(row.roles).some((v) => String(v ?? '').trim() !== '');
  const groups = useMemo(
    () => commissionProductGroups(catalog, products.filter((r) => isSet(r)).map((r) => r.code), filter),
    [catalog, products, filter],
  );
  const nameOf = (code: string) => {
    const p = catalog?.products?.[code];
    return p?.name ? `${p.name} (${code})` : code;
  };
  // Every product is listed; a row is made the moment one of its boxes is typed in.
  const rowFor = (code: string): ProductRow => products.find((r) => r.code === code) || { code, type: 'percent', roles: {} };
  const setRow = (code: string, patch: Partial<ProductRow>) => setProducts((rows) => (rows.some((r) => r.code === code)
    ? rows.map((r) => (r.code === code ? { ...r, ...patch } : r))
    : [...rows, { code, type: 'percent', roles: {}, ...patch }]));
  const general = (key: 'recharge' | 'internet') => {
    const r = rules[key];
    return r?.type === 'percent' ? `${r.value}%` : `RM${Number(r?.value || 0).toFixed(2)}`;
  };

  function parse(raw: string | undefined, type: 'percent' | 'fixed', label: string): number | null | string {
    const t = String(raw ?? '').trim();
    if (t === '') return null;
    const v = Number(t);
    if (!Number.isFinite(v) || v < 0 || (type === 'percent' && v > 100)) return `${label}: enter a number${type === 'percent' ? ' from 0 to 100' : ' of 0 or more'}.`;
    return v;
  }

  async function save() {
    const byRole: NonNullable<CommissionRules['byRole']> = {};
    for (const role of ROLES) {
      for (const s of SERVICES) {
        const v = parse(table[role]?.[s.key], s.type, `${ROLE_LABELS[role]} ${s.label}`);
        if (typeof v === 'string') { setMessage(v); return; }
        if (v === null) continue;
        byRole[role] = { ...(byRole[role] || {}), [s.key]: { type: s.type, value: v } };
      }
    }
    const productRules: NonNullable<CommissionRules['products']> = {};
    for (const row of products) {
      for (const role of ROLES) {
        const v = parse(row.roles[role], row.type, `${nameOf(row.code)} ${ROLE_LABELS[role]}`);
        if (typeof v === 'string') { setMessage(v); return; }
        if (v === null) continue;
        productRules[row.code] = { ...(productRules[row.code] || {}), [role]: { type: row.type, value: v } };
      }
    }
    const next: CommissionRules = commissionPayload(rules, { byRole, products: productRules });
    setSaving(true); setMessage('');
    try {
      await saveCommissionRules(next);
      onSaved(next);
      setMessage('Saved. New commissions apply to the next order.');
    } catch (err) {
      const msg = String((err as Error)?.message || '');
      setMessage(/recent authentication/i.test(msg)
        ? 'For your security, pricing changes need a sign-in from the last 15 minutes. Sign out, sign in again, then save.'
        : msg || 'Could not save commissions.');
    } finally { setSaving(false); }
  }


  return (
    <div>
      <p className="pb-3 text-xs text-[var(--color-ink-soft)]">
        What each kind of user earns back on an order. Leave a box empty to use the general rule ({general('recharge')} recharge, {general('internet')} internet, bill tiers).
        Customers earn nothing unless you enter a value for them.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead><tr className="text-left text-xs text-[var(--color-ink-soft)]"><th className="py-1">Role</th>{SERVICES.map((s) => <th key={s.key} className="px-1 py-1">{s.label}</th>)}</tr></thead>
          <tbody>
            {ROLES.map((role) => (
              <tr key={role}>
                <td className="py-1 font-semibold">{ROLE_LABELS[role]}</td>
                {SERVICES.map((s) => (
                  <td key={s.key} className="px-1 py-1">
                    <input type="number" min="0" step="0.01" className={input} placeholder={role === 'customer' ? '0' : '-'} aria-label={`${ROLE_LABELS[role]} ${s.label}`}
                      value={table[role]?.[s.key] ?? ''} onChange={(e) => setTable((t) => ({ ...t, [role]: { ...t[role], [s.key]: e.target.value } }))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-5 text-xs font-bold">By product / operator</p>
      <p className="text-xs text-[var(--color-ink-soft)]">
        Every product, by category - click a category to open it. A value here beats the table above for that product, for Reload, Internet, Bill and Vouchers.
        Vouchers earn commission only from this list. Leave a role empty to use the table above.
      </p>
      <input className={`mt-2 max-w-xl ${input}`} value={filter} onChange={(e) => setFilter(e.target.value)}
        placeholder={catalog ? 'Filter, e.g. Digi, Shell, TNB, Nepal' : catalogError || 'Loading products…'} />
      <div className="mt-2 divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
        {groups.map((g) => {
          const isOpen = !!filter.trim() || !!open[g.label];
          const setCount = g.items.filter((p) => isSet(products.find((r) => r.code === p.code))).length;
          return (
            <div key={g.label}>
              <button onClick={() => setOpen((o) => ({ ...o, [g.label]: !o[g.label] }))} className="flex w-full items-center justify-between px-3 py-2 text-left">
                <span className="text-sm font-semibold">{isOpen ? '▾' : '▸'} {g.label}</span>
                <span className="text-xs text-[var(--color-ink-soft)]">{g.items.length} products{setCount ? ` · ${setCount} set` : ''}</span>
              </button>
              {isOpen && (
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead><tr className="text-left text-xs text-[var(--color-ink-soft)]"><th className="py-1">Product</th><th className="px-1">Type</th>{ROLES.map((r) => <th key={r} className="px-1">{ROLE_LABELS[r]}</th>)}</tr></thead>
                    <tbody>
                      {g.items.map((p) => {
                        const row = rowFor(p.code);
                        return (
                          <tr key={p.code} className={isSet(products.find((r) => r.code === p.code)) ? 'bg-[var(--color-primary)]/5' : ''}>
                            <td className="py-1 pr-2">{p.name} <span className="text-xs text-[var(--color-ink-soft)]">({p.code})</span></td>
                            <td className="px-1">
                              <select value={row.type} onChange={(e) => setRow(p.code, { type: e.target.value as 'percent' | 'fixed' })} className="rounded-lg border border-[var(--color-line)] px-1 py-1 text-xs">
                                <option value="percent">%</option><option value="fixed">RM</option>
                              </select>
                            </td>
                            {ROLES.map((role) => (
                              <td key={role} className="px-1 py-1">
                                <input type="number" min="0" step="0.01" className={input} placeholder="-" aria-label={`${p.name} ${ROLE_LABELS[role]}`}
                                  value={row.roles[role] ?? ''} onChange={(e) => setRow(p.code, { roles: { ...row.roles, [role]: e.target.value } })} />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {!!catalog && !groups.length && <p className="px-3 py-3 text-xs text-[var(--color-ink-soft)]">No product matches.</p>}
      </div>
      <button disabled={saving} onClick={save} className="mt-4 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save commissions'}</button>
      {!!message && <p className="mt-2 text-xs text-[var(--color-ink-soft)]">{message}</p>}
    </div>
  );
}
