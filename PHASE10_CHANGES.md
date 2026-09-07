# Phase 10 — Advertising Packages and Payments

Adds configurable ad packages and a payment record system on top of
Phase 9's Advertiser/Campaign management. No payment gateway is
integrated anywhere in this app, so per the brief's own instruction
this is the admin manual-payment workflow: an admin records what came
in through an external channel (bank transfer, DuitNow QR, cash,
cheque) and moves it through Pending → Paid/Failed → Refunded. Nothing
here has been run against a live Firebase project or emulator — no
`npm install`/Functions deploy was available in the sandbox this was
written in. Review and test before merging.

## New files
- `src/utils/adPackagePaymentRules.js` — zero-dependency validation
  (`validatePackagePayload`, `validatePaymentPayload`) and the payment
  status state machine (`isValidPaymentStatusTransition`,
  `PAYMENT_STATUS_TRANSITIONS`: Pending → Paid/Failed, Paid →
  Refunded/Failed, Failed → Pending/Paid, Refunded is terminal). Same
  "CommonJS module a test script can `require()` directly" pattern as
  `adAnalyticsRules.js`/`adFrequencyRules.js` from earlier phases.
  Imported by both `AdPackageFormModal.js`/`AdPaymentFormModal.js`
  (client-side, fast feedback) and mirrored by hand in
  `functions/adPaymentService.js` (server-side, the copy that actually
  matters — `functions/` is a separate deployable with no import path
  back into `src/`).
- `functions/adPaymentService.js` — `createAdPayment` /
  `updateAdPaymentStatus`, the only writers of `ad_payments/{paymentId}`
  (`firestore.rules` already had `allow write: if false` on that
  collection since Phase 1). Super Admin only. `createAdPayment`
  validates the advertiser exists, and the campaign/package too if
  provided (and that a provided campaign actually belongs to the given
  advertiser), then denormalizes `advertiserName`/`campaignName`/
  `packageName` onto the new doc. `updateAdPaymentStatus` enforces the
  same transition state machine `adPackagePaymentRules.js` describes,
  rejecting same-status "changes" and any transition off that list
  (e.g. Refunded → anything). Both write an `ad_audit_logs` entry
  (`targetType: 'ad_payment'`).
- `src/components/AdPackageFormModal.js` — Create/Edit form for one
  `ad_packages` doc: every field from the brief's PACKAGE list (Name,
  Description, Price, Currency, Duration, Placements, Max Impressions,
  Priority, Active).
- `src/screens/AdPackagesManagementScreen.js` — Super Admin roster
  screen: Active/Inactive/All filter chips, + New Package, and per-card
  Edit/Activate/Deactivate — the brief's ADMIN → Packages action list.
- `src/components/AdPaymentFormModal.js` — manual payment recording
  form: Advertiser (locked when opened from an advertiser's own detail
  screen), Campaign (scoped to the chosen advertiser), Package
  (prefills Amount/Currency, without clobbering an amount already
  typed), Amount, Currency, Payment Method, Transaction Reference,
  initial Status.
