import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, SlidersHorizontal, BadgeCheck, ShieldAlert,
  MessageCircle, LifeBuoy, BarChart3, Tag, Wallet, Megaphone, BellRing, LayoutGrid, Layers,
  CreditCard, Coins, Smartphone, PercentCircle, Receipt, Plane, Send, Building2, LineChart, Lock,
  Activity, Search, TriangleAlert, ClipboardList, Headphones, Store, BriefcaseBusiness, Banknote,
  Network, TrendingUp, ScrollText, Settings2, ShieldCheck, Gauge, Workflow,
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

export const navGroups: NavGroup[] = [
  { label: 'Overview', accent: 'primary', items: [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard, enabled: true },
    { label: 'Executive Overview', path: '/executive', icon: Gauge, enabled: true },
    { label: 'Alert Center', path: '/alerts', icon: TriangleAlert, enabled: true },
    { label: 'Investigation Center', path: '/investigation', icon: Search, enabled: true },
  ] },
  { label: 'Operations', accent: 'secondary', items: [
    { label: 'Transactions', path: '/transactions', icon: Receipt, enabled: true },
    { label: 'User Operations', path: '/users', icon: Users, enabled: true },
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
  ] },
  { label: 'Finance & Risk', accent: 'danger', items: [
    { label: 'Financial Control', path: '/financial', icon: Banknote, enabled: true },
    { label: 'Wallet Settlement', path: '/wallet-settlement', icon: Wallet, enabled: true },
    { label: 'Fraud & Risk', path: '/fraud-risk', icon: ShieldAlert, enabled: true },
    { label: 'Financial Risk Controls', path: '/financial-risk', icon: Lock, superadminOnly: true, enabled: true },
  ] },
  { label: 'Support & Communications', accent: 'danger', items: [
    { label: 'Support Tickets', path: '/support', icon: LifeBuoy, enabled: true },
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
    { label: 'Module Subscriptions', path: '/config/modules', icon: Layers, enabled: true },
  ] },
  { label: 'Superadmin Governance', accent: 'purple', items: [
    { label: 'Governance Center', path: '/governance', icon: Settings2, superadminOnly: true, enabled: true },
    { label: 'Platform Control', path: '/platform-control', icon: BriefcaseBusiness, superadminOnly: true, enabled: true },
    { label: 'Role & Permissions', path: '/role-permissions', icon: Network, superadminOnly: true, enabled: true },
    { label: 'Tool Access', path: '/tool-access', icon: Lock, superadminOnly: true, enabled: true },
    { label: 'Audit & Compliance', path: '/audit', icon: ScrollText, superadminOnly: true, enabled: true },
    { label: 'Activity Center', path: '/activity-center', icon: Activity, superadminOnly: true, enabled: true },
    { label: 'System Health', path: '/system-health', icon: Activity, superadminOnly: true, enabled: true },
    { label: 'Device Sessions', path: '/devices', icon: Smartphone, superadminOnly: true, enabled: true },
    { label: 'Point Top-Up', path: '/topup', icon: Coins, superadminOnly: true, enabled: true },
  ] },
];
