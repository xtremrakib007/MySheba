import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  markChatReadByStaff,
  sendStaffMessage,
  subscribeAllChats,
  subscribeMessages,
  type ChatThread,
  type ChatThreadMessage,
} from '../services/supportChatService';

function ThreadRow({ thread, active, onClick }: { thread: ChatThread; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl px-3 py-3 text-left transition ${
        active ? 'bg-[var(--color-primary)]/10' : 'hover:bg-black/5'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{thread.customerName || thread.customerId}</span>
        {thread.unreadForStaff > 0 && (
          <span className="rounded-full bg-[var(--color-danger)] px-2 py-0.5 text-[10px] font-bold text-white">
            {thread.unreadForStaff}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-[var(--color-ink-soft)]">
        {thread.lastSenderRole === 'staff' ? 'You: ' : ''}
        {thread.lastMessage || 'No messages yet'}
      </p>
      {thread.assignedToName && (
        <p className="mt-1 text-[11px] text-[var(--color-primary)]">Assigned: {thread.assignedToName}</p>
      )}
    </button>
  );
}

export default function SupportMessagesPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { firebaseUser, profile } = useAuth();

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = subscribeAllChats(setThreads, (err) => setThreadsError(err.message));
    return unsub;
  }, []);

  const activeThread = useMemo(() => threads.find((t) => t.id === chatId) ?? null, [threads, chatId]);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    setMessagesError(null);
    const unsub = subscribeMessages(chatId, setMessages, (err) => setMessagesError(err.message));
    markChatReadByStaff(chatId).catch(() => {});
    return unsub;
  }, [chatId]);

  async function handleSend() {
    if (!chatId || !draft.trim() || !firebaseUser) return;
    setSending(true);
    try {
      await sendStaffMessage(chatId, { uid: firebaseUser.uid, name: profile?.name }, draft);
      setDraft('');
    } catch (err) {
      console.error(err);
      setMessagesError('Could not send the message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Support Messages</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Live 1:1 support chat threads — separate from the trackable Support Tickets queue.
      </p>

      {threadsError && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-4 py-3 text-sm text-[var(--color-danger)]">
          Could not load message threads.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-2">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-ink-soft)]">No conversations yet.</p>
          ) : (
            threads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === chatId}
                onClick={() => navigate(`/support-messages/${t.id}`)}
              />
            ))
          )}
        </div>

        <div className="flex min-h-[70vh] flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)]">
          {!chatId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-ink-soft)]">
              Select a conversation to view messages.
            </div>
          ) : (
            <>
              <div className="border-b border-[var(--color-line)] p-4">
                <p className="font-semibold">{activeThread?.customerName || chatId}</p>
                {activeThread?.customerPhone && (
                  <p className="text-xs text-[var(--color-ink-soft)]">{activeThread.customerPhone}</p>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messagesError ? (
                  <p className="text-sm text-[var(--color-danger)]">{messagesError}</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-[var(--color-ink-soft)]">No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.senderRole === 'staff' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-sm rounded-2xl px-3 py-2 text-sm ${
                          m.senderRole === 'staff'
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-black/5 text-[var(--color-ink)]'
                        }`}
                      >
                        <p>{m.text || (m.type ? `[${m.type}]` : '')}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            m.senderRole === 'staff' ? 'text-white/70' : 'text-[var(--color-ink-soft)]'
                          }`}
                        >
                          {m.createdAt ?? ''}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2 border-t border-[var(--color-line)] p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Reply as support…"
                  className="flex-1 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                />
                <button
                  disabled={sending || !draft.trim()}
                  onClick={handleSend}
                  className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
