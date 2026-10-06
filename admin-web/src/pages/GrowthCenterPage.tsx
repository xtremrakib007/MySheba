import { useEffect, useState } from 'react';
import { Gift, Megaphone, Users, TicketPercent, Save } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

type GrowthConfig = {
  referralEnabled: boolean;
  referralReward: number;
  firstTransactionReward: number;
  welcomeReward: number;
  minimumTransaction: number;
};

const defaults: GrowthConfig = {
  referralEnabled: true,
  referralReward: 0,
  firstTransactionReward: 0,
  welcomeReward: 0,
  minimumTransaction: 0,
};

export default function GrowthCenterPage() {
  const [config, setConfig] = useState<GrowthConfig>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fn = httpsCallable<void, GrowthConfig>(functions, 'getGrowthConfig');
    fn({}).then(({ data }) => setConfig({ ...defaults, ...data })).catch(() => setMessage('Could not load growth settings.')).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const fn = httpsCallable<GrowthConfig, { saved: boolean }>(functions, 'saveGrowthConfig');
      await fn(config);
      setMessage('Growth settings saved.');
    } catch (e) {
      setMessage('Only the superadmin can change these settings.');
    } finally { setSaving(false); }
  };

  const money = (key: keyof GrowthConfig) => (
    <input type="number" min="0" max="10000" step="0.01" value={Number(config[key]) || 0}
      onChange={(e) => setConfig((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))}
      className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-sm" />
  );

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Growth Center</h1><p className="mt-1 text-sm text-[var(--color-ink-soft)]">Acquisition, referrals and first-transaction conversion controls.</p></div>
      <button onClick={save} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={16}/>{saving ? 'Saving…' : 'Save settings'}</button>
    </div>

    {message && <div className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-card)] p-3 text-sm">{message}</div>}

    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[
        [Users, 'Referral Program', 'Every customer gets a shareable referral code. Registration attribution is recorded securely.'],
        [TicketPercent, 'Promo Engine', 'Use existing pricing, banners and announcements for service-specific promotions.'],
        [Gift, 'Rewards', 'Configure welcome, first-transaction and referral reward values before enabling financial automation.'],
        [Megaphone, 'Campaigns', 'Use banners and notifications to turn offers into repeat visits and re-engagement.'],
      ].map(([Icon, title, text]) => <div key={title as string} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]"><Icon size={22}/></div>
        <h2 className="mt-4 font-bold">{title as string}</h2><p className="mt-1 text-sm text-[var(--color-ink-soft)]">{text as string}</p>
      </div>)}
    </div>

    <div className="mt-6 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
      <h2 className="font-bold">Referral & onboarding controls</h2>
      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Amounts are stored as wallet reward values. Keep them at zero until your campaign economics are approved.</p>
      <label className="mt-5 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={config.referralEnabled} onChange={(e) => setConfig((p) => ({ ...p, referralEnabled: e.target.checked }))}/> Enable referral program</label>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">Referral reward{money('referralReward')}</label>
        <label className="text-sm">First transaction reward{money('firstTransactionReward')}</label>
        <label className="text-sm">Welcome reward{money('welcomeReward')}</label>
        <label className="text-sm">Minimum qualifying transaction{money('minimumTransaction')}</label>
      </div>
    </div>

    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <b>Safe rollout:</b> referral attribution is live, but reward balances remain zero by default. This prevents accidental wallet credits while you decide the campaign budget and qualifying rules.
    </div>
  </div>;
}