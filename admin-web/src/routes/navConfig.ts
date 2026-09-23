import type { LucideIcon } from 'lucide-react';
import type { AdminRole } from '../contexts/AuthContext';
import type { Capability } from '../services/accessControlService';
import {
  LayoutDashboard, Users, SlidersHorizontal, BadgeCheck, ShieldAlert,
  MessageCircle, LifeBuoy, BarChart3, Tag, Wallet, Megaphone, BellRing, LayoutGrid, Layers,
  CreditCard, Coins, Smartphone, PercentCircle, Receipt, Plane, Send, Building2, LineChart, Lock,
  Activity, Search, TriangleAlert, ClipboardList, Headphones, Mail, BriefcaseBusiness, Banknote,
  ListChecks, UserCog, UserRoundCog,
  Network, TrendingUp, ScrollText, Settings2, ShieldCheck, Gauge, Workflow, Ticket, KeyRound,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  superadminOnly?: boolean;
  enabled: boolean;
}

export interface NavGroup {
  label: string;
  accent: 'primary' | 'secondary' | 'warning' | 'danger' | 'success' | 'purple';
  items: NavItem[];
}

// ---------------------------------------------------------------------
// Who may open what.
//
// Screens are gated by capability, not by role name, so a superadmin's
// per-user grants and revokes (Access Control) change what someone sees the
// moment they are saved. Each screen lists the capabilities that open it -
// any one is enough. SUPERADMIN screens are governance and are never
// grantable. A screen not listed here needs 'users', which keeps a newly
// added screen closed to support and finance until someone decides otherwise.
// ---------------------------------------------------------------------

export interface Access {
  role: AdminRole | undefined;
  capabilities: readonly Capability[];
}

const SUPERADMIN = 'superadmin-only' as const;
type Requirement = readonly Capability[] | typeof SUPERADMIN | 'everyone';

export const PATH_ACCESS: Record<string, Requirement> = {
  '/': 'everyone',

  // Support
  '/support': ['support'],
  '/support-messages': ['support'],
  '/support-operations': ['support'],
  '/operations': ['support'],
  '/inquiries': ['support'],
  '/announcements': ['support'],
  '/communications': ['support'],
  '/notification-delivery': ['support'],
  '/chat-reports': ['support'],

  // Orders and money. Transactions serve both: order handling and finance.
  '/transactions': ['orders', 'finance'],
  '/service-operations': ['orders'],
  '/financial': ['finance'],
  '/wallet-settlement': ['finance'],
  '/fraud-risk': ['finance'],
  '/topup': ['finance'],
  '/transfer-points': ['finance'],

  // Users
  '/users': ['users'],
  '/user-operations': ['users'],
  '/advanced-user-operations': ['users'],
  '/kyc-operations': ['users'],
  '/verification': ['users'],
  '/business-profiles': ['users'],
  '/feature-access': ['users'],
  '/investigation': ['users'],
  '/security': ['users'],

  // Settings
  '/config/rates': ['settings'],
  '/config/pricing': ['settings'],
  '/config/payments': ['settings'],
  '/config/salary': ['settings'],
  '/config/banners': ['settings'],
  '/config/categories': ['settings'],
  '/config/billers': ['settings'],
  '/config/modules': ['settings'],

  // Reports
  '/reports': ['reports'],
  '/analytics': ['reports'],
  '/growth': ['reports'],
  '/executive': ['reports'],
  '/alerts': ['reports'],

  // Superadmin governance
  '/governance': SUPERADMIN,
  '/platform-control': SUPERADMIN,
  '/role-permissions': SUPERADMIN,
  '/tool-access': SUPERADMIN,
  '/access-control': SUPERADMIN,
  '/audit': SUPERADMIN,
  '/activity-center': SUPERADMIN,
  '/system-health': SUPERADMIN,
  '/devices': SUPERADMIN,
  '/recharge-pins': SUPERADMIN,
  '/financial-risk': SUPERADMIN,
};

export function canAccess(path: string, access: Access): boolean {
  if (!access.role) return false;
  if (access.role === 'superadmin') return true;
  const need = PATH_ACCESS[path] ?? ['users'];
  if (need === 'everyone') return true;
  if (need === SUPERADMIN) return false;
  return need.some((cap) => access.capabilities.includes(cap));
}

// First screen to try for each capability, in the order a role's landing
// page is chosen.
const LANDING_BY_CAPABILITY: [Capability, string][] = [
  ['support', '/support'],
  ['finance', '/transactions'],
  ['orders', '/transactions'],
  ['users', '/users'],
  ['settings', '/config/rates'],
  ['reports', '/reports'],
];

/** Where someone lands after signing in, or when they open a screen they may
 * not see. Admins and superadmins land on the dashboard; the focused staff
 * roles land on their own work. */
export function landingPathFor(access: Access): string {
  if (access.role === 'admin' || access.role === 'superadmin') return '/';
  const hit = LANDING_BY_CAPABILITY.find(([cap]) => access.capabilities.includes(cap));
  return hit ? hit[1] : '/';
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  support: 'Support Agent',
  finance: 'Finance',
};

