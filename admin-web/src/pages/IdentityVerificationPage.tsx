import { useEffect, useState } from 'react';
import {
  fetchVerificationRequests,
  reviewVerification,
  type VerificationRequest,
} from '../services/moderationService';

function ImageThumb({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={url}
        alt={label}
        className="h-20 w-32 rounded-lg border border-[var(--color-line)] object-cover"
      />
      <p className="mt-1 text-[10px] text-[var(--color-ink-soft)]">{label}</p>
    </a>
  );
}

export default function IdentityVerificationPage() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRequests(await fetchVerificationRequests('pending'));
    } catch (err) {
      console.error(err);
      setError('Could not load verification requests.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleApprove(req: VerificationRequest) {
    setBusyId(req.id);
    try {
      await reviewVerification(req, 'approved');
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      console.error(err);
      setError('Approval failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(req: VerificationRequest) {
    setBusyId(req.id);
    try {
      await reviewVerification(req, 'rejected', rejectionReason.trim() || undefined);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      setRejectingId(null);
      setRejectionReason('');
    } catch (err) {
      console.error(err);
      setError('Rejection failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Identity Verification</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Review pending KYC submissions. Approving or rejecting also updates the user's{' '}
        <code className="text-xs">verificationStatus</code>.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">No pending verification requests.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {requests.map((req) => {
            const busy = busyId === req.id;
            const isRejecting = rejectingId === req.id;
            return (
              <div
                key={req.id}
                className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{req.name}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      {req.phone ?? '—'} · {req.documentType ?? 'Document type unknown'} ·
                      Submitted {req.submittedAt ?? '—'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => handleApprove(req)}
                      className="rounded-lg bg-[var(--color-success)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setRejectingId(isRejecting ? null : req.id)}
                      className="rounded-lg border border-[var(--color-danger)] px-4 py-2 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-4">
                  <ImageThumb url={req.frontImageUrl} label="Document front" />
                  <ImageThumb url={req.backImageUrl} label="Document back" />
                  <ImageThumb url={req.selfieImageUrl} label="Selfie" />
                </div>

                {isRejecting && (
                  <div className="mt-4 flex gap-2">
                    <input
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Reason for rejection (optional)"
                      className="flex-1 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-danger)]"
                    />
                    <button
                      disabled={busy}
                      onClick={() => handleReject(req)}
                      className="rounded-lg bg-[var(--color-danger)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Confirm reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
