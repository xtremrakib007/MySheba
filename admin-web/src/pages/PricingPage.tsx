import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_PRICING,
  ROLE_PRICE_KEYS,
  ROLE_PRICE_ROLES,
  fetchPricing,
  updatePricing,
  updateRolePrice,
  type PricingSettings,
  type PricingRole,
  type RolePriceKey,
} from '../services/pricingService';

const ROLE_LABELS: Record<PricingRole, string> = {
  customer: 'Customer',
  subdealer: 'Sub Dealer',
  dealer: 'Dealer',
  reseller: 'Reseller',
  admin: 'Admin',
};

const ROLE_PRICE_LABELS: Record<RolePriceKey, string> = {
  webviewAccessCost: 'FOMEMA / Visa Status Check (pts)',
  webviewSubmitCost: 'Malaysia Arrival Card / Passport Submission (pts)',
  paymentSuccessCost: 'Bus / Train / MY e-SIM Purchase (pts)',
  listingBoostCost: 'Marketplace Listing Boost (pts)',
  notepadCost: 'Notepad (pts/month)',
  myDocumentsCost: 'My Documents (pts/month)',
  salaryOtCost: 'Salary & OT (pts/month)',
  rechargePointCostPerUnit: 'Recharge point cost per unit',
  internetPointCostPerUnit: 'Internet package point cost per unit',
  gamePointsCostPerUnit: 'Game Points cost per unit',
};

function FieldRow({
  label,
  value,
  suffix,
  onSave,
}: {
  label: string;
  value: number;
  suffix?: string;
  onSave: (next: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  async function save() {
    const num = Number(draft);
    if (!Number.isFinite(num) || num < 0) return;
    setSaving(true);
    try {
      await onSave(num);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            className="w-24 rounded-lg border border-[var(--color-line)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <button
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
          <button
            disabled={saving}
            onClick={() => {
              setDraft(String(value));
              setEditing(false);
            }}
            className="rounded-lg border border-[var(--color-line)] px-3 py-1 text-xs font-semibold"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="font-semibold">
            {value}
            {suffix}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-primary)]"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <h2 className="text-base font-bold">{title}</h2>
      <div className="mt-2 divide-y divide-[var(--color-line)]">{children}</div>
    </div>
  );
}

function RolePriceRow({
  priceKey,
  pricing,
  onSave,
}: {
  priceKey: RolePriceKey;
  pricing: PricingSettings;
  onSave: (role: PricingRole, key: RolePriceKey, value: number) => Promise<void>;
}) {
  return (
    <div className="py-3">
      <p className="text-sm font-semibold">{ROLE_PRICE_LABELS[priceKey]}</p>
      <div className="mt-2 space-y-1">
        {ROLE_PRICE_ROLES.map((role) => {
          const override = pricing.rolePricing?.[role]?.[priceKey];
          const isDefault = override == null;
          const displayValue = isDefault ? pricing[priceKey] : override;
          return (
            <FieldRow
              key={role}
              label={ROLE_LABELS[role]}
              value={displayValue}
              suffix={isDefault ? ' pts (default)' : ' pts'}
              onSave={(next) => onSave(role, priceKey, next)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function PricingPage() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === 'superadmin';
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setPricing(await fetchPricing());
    } catch (err) {
      console.error(err);
      setError('Could not load pricing settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(key: keyof PricingSettings, value: number) {
    await updatePricing(key, value);
    setPricing((prev) => ({ ...prev, [key]: value }));
  }

  async function saveRolePrice(role: PricingRole, key: RolePriceKey, value: number) {
    await updateRolePrice(role, key, value);
    setPricing((prev) => ({
      ...prev,
      rolePricing: { ...prev.rolePricing, [role]: { ...prev.rolePricing?.[role], [key]: value } },
    }));
  }

  if (loading) {
    return <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Pricing</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Platform-wide money rules — dealer earnings, point costs, and margins. Changes apply
        immediately across the app.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-6">
        <Section title="Earning & Margin Settings">
          <FieldRow
            label="Dealer Earning on Customer Transfer (%)"
            value={pricing.dealerEarningPercent}
            suffix="%"
            onSave={(v) => save('dealerEarningPercent', v)}
          />
          <FieldRow
            label="Mobile Recharge Cost (%)"
            value={pricing.rechargeCostPercent}
            suffix="%"
            onSave={(v) => save('rechargeCostPercent', v)}
          />
          <FieldRow
            label="Mobile Recharge Profit (%)"
            value={pricing.rechargeProfitPercent}
            suffix="%"
            onSave={(v) => save('rechargeProfitPercent', v)}
          />
          <FieldRow
            label="GameBot Winner Payout Fee (%)"
            value={pricing.gamePointsFeePercent}
            suffix="%"
            onSave={(v) => save('gamePointsFeePercent', v)}
          />
        </Section>

        <Section title="Point Feature Costs">
          <FieldRow
            label="FOMEMA / Visa Status Check (pts)"
            value={pricing.webviewAccessCost}
            suffix=" pts"
            onSave={(v) => save('webviewAccessCost', v)}
          />
          <FieldRow
            label="Malaysia Arrival Card / Passport Submission (pts)"
            value={pricing.webviewSubmitCost}
            suffix=" pts"
            onSave={(v) => save('webviewSubmitCost', v)}
          />
          <FieldRow
            label="Bus / Train / MY e-SIM Purchase (pts)"
            value={pricing.paymentSuccessCost}
            suffix=" pts"
            onSave={(v) => save('paymentSuccessCost', v)}
          />
          <FieldRow
            label="FOMEMA / Visa Free Access Window (hours)"
            value={pricing.webviewAccessWindowHours}
            suffix=" hrs"
            onSave={(v) => save('webviewAccessWindowHours', v)}
          />
        </Section>

        <Section title="Notepad / Documents / Salary & OT">
          <FieldRow
            label="Notepad (pts/month)"
            value={pricing.notepadCost}
            suffix=" pts"
            onSave={(v) => save('notepadCost', v)}
          />
          <FieldRow
            label="My Documents (pts/month)"
            value={pricing.myDocumentsCost}
            suffix=" pts"
            onSave={(v) => save('myDocumentsCost', v)}
          />
          <FieldRow
            label="Salary & OT (pts/month)"
            value={pricing.salaryOtCost}
            suffix=" pts"
            onSave={(v) => save('salaryOtCost', v)}
          />
          <FieldRow
            label="Subscription Cycle Length (days)"
            value={pricing.moduleSubscriptionDays}
            suffix=" days"
            onSave={(v) => save('moduleSubscriptionDays', v)}
          />
        </Section>

        <Section title="Marketplace Boost">
          <FieldRow
            label="Marketplace Listing Boost (pts)"
            value={pricing.listingBoostCost}
            suffix=" pts"
            onSave={(v) => save('listingBoostCost', v)}
          />
          <FieldRow
            label="Boost Duration (days)"
            value={pricing.listingBoostDurationDays}
            suffix=" days"
            onSave={(v) => save('listingBoostDurationDays', v)}
          />
        </Section>

        {isSuperadmin ? (
          <Section title="Role-Based Pricing (superadmin only)">
            {ROLE_PRICE_KEYS.map((key) => (
              <RolePriceRow key={key} priceKey={key} pricing={pricing} onSave={saveRolePrice} />
            ))}
          </Section>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-5 text-sm text-[var(--color-ink-soft)]">
            Role-Based Pricing is visible to superadmin accounts only.
          </div>
        )}
      </div>
    </div>
  );
}
