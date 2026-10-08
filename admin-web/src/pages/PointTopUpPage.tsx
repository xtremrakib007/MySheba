export default function PointTopUpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Wallet Funding</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Direct administrative wallet credit is disabled.
      </p>

      <div className="mt-6 max-w-3xl rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-6">
        <h2 className="font-semibold">Controlled funding only</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-soft)]">
          MySheba does not create wallet value from an admin button. Wallet funds
          must come from an approved funding mechanism or an auditable transfer
          from an already funded wallet.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--color-ink-soft)]">
          <li>Finance wallets are funded through the controlled funding workflow.</li>
          <li>Admin wallets are funded by the approved higher-level workflow.</li>
          <li>Superadmin funding must originate from an approved external/partner mechanism.</li>
          <li>Every financial mutation must be server-side and auditable.</li>
        </ul>
      </div>
    </div>
  );
}
