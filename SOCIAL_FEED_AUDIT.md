
## Scope of this pass
and the existing merged base (see `MERGE_AUDIT_REPORT.md`). No web changes
were needed — `mysheba-web-updated.zip` (the mysheba.top marketing site) is
untouched, unrelated to this PRD, and not included in this delivery.

## PRD §3 requirement check
| Requirement | Status | Where |
|---|---|---|
| Country/region tagging | ✅ | Post carries `author.country` at creation time; untagged (`null`) posts are treated as global per PRD §2 |
| Admin/moderator controls remain available | ✅ | Same moderation screen as above; `setPostStatus`/`deletePost` are admin-callable |

No gaps found against §3.

## Consistency with rest of the app
  security-rule shape (author-or-admin write, server-trusted `reportCount`,
  client-trusted `likeCount`/`commentCount`/`shareCount`), so nothing about
  touched.
  (321/321, 821/821). Nothing in the pre-existing rules was altered.

## Verification performed
- All 355 `.js`/`.jsx` files in the tree parse cleanly (`@babel/parser`,
  `sourceType: module`, JSX plugin) — 0 errors.
- `functions/index.js` passes `node --check`.
- `firestore.rules` brace/paren counts balanced.
- Grepped for leftover `<<<<<<<`/`=======`/`>>>>>>>` merge markers — none.
- **Not run** (no `npm install`/emulator/network access to Firebase in this
  environment): Metro bundle, Firebase Emulator Suite, `firestore:rules`
  dry-run deploy. Same caveat as every prior audit pass — recommend running

## Correction — §5 International Wallet / MYR Exchange is already built
An earlier pass of this report said §5 wasn't ported to the RN/Firebase
stack, echoing an older `MERGE_AUDIT_REPORT.md` finding. That was **wrong
for this zip** — that report predates whatever session actually built §5
into this base. A closer look (grepping code content, not just filenames)
found it fully implemented:
- `functions/walletService.js`: `recomputeChargeAmounts()` converts
  recharge/internet/mobile-banking/remittance amounts to MYR using the
  server's own `rates/current` read (never the client's), tolerance-checked
  against the client's claimed amount, rejecting on mismatch.
- `src/steps/RechargeSteps.js` / `RemittanceSteps.js` /
  `MobileBankingSteps.js`: all show source currency, applied rate, and
  final MYR/points deduction before charging.
- Every `transactions/{id}` doc snapshots `exchangeRate`/
  `exchangeRateSource` at charge time (explicitly commented as the PRD §5
  auditability requirement).
- Rounding is `Math.round(x * 100) / 100` consistently, client and server.
- `AdminHomeScreen.js`'s Rates tab exposes live rate editing via
  `ratesService.updateRate` — the superadmin config requirement.
- Whole charge runs inside one Firestore transaction; wallet balance is
  frozen against direct client writes in `firestore.rules`.

No gaps found against §5. Nothing was built or changed for this item.

## Still open against the full PRD
- **§6 API provider ON/OFF+fallback** — already exists from Phase 10
  (`ApiProviderManagementScreen.js`, `apiProviderService.js`); worth a
  fresh pass against §6's exact wording (fallback-to-previous-logic
  behavior, credential exposure) but not new work from this batch.
- **§7 Ads regression pass** — not run as part of this batch; recommended
  before shipping per PRD §12 step 6.
- GiftAudit / homepage-config audit-log admin screens (§8) — still flagged
  as out of scope, per the gift delta's own notes.

## Recommended next step
Per PRD §12, the only unverified/unbuilt items left are the §6 fallback-
logic re-check and the §7 Ads regression pass — say which one and I'll
start there.
