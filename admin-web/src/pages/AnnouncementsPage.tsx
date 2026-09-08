import { useEffect, useState } from 'react';
import {
  ANNOUNCEMENT_AUDIENCES,
  sendAnnouncement,
  subscribeAnnouncements,
  type AnnouncementAudience,
  type AnnouncementLogEntry,
} from '../services/announcementService';

const AUDIENCE_LABEL = Object.fromEntries(ANNOUNCEMENT_AUDIENCES.map((a) => [a.key, a.label]));

export default function AnnouncementsPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<AnnouncementLogEntry[]>([]);

  useEffect(() => {
    const unsub = subscribeAnnouncements(setHistory, () => {});
    return unsub;
  }, []);

  async function handleSend() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await sendAnnouncement({ title: title.trim(), body: body.trim(), audience });
      setResult(`Sent to ${res.sentCount} of ${res.matchedCount} matching accounts.`);
      setTitle('');
      setBody('');
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Could not send this announcement.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Announcements</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Send a push notification to every matching account, and see what's already been sent.
      </p>

      <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="text-base font-bold">New Broadcast</h2>

        <div className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message"
            rows={3}
            className="w-full rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--color-ink-soft)]">Send to:</span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
              className="rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-sm"
            >
              {ANNOUNCEMENT_AUDIENCES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
        {result && <p className="mt-3 text-sm text-[var(--color-success)]">{result}</p>}

        <button
          disabled={sending || !title.trim() || !body.trim()}
          onClick={handleSend}
          className="mt-4 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {sending ? 'Sending…' : '📣 Send Announcement'}
        </button>
      </div>

      <h2 className="mt-8 text-lg font-bold">History</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">Nothing sent yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {history.map((a) => (
            <div key={a.id} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{a.title}</p>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase">
                  {AUDIENCE_LABEL[a.audience] ?? a.audience}
                </span>
              </div>
              <p className="mt-1 text-sm">{a.body}</p>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                Sent by {a.sentByName || 'unknown'} · {a.createdAt ?? '—'} · reached {a.sentCount}/
                {a.matchedCount}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
