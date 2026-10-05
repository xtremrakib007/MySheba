import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  INVOICE_KINDS, invoiceKindLabel, createInvoice, approveInvoice, rejectInvoice, listInvoices,
  openInvoiceDocument,
  type Invoice, type InvoiceKind, type NewInvoice,
} from '../services/invoiceService';

/**
 * Invoices for money put into the business and money paid out to providers.
 *
 * Built around what the record is for: every row names who raised it and who
 * approved it, with the date AND the time. "Approved on the 3rd" is not an
 * audit trail.
 *
 * The decision buttons are hidden on an invoice you raised yourself, and the
 * reason appears in their place. The server refuses self-approval inside the
 * transaction either way - the rule lives in functions/invoiceRules.js - but a
 * button that exists only to produce an error is worse than no button.
 */

const EMPTY: NewInvoice = { kind: 'providerPayment', party: '', amount: '', currency: 'MYR', reference: '', notes: '' };

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};

function when(millis: number | null): string {
  if (!millis) return '';
  const d = new Date(millis);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function InvoicesPage() {
  const { profile, access } = useAuth();
  // Raising and deciding both need finance; reports can read the history.
  const mayDecide = access.role === 'superadmin' || access.capabilities.includes('finance');
  const myUid = profile?.uid ?? '';

  const [filter, setFilter] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState('');
  const [form, setForm] = useState<NewInvoice>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setInvoices(await listInvoices(filter)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load the invoices.'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await createInvoice(form);
      setForm({ ...EMPTY, kind: form.kind, currency: form.currency });
      setShowForm(false);
      await load();
    } catch (err) {
      // The server's own words: it names the field that is wrong.
      setError(err instanceof Error ? err.message : 'Could not raise the invoice.');
    } finally { setSaving(false); }
  };

  const print = async (invoice: Invoice) => {
    setError(null);
    try {
      await openInvoiceDocument(invoice.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare that invoice.');
    }
  };

  const decide = async (invoice: Invoice, approved: boolean) => {
    if (busyId) return;
    let note = '';
    if (!approved) {
      // The server refuses a rejection with no reason, so it is collected here
      // rather than letting the call fail.
      const given = window.prompt(`Rejecting ${invoice.number}. Why? This is kept on the record.`);
      if (given === null) return;
      note = given.trim();
      if (!note) { setError('A rejection needs a reason.'); return; }
    }
    setBusyId(invoice.id);
    setError(null);
    try {
      if (approved) await approveInvoice(invoice.id);
      else await rejectInvoice(invoice.id, note);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the decision.');
    } finally { setBusyId(''); }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Invoices</h1>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Money put into the business, and money paid out to providers.
          </p>
        </div>
        {mayDecide && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
          >
            {showForm ? 'Cancel' : 'Raise an invoice'}
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        {[{ key: '', label: 'All' }, ...INVOICE_KINDS].map((f) => (
          <button
            key={f.key || 'all'}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-4 py-1.5 text-sm ${filter === f.key ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-[var(--color-line)]'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 rounded-xl border border-[var(--color-line)] p-4">
          <div className="mb-3 flex gap-2">
            {INVOICE_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, kind: k.key as InvoiceKind }))}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${form.kind === k.key ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white' : 'border-[var(--color-line)]'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            {form.kind === 'investment' ? 'Investor' : 'Paid to'}
          </label>
          <input
            required
            value={form.party}
            onChange={(e) => setForm((f) => ({ ...f, party: e.target.value }))}
            placeholder={form.kind === 'investment' ? 'Who put the money in' : 'e.g. iimmpact'}
            className="mb-3 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
          />
          <div className="mb-3 flex gap-2">
            <input
              required
              value={form.currency}
              maxLength={3}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
              className="w-24 rounded-lg border border-[var(--color-line)] px-3 py-2 text-center text-sm"
            />
            <input
              required
              inputMode="decimal"
              value={String(form.amount)}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              className="flex-1 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
            />
          </div>
          <input
            value={form.reference ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="Their invoice or receipt number (optional)"
            className="mb-3 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
          />
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            rows={3}
            className="mb-3 w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Raise invoice'}
          </button>
          <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
            It is recorded against your name and waits for somebody else in finance to approve it.
          </p>
        </form>
      )}

      {loading ? <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p> : (
        <div className="space-y-3">
          {invoices.length === 0 && <p className="text-sm text-[var(--color-ink-soft)]">No invoices yet.</p>}
          {invoices.map((invoice) => {
            const mine = !!myUid && invoice.createdBy === myUid;
            const pending = invoice.status === 'pending';
            return (
              <div key={invoice.id} className="rounded-xl border border-[var(--color-line)] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{invoice.number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_CLASS[invoice.status] ?? ''}`}>
                    {invoice.status}
                  </span>
                </div>
                <p className="mt-1 text-sm">{invoice.party}</p>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  {invoiceKindLabel(invoice.kind)}{invoice.reference ? ` · ${invoice.reference}` : ''}
                </p>
                <p className="mt-2 text-lg font-semibold">{invoice.currency} {invoice.amount.toFixed(2)}</p>
                {invoice.notes && <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{invoice.notes}</p>}

                {/* Both names always shown, so an invoice nobody has approved
                    reads as unapproved rather than as missing a field. */}
                <div className="mt-3 border-t border-[var(--color-line)] pt-3 text-xs">
                  <p>
                    <span className="text-[var(--color-ink-soft)]">Raised by </span>
                    {invoice.createdByName || invoice.createdBy || 'unknown'}
                    {invoice.createdByRole ? ` (${invoice.createdByRole})` : ''}
                    {invoice.createdAt ? ` · ${when(invoice.createdAt)}` : ''}
                  </p>
                  <p>
                    <span className="text-[var(--color-ink-soft)]">
                      {invoice.status === 'rejected' ? 'Rejected by ' : 'Approved by '}
                    </span>
                    {invoice.approvedByName || invoice.approvedBy
                      ? `${invoice.approvedByName || invoice.approvedBy}`
                        + (invoice.approvedByRole ? ` (${invoice.approvedByRole})` : '')
                        + (invoice.approvedAt ? ` · ${when(invoice.approvedAt)}` : '')
                      : 'nobody yet'}
                  </p>
                  {invoice.decisionNote && <p className="mt-1 italic text-[var(--color-ink-soft)]">{invoice.decisionNote}</p>}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* Every invoice, not only approved ones. An unapproved one
                      prints with a notice across the top saying it is not
                      payable - see functions/invoiceDocument.js. */}
                  <button
                    type="button"
                    onClick={() => void print(invoice)}
                    className="rounded-lg border border-[var(--color-line)] px-4 py-1.5 text-sm font-medium"
                  >
                    Print / Download
                  </button>
                </div>

                {pending && mayDecide && (mine ? (
                  <p className="mt-3 text-xs italic text-[var(--color-ink-soft)]">
                    You raised this one, so somebody else in finance has to approve it.
                  </p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={!!busyId}
                      onClick={() => void decide(invoice, false)}
                      className="rounded-lg border border-rose-600 px-4 py-1.5 text-sm font-medium text-rose-700 disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={!!busyId}
                      onClick={() => void decide(invoice, true)}
                      className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {busyId === invoice.id ? '…' : 'Approve'}
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