- `src/screens/AdPaymentsManagementScreen.js` — Super Admin
  cross-advertiser roster: Pending/Paid/Failed/Refunded/All tabs (the
  brief's ADMIN → Payments action list), + Record Payment, and
  per-payment quick-action buttons sourced directly from
  `isValidPaymentStatusTransition` so a button is never offered for a
  transition the backend would then reject.
- `scripts/phase10-ad-packages-payments-tests.js` — acceptance tests
  covering the brief's ACCEPTANCE TEST list: package creation
  validation (including the four example packages), payment payload
  validation ("linked correctly" — advertiser/campaign/package present),
  every entry in the status transition matrix (including the terminal
  Refunded state and rejected same-status "changes"), and a smoke check
  that `functions/walletService.js`'s unrelated wallet payment exports
  are untouched. `node scripts/phase10-ad-packages-payments-tests.js` —
  37/37 passing.

## Modified files
- `src/types/ads.ts` —
  - `AdPackage`: renamed `includedPlacements`/`includedImpressions` →
    `placements`/`maxImpressions` (matching the brief's exact field
    names, and now reading consistently with `Advertisement.placements`
    above) and added `priority`. Safe rename: no document had ever been
    written under the old names.
  - `AdPayment`: renamed `status`/`method`/`reference` →
    `paymentStatus`/`paymentMethod`/`transactionReference` (again
    matching the brief exactly), added denormalized
    `advertiserName`/`campaignName`/`packageName` and `recordedBy`. Also
    a safe rename — Phase 9 only ever built the read-only history tab
    against this collection, and nothing had a write path to it yet.
  - `AdAuditLog.targetType` — added `'ad_payment'`.
- `src/constants/adEnums.ts` — added `PACKAGE_STATUS_FILTERS`,
  `AD_PAYMENT_STATUSES`/`AD_PAYMENT_STATUS_LABELS`/
  `PAYMENT_STATUS_FILTERS`, and `AD_PAYMENT_METHODS`/
  `AD_PAYMENT_METHOD_LABELS`/`AD_PAYMENT_METHOD_OPTIONS` (a separate
  vocabulary from `topupService.js`'s customer-facing top-up methods —
  this is an admin-recorded B2B flow, not customer self-service, so
  `cash`/`cheque` are options here but never there).
- `src/firebase/adService.js` — added `activatePackage`/
  `deactivatePackage` (thin `active: true/false` writes — no state
  machine, unlike Advertisement/Campaign status, so no Cloud Function
  needed; `ad_packages` write is already Super-Admin-only per
  `firestore.rules`), `subscribeAllPayments` (every payment, newest
  first, filtered client-side by `AdPaymentsManagementScreen`'s tabs —
  same "fetch once, filter in memory" approach `CampaignsTab` already
  uses), and `createAdPayment`/`updateAdPaymentStatus` (httpsCallable
  wrappers around the two new Cloud Functions).
- `src/components/CampaignFormModal.js` — added an optional Package
  picker (`packageId`). Picking a package prefills Budget/Currency only
  when the admin hasn't already typed a budget, and denormalizes
  `packageName` onto the campaign — satisfies the brief's "Campaign
  linked to package" acceptance test.
- `src/screens/AdvertiserDetailScreen.js` — `PaymentsTab` updated to the
  renamed `paymentStatus`/`paymentMethod`/`transactionReference` fields,
  now shows a linked package's name, and gained a "+ Record Payment"
  button (pre-linked to the advertiser being viewed) via the new
  `AdPaymentFormModal`.
- `src/screens/AdminFeaturesScreen.js` — added the "Ad Packages"/"Ad
  Payments" tiles to the 📢 Advertisement `FeatureGrid`.
- `App.js` — imports + renders `AdPackagesManagementScreen`/
  `AdPaymentsManagementScreen` for `screen === 'adPackagesManagement'` /
  `'adPaymentsManagement'`.
- `functions/index.js` — exports the two new Cloud Functions.

## Not changed
- `firestore.rules` — no changes needed. `ad_packages` was already
  Super-Admin-write per Phase 1's rules, and `ad_payments` was already
  `allow write: if false` (client can never write it directly) — both
  exactly the access pattern this phase's Cloud Functions rely on.
- No payment gateway was added, per the brief's own instruction (none
  exists anywhere else in this codebase — `package.json` has no
  Stripe/PayPal/etc. dependency).
- `functions/walletService.js` (the customer-facing top-up/wallet
  system) was not touched — see the acceptance test script's final
  section.

## Acceptance test coverage
Per the brief's ACCEPTANCE TEST list:
- **Package creation** — `validatePackagePayload` rejects a missing
  name, a non-positive price ("Do NOT hard-code package prices" is
  enforced by there being no fixed price anywhere — every package's
  price is whatever an admin enters here), a non-positive duration, and
  a negative Max Impressions; accepts the four named example packages
  and a blank (unlimited) Max Impressions.
- **Package activation/deactivation** — a plain boolean write via
  `activatePackage`/`deactivatePackage`, exercised through
  `AdPackagesManagementScreen`'s Activate/Deactivate buttons.
- **Campaign linked to package** — `CampaignFormModal`'s new Package
  picker sets `ad_campaigns.packageId`, compile-time typed in
  `src/types/ads.ts`.
- **Payment record linked correctly** — `createAdPayment` validates the
  advertiser exists and that a provided campaign belongs to it before
  ever writing the payment doc.
- **No existing MySheba payment logic is broken** — the field-name
  changes are scoped entirely to `ad_payments` (a collection with no
  existing documents); `functions/walletService.js`'s
  `approveTopup`/`chargeWallet` and everything else in the wallet
  system were not modified.
