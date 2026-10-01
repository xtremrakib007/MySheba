import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccess, navGroups, ROLE_LABELS, type NavGroup } from '../routes/navConfig';
import logo from '../assets/logo.png';
import UniversalSearch from '../components/UniversalSearch';
import NotificationCenter from '../components/NotificationCenter';

const ACCENT: Record<NavGroup['accent'], { bar: string; icon: string; activeBg: string; dot: string }> = {
  primary: { bar: 'from-[var(--color-primary)]/30 to-transparent', icon: 'text-[var(--color-primary)]', activeBg: 'bg-[var(--color-primary)]', dot: 'bg-[var(--color-primary)]' },
  secondary: { bar: 'from-[var(--color-secondary)]/30 to-transparent', icon: 'text-[var(--color-secondary)]', activeBg: 'bg-[var(--color-secondary)]', dot: 'bg-[var(--color-secondary)]' },
  warning: { bar: 'from-[var(--color-warning)]/30 to-transparent', icon: 'text-[var(--color-warning)]', activeBg: 'bg-[var(--color-warning)]', dot: 'bg-[var(--color-warning)]' },
  danger: { bar: 'from-[var(--color-danger)]/30 to-transparent', icon: 'text-[var(--color-danger)]', activeBg: 'bg-[var(--color-danger)]', dot: 'bg-[var(--color-danger)]' },
  success: { bar: 'from-[var(--color-success)]/30 to-transparent', icon: 'text-[var(--color-success)]', activeBg: 'bg-[var(--color-success)]', dot: 'bg-[var(--color-success)]' },
  purple: { bar: 'from-[var(--color-purple)]/30 to-transparent', icon: 'text-[var(--color-purple)]', activeBg: 'bg-[var(--color-purple)]', dot: 'bg-[var(--color-purple)]' },
};

const COLLAPSE_KEY = 'mysheba-admin-sidebar-collapsed';
const GROUPS_KEY = 'mysheba-admin-sidebar-groups';

export default function AppShell() {
  const { profile, signOut, access, deviceCheckDeferred } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(GROUPS_KEY) || '{}'); } catch { return {}; }
  });

  // One source of truth for access: navConfig's PATH_ROLES decides both what
  // the sidebar offers and what ProtectedRoute lets through.
  const visibleGroups = useMemo(() => navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccess(item.path, access) && (!item.superadminOnly || access.role === 'superadmin')),
  })).filter((group) => group.items.length > 0), [access]);

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { localStorage.setItem(GROUPS_KEY, JSON.stringify(openGroups)); }, [openGroups]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const isGroupActive = (group: NavGroup) => group.items.some((item) =>
    item.enabled && (item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path))
  );

  const toggleGroup = (label: string) => {
    setOpenGroups((current) => ({ ...current, [label]: !(current[label] ?? true) }));
  };

  const sidebar = (
    <aside className={`flex h-full shrink-0 flex-col bg-[var(--color-navy)] py-5 shadow-2xl transition-[width] duration-200 lg:shadow-none ${collapsed ? 'w-[68px]' : 'w-72'}`}>
      <div className={`mb-5 flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        <img src={logo} alt="MySheba" className="h-10 w-10 shrink-0 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.35)]" />
        {!collapsed && <div className="min-w-0 flex-1 overflow-hidden"><p className="truncate font-[var(--font-display)] text-sm font-bold text-white">MySheba</p><p className="truncate text-[11px] text-white/50">Admin Control Center</p></div>}
        <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close navigation"><X size={18} /></button>
      </div>

      <nav className={`flex-1 space-y-2 overflow-y-auto overflow-x-hidden ${collapsed ? 'px-2' : 'px-3'}`}>
        {visibleGroups.map((group) => {
          const accent = ACCENT[group.accent];
          const active = isGroupActive(group);
          const open = openGroups[group.label] ?? true;
          return <div key={group.label} className="rounded-xl">
            <button onClick={() => toggleGroup(group.label)} title={collapsed ? group.label : undefined} className={`mb-1 flex w-full items-center rounded-lg py-2 transition ${collapsed ? 'justify-center px-1' : 'gap-2 px-2 text-left'} ${active ? 'text-white' : 'text-white/55 hover:bg-white/5 hover:text-white/80'}`} aria-expanded={open}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot} ${active ? 'opacity-100' : 'opacity-50'}`} />
              {!collapsed && <><span className="flex-1 truncate text-[10px] font-bold uppercase tracking-[0.14em]">{group.label}</span><ChevronDown size={14} className={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} /></>}
            </button>
            {open && <div className="space-y-0.5 pb-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return item.enabled ? <NavLink key={item.path} to={item.path} end={item.path === '/'} title={collapsed ? item.label : undefined} className={({ isActive }) => `group flex items-center rounded-lg border border-transparent py-2 text-sm font-medium transition ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3'} ${isActive ? `${accent.activeBg} text-white shadow-sm` : 'text-white/65 hover:border-white/5 hover:bg-white/5 hover:text-white'}`}>
                  {({ isActive }) => <><Icon size={16} strokeWidth={2} className={`shrink-0 ${isActive ? 'text-white' : accent.icon}`} />{!collapsed && <><span className="truncate">{item.label}</span>{isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" />}</>}</>}
                </NavLink> : <div key={item.path} title={collapsed ? `${item.label} — Coming in a later phase` : 'Coming in a later phase'} className={`flex cursor-not-allowed items-center rounded-lg py-2 text-sm font-medium text-white/25 ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3'}`}><Icon size={16} strokeWidth={2} className="shrink-0" />{!collapsed && <><span className="truncate">{item.label}</span><span className="ml-auto text-[9px] text-white/20">soon</span></>}</div>;
              })}
            </div>}
          </div>;
        })}
      </nav>

      <div className={`mt-3 border-t border-white/10 pt-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && <div className="rounded-xl bg-white/5 px-3 py-2.5">
          <p className="truncate text-sm font-medium text-white">{profile?.name || profile?.email}</p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/40">{profile ? ROLE_LABELS[profile.role] : ''}</p>
        </div>}
        <button onClick={() => signOut()} title={collapsed ? 'Sign out' : undefined} className={`mt-2 flex w-full items-center rounded-lg py-2 text-sm font-medium text-white/65 transition hover:bg-white/5 hover:text-white ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3 text-left'}`}><LogOut size={16} strokeWidth={2} />{!collapsed && 'Sign out'}</button>
        <button onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand sidebar' : undefined} className={`mt-1 hidden w-full items-center rounded-lg py-2 text-sm font-medium text-white/45 transition hover:bg-white/5 hover:text-white lg:flex ${collapsed ? 'justify-center px-1' : 'gap-2.5 px-3 text-left'}`}>{collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} />Compact mode</>}</button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <div className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setMobileOpen(false)} />
      <div className={`fixed inset-y-0 left-0 z-50 -translate-x-full transition-transform duration-200 lg:static lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : ''}`}>{sidebar}</div>
      <main className="h-full min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex items-center gap-3">
          <button onClick={() => setMobileOpen(true)} className="rounded-xl border border-[var(--color-border)] bg-white p-2.5 text-[var(--color-navy)] shadow-sm lg:hidden" aria-label="Open navigation"><Menu size={20} /></button>
          <div className="min-w-0 flex-1"><UniversalSearch /></div>
          <NotificationCenter />
        </div>
        {deviceCheckDeferred && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <span className="font-semibold">Device verification was unavailable at sign-in.</span>{' '}
            You have access, but this browser was not verified for this session. Sign out and back in
            once the connection is stable.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
