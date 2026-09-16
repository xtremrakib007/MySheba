import { Gift, Megaphone, Users, TicketPercent } from 'lucide-react';

const items = [
  { icon: Users, title: 'Referral Program', text: 'Configure referral rewards, eligibility and campaign rules.', path: '/users' },
  { icon: TicketPercent, title: 'Promo Codes', text: 'Create and manage promotional coupon campaigns.', path: '/config/pricing' },
  { icon: Gift, title: 'Rewards', text: 'Monitor reward incentives and redemption activity.', path: '/analytics' },
  { icon: Megaphone, title: 'Campaigns', text: 'Use announcements and banners to promote offers.', path: '/announcements' },
];

export default function GrowthCenterPage() {
  return <div>
    <h1 className="text-2xl font-bold">Growth Center</h1>
    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">Manage user acquisition, referrals, rewards and promotional campaigns.</p>
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ icon: Icon, title, text, path }) => <a key={title} href={path} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]"><Icon size={22}/></div>
        <h2 className="mt-4 font-bold">{title}</h2><p className="mt-1 text-sm text-[var(--color-ink-soft)]">{text}</p>
        <span className="mt-4 inline-block text-xs font-bold text-[var(--color-primary)]">Open module →</span>
      </a>)}
    </div>
    <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <h2 className="font-bold">Growth roadmap</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4"><b>Referral tracking</b><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Track inviter → invitee relationships and qualified referrals.</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><b>Reward ledger</b><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Keep every earned and redeemed reward auditable.</p></div>
        <div className="rounded-xl bg-slate-50 p-4"><b>Campaign analytics</b><p className="mt-1 text-xs text-[var(--color-ink-soft)]">Measure redemptions and conversion before adding financial automation.</p></div>
      </div>
    </div>
  </div>;
}
