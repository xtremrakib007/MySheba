# Phase 10 Broadcast Order Flow Update

## Implemented
- Broadcast order pool for Dealer, Reseller, Admin and Super Admin.
- Race-safe first-accept-wins using Firestore `runTransaction`.
- Unified completion for Recharge, Internet, Mobile Banking and Remittance:
  Accept -> 4-digit confirmation code -> receipt upload -> Complete.
- All four services now use atomic wallet charge-at-creation Cloud Functions.
- Mobile Banking/Remittance use `total` (face value + fee) as the wallet charge basis, with flat 1:1 points for now.
- Per-recipient Reject records `rejectedBy` and leaves the order pending for other staff. It does not refund because the order is not terminally rejected.
- Removed the Sub Dealer role from application role logic and collapsed dealer-tier behavior into Dealer.
- Reseller "Send to Dealer" transaction forwarding is retired for new broadcast orders.
- Added generic `order-receipts/{txId}/...` storage path and upload helper.
- Added `scripts/migrate-phase10-subdealers.js` for controlled conversion of legacy `role: subdealer` accounts to `role: dealer`.

## Compatibility / unchanged areas
- Existing non-order application features and screens were left intact apart from removing Sub Dealer as a distinct role.
- Legacy `assignDealer()` remains in the transaction service for historical compatibility, but new orders are broadcast.
- Existing Remittance receipt storage remains available for historical orders.

## Important deployment notes
1. Deploy the updated Cloud Functions and Firestore/Storage rules together with the app.
2. Run the legacy Sub Dealer migration separately during a maintenance window.
3. The current implementation chooses `total` and flat 1:1 for Mobile Banking/Remittance wallet charging.
4. Individual Reject is intentionally non-terminal under broadcast semantics; no wallet refund occurs until a future explicit terminal-reject policy is defined.
