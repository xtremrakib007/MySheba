import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Bell, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { navGroups, type NavGroup } from '../routes/navConfig';
import logo from '../assets/logo.png';
import UniversalSearch from '../components/UniversalSearch';

const ACCENT: Record<NavGroup['accent'], { bar: string; icon: string; activeBg: string }> = {
  primary: { bar: 'from-[var(--color-primary)]/30 to-transparent', icon: 'text-[var(--color-primary)]', activeBg: 'bg-[var(--color-primary)]' },
  secondary: { bar: 'from-[var(--color-secondary)]/30 to-transparent', icon: 'text-[var(--color-secondary)]', activeBg: 'bg-[var(--color-secondary)]' },
  warning: { bar: 'from-[var(--color-warning)]/30 to-transparent', icon: 'text-[var(--color-warning)]', activeBg: 'bg-[var(--color-warning)]' },
  danger: { bar: 'from-[var(--color-danger)]/30 to-transparent', icon: 'text-[var(--color-danger)]', activeBg: 'bg-[var(--color-danger)]' },
  success: { bar: 'from-[var(--color-success)]/30 to-transparent', icon: 'text-[var(--color-success)]', activeBg: 'bg-[var(--color-success)]' },
  purple: { bar: 'from-[var(--color-purple)]/30 to-transparent', icon: 'text-[var(--color-purple)]', activeBg: 'bg-[var(--color-purple)]' },
};

const COLLAPSE_KEY = 'mysheba-admin-sidebar-collapsed';

export default function AppShell() {
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <aside className={`flex h-full shrink-0 flex-col bg-[var(--color-navy)] py-6 transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-64'}`}>
        <div className={`mb-6 flex items-center gap-2.5 px-4 ${collapsed ? 'justify-center px-0' : ''}`}>
          <img src={logo} alt="MySheba" className="h-10 w-10 shrink-0 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.35)]" />
          {!collapsed && <div className="overflow-hidden"><p className="truncate font-[var(--font-display)] text-sm font-bold text-white">MySheba</p><p className="truncate text-[11px] text-white/50">Admin Console</p></div>}
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => !item.superadminOnly || profile?.role === 'superadmin');
            if (visibleItems.length === 0) return null;
            const accent = ACCENT[group.accent];
            return <div key={group.label}>
              {!collapsed && <div className={`mb-2 rounded-md bg-gradient-to-r px-2 py-1.5 ${accent.bar}`}><p className="truncate text-[11px] font-semibold uppercase tracking-wide text-white/80">{group.label}</p></div>}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  return item.enabled ? <NavLink key={item.path} to={item.path} end={item.path === '/'} title={collapsed ? item.label : undefined} className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${collapsed ? 'justify-center px-0' : ''} ${isActive ? `${accent.activeBg} text-white` : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
                    {({ isActive }) => <><Icon size={16} strokeWidth={2} className={`shrink-0 ${isActive ? 'text-white' : accent.icon}`} />{!collapsed && <span className="truncate">{item.label}</span>}</>}
                  </NavLink> : <div key={item.path} title={collapsed ? item.label : 'Coming in a later phase'} className={`flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-white/25 ${collapsed ? 'justify-center px-0' : 'justify-between'}`}><span className="flex items-center gap-2.5"><Icon size={16} strokeWidth={2} className="shrink-0" />{!collapsed && <span className="truncate">{item.label}</span>}</span>{!collapsed && <span className="text-[10px] text-white/20">soon</span>}</div>;
                })}
              </div>
            </div>;
          })}
        </nav>
        <div className="mt-4 border-t border-white/10 px-3 pt-4">
          {!collapsed && <><p className="truncate px-2 text-sm font-medium text-white">{profile?.name || profile?.email}</p><p className="truncate px-2 text-xs capitalize text-white/50">{profile?.role}</p></>}
          <button onClick={() => signOut()} title={collapsed ? 'Sign out' : undefined} className={`mt-3 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white ${collapsed ? 'justify-center px-0' : ''}`}><LogOut size={16} strokeWidth={2} className="shrink-0" />{!collapsed && 'Sign out'}</button>
          <button onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/50 transition hover:bg-white/5 hover:text-white ${collapsed ? 'justify-center px-0' : ''}`}>{collapsed ? <PanelLeftOpen size={16} strokeWidth={2} className="shrink-0" /> : <><PanelLeftClose size={16} strokeWidth={2} className="shrink-0" />Collapse</>}</button>
        </div>
      </aside>
      <main className="h-full flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <UniversalSearch />
          <button onClick={() => window.dispatchEvent(new CustomEvent('mysheba:notifications'))} className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-blue-300 hover:text-blue-600 lg:hidden" title="Notifications"><Bell size={18} /></button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