export const navGroups: NavGroup[] = [
  { label: 'Overview', accent: 'primary', items: [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard, enabled: true },
    { label: 'Executive Overview', path: '/executive', icon: Gauge, enabled: true },
    { label: 'Alert Center', path: '/alerts', icon: TriangleAlert, enabled: true },
    { label: 'Investigation Center', path: '/investigation', icon: Search, enabled: true },
  ] },
  { label: 'Operations', accent: 'secondary', items: [
    { label: 'Operations Center', path: '/operations', icon: ListChecks, enabled: true },
    { label: 'Transactions', path: '/transactions', icon: Receipt, enabled: true },
    { label: 'User Management', path: '/users', icon: Users, enabled: true },
    { label: 'User Operations', path: '/user-operations', icon: UserRoundCog, enabled: true },
    { label: 'Advanced User Ops', path: '/advanced-user-operations', icon: UserCog, enabled: true },
    { label: 'KYC Operations', path: '/kyc-operations', icon: ClipboardList, enabled: true },
    { label: 'Support Operations', path: '/support-operations', icon: Headphones, enabled: true },
    { label: 'Service Operations', path: '/service-operations', icon: Workflow, enabled: true },
    { label: 'Inquiries', path: '/inquiries', icon: Plane, enabled: true },
  ] },
  { label: 'Users & Access', accent: 'secondary', items: [
    { label: 'Transfer Points', path: '/transfer-points', icon: Send, enabled: true },
    { label: 'Feature Access', path: '/feature-access', icon: SlidersHorizontal, enabled: true },
    { label: 'Business Profiles', path: '/business-profiles', icon: Building2, enabled: true },
  ] },
  { label: 'Verification & Moderation', accent: 'warning', items: [
    { label: 'Identity Verification', path: '/verification', icon: BadgeCheck, enabled: true },
    { label: 'Security Center', path: '/security', icon: ShieldCheck, enabled: true },
    { label: 'Chat Reports', path: '/chat-reports', icon: MessageCircle, enabled: true },
  ] },
  { label: 'Finance & Risk', accent: 'danger', items: [
    { label: 'Financial Control', path: '/financial', icon: Banknote, enabled: true },
    { label: 'Wallet Settlement', path: '/wallet-settlement', icon: Wallet, enabled: true },
    { label: 'Point Top-Up', path: '/topup', icon: Coins, enabled: true },
    { label: 'Fraud & Risk', path: '/fraud-risk', icon: ShieldAlert, enabled: true },
    { label: 'Financial Risk Controls', path: '/financial-risk', icon: Lock, superadminOnly: true, enabled: true },
  ] },
  { label: 'Support & Communications', accent: 'danger', items: [
    { label: 'Support Tickets', path: '/support', icon: LifeBuoy, enabled: true },
    { label: 'Support Messages', path: '/support-messages', icon: Mail, enabled: true },
    { label: 'Announcements', path: '/announcements', icon: BellRing, enabled: true },
    { label: 'Communications Center', path: '/communications', icon: Megaphone, enabled: true },
    { label: 'Notification Delivery', path: '/notification-delivery', icon: Activity, enabled: true },
  ] },
  { label: 'Analytics & Reports', accent: 'primary', items: [
    { label: 'Reports', path: '/reports', icon: BarChart3, enabled: true },
    { label: 'Analytics', path: '/analytics', icon: LineChart, enabled: true },
    { label: 'Growth Center', path: '/growth', icon: TrendingUp, enabled: true },
  ] },
  { label: 'Platform Configuration', accent: 'success', items: [
    { label: 'Rates & Pricing', path: '/config/rates', icon: Tag, enabled: true },
    { label: 'Pricing', path: '/config/pricing', icon: PercentCircle, enabled: true },
    { label: 'Payment Settings', path: '/config/payments', icon: CreditCard, enabled: true },
    { label: 'Salary Settings', path: '/config/salary', icon: Wallet, enabled: true },
    { label: 'Banners', path: '/config/banners', icon: Megaphone, enabled: true },
    { label: 'Categories', path: '/config/categories', icon: LayoutGrid, enabled: true },
    { label: 'Billers', path: '/config/billers', icon: Receipt, enabled: true },
    { label: 'Module Subscriptions', path: '/config/modules', icon: Layers, enabled: true },
  ] },
  { label: 'Superadmin Governance', accent: 'purple', items: [
    { label: 'Governance Center', path: '/governance', icon: Settings2, superadminOnly: true, enabled: true },
    { label: 'Platform Control', path: '/platform-control', icon: BriefcaseBusiness, superadminOnly: true, enabled: true },
    { label: 'Access Control', path: '/access-control', icon: KeyRound, superadminOnly: true, enabled: true },
    { label: 'Role & Permissions', path: '/role-permissions', icon: Network, superadminOnly: true, enabled: true },
    { label: 'Tool Access', path: '/tool-access', icon: Lock, superadminOnly: true, enabled: true },
    { label: 'Audit & Compliance', path: '/audit', icon: ScrollText, superadminOnly: true, enabled: true },
    { label: 'Activity Center', path: '/activity-center', icon: Activity, superadminOnly: true, enabled: true },
    { label: 'System Health', path: '/system-health', icon: Activity, superadminOnly: true, enabled: true },
    { label: 'Device Sessions', path: '/devices', icon: Smartphone, superadminOnly: true, enabled: true },
    { label: 'Recharge PINs', path: '/recharge-pins', icon: Ticket, superadminOnly: true, enabled: true },
  ] },
];
