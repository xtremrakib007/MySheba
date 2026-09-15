import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, CheckCircle2, ExternalLink, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { subscribeAnnouncements, type AnnouncementLogEntry } from '../services/announcementService';

const READ_KEY = 'mysheba-admin-notification-read';
const MAX_READ_IDS = 200;

function readIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(READ_KEY) || '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AnnouncementLogEntry[]>([]);
  const [read, setRead] = useState<string[]>(readIds);
  const [error, setError] = useState(false);

  useEffect(() => {
    return subscribeAnnouncements(setItems, () => setError(true));
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('mysheba:notifications', handler);
    return () => window.removeEventListener('mysheba:notifications', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem(READ_KEY, JSON.stringify(read.slice(-MAX_READ_IDS)));
  }, [read]);

  const unreadItems = useMemo(() => items.filter((item) => !read.includes(item.id)), [items, read]);
  const unreadCount = unreadItems.length;

  const markRead = (id: string) => setRead((current) => current.includes(id) ? current : [...current, id].slice(-MAX_READ_IDS));
  const markAllRead = () => setRead((current) => Array.from(new Set([...current, ...items.map((item) => item.id)])).slice(-MAX_READ_IDS));

  const openAnnouncements = () => {
    setOpen(false);
    navigate('/announcements');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
        title="Notifications"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Close notifications" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">Notifications</p>
                  {unreadCount > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">{unreadCount} unread</span>}
                </div>
                <p className="text-xs text-slate-500">Latest platform announcements</p>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && <button onClick={markAllRead} className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Mark all as read" aria-label="Mark all as read"><CheckCheck size={17} /></button>}
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={17} /></button>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {error ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">Notifications are temporarily unavailable.</div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
                  <p className="text-sm font-medium text-slate-700">You’re all caught up</p>
                  <p className="mt-1 text-xs text-slate-400">No announcements yet.</p>
                </div>
              ) : (
                items.map((item) => {
                  const unread = !read.includes(item.id);
                  return (
                    <button key={item.id} onClick={() => markRead(item.id)} className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-0 hover:bg-slate-50 ${unread ? 'bg-blue-50/50' : 'bg-white'}`}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-blue-500' : 'bg-slate-200'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-800">{item.title}</span>
                            <span className="shrink-0 text-[10px] text-slate-400">{item.createdAt ?? ''}</span>
                          </span>
                          <span className="mt-1 block line-clamp-3 text-xs leading-5 text-slate-500">{item.body}</span>
                          <span className="mt-2 block text-[10px] font-medium uppercase tracking-wide text-blue-500">{item.audience}</span>
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
              <button onClick={openAnnouncements} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700">Open Communications <ExternalLink size={13} /></button>
              <span className="text-[10px] text-slate-400">Read status is browser-local</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
