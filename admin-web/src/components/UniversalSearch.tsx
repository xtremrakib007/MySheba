import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Command, Search } from 'lucide-react';

type SearchItem = { label: string; description: string; path: string; keywords?: string };

const ITEMS: SearchItem[] = [
  { label: 'Dashboard', description: 'Admin control center', path: '/' },
  { label: 'User Management', description: 'Users, accounts and access', path: '/users', keywords: 'customer account user' },
  { label: 'KYC Management', description: 'Identity verification queue', path: '/verification', keywords: 'identity verification kyc' },
  { label: 'Transactions', description: 'Financial activity and records', path: '/transactions', keywords: 'wallet money payment transfer' },
  { label: 'Support Tickets', description: 'Customer support inbox', path: '/support', keywords: 'help ticket complaint' },
  { label: 'Reports & Analytics', description: 'Operational reports', path: '/reports', keywords: 'report analytics statistics' },
  { label: 'Announcements', description: 'Publish platform announcements', path: '/announcements' },
  { label: 'Exchange Rates', description: 'Rates and remittance settings', path: '/config/rates', keywords: 'remittance currency exchange' },
  { label: 'Pricing', description: 'Service pricing configuration', path: '/config/pricing' },
  { label: 'Feature Access', description: 'Enable or control modules', path: '/feature-access', keywords: 'modules services marketplace' },
  { label: 'Business Profiles', description: 'Business profile management', path: '/business-profiles' },
  { label: 'Inquiries', description: 'Flight, bus, train and service inquiries', path: '/inquiries' },
];

export default function UniversalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS.slice(0, 7);
    return ITEMS.filter((item) => `${item.label} ${item.description} ${item.keywords ?? ''}`.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (path: string) => { setOpen(false); setQuery(''); navigate(path); };

  return (
    <>
      <button onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }} className="hidden h-10 min-w-[240px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-400 shadow-sm transition hover:border-blue-300 hover:text-slate-500 lg:flex" title="Universal search (Ctrl+K)">
        <Search size={16} /><span className="flex-1">Search admin...</span><kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">Ctrl K</kbd>
      </button>
      {open && <div className="fixed inset-0 z-50 bg-slate-950/30 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="mx-auto mt-[10vh] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3"><Search size={19} className="text-slate-400" /><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pages, users, transactions, KYC..." className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none" /><button onClick={() => setOpen(false)} className="rounded-md border px-2 py-1 text-[10px] font-bold text-slate-400">ESC</button></div>
          <div className="max-h-[55vh] overflow-y-auto p-2">
            {results.length ? results.map((item) => <button key={item.path} onClick={() => go(item.path)} className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-blue-50"><div className="rounded-lg bg-slate-100 p-2 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600"><Command size={16} /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">{item.label}</p><p className="truncate text-xs text-slate-500">{item.description}</p></div><ArrowRight size={16} className="text-slate-300 group-hover:text-blue-500" /></button>) : <div className="p-10 text-center text-sm text-slate-400">No admin destination found.</div>}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold text-slate-400">Universal Admin Search · Ctrl+K to open · Esc to close</div>
        </div>
      </div>}
    </>
  );
}
