import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BadgeCheck,
  Banknote,
  BellRing,
  Building2,
  CreditCard,
  FileText,
  Globe2,
  Headphones,
  LayoutGrid,
  LockKeyhole,
  Plane,
  Receipt,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Ticket,
  TrainFront,
  UserRoundCog,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchOpsOverview, type OpsOverview } from '../services/reportsService';

type Feature = {
  key: string;
  label: string;
  path: string;
  icon: typeof Users;
  tone: string;
  superadminOnly?: boolean;
};

const FEATURES: Feature[] = [
  { key: 'financial', label: 'Financial\nManagement', path: '/transactions', icon: Banknote, tone: 'teal' },
  { key: 'reports', label: 'Reports &\nAnalytics', path: '/reports', icon: BarChart3, tone: 'blue' },
  { key: 'users', label: 'User\nManagement', path: '/users', icon: UserRoundCog, tone: 'indigo' },
  { key: 'kyc', label: 'KYC\nManagement', path: '/verification', icon: BadgeCheck, tone: 'green' },
  { key: 'support', label: 'Support\nInbox', path: '/support', icon: Headphones, tone: 'cyan' },
  { key: 'recharge', label: 'Recharge', path: '/topup', icon: CreditCard, tone: 'violet', superadminOnly: true },
  { key: 'remittance', label: 'Remittance', path: '/config/rates', icon: Globe2, tone: 'sky' },
  { key: 'banking', label: 'Mobile\nBanking', path: '/transactions', icon: Building2, tone: 'gold' },
  { key: 'internet', label: 'Internet', path: '/config/modules', icon: Globe2, tone: 'azure' },
  { key: 'flight', label: 'Flight', path: '/inquiries', icon: Plane, tone: 'blue' },
  { key: 'bus', label: 'Bus', path: '/inquiries', icon: Ticket, tone: 'orange' },
  { key: 'train', label: 'Train', path: '/inquiries', icon: TrainFront, tone: 'slate' },
  { key: 'visa', label: 'Visa', path: '/inquiries', icon: FileText, tone: 'deepblue' },
  { key: 'arrival', label: 'Malaysia\nArrival Card', path: '/inquiries', icon: Smartphone, tone: 'lightblue' },
  { key: 'passport', label: 'Passport', path: '/inquiries', icon: ShieldCheck, tone: 'navy' },
  { key: 'more', label: 'More Features', path: '/feature-access', icon: LayoutGrid, tone: 'purple' },
];

const toneClasses: Record<string, string> = {
  teal: 'from-teal-50 to-cyan-100 text-teal-600',
  blue: 'from-blue-50 to-blue-100 text-blue-600',
  indigo: 'from-indigo-50 to-indigo-100 text-indigo-600',
  green: 'from-emerald-50 to-green-100 text-emerald-600',
  cyan: 'from-cyan-50 to-sky-100 text-cyan-600',
  violet: 'from-violet-50 to-purple-100 text-violet-600',
  sky: 'from-sky-50 to-blue-100 text-sky-600',
  gold: 'from-amber-50 to-yellow-100 text-amber-600',
  azure: 'from-blue-50 to-cyan-100 text-blue-600',
  orange: 'from-orange-50 to-amber-100 text-orange-600',
  slate: 'from-slate-50 to-blue-100 text-slate-600',
  deepblue: 'from-blue-100 to-indigo-100 text-blue-700',
  lightblue: 'from-sky-50 to-blue-100 text-sky-600',
  navy: 'from-slate-100 to-indigo-100 text-indigo-800',
  purple: 'from-purple-50 to-fuchsia-100 text-purple-600',
};

const STAT_CARDS: { key: keyof OpsOverview; label: string; path: string }[] = [
  { key: 'totalUsers', label: 'Users', path: '/users' },
  { key: 'verifiedUsers', label: 'Verified', path: '/users' },
  { key: 'pendingVerifications', label: 'Pending KYC', path: '/verification' },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OpsOverview | null>(null);

  useEffect(() => {
    fetchOpsOverview().then(setOverview).catch(() => setOverview(null));
  }, []);

  const visibleFeatures = FEATURES.filter(
    (feature) => !feature.superadminOnly || profile?.role === 'superadmin'
  );

  return (
    <div className="mx-auto max-w-[1500px] pb-8">
      <div className="mb-5 overflow-hidden rounded-[22px] bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-600 px-5 py-5 text-white shadow-lg shadow-blue-100 md:px-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/20 p-3 backdrop-blur-sm">
              <Settings2 size={29} strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-white md:text-2xl">MySheba</h1>
              <p className="text-sm font-medium text-white/85 md:text-base">Admin Control Center</p>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xs text-white/70">Signed in as</p>
            <p className="max-w-[240px] truncate text-sm font-semibold">{profile?.name || profile?.email}</p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm md:gap-4 md:p-4">
        {STAT_CARDS.map(({ key, label, path }) => (
          <button key={key} onClick={() => navigate(path)} className="rounded-2xl bg-slate-50 px-2 py-2 text-center transition hover:bg-blue-50">
            <p className="text-lg font-extrabold text-slate-800 md:text-2xl">{overview?.[key] ?? '—'}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:text-xs">{label}</p>
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-3 px-1">
        <div className="rounded-xl bg-blue-100 p-2 text-blue-600"><Settings2 size={23} /></div>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 md:text-2xl">Admin Control Center</h2>
          <p className="text-xs text-slate-500 md:text-sm">Manage your MySheba platform from one place</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:gap-4">
        {visibleFeatures.map(({ key, label, path, icon: Icon, tone }) => (
          <button
            key={key}
            onClick={() => navigate(path)}
            className="group flex min-h-[145px] flex-col items-center justify-center rounded-[22px] border-2 border-blue-500/90 bg-white px-2 py-4 text-center shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-600 hover:shadow-lg active:scale-[0.98] md:min-h-[174px] md:rounded-[24px]"
          >
            <div className={`mb-3 rounded-2xl bg-gradient-to-br p-3.5 shadow-sm transition group-hover:scale-105 md:p-4 ${toneClasses[tone]}`}>
              <Icon size={37} strokeWidth={1.8} className="md:h-11 md:w-11" />
            </div>
            <span className="whitespace-pre-line text-[15px] font-bold leading-5 text-slate-900 md:text-[17px] md:leading-6">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button onClick={() => navigate('/announcements')} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"><BellRing size={16} /> Announcements</button>
        <button onClick={() => navigate('/config/pricing')} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"><Receipt size={16} /> Pricing</button>
        <button onClick={() => navigate('/business-profiles')} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"><Users size={16} /> Business Profiles</button>
        <button onClick={() => navigate('/devices')} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"><LockKeyhole size={16} /> Device Sessions</button>
      </div>
    </div>
  );
}
