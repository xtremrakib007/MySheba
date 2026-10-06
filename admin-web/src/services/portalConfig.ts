import type { Access } from '../routes/navConfig';

export type Portal = 'ADMIN' | 'FINANCE' | 'SUPPORT' | 'LOCAL';

export const PORTAL_HOSTS: Record<Exclude<Portal, 'LOCAL'>, string> = {
  ADMIN: 'admin.mysheba.top',
  FINANCE: 'finance.mysheba.top',
  SUPPORT: 'support.mysheba.top',
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function getCurrentPortal(hostname = window.location.hostname): Portal {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (LOCAL_HOSTS.has(host)) return 'LOCAL';
  if (host === PORTAL_HOSTS.ADMIN) return 'ADMIN';
  if (host === PORTAL_HOSTS.FINANCE) return 'FINANCE';
  if (host === PORTAL_HOSTS.SUPPORT) return 'SUPPORT';
  // Unknown hosts are treated as ADMIN for compatibility while enforcement is
  // disabled. Strict mode will refuse them through isKnownProductionPortal().
  return 'ADMIN';
}

export function isKnownProductionPortal(hostname = window.location.hostname): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  return LOCAL_HOSTS.has(host) || Object.values(PORTAL_HOSTS).includes(host);
}

export function portalEnforcementEnabled(): boolean {
  return String(import.meta.env.SUBDOMAIN_PORTAL_ENFORCEMENT ?? 'false').toLowerCase() === 'true';
}

export function canAccessPortal(portal: Portal, access: Access): boolean {
  if (!access.role) return false;
  if (portal === 'LOCAL') return true;
  if (portal === 'ADMIN') return access.role === 'superadmin' || access.role === 'admin';
  if (portal === 'FINANCE') {
    return access.role === 'superadmin' || access.role === 'admin'
      || access.capabilities.includes('finance') || access.capabilities.includes('orders');
  }
  return access.role === 'superadmin' || access.role === 'admin'
    || access.capabilities.includes('support') || access.capabilities.includes('users');
}

const FINANCE_PATHS = [
  '/transactions', '/invoices', '/financial', '/wallet-settlement', '/fraud-risk',
  '/topup', '/transfer-points', '/service-operations', '/reports', '/analytics',
];

const SUPPORT_PATHS = [
  '/support', '/support/messages', '/support-operations', '/inquiries',
  '/announcements', '/communications', '/notification-delivery',
  '/users', '/user-operations', '/kyc-operations', '/verification', '/reports',
];

function matches(path: string, allowed: string[]): boolean {
  return allowed.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

export function portalAllowsPath(portal: Portal, path: string): boolean {
  if (portal === 'LOCAL' || portal === 'ADMIN') return true;
  if (path === '/') return true;
  if (portal === 'FINANCE') return matches(path, FINANCE_PATHS);
  return matches(path, SUPPORT_PATHS);
}

export function landingPathForPortal(portal: Portal, access: Access): string {
  if (portal === 'ADMIN' || portal === 'LOCAL') return '/';
  if (portal === 'FINANCE') {
    if (access.capabilities.includes('finance') || access.capabilities.includes('orders') || access.role === 'superadmin' || access.role === 'admin') return '/transactions';
    return '/';
  }
  if (access.capabilities.includes('support')) return '/support';
  if (access.capabilities.includes('users')) return '/verification';
  return '/';
}

export function recommendedPortal(access: Access): Exclude<Portal, 'LOCAL'> | null {
  if (access.role === 'superadmin' || access.role === 'admin') return 'ADMIN';
  if (access.capabilities.includes('finance') || access.capabilities.includes('orders')) return 'FINANCE';
  if (access.capabilities.includes('support') || access.capabilities.includes('users')) return 'SUPPORT';
  return null;
}

export function portalUrl(portal: Exclude<Portal, 'LOCAL'>, path = '/'): string {
  return `${window.location.protocol}//${PORTAL_HOSTS[portal]}${path.startsWith('/') ? path : '/' + path}`;
}

export function portalLabel(portal: Portal): string {
  if (portal === 'FINANCE') return 'Finance & Operations';
  if (portal === 'SUPPORT') return 'Customer Support & KYC';
  if (portal === 'ADMIN') return 'Admin';
  return 'Local development';
}
