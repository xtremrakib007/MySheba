import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeInvestigationMessages,
  type InvestigationMessage,
} from '../services/moderationService';

// Reached only from ChatReportsPage's "Investigate" button. Deliberately
// read-only (no reply box) - this is a moderation tool for someone who
// isn't a participant in the conversation, not a second way to use chat.
// Access depends entirely on directChats/{chatId}.underInvestigation,
// which Cloud Functions set/clear based on the report's status - closing
// or resolving the report elsewhere will make this view stop working,
// same as on mobile.
export default function InvestigateChatPage() {
  const { chatId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const reportedUid = params.get('reportedUid');
  const reportedName = params.get('reportedName');

  const [messages, setMessages] = useState<InvestigationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role !== 'superadmin') {
      setError('Only a superadmin can investigate a reported conversation.');
      setLoading(false);
      return;
    }
    if (!chatId) return;
    setLoading(true);
    setError(null);
    const unsub = subscribeInvestigationMessages(
      chatId,
      (list) => {
        setMessages(list);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Could not load this conversation. The report may have been resolved.');
        setLoading(false);
      }
    );
    return unsub;
  }, [chatId, profile?.role]);

  return (
    <div>
      <button
        onClick={() => navigate('/chat-reports')}
        className="text-sm font-semibold text-[var(--color-primary)]"
      >
        ← Back to Chat Reports
      </button>

      <h1 className="mt-3 text-2xl font-bold">Investigate Conversation</h1>
      {reportedName && (
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Reported: {reportedName}</p>
      )}

      <div className="mt-4 rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 px-4 py-3 text-sm">
        🔒 You're viewing this conversation because there's an open report against it. Access ends
        automatically once the report is resolved.
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : error ? (
        <div className="mt-6 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </div>
      ) : messages.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-card)] p-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">No messages in this conversation.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {messages.map((m) => {
            const fromReported = reportedUid && m.senderId === reportedUid;
            return (
              <div
                key={m.id}
                className={`max-w-lg rounded-2xl border p-3 ${
                  fromReported
                    ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5'
                    : 'border-[var(--color-line)] bg-[var(--color-card)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{m.senderName || 'User'}</span>
                  {fromReported && (
                    <span className="rounded-full bg-[var(--color-danger)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-danger)]">
                      reported
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm">{m.text || (m.type ? `[${m.type}]` : '')}</p>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">{m.createdAt ?? ''}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
