import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Command, Search, Sparkles } from 'lucide-react';

type SearchItem = { label: string; description: string; path: string; keywords?: string; group: string };

const ITEMS: SearchItem[] = [
  { label: 'Dashboard', description: 'Admin control center', path: '/', group: 'Overview' },
  { label: 'Executive Overview', description: 'Leadership KPIs and operational attention', path: '/executive', keywords: 'executive kpi leadership', group: 'Overview' },
  { label: 'Alert Center', description: 'Operational alerts and notification activity', path: '/alerts', keywords: 'alerts critical warning notifications', group: 'Overview' },
  { label: 'Investigation Center', description: 'Search an account and inspect its operational footprint', path: '/investigation', keywords: 'investigate search account uid email phone activity audit support transaction kyc', group: 'Investigation' },
  { label: 'User Management', description: 'Users, accounts and access', path: '/users', keywords: 'customer account user dealer reseller admin', group: 'Operations' },
  { label: 'KYC Management', description: 'Identity verification queue', path: '/verification', keywords: 'identity verification kyc document selfie', group: 'Operations' },
  { label: 'Transactions', description: 'Financial activity and records', path: '/transactions', keywords: 'wallet money payment transfer', group: 'Finance' },
  { label: 'Financial Control', description: 'Transaction financial overview', path: '/financial', keywords: 'finance completed pending rejected', group: 'Finance' },
  { label: 'Wallet Settlement', description: 'Point transfers and settlement activity', path: '/wallet-settlement', keywords: 'wallet points settlement transfer', group: 'Finance' },
  { label: 'Fraud & Risk', description: 'Operational risk signals and transaction review', path: '/fraud-risk', keywords: 'fraud risk high value rejected', group: 'Risk' },
  { label: 'Financial Risk Controls', description: 'Superadmin financial risk monitoring', path: '/financial-risk', keywords: 'risk controls exposure', group: 'Risk' },
  { label: 'Support Tickets', description: 'Customer support inbox', path: '/support', keywords: 'help ticket complaint', group: 'Support' },
  { label: 'Support Operations', description: 'Support workload and live chat operations', path: '/support-operations', keywords: 'support workload chat', group: 'Support' },
  { label: 'Announcements', description: 'Publish platform announcements', path: '/announcements', keywords: 'broadcast message notification', group: 'Communications' },
  { label: 'Communications Center', description: 'Campaign and delivery monitoring', path: '/communications', keywords: 'campaign delivery', group: 'Communications' },
  { label: 'Notification Delivery', description: 'Broadcast delivery history and metrics', path: '/notification-delivery', keywords: 'notification sent failed delivery', group: 'Communications' },
  { label: 'Reports & Analytics', description: 'Operational reports', path: '/reports', keywords: 'report analytics statistics', group: 'Analytics' },
  { label: 'Analytics', description: 'Platform usage and trends', path: '/analytics', keywords: 'analytics trends users', group: 'Analytics' },
  { label: 'Growth Center', description: 'Growth, referrals and campaign planning', path: '/growth', keywords: 'growth referral rewards promotion', group: 'Analytics' },
  { label: 'Exchange Rates', description: 'Rates and remittance settings', path: '/config/rates', keywords: 'remittance currency exchange', group: 'Configuration' },
  { label: 'Pricing', description: 'Service pricing configuration', path: '/config/pricing', keywords: 'price fee charges', group: 'Configuration' },
  { label: 'Payment Settings', description: 'Payment configuration', path: '/config/payments', keywords: 'payment gateway', group: 'Configuration' },
  { label: 'Feature Access', description: 'Enable or control modules', path: '/feature-access', keywords: 'modules services access', group: 'Configuration' },
  { label: 'Chat Reports', description: 'Review reported direct chat content', path: '/chat-reports', keywords: 'chat report moderation', group: 'Moderation' },
  { label: 'Inquiries', description: 'Flight, bus, train and service inquiries', path: '/inquiries', keywords: 'flight bus train visa passport', group: 'Services' },
  { label: 'Service Operations', description: 'Monitor platform service modules', path: '/service-operations', keywords: 'mobile banking recharge remittance flight bus train', group: 'Services' },
  { label: 'System Health', description: 'Backend health and operational logs', path: '/system-health', keywords: 'health errors firestore activity', group: 'Governance' },
  { label: 'Audit & Compliance', description: 'Read-only audit and compliance records', path: '/audit', keywords: 'audit compliance logs', group: 'Governance' },
  { label: 'Activity Center', description: 'Combined admin activity, audit and error timeline', path: '/activity-center', keywords: 'activity logs errors audit timeline', group: 'Governance' },
  { label: 'Governance Center', description: 'Superadmin platform governance controls', path: '/governance', keywords: 'governance permissions security configuration', group: 'Governance' },
];

export default function UniversalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS.slice(0, 10);
    return ITEMS.filter((item) => `${item.label} ${item.description} ${item.keywords ?? ''} ${item.group}`.toLowerCase().includes(q)).slice(0, 12);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen(true); setSelected(0); setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { setSelected(0); }, [query]);

  const go = (path: string) => { setOpen(false); setQuery(''); navigate(path); };
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((v) => Math.min(v + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((v) => Math.max(v - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); go(results[selected]?.path); }
  };

  return <>
    <button onClick={() => { setOpen(true); setSelected(0); setTimeout(() => inputRef.current?.focus(), 0); }} className="hidden h-10 min-w-[240px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-400 shadow-sm transition hover:border-blue-300 hover:text-slate-500 lg:flex" title="Universal search (Ctrl+K)">
      <Search size={16}/><span className="flex-1">Search admin...</span><kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Ctrl K</kbd>
    </button>
    {open && <div className="fixed inset-0 z-50 bg-slate-950/35 p-4 backdrop-blur-[3px]" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="mx-auto mt-[8vh] max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600"><Sparkles size={16}/></div>
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onInputKeyDown} placeholder="Search users, transactions, KYC, tickets, reports..." className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none" aria-label="Search admin destinations" />
          <kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-400">ESC</kbd>
        </div>
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{query ? `${results.length} matching destinations` : 'Quick destinations'}</div>
        <div className="max-h-[58vh] overflow-y-auto p-2">
          {results.length ? results.map((item, index) => <button key={item.path} onMouseEnter={() => setSelected(index)} onClick={() => go(item.path)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${index === selected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
            <div className={`rounded-lg p-2 ${index === selected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}><Command size={16}/></div>
            <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">{item.label}</p><p className="truncate text-xs text-slate-500">{item.description} · {item.group}</p></div>
            {index === selected ? <kbd className="hidden rounded border border-blue-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-blue-500 sm:block">ENTER</kbd> : <ArrowRight size={16} className="text-slate-300 group-hover:text-blue-500"/>}
          </button>) : <div className="p-12 text-center"><Search className="mx-auto mb-2 text-slate-300" size={26}/><p className="text-sm font-semibold text-slate-600">No admin destination found</p><p className="mt-1 text-xs text-slate-400">Try a user, KYC, transaction, support, report or configuration keyword.</p></div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-semibold text-slate-400"><span>Universal Admin Search</span><span>↑ ↓ Navigate · Enter Open · Esc Close</span></div>
      </div>
    </div>}
  </>;
}
