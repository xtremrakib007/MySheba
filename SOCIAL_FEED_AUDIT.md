# Audit — Social Feed (Next Update PRD §3) on top of mysheba-app-final v5.3.0.1

## Scope of this pass
Verified `mysheba-app-social-feed.zip` against `MySheba_Next_Update_PRD.docx`
and the existing merged base (see `MERGE_AUDIT_REPORT.md`). No web changes
were needed — `mysheba-web-updated.zip` (the mysheba.top marketing site) is
untouched, unrelated to this PRD, and not included in this delivery.

## PRD §3 requirement check
| Requirement | Status | Where |
|---|---|---|
| Text + media posts | ✅ | `CreateSocialPostScreen.js`, `socialFeedService.createPost`/`setPostImages` |
| Like/react | ✅ | `socialFeedService.likePost`/`unlikePost`, `socialLikes/{uid_postId}` |
| Comments | ✅ | `socialFeedService.addComment`/`subscribeComments`, `socialComments` |
| Share | ✅ | `recordShare` counter, wired to native share sheet in `SocialPostDetailScreen.js` |
| Report + moderation | ✅ | `reportPost` → `socialReports` → `onSocialReportCreated` (functions/index.js) auto-hides past threshold and notifies admins; **also plugged into the existing unified `MarketplaceModerationScreen` as a new `social` entry in `REPORT_KINDS`** — so admins see and act on Social Feed reports from the same screen as every other report type, no new screen needed |
| Country/region tagging | ✅ | Post carries `author.country` at creation time; untagged (`null`) posts are treated as global per PRD §2 |
| Global + country/region feed modes | ✅ | `SocialFeedScreen.js` mode toggle over the single `subscribeActivePosts` window |
| Admin/moderator controls remain available | ✅ | Same moderation screen as above; `setPostStatus`/`deletePost` are admin-callable |

No gaps found against §3.

## Consistency with rest of the app
- `socialPosts`/`socialLikes`/`socialComments`/`socialReports` are a clean
  parallel structure to the existing `communityPosts` family — same
  security-rule shape (author-or-admin write, server-trusted `reportCount`,
  client-trusted `likeCount`/`commentCount`/`shareCount`), so nothing about
  the existing Community module changes.
- `App.js` registers the three new screens (`socialFeed`, `createSocialPost`,
  `socialPostDetail`) alongside the existing ones — no existing route was
  touched.
- `firestore.rules`: `socialPosts`/`socialLikes`/`socialComments`/
  `socialReports` match blocks added; brace/paren counts balanced
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
  these, plus a manual walk of PRD §10's Social tests, before deploying.

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
Social Feed (§3) and International Wallet (§5) are both done. Remaining:
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
