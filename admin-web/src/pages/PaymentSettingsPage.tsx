import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, Lock, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_PAYMENT_SETTINGS,
  addBankAccount,
  removeBankAccount,
  subscribePaymentSettings,
  updateBankAccount,
  updatePaymentSettings,
  type BankAccount,
  type PaymentSettings,
  type PaymentSettingsKey,
} from '../services/paymentSettingsService';

const TEXT_FIELDS: { key: PaymentSettingsKey; label: string; placeholder: string; hint?: string }[] = [
  { key: 'jompayBillerId', label: 'JomPay Biller ID', placeholder: 'e.g. 12345' },
  { key: 'jompayRefNo', label: 'JomPay Reference No.', placeholder: "e.g. the company's registered ref/account no." },
  { key: 'duitnowQrUrl', label: 'DuitNow QR image URL', placeholder: 'https://…', hint: 'Paste an already-hosted image URL — this screen does not upload files.' },
];

const BLANK_ACCOUNT = { bankName: '', accountNumber: '', accountHolder: '' };

function TextSetting({
  label, value, placeholder, hint, editable, onSave,
}: {
  label: string; value: string; placeholder: string; hint?: string; editable: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(value); }, [value]);
  const dirty = draft !== value;

  async function save() {
    setSaving(true);
    setError(null);
    try { await onSave(draft.trim()); }
    catch (err) { console.error(err); setError(err instanceof Error ? err.message : 'Could not save.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="py-3">
      <label className="text-sm font-semibold">{label}</label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={draft}
          disabled={!editable}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void save(); }}
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-black/[0.03] disabled:text-[var(--color-ink-soft)]"
        />
        {editable && (
          <button
            disabled={!dirty || saving}
            onClick={() => void save()}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{hint}</p>}
      {error && <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

export default function PaymentSettingsPage() {
  const { profile } = useAuth();
  const editable = profile?.role === 'superadmin';
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newAccount, setNewAccount] = useState(BLANK_ACCOUNT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(BLANK_ACCOUNT);

  useEffect(() => {
    const unsubscribe = subscribePaymentSettings(
      (next) => { setSettings(next); setLoading(false); setError(null); },
      (err) => { console.error(err); setError('Could not load payment settings.'); setLoading(false); }
    );
    return unsubscribe;
  }, []);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (err) { console.error(err); setError(failure); }
    finally { setBusy(false); }
  }

  const accountComplete = (a: typeof BLANK_ACCOUNT) => Boolean(a.bankName.trim() && a.accountNumber.trim() && a.accountHolder.trim());

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payment Settings</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            The JomPay, DuitNow and bank details customers see on the Top-Up screen, stored in <code className="rounded bg-black/5 px-1">settings/paymentMethods</code> — the document the mobile app reads.
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

      {!editable && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-sm">
          <Lock size={16} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
          These are the platform's billing credentials, so only a superadmin can change them. You can see the current values.
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="flex items-center gap-2 text-base font-bold"><QrCode size={17} className="text-[var(--color-primary)]" /> JomPay &amp; DuitNow</h2>
          <div className="mt-1 divide-y divide-[var(--color-line)]">
            {TEXT_FIELDS.map((f) => (
              <TextSetting
                key={f.key}
                label={f.label}
                value={settings[f.key]}
                placeholder={f.placeholder}
                hint={f.hint}
                editable={editable}
                onSave={(next) => updatePaymentSettings(f.key, next)}
              />
            ))}
          </div>
          {settings.duitnowQrUrl && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">Current QR</p>
              <img src={settings.duitnowQrUrl} alt="DuitNow QR code" className="mt-2 h-40 w-40 rounded-xl border border-[var(--color-line)] object-contain p-2" />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold"><Building2 size={17} className="text-[var(--color-primary)]" /> Receiving bank accounts</h2>
            {editable && !adding && (
              <button onClick={() => setAdding(true)} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white">Add account</button>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Shown to customers who pick Bank Transfer or Bank Deposit.</p>

          {adding && (
            <div className="mt-4 space-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
              {(['bankName', 'accountNumber', 'accountHolder'] as const).map((key) => (
                <input
                  key={key}
                  value={newAccount[key]}
                  placeholder={key === 'bankName' ? 'Bank name' : key === 'accountNumber' ? 'Account number' : 'Account holder'}
                  onChange={(e) => setNewAccount((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              ))}
              <div className="flex gap-2">
                <button
                  disabled={busy || !accountComplete(newAccount)}
                  onClick={() => void run(async () => {
                    await addBankAccount({
                      bankName: newAccount.bankName.trim(),
                      accountNumber: newAccount.accountNumber.trim(),
                      accountHolder: newAccount.accountHolder.trim(),
                    });
                    setNewAccount(BLANK_ACCOUNT);
                    setAdding(false);
                  }, 'Could not add that account.')}
                  className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Save account
                </button>
                <button onClick={() => { setAdding(false); setNewAccount(BLANK_ACCOUNT); }} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold">Cancel</button>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {settings.bankAccounts.map((account: BankAccount) => {
              const isEditing = editingId === account.id;
              return (
                <div key={account.id} className="rounded-xl border border-[var(--color-line)] p-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      {(['bankName', 'accountNumber', 'accountHolder'] as const).map((key) => (
                        <input
                          key={key}
                          value={editDraft[key]}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                        />
                      ))}
                      <div className="flex gap-2">
                        <button
                          disabled={busy || !accountComplete(editDraft)}
                          onClick={() => void run(async () => {
                            await updateBankAccount(account.id, {
                              bankName: editDraft.bankName.trim(),
                              accountNumber: editDraft.accountNumber.trim(),
                              accountHolder: editDraft.accountHolder.trim(),
                            });
                            setEditingId(null);
                          }, 'Could not save that account.')}
                          className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{account.bankName}</p>
                        <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-soft)]">{account.accountNumber}</p>
                        <p className="text-xs text-[var(--color-ink-soft)]">{account.accountHolder}</p>
                      </div>
                      {editable && (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => { setEditingId(account.id); setEditDraft({ bankName: account.bankName, accountNumber: account.accountNumber, accountHolder: account.accountHolder }); }}
                            className="rounded-lg bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-primary)]"
                          >
                            Edit
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void run(() => removeBankAccount(account.id), 'Could not remove that account.')}
                            className="rounded-lg p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-40"
                            title="Remove account"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && settings.bankAccounts.length === 0 && !adding && (
              <p className="rounded-xl border border-dashed border-[var(--color-line)] p-6 text-center text-sm text-[var(--color-ink-soft)]">No bank accounts yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
