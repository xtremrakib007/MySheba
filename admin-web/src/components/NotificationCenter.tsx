import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, X } from 'lucide-react';
import { subscribeAnnouncements, type AnnouncementLogEntry } from '../services/announcementService';

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AnnouncementLogEntry[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    return subscribeAnnouncements(setItems, () => setError(true));
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('mysheba:notifications', handler);
    return () => window.removeEventListener('mysheba:notifications', handler);
  }, []);

  const unreadCount = items.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
        title="Notifications"
        aria-label="Notifications"
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
          <div className="absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="font-semibold text-slate-900">Notifications</p>
                <p className="text-xs text-slate-500">Latest platform announcements</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X size={17} />
              </button>
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
                items.map((item) => (
                  <div key={item.id} className="border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <span className="shrink-0 text-[10px] text-slate-400">{item.createdAt ?? ''}</span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500">{item.body}</p>
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-blue-500">{item.audience}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
