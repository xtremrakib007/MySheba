import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  SlidersHorizontal,
  BadgeCheck,
  ShieldAlert,
  MessageSquareWarning,
  MessageCircle,
  LifeBuoy,
  BarChart3,
  Tag,
  Wallet,
  Megaphone,
  BellRing,
  LayoutGrid,
  Layers,
  CreditCard,
  Coins,
  Smartphone,
  PercentCircle,
  Receipt,
  Plane,
  Send,
  Building2,
  LineChart,
  Lock,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  superadminOnly?: boolean;
  // false = not yet built (Phase 1 shows these as disabled/"coming soon")
  enabled: boolean;
}

export interface NavGroup {
  label: string;
  // Section header accent, matched to a --color-* token in index.css -
  // gives each group its own color band, like the grouped sections in
  // a typical mobile nav drawer (Website / Solutions / Community).
  accent: 'primary' | 'secondary' | 'warning' | 'danger' | 'success' | 'purple';
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    accent: 'primary',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard, enabled: true },
      { label: 'Transactions', path: '/transactions', icon: Receipt, enabled: true },
      { label: 'Inquiries', path: '/inquiries', icon: Plane, enabled: true },
    ],
  },
  {
    label: 'Users & Access',
    accent: 'secondary',
    items: [
      { label: 'User Management', path: '/users', icon: Users, enabled: true },
      { label: 'Transfer Points', path: '/transfer-points', icon: Send, enabled: true },
      { label: 'Feature Access', path: '/feature-access', icon: SlidersHorizontal, enabled: true },
      { label: 'Tool Access', path: '/tool-access', icon: Lock, enabled: true },
    ],
  },
  {
    label: 'Verification & Moderation',
    accent: 'warning',
    items: [
      { label: 'Identity Verification', path: '/verification', icon: BadgeCheck, enabled: true },
      { label: 'Marketplace Moderation', path: '/marketplace-moderation', icon: ShieldAlert, enabled: true },
      { label: 'Chat Reports', path: '/chat-reports', icon: MessageSquareWarning, enabled: true },
      { label: 'Business Profiles', path: '/business-profiles', icon: Building2, enabled: true },
      { label: 'Analytics', path: '/analytics', icon: LineChart, enabled: true },
    ],
  },
  {
    label: 'Support & Reports',
    accent: 'danger',
    items: [
      { label: 'Support Tickets', path: '/support', icon: LifeBuoy, enabled: true },
      { label: 'Support Messages', path: '/support-messages', icon: MessageCircle, enabled: true },
      { label: 'Announcements', path: '/announcements', icon: BellRing, enabled: true },
      { label: 'Reports', path: '/reports', icon: BarChart3, enabled: true },
    ],
  },
  {
    label: 'Configuration',
    accent: 'success',
    items: [
      { label: 'Rates & Pricing', path: '/config/rates', icon: Tag, enabled: true },
      { label: 'Pricing', path: '/config/pricing', icon: PercentCircle, enabled: true },
      { label: 'Salary Settings', path: '/config/salary', icon: Wallet, enabled: true },
      { label: 'Banners', path: '/config/banners', icon: Megaphone, enabled: true },
      { label: 'Categories', path: '/config/categories', icon: LayoutGrid, enabled: true },
      { label: 'Module Subscriptions', path: '/config/modules', icon: Layers, enabled: true },
      { label: 'Payment Settings', path: '/config/payments', icon: CreditCard, enabled: true },
    ],
  },
  {
    label: 'Superadmin',
    accent: 'purple',
    items: [
      { label: 'Point Top-Up', path: '/topup', icon: Coins, superadminOnly: true, enabled: true },
      { label: 'Device Sessions', path: '/devices', icon: Smartphone, superadminOnly: true, enabled: true },
    ],
  },
];
