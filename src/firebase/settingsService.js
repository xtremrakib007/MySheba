// A single `settings/pricing` document holds the platform's editable money
// rules that don't fit into `rates/current` (exchange rates) or a specific
// package list. Kept as one doc for the same reason ratesService.js does -
// the Admin > Pricing tab and anything that needs a value (point transfer,
// recharge checkout) can subscribe with a single read.
import { doc, getDoc, setDoc, deleteField, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const SETTINGS_DOC = doc(db, 'settings', 'pricing');

// Roles that can be given their own price for a point-cost feature from
// Admin > Pricing > Role-Based Pricing (superadmin only - see
// AdminHomeScreen). superadmin is left out on purpose: they're the ones
// setting prices, not paying them. reseller is included since, like
// dealer/dealer, it's a staff account that uses the webview/notepad/
// documents features and gets charged points for them the same way.
export const ROLE_PRICE_ROLES = ['customer', 'dealer', 'reseller', 'admin'];

// The price fields role overrides apply to - the three "point deduct"
// webview costs, the marketplace boost cost, the three module
// subscriptions, plus the Recharge/Internet Package per-point-of-value
// multipliers below. Mirrored server-side in functions/walletService.js's
// own ROLE_PRICE_KEYS - keep both in sync.
export const ROLE_PRICE_KEYS = ['webviewAccessCost', 'webviewSubmitCost', 'paymentSuccessCost', 'listingBoostCost', 'notepadCost', 'myDocumentsCost', 'salaryOtCost', 'rechargePointCostPerUnit', 'internetPointCostPerUnit', 'gamePointsCostPerUnit'];

export const DEFAULT_PRICING = {
  // % of the points a dealer/dealer sends to one of their own customers
  // that the system also credits back onto the dealer's own wallet as an
  // earning/commission - see pointTransferService.transferPoints().
  dealerEarningPercent: 1.5,
  // Mobile recharge margin, shown to admin/dealer on the order (see
  // TransactionDetailModal's cost/profit rows) - cost is what the recharge
  // face value effectively costs the platform, profit is the margin kept.
  // These are percentages of the recharge amount the customer pays and are
  // expected to add up to 100 (e.g. cost 95 + profit 5), though nothing
  // enforces that - admin can set them however they like. Reporting only -
  // see rechargePointCostPerUnit below for what's actually charged.
  rechargeCostPercent: 95,
  rechargeProfitPercent: 5,

  // Points actually charged per 1 point of recharge/internet-package face
  // value (face value is already converted to points/MYR via
  // amountToPoints before this multiplier applies - see
  // buildTransactionPayload in AppContext.js). Default 1 means "charge
  // exactly face value", i.e. no behavior change from before this field
  // existed. A superadmin can give a role a cheaper (< 1) or costlier (> 1)
  // per-point rate from Admin > Pricing > Role-Based Pricing - e.g. a
  // dealer buying recharge for themselves at 0.95 pays 5% fewer points
  // than a customer buying the same face value. The actual charge/refund
  // enforcement point is functions/walletService.js's chargeRecharge /
  // chargeInternetPackage (recharge) and their reject counterparts -
  // client-side this value is display-only, same "server is the real
  // source of truth" reasoning as every other *Cost field in this file.
  rechargePointCostPerUnit: 1,
  internetPointCostPerUnit: 1,

  // Wallet points charged per 1 Game Point recharged into gamePoints/{uid}
  // (the play-money balance functions-gamebot uses for room games - see
  // gamePointsService.js and chargeGamePoints in functions/walletService.js,
  // the actual enforcement point). Default 1 = 1 wallet point buys 1 game
  // point. Same role-override shape as rechargePointCostPerUnit above.
  gamePointsCostPerUnit: 1,

  // Point costs for the "point deduct" webview features (FOMEMA/Visa status
  // checks, MY Digital/Passport submissions, Bus/Train/e-SIM ticket purchases) -
  // see webviewAccessService.js and paymentWebviewService.js, which are the
  // actual enforcement point for these. AppContext.openWebView reads these
  // live values (falling back to the matching *_COST constant in
  // data/countries.js only if this doc hasn't loaded yet) to lock the
  // feature and show the price before a user can open it - see
  // AppContext.pointCosts.
  webviewAccessCost: 2, // FOMEMA / Visa - charged once per access window
  webviewSubmitCost: 2, // MY Digital / Passport - charged once on submit
  paymentSuccessCost: 3, // Bus (redBus/Bus Online Ticket/Easybook) / Train (KTMB) / MY e-SIM - charged on payment success

  // Point costs for Notepad, My Documents, and Salary & OT - each is a
  // MONTHLY SUBSCRIPTION, not a per-use charge: opening the module charges
  // this price once, then every further open is free until
  // moduleSubscriptionDays has passed since that charge (see
  // moduleSubscriptionService.ensureModuleSubscription and chargeWallet's
  // 'module_subscription' kind, the actual enforcement point). Defaults to
  // 0 (free) so nothing changes for existing users until a price is set
  // from Admin > Pricing > Point Feature Costs.
  notepadCost: 0,
  myDocumentsCost: 0,
  salaryOtCost: 0,
  // Length of one subscription cycle for the three modules above, in days.
  // Admin-editable from Admin > Pricing > Point Feature Costs; shared by
  // all three rather than a separate window per module.
  moduleSubscriptionDays: 30,

  // How long a FOMEMA/Visa charge stays "unlocked" before the next search
  // charges again - see webviewAccessService.ensureWebviewAccess, the
  // actual enforcement point. Admin-editable from Admin > Pricing > Access
  // Window; falls back to WEBVIEW_ACCESS_WINDOW_HOURS in data/countries.js
  // only if this doc hasn't loaded yet.
  webviewAccessWindowHours: 1,

  // Marketplace "Listing Boost" / Featured Listings (Phase 3 monetization,
  // PRD section 15). Charged via the boostListing Cloud Function
  // (functions/walletService.js), which is the only path that can flip a
  // listing's featured/featuredUntil fields - see marketplaceService.js
  // and firestore.rules' marketplaceListings match block. Admin-editable
  // from Admin > Pricing > Marketplace Boost.
  listingBoostCost: 5, // points charged per boost
  listingBoostDurationDays: 7, // days a boost keeps a listing featured

  // % taken off the pot before GameBot (functions-gamebot, deployed
  // separately) pays out a room game winner - dice/lowcard/highcard/
  // cricket/29 (see index.js's .startgame handler there). Default 10 =
  // winner gets 90% of the pot; the fee is simply not credited to anyone,
  // not routed to an admin wallet. Superadmin-editable from Admin >
  // Pricing > Earning & Margin Settings, same flat (non-role-based) shape
  // as dealerEarningPercent above. Draw refunds (29) are unaffected - a
  // draw returns full entry fees, since no pot actually changed hands.
  gamePointsFeePercent: 10,

  // Per-role overrides for the ROLE_PRICE_KEYS above - { [role]: { [key]:
  // price } }. A role with no entry, or a key missing from its entry,
  // falls back to the flat price above (see priceForRole). Empty by
  // default: every role pays the same flat price until a superadmin sets
  // a role-specific one from Admin > Pricing > Role-Based Pricing.
  rolePricing: {},
};

/** The price `key` charges for `role` - that role's own override if a
 * superadmin has set one, otherwise the flat default price everyone else
 * pays. `role` may be null/undefined (falls straight back to the flat
 * price). Mirrored server-side as priceForRole in
 * functions/walletService.js - the actual charge/lock enforcement point -
 * keep both in sync if this logic ever changes. */
export function priceForRole(pricing, key, role) {
  const override = role && pricing?.rolePricing?.[role]?.[key];
  return override != null ? override : pricing?.[key];
}

/** Sets one role's override price for one feature key, or clears it (pass
 * value === null) back to the flat default. Superadmin-only in the UI. */
export async function updateRolePrice(role, key, value) {
  if (!ROLE_PRICE_ROLES.includes(role)) throw new Error('Unknown role.');
  if (!ROLE_PRICE_KEYS.includes(key)) throw new Error('Unknown price key.');
  const path = `rolePricing.${role}.${key}`;
  if (value === null) {
    await setDoc(SETTINGS_DOC, { [path]: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
    return;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) throw new Error('Enter a valid price.');
  await setDoc(SETTINGS_DOC, { [path]: num, updatedAt: serverTimestamp() }, { merge: true });
}

/** Ensures the settings doc exists (first run) then returns current values. */
export async function ensurePricing() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) {
    await setDoc(SETTINGS_DOC, { ...DEFAULT_PRICING, updatedAt: serverTimestamp() });
    return { ...DEFAULT_PRICING };
  }
  return { ...DEFAULT_PRICING, ...snap.data() };
}

export function subscribePricing(callback, onError) {
  return onSnapshot(
    SETTINGS_DOC,
    (snap) => callback(snap.exists() ? { ...DEFAULT_PRICING, ...snap.data() } : DEFAULT_PRICING),
    onError
  );
}

export async function updatePricing(key, value) {
  await setDoc(SETTINGS_DOC, { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}
