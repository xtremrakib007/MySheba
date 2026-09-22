import { useEffect, useState } from 'react';
import { AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_RATES,
  MOBILE_RATE_FIELDS,
  RECHARGE_RATE_FIELDS,
  REMITTANCE_RATE_FIELDS,
  canEditRate,
  subscribeRates,
  updateRate,
  type RateField,
  type Rates,
} from '../services/ratesService';

function RateRow({
  field, value, editable, onSave,
}: {
  field: RateField;
  value: number;
  editable: boolean;
  onSave: (next: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setDraft(String(value)); }, [value]);

  async function save() {
    const num = Number(draft);
    if (!Number.isFinite(num) || num <= 0) { setError('Enter a valid positive rate.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(num);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that rate.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <span className="text-sm">{field.label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus type="number" step="any" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); } }}
            className="w-28 rounded-lg border border-[var(--color-line)] px-2 py-1 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <button disabled={saving} onClick={() => void save()} className="rounded-lg bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">Save</button>
          <button disabled={saving} onClick={() => { setDraft(String(value)); setEditing(false); setError(null); }} className="rounded-lg border border-[var(--color-line)] px-3 py-1 text-xs font-semibold">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="font-semibold">{value}</span>
          {editable ? (
            <button onClick={() => setEditing(true)} className="rounded-lg bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">Edit</button>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]"><Lock size={11} /> Superadmin</span>
          )}
        </div>
      )}
      {error && <p className="w-full text-right text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <h2 className="text-base font-bold">{title}</h2>
      {note && <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{note}</p>}
      <div className="mt-2 divide-y divide-[var(--color-line)]">{children}</div>
    </div>
  );
}

export default function RatesPricingPage() {
  const { profile } = useAuth();
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeRates(
      (next) => { setRates(next); setLoading(false); setError(null); },
      (err) => { console.error(err); setError('Could not load rates.'); setLoading(false); }
    );
    return unsubscribe;
  }, []);

  const isSuperadmin = profile?.role === 'superadmin';

  const section = (fields: RateField[]) => fields.map((field) => (
    <RateRow
      key={field.key}
      field={field}
      value={rates[field.key] ?? 0}
      editable={canEditRate(field.key, profile?.role)}
      onSave={(next) => updateRate(field.key, next, profile?.role)}
    />
  ));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Rates &amp; Pricing</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            The live service rates in <code className="rounded bg-black/5 px-1">rates/current</code> — the same document the mobile app reads. A change here applies immediately, everywhere.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading…' : 'Live'}
        </span>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      {!isSuperadmin && (
        <div className="mt-4 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-sm">
          You can change Mobile Banking and Remittance rates. Recharge/Internet rates are superadmin-only.
        </div>
      )}

      <div className="mt-6 space-y-6">
        <Section title="Mobile Banking">{section(MOBILE_RATE_FIELDS)}</Section>
        <Section title="Remittance" note="Each corridor keeps its own payout rate; the transfer fee is charged in MYR.">
          {section(REMITTANCE_RATE_FIELDS)}
        </Section>
        <Section title="Recharge & Internet" note="Used for server-side conversion only — customers never see these rates.">
          {section(RECHARGE_RATE_FIELDS)}
        </Section>
      </div>
    </div>
  );
}
