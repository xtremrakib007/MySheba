import { useMemo } from 'react';
import { ArrowRight, BusFront, CheckCircle2, CreditCard, Globe2, Plane, ShieldCheck, Smartphone, TrainFront } from 'lucide-react';
import { Link } from 'react-router-dom';

const services = [
  { key: 'mobileBanking', name: 'Mobile Banking', description: 'Mobile financial service operations and transactions.', icon: Smartphone, href: '/transactions', status: 'Operational' },
  { key: 'recharge', name: 'Recharge', description: 'Mobile recharge and top-up operations.', icon: CreditCard, href: '/transactions', status: 'Operational' },
  { key: 'remittance', name: 'Remittance', description: 'International transfer requests, rates and receipts.', icon: Globe2, href: '/config/rates', status: 'Operational' },
  { key: 'flight', name: 'Flight', description: 'Flight contact inquiries and ticket follow-up.', icon: Plane, href: '/inquiries', status: 'Inquiry-based' },
  { key: 'bus', name: 'Bus', description: 'Bus travel inquiries and staff follow-up.', icon: BusFront, href: '/inquiries', status: 'Inquiry-based' },
  { key: 'train', name: 'Train', description: 'Train travel inquiries and staff follow-up.', icon: TrainFront, href: '/inquiries', status: 'Inquiry-based' },
  { key: 'visa', name: 'Visa', description: 'Visa-related customer requests and support.', icon: ShieldCheck, href: '/inquiries', status: 'Operational' },
  { key: 'passport', name: 'Passport', description: 'Passport assistance and customer requests.', icon: ShieldCheck, href: '/inquiries', status: 'Operational' },
  { key: 'marketplace', name: 'Marketplace', description: 'Listings, moderation and marketplace activity.', icon: Globe2, href: '/marketplace-moderation', status: 'Operational' },
];

export default function ServiceOperationsPage() {
  const operational = useMemo(() => services.filter(s => s.status === 'Operational').length, []);
  return <div className="space-y-6 p-4 sm:p-6">
    <div className="rounded-3xl bg-gradient-to-r from-[#00a99d] to-[#1a73e8] p-6 text-white shadow-sm"><div><div className="flex items-center gap-2 text-sm font-semibold opacity-90"><Globe2 size={18}/> Service Operations</div><h1 className="mt-2 text-2xl font-bold sm:text-3xl">MySheba Services & Modules</h1><p className="mt-2 max-w-2xl text-sm opacity-90">One operational view of the services exposed across MySheba, with direct links to the existing control screens.</p></div></div>
    <div className="grid gap-4 sm:grid-cols-3"><Stat label="Services tracked" value={services.length}/><Stat label="Operational modules" value={operational}/><Stat label="Inquiry-based services" value={services.length-operational}/></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{services.map(({key,name,description,icon:Icon,href,status})=><Link key={key} to={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#00a99d]"><div className="flex items-start justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00a99d]/10 text-[#00a99d]"><Icon size={25}/></div><ArrowRight size={18} className="text-slate-300 transition group-hover:text-[#00a99d]"/></div><h2 className="mt-4 font-bold text-[#0b2447]">{name}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p><div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600"><CheckCircle2 size={13}/>{status}</div></Link>)}</div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-[#0b2447]">Configuration</h2><p className="mt-1 text-sm text-slate-500">Global module plans and pricing are managed separately from operational activity.</p><Link to="/config/modules" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0b2447] px-4 py-2.5 text-xs font-semibold text-white">Manage Module Subscriptions <ArrowRight size={15}/></Link></div>
  </div>;
}
function Stat({label,value}:{label:string;value:number}) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-[#0b2447]">{value}</p></div>; }
