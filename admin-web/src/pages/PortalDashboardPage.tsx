import { BadgeCheck, Banknote, BarChart3, Headphones, MessageCircle, Receipt, Send, Users, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { useAuth } from '../contexts/AuthContext';
import { canAccess } from '../routes/navConfig';
import { getCurrentPortal, portalEnforcementEnabled, portalLabel } from '../services/portalConfig';

const FINANCE_ITEMS = [
  { label: 'Transactions', description: 'Review financial and operational transactions.', path: '/transactions', icon: Receipt },
  { label: 'Invoices', description: 'Review provider invoices and finance history.', path: '/invoices', icon: Banknote },
  { label: 'Service Operations', description: 'Process service-order operations.', path: '/service-operations', icon: Workflow },
  { label: 'Wallet Settlement', description: 'Review wallet settlement activity.', path: '/wallet-settlement', icon: Send },
  { label: 'Reports', description: 'Open authorized finance and operations reports.', path: '/reports', icon: BarChart3 },
];

const SUPPORT_ITEMS = [
  { label: 'Support Tickets', description: 'Handle customer support requests and case status.', path: '/support', icon: Headphones },
  { label: 'Support Messages', description: 'Open authorized customer-support conversations.', path: '/support/messages', icon: MessageCircle },
  { label: 'Customer Search', description: 'Find customers when your permissions allow it.', path: '/users', icon: Users },
  { label: 'KYC Verification', description: 'Review pending identity verification requests.', path: '/verification', icon: BadgeCheck },
  { label: 'KYC Operations', description: 'Open the existing KYC operations workspace.', path: '/kyc-operations', icon: BadgeCheck },
];

export default function PortalDashboardPage() {
  const portal = getCurrentPortal();
  const enforcePortal = portalEnforcementEnabled();
  const { access, profile } = useAuth();
  const navigate = useNavigate();

  if (!enforcePortal || portal === 'ADMIN' || portal === 'LOCAL') {
    return <DashboardPage />;
  }

  const source = portal === 'FINANCE' ? FINANCE_ITEMS : SUPPORT_ITEMS;
  const items = source.filter((item) => canAccess(item.path, access));

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <div className="mb-6 rounded-3xl bg-[var(--color-navy)] px-6 py-6 text-white shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">MySheba</p>
        <h1 className="mt-2 text-2xl font-extrabold">{portalLabel(portal)}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
          Authorized tools for {profile?.name || profile?.email || 'this account'} are shown below.
          Access is based on your current permissions.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ label, description, path, icon: Icon }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
          >
            <span className="mb-4 inline-flex rounded-xl bg-slate-100 p-2.5 text-slate-700"><Icon size={20} /></span>
            <h2 className="font-extrabold text-slate-900">{label}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
          </button>
        ))}
      </div>

      {items.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          This account does not currently have an authorized module in this portal.
        </div>
      )}
    </div>
  );
}
