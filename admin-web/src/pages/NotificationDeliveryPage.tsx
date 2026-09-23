import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, RefreshCw, Send, Users, XCircle } from 'lucide-react';
import { subscribeAnnouncements, type AnnouncementLogEntry } from '../services/announcementService';

const audienceLabel: Record<string, string> = {
  all: 'Everyone', customer: 'Customers', dealer: 'Dealers', reseller: 'Resellers', support: 'Support Agents', finance: 'Finance', admin: 'Admins', superadmin: 'Superadmins',
};

export default function NotificationDeliveryPage() {
  const [items, setItems] = useState<AnnouncementLogEntry[]>([]);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setError('');
    return subscribeAnnouncements(setItems, (err) => setError(err.message || 'Unable to load notification history.'));
  }, [refreshKey]);

  const stats = useMemo(() => {
    const matched = items.reduce((n, x) => n + Number(x.matchedCount || 0), 0);
    const sent = items.reduce((n, x) => n + Number(x.sentCount || 0), 0);
    const failed = Math.max(0, matched - sent);
    const rate = matched ? Math.round((sent / matched) * 100) : 0;
    return { matched, sent, failed, rate };
  }, [items]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="rounded-3xl bg-gradient-to-r from-[#00a99d] to-[#1a73e8] p-6 text-white shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold opacity-90"><Bell size={18} /> Notification Center</div>
            <h1 className="text-2xl font-bold sm:text-3xl">Delivery & Announcement Monitoring</h1>
            <p className="mt-2 max-w-2xl text-sm opacity-90">Monitor broadcast history and delivery results from the existing server-side announcement pipeline.</p>
          </div>
          <button onClick={() => setRefreshKey((v) => v + 1)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0b2447] shadow-sm"><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['Broadcasts', items.length, Bell], ['Recipients Matched', stats.matched, Users], ['Notifications Sent', stats.sent, CheckCircle2], ['Unsent / Failed', stats.failed, XCircle],
        ] as const).map(([label, value, Icon]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><Icon size={20} /></div><div className="mt-2 text-2xl font-bold text-[#0b2447]">{Number(value).toLocaleString()}</div></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2"><div className="flex items-center gap-2 font-semibold text-[#0b2447]"><Send size={18} /> Delivery performance</div><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#00a99d]" style={{ width: `${stats.rate}%` }} /></div><div className="mt-2 flex justify-between text-sm text-slate-500"><span>Successful delivery rate</span><strong className="text-[#0b2447]">{stats.rate}%</strong></div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Pipeline status</div><div className="mt-2 flex items-center gap-2 text-lg font-bold text-[#0b2447]"><span className="h-2.5 w-2.5 rounded-full bg-[#00a99d]" /> Server-side delivery</div><p className="mt-2 text-xs text-slate-500">Sending and permission checks are handled by the existing Cloud Function.</p></div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5"><h2 className="font-semibold text-[#0b2447]">Recent broadcasts</h2><p className="mt-1 text-sm text-slate-500">Latest 30 announcement delivery records.</p></div>
        <div className="divide-y divide-slate-100">
          {items.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No announcement delivery records found.</div> : items.map((item) => {
            const matched = Number(item.matchedCount || 0); const sent = Number(item.sentCount || 0); const success = matched === 0 ? true : sent >= matched;
            return <div key={item.id} className="p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[#0b2447]">{item.title || 'Untitled announcement'}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{audienceLabel[item.audience] || item.audience}</span></div><p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.body}</p><p className="mt-2 text-xs text-slate-400">{item.createdAt || 'Time unavailable'} · {item.sentByName || 'Unknown sender'}</p></div><div className="flex shrink-0 items-center gap-4 text-sm"><span><strong>{sent.toLocaleString()}</strong> / {matched.toLocaleString()} sent</span>{success ? <CheckCircle2 size={19} /> : <XCircle size={19} />}</div></div></div>;
          })}
        </div>
      </div>
    </div>
  );
}
