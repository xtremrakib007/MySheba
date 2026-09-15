import { useNavigate } from 'react-router-dom';
import { CreditCard, Layers, Megaphone, Percent, Receipt, Settings2, Tags, Wallet } from 'lucide-react';

const groups = [
  { title: 'Money & Commercial', items: [['Rates & Pricing','/config/rates','Exchange rates, remittance and service pricing', Tags],['Pricing','/config/pricing','Customer and service pricing controls', Percent],['Payment Settings','/config/payments','Payment and collection configuration', CreditCard],['Salary Settings','/config/salary','Salary and commission settings', Wallet]] },
  { title: 'Platform Experience', items: [['Banners','/config/banners','Manage promotional banners and campaigns', Megaphone],['Categories','/config/categories','Marketplace listing categories', Layers],['Module Subscriptions','/config/modules','Enable or configure platform modules', Settings2]] },
  { title: 'Operational Records', items: [['Transactions','/transactions','Review live transaction activity', Receipt]] },
] as const;

export default function PlatformControlCenterPage() {
  const navigate = useNavigate();
  return <div className="mx-auto max-w-[1400px] space-y-6 pb-10">
    <div className="rounded-3xl bg-gradient-to-r from-[#0b2447] via-[#155e9c] to-[#00a99d] p-6 text-white shadow-lg md:p-8"><div className="flex items-center gap-3"><span className="rounded-2xl bg-white/15 p-3"><Settings2 size={25}/></span><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Administration</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Configuration & Platform Control</h1><p className="mt-2 max-w-2xl text-sm text-white/75">One organized control panel for the settings that shape MySheba's services, pricing and platform experience.</p></div></div></div>
    <div className="grid gap-5 md:grid-cols-2">
      {groups.map((group) => <section key={group.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-[#0b2447]">{group.title}</h2><div className="mt-4 space-y-2">{group.items.map(([label,path,description,Icon]) => <button key={path} onClick={() => navigate(path)} className="flex w-full items-center gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-[#00a99d] hover:shadow-sm"><span className="rounded-xl bg-slate-50 p-2.5 text-[#00a99d]"><Icon size={19}/></span><span className="min-w-0 flex-1"><b className="block text-sm text-[#0b2447]">{label}</b><small className="mt-1 block text-xs text-slate-500">{description}</small></span><span className="text-slate-400">→</span></button>)}</div></section>)}
    </div>
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800"><b>Safety boundary:</b> this page is an organized navigation/control surface. It does not duplicate configuration logic or bypass the permissions already enforced by each existing settings page and its backend.</div>
  </div>;
}
