import { ExternalLink, ShieldAlert } from 'lucide-react';
import type { Access } from '../routes/navConfig';
import { portalLabel, portalUrl, recommendedPortal, type Portal } from '../services/portalConfig';

export default function AccessRestrictedPage({ access, portal }: { access: Access; portal: Portal }) {
  const recommended = recommendedPortal(access);
  const mayLink = recommended && portal !== 'LOCAL' && recommended !== portal;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">Access Restricted</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your account does not have permission to access this portal or feature.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Please use the portal assigned to your account.
        </p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Current portal: {portalLabel(portal)}
        </p>
        {mayLink && (
          <a
            href={portalUrl(recommended, '/')}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open {portalLabel(recommended)} portal <ExternalLink size={15} />
          </a>
        )}
      </div>
    </div>
  );
}
