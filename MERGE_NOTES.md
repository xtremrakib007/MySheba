# Merge notes — Tier/Level system into phase10-api-management-toggle-fixed

Base: `mysheba-app-phase10-api-management-toggle-fixed.zip` (417 files)
Merged in: `mysheba-phase10-all-changes.zip` (the tier-level-system feature;
`mysheba-tier-level-system.zip` was a strict subset of this, so it wasn't
needed separately).

Not merged: `gamepoints-withdraw-transfer.zip` (already superseded by a
newer revision in base) and `gamebot.zip` (a standalone Cloud Functions
codebase, `functions-gamebot/`, not wired into the main app — would be
added as its own Firebase Functions deployment, not merged into this tree).

## Tier/Level feature — merged
- New files: `src/firebase/progressionService.js`, `functions/progressionService.js`,
  `src/screens/TierPromotionsScreen.js`
- `functions/index.js`: tier/level triggers merged into the *existing*
  `onTransactionUpdated` / `onInquiryUpdated` / `onChatMessageCreated`
  handlers (base already had these for push notifications — merged rather
  than letting the tier zip's copies silently overwrite them)
- `functions/walletService.js`: tier discount wired into `chargeProductPurchase`
- `firestore.rules`: froze `tier/tierLabel/tierPoints/level/levelPoints` on
  the user profile; locked `settings/progression` to superadmin-only
- `App.js`, `AdminFeaturesScreen.js`, `ProfileScreen.js`: nav wiring + UI badges

## Service-tier routing (Dealer/Reseller split) — now merged too
Originally flagged as a conflict and left out; reinstated on request. Base's
`PHASE10_BROADCAST_UPDATE.md` broadcast-pool model (any staff can accept
any order) has been replaced with the tier zip's split:
- `firestore.rules`: added `canHandleTransaction(service)` — Admin/
  Superadmin: everything; Dealer: Mobile Banking only; Reseller: Recharge/
  Internet/Remittance only. Used in the `transactions/{id}` accept/complete
  rule (was `isStaff()`). Also: `inquiries/{id}` update is now Admin or
  Reseller only (Flight inquiries route to Reseller; Dealer no longer
  touches inquiries at all).
- `src/context/AppContext.js`: the broadcast-transactions subscription now
  filters `dealerTxs`/`resellerTxs` by service per the same split; the
  inquiries subscription now also fires on `resellerHome`, filtered to
  `type == 'flight'` only.
- `src/screens/ResellerHomeScreen.js`: replaced wholesale with the tier
  zip's version — adds a "Flight Inquiries" tab (Contact/Call/WhatsApp,
  close-with-ticket-attachment), same pattern AdminHomeScreen already used
  for its own inquiry handling. Confirmed all its dependencies
  (`mediaUpload.uploadFlightTicket`, `inquiryService.closeInquiryWithTicket`,
  `AttachFileModal`, etc.) already existed in base.

Net effect: Dealer only ever sees/accepts Mobile Banking orders; Reseller
only ever sees/accepts Recharge/Internet/Remittance orders plus Flight
inquiries; Admin/Superadmin retain the full unrestricted view of everything,
same as before.

## Unrelated pre-existing bugs found & fixed while merging
Base would not have parsed/bundled as delivered — 12 files had a botched
"Sub Dealer role removal" edit that left an invalid unquoted object key
with a space in it (`sub dealer: 'Dealer'` / `sub reseller: 'Reseller'`),
which is a hard JS syntax error:
`AdminHomeScreen.js`, `ProfileScreen.js`, `Sidebar.js`, `MyAccountScreen.js`,
`ContactProfileScreen.js`, `UserManagementScreen.js`, `FriendsListScreen.js`,
`AddContactScreen.js`, `QRScanScreen.js`, `MyQRCodeScreen.js`,
`NewGroupScreen.js`, `TransferPointsScreen.js` — all fixed to `dealer: 'Dealer'`
/ `reseller: 'Reseller'`.

Also fixed:
- `functions/walletService.js`: `chargeProductPurchase` referenced an
  undefined `amount` variable (leftover from base's `faceAmount`/`chargeAmount`
  refactor) — would throw on every Recharge/Internet Package charge.
- `src/firebase/announcementService.js`: a corrupted audience entry
  (`{ key: label: 'Dealers' }`) — restored as `{ key: 'reseller', label: 'Resellers' }`.
- `src/screens/ApiProviderManagementScreen.js`: an unbalanced stray `)` in
  the `FlatList` `renderItem` JSX.

All 323 JS/JSX files in the tree now parse cleanly (checked with
`@babel/parser`, jsx plugin). This was a syntax check only — not a full
test run, since there's no `npm install`/emulator available here. Please
review and test before deploying, especially the wallet/discount and
firestore.rules changes.
