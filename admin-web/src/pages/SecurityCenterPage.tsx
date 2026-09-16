import { useMemo } from 'react';
import { ShieldCheck, Smartphone, KeyRound, LockKeyhole, AlertTriangle, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function SecurityCenterPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isSuperadmin = profile?.role === 'superadmin';

  const checks = useMemo(() => [
    { label: 'Admin account protection', detail: 'Password and role-based access are enabled.', ok: true, icon: LockKeyhole },
    { label: 'New-device verification', detail: 'Unrecognized admin browsers require an OTP challenge.', ok: true, icon: Smartphone },
    { label: 'Role enforcement', detail: 'Superadmin-only operations remain protected by the route guard.', ok: true, icon: ShieldCheck },
    { label: 'Server-side verification', detail: 'Trusted-device changes are handled by protected Cloud Functions.', ok: true, icon: KeyRound },
  ], [profile?.role]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="rounded-3xl bg-gradient-to-br from-[var(--color-navy)] via-[#123b67] to-[var(--color-primary)] p-6 text-white shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-white/15 p-3"><ShieldCheck size={28} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">MySheba Admin</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Security Center</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">A single place to review the protections around administrator access and active sessions.</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {checks.map(({ label, detail, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><Icon size={20} /></div>
              <div className="min-w-0 flex-1"><h2 className="font-semibold text-slate-900">{label}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p></div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Protected</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={20} /><div><h2 className="font-semibold text-amber-900">Security policy</h2><p className="mt-1 text-sm leading-5 text-amber-800">Never add trusted devices directly from the browser. Device trust must be granted only after the server-side verification challenge succeeds.</p></div></div>
      </div>

      {isSuperadmin && (
        <button onClick={() => navigate('/devices')} className="mt-6 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md">
          <span className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Smartphone size={20} /></span><span><span className="block font-semibold text-slate-900">Active Device Sessions</span><span className="mt-1 block text-sm text-slate-500">Review active account sessions and force sign out when necessary.</span></span></span><ChevronRight size={20} className="text-slate-400" />
        </button>
      )}
    </div>
  );
}
