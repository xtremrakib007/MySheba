import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  completeTopup, newDepositRequestId, recordDeposit, rejectTopup, subscribeOpenTopups, verifyTopup, type TopupRequest,
} from '../services/topupReviewService';

// Wallet funding. This page used to be a note saying admin credit is disabled,
// with no action on it. Both funding paths that do exist now live here:
//   - customers' top-up requests: finance (or a superadmin) verifies the
//     payment, then finance / an admin / a superadmin completes it, which pays
//     the customer from the approver's own wallet;
//   - the superadmin's recorded bank deposit, the one place money enters.
export default function PointTopUpPage() {
  const { access } = useAuth();
  const role = access.role;
  const isSuperadmin = role === 'superadmin';
  const mayComplete = role === 'superadmin' || role === 'admin' || role === 'finance';
  const [rows, setRows] = useState<TopupRequest[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => subscribeOpenTopups(setRows, (e) => setError(e.message || 'Could not load top-up requests.')), []);

  async function act(id: string, run: () => Promise<unknown>, done: string) {
    setBusy(id); setError(''); setNotice('');
    try { await run(); setNotice(done); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Wallet Funding</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Review customers&apos; top-up requests. A completed top-up is paid from the approver&apos;s own wallet, so nothing is created out of thin air.
      </p>
      {error && <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">{error}</div>}
      {notice && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {isSuperadmin && <DepositForm />}

      <section className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
        <div className="border-b border-[var(--color-line)] px-5 py-3 font-semibold">Open top-up requests ({rows.length})</div>
        {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-[var(--color-ink-soft)]">No top-up requests are waiting.</p>}
        <div className="divide-y divide-[var(--color-line)]">
          {rows.map((t) => (
            <div key={t.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="font-semibold">{t.currency} {t.amount.toFixed(2)} · {t.userName || t.userPhone || t.userId}</div>
                <div className="text-xs text-[var(--color-ink-soft)]">
                  {[t.method, t.bankName, t.refNo && `Ref ${t.refNo}`, t.createdAt && new Date(t.createdAt).toLocaleString()].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-1 flex gap-3 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-bold ${t.status === 'verified' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{t.status === 'verified' ? 'Verified - ready to complete' : 'Pending verification'}</span>
                  {t.receiptUrl && <a href={t.receiptUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--color-primary)]">View receipt</a>}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {t.status === 'pending' && (
                  <button disabled={!!busy} onClick={() => act(t.id, () => verifyTopup(t.id), 'Payment verified. It can now be completed.')} className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] disabled:opacity-40">Verify payment</button>
                )}
                {t.status === 'verified' && mayComplete && (
                  <button disabled={!!busy} onClick={() => act(t.id, () => completeTopup(t.id), 'Top-up completed and the customer credited.')} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Complete</button>
                )}
                <button disabled={!!busy} onClick={() => { const reason = window.prompt('Reason for rejecting this top-up?'); if (reason !== null) void act(t.id, () => rejectTopup(t.id, reason), 'Top-up rejected.'); }} className="rounded-lg border border-[var(--color-danger)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-40">Reject</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Superadmin: record money actually deposited into the business bank account.
function DepositForm() {
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [requestId, setRequestId] = useState(newDepositRequestId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const valid = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0 && Number(amount) <= 50000 && bankName.trim() && /[A-Za-z0-9]{3,}/.test(refNo) && receipt;

  async function submit() {
    if (!valid || busy || !receipt) return;
    setBusy(true); setMessage('');
    try {
      const out = await recordDeposit({ amount, bankName, refNo, note, receipt, requestId });
      setMessage(out.duplicate ? 'This deposit was already recorded.' : `MYR ${Number(out.amount).toFixed(2)} added to your wallet.`);
      setAmount(''); setBankName(''); setRefNo(''); setNote(''); setReceipt(null); setRequestId(newDepositRequestId());
    } catch (e) {
      const msg = (e as Error).message;
      setMessage(/recent authentication/i.test(msg) ? 'For your security, sign out and sign in again, then record the deposit within 15 minutes.' : msg);
    } finally { setBusy(false); }
  }

  const input = 'w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]';
  return (
    <section className="mt-6 max-w-2xl rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <h2 className="font-semibold">🏦 Record bank deposit</h2>
      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Money enters MySheba here. Each bank reference can be recorded once; up to MYR 50,000 per deposit.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className={input} placeholder="Amount (MYR)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className={input} placeholder="Bank, e.g. Maybank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
        <input className={input} placeholder="Bank reference number" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
        <input className={input} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <label className="mt-3 block text-sm">Bank receipt (image)
        <input type="file" accept="image/*" className="mt-1 block text-sm" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
      </label>
      {message && <p className="mt-3 text-sm">{message}</p>}
      <button disabled={!valid || busy} onClick={submit} className="mt-4 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Recording…' : 'Record deposit'}</button>
    </section>
  );
}
