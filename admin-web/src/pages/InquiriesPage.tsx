import { useEffect, useState } from 'react';
import { subscribeInquiries, updateInquiryStatus, closeInquiryWithTicket, type Inquiry } from '../services/inquiryService';

const TYPE_ICON: Record<string, string> = { flight: '✈️', bus: '🚌', train: '🚆' };
const STATUS_STYLES: Record<string, string> = {
  new: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  contacted: 'bg-[var(--color-warning)]/15 text-[#8a6d00]',
  closed: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
};

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ticketDraft, setTicketDraft] = useState<Record<string, string>>({});
  const [ticketingId, setTicketingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeInquiries(setInquiries, (err) => setError(err.message));
    return unsub;
  }, []);

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setError('Could not update this inquiry.');
    } finally {
      setBusyId(null);
    }
  }

  function handleClose(inq: Inquiry) {
    if (inq.type === 'flight') {
      setTicketingId(inq.id);
      return;
    }
    run(inq.id, () => updateInquiryStatus(inq.id, 'closed'));
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Inquiries</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Flight, bus, and train "contact me" requests — no live booking, staff calls back to arrange
        the ticket.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {inquiries.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">No travel inquiries yet.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {inquiries.map((inq) => {
            const busy = busyId === inq.id;
            return (
              <div key={inq.id} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">
                    {TYPE_ICON[inq.type]} {inq.type}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[inq.status]}`}>
                    {inq.status}
                  </span>
                </div>
                <p className="mt-1 text-sm">
                  🗺️ {inq.from} → {inq.to} · {inq.date}
                  {inq.time ? ` · ${inq.time}` : ''}
                </p>
                <p className="text-xs text-[var(--color-ink-soft)]">👥 {inq.passengers} passenger(s)</p>
                <p className="mt-1 text-sm">
                  👤 {inq.name} · 📞 {inq.phone}
                </p>
                {inq.email && <p className="text-sm">✉️ {inq.email}</p>}
                {inq.notes && <p className="mt-1 text-sm text-[var(--color-ink-soft)]">📝 {inq.notes}</p>}
                {inq.status === 'closed' && inq.ticketUrl && (
                  <a
                    href={inq.ticketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-[var(--color-primary)] underline"
                  >
                    View issued ticket
                  </a>
                )}

                {inq.status !== 'closed' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      onClick={() => run(inq.id, () => updateInquiryStatus(inq.id, 'contacted'))}
                      className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      💬 Mark Contacted
                    </button>
                    <a
                      href={inq.phone ? `tel:${inq.phone}` : undefined}
                      onClick={() => run(inq.id, () => updateInquiryStatus(inq.id, 'contacted'))}
                      className={`rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold ${
                        inq.phone ? 'hover:border-[var(--color-primary)]' : 'pointer-events-none opacity-40'
                      }`}
                    >
                      📞 Call
                    </a>
                    <a
                      href={
                        inq.phone
                          ? `https://wa.me/${inq.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                              `Hi ${inq.name || ''}, this is MySheba regarding your ${inq.type} inquiry (${inq.from} → ${inq.to} · ${inq.date}${inq.time ? ` · ${inq.time}` : ''}).`
                            )}`
                          : undefined
                      }
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => run(inq.id, () => updateInquiryStatus(inq.id, 'contacted'))}
                      className={`rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold ${
                        inq.phone ? 'hover:border-[var(--color-primary)]' : 'pointer-events-none opacity-40'
                      }`}
                    >
                      💬 WhatsApp
                    </a>
                    <button
                      disabled={busy}
                      onClick={() => handleClose(inq)}
                      className="rounded-lg bg-[var(--color-success)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      ✓ Close
                    </button>
                  </div>
                )}

                {ticketingId === inq.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={ticketDraft[inq.id] ?? ''}
                      onChange={(e) => setTicketDraft((prev) => ({ ...prev, [inq.id]: e.target.value }))}
                      placeholder="E-ticket URL (already hosted)"
                      className="flex-1 rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]"
                    />
                    <button
                      disabled={busy || !(ticketDraft[inq.id] ?? '').trim()}
                      onClick={() =>
                        run(inq.id, async () => {
                          await closeInquiryWithTicket(inq.id, (ticketDraft[inq.id] ?? '').trim());
                          setTicketingId(null);
                        })
                      }
                      className="rounded-lg bg-[var(--color-success)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Confirm & Close
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
