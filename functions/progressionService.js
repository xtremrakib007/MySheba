// Tier/Level loyalty progression.
//
// Tier (named, e.g. "Bronze+") grows from completed qualifying paid
// service orders - Recharge/Internet/Mobile Banking/Remittance
// (transactions/{id} status -> 'completed') and Flight ticket
// confirmations (inquiries/{id} type 'flight' closed with a ticket
// attached). Level (numeric) grows from chat activity (a message sent)
// and chat-game spending (a gamePointsLedger 'entry_fee' row - NOT
// 'pot_winnings', since winning shouldn't itself grant progress).
//
// Both counters are only ever written from Firestore triggers in
// index.js (onTransactionUpdated, onInquiryUpdated, onChatMessageCreated,
// onGamePointsLedgerCreated), never from a client-callable - a modified
// client can't fake progress the way it could if this were a plain
// client-side increment. Firestore Security Rules back this up by
// freezing users/{uid}.tier*/level* from client writes entirely (see
// firestore.rules) - only the Admin SDK (which bypasses rules) can touch
// them, and only these triggers do.
//
// Thresholds/step/promotions all live in settings/progression and are
// superadmin-editable (Superadmin > Tier Promotions) without a redeploy -
// same override pattern as settings/pricing in src/firebase/settingsService.js.

const admin = require('firebase-admin');

function progressionDocRef() {
  return admin.firestore().collection('settings').doc('progression');
}

// Ordered low -> high. A user's tier is whichever entry's minPoints is the
// highest one their tierPoints count meets/exceeds. minPoints is a count
// of qualifying completed orders, not a monetary amount.
const DEFAULT_TIERS = [
  { key: 'bronze', label: 'Bronze', minPoints: 0 },
  { key: 'bronzePlus', label: 'Bronze+', minPoints: 10 },
  { key: 'silver', label: 'Silver', minPoints: 20 },
  { key: 'silverPlus', label: 'Silver+', minPoints: 40 },
  { key: 'gold', label: 'Gold', minPoints: 60 },
  { key: 'goldPlus', label: 'Gold+', minPoints: 100 },
  { key: 'platinum', label: 'Platinum', minPoints: 150 },
  { key: 'platinumPlus', label: 'Platinum+', minPoints: 250 },
];

// Level is numeric: floor(levelPoints / levelStep). levelPoints is a count
// of qualifying chat messages + game entry-fee spends combined - no
// separate weighting between the two kinds of activity.
const DEFAULT_LEVEL_STEP = 20;

function defaultPromotion() {
  // discountPercent applies to the four qualifying paid services' point
  // cost (see functions/walletService.js's chargeProductPurchase).
  // title/description/active are display-only (e.g. a "Your Tier" card
  // on Profile) and don't affect the charge math themselves - active
  // does gate discountPercent though (see getTierDiscountPercent below).
  return { discountPercent: 0, title: '', description: '', active: true };
}

const DEFAULT_PROMOTIONS = DEFAULT_TIERS.reduce((acc, t) => {
  acc[t.key] = defaultPromotion();
  return acc;
}, {});

const DEFAULT_PROGRESSION = {
  tiers: DEFAULT_TIERS,
  levelStep: DEFAULT_LEVEL_STEP,
  promotions: DEFAULT_PROMOTIONS,
};

/** Reads settings/progression, merged over the defaults above - same
 * "doc may not exist yet, defaults fill the gap" shape as
 * settingsService.js's ensurePricing/subscribePricing. */
async function getProgressionSettings() {
  const snap = await progressionDocRef().get();
  if (!snap.exists) return DEFAULT_PROGRESSION;
  const data = snap.data() || {};
  const tiers = Array.isArray(data.tiers) && data.tiers.length ? data.tiers : DEFAULT_TIERS;
  const levelStep = Number(data.levelStep) > 0 ? Number(data.levelStep) : DEFAULT_LEVEL_STEP;
  const promotions = { ...DEFAULT_PROMOTIONS, ...(data.promotions || {}) };
  return { tiers, levelStep, promotions };
}

/** Highest tier whose minPoints the given raw tierPoints count meets or
 * exceeds. Assumes tiers is sorted low -> high (both DEFAULT_TIERS and
 * anything a superadmin saves via the Tier Promotions screen are). */
function tierForPoints(tiers, points) {
  let current = tiers[0];
  for (const t of tiers) {
    if (points >= t.minPoints) current = t;
  }
  return current;
}

/** +1 to users/{uid}.tierPoints for one qualifying completed order, and
 * recomputes .tier/.tierLabel to match - all inside one transaction so a
 * burst of near-simultaneous completions (e.g. an admin batch-completing
 * several orders) can't race and drop an increment. Silently no-ops if
 * uid is missing or the user doc doesn't exist (e.g. a guest inquiry with
 * no linked account) - there's nowhere to record progress. */
async function incrementTierPoints(uid) {
  if (!uid) return;
  const db = admin.firestore();
  const settings = await getProgressionSettings();
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const points = Number(snap.data().tierPoints || 0) + 1;
    const tier = tierForPoints(settings.tiers, points);
    tx.update(userRef, { tierPoints: points, tier: tier.key, tierLabel: tier.label });
  });
}

/** Same shape as incrementTierPoints but for .levelPoints/.level (numeric,
 * floor(levelPoints / levelStep)) - called from the chat-message and
 * game-entry-fee triggers. */
async function incrementLevelPoints(uid) {
  if (!uid) return;
  const db = admin.firestore();
  const settings = await getProgressionSettings();
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const points = Number(snap.data().levelPoints || 0) + 1;
    const level = Math.floor(points / settings.levelStep);
    tx.update(userRef, { levelPoints: points, level });
  });
}

/** Pure lookup: discount percent (0-100) for a tier key, given an already-
 * fetched settings/progression object (from getProgressionSettings). No
 * Firestore read of its own - this is what lets a caller that's already
 * inside its own db.runTransaction() (e.g. walletService.js's
 * chargeProductPurchase, which fetches settings once before the
 * transaction starts, same pattern as its `pricing` fetch) apply the
 * discount without a second read from inside that transaction. */
function discountPercentFromSettings(settings, tierKey) {
  if (!tierKey) return 0;
  const promo = settings.promotions[tierKey];
  if (!promo || !promo.active) return 0;
  const pct = Number(promo.discountPercent);
  return Number.isFinite(pct) && pct > 0 ? Math.min(pct, 100) : 0;
}

/** Active discount percent (0-100) for a tier key, from settings/
 * progression.promotions - 0 if unset or the promotion is toggled
 * inactive. Fetches settings itself; for a caller already inside a
 * Firestore transaction, use discountPercentFromSettings with a
 * pre-fetched settings object instead (see its comment above). */
async function getTierDiscountPercent(tierKey) {
  if (!tierKey) return 0;
  const settings = await getProgressionSettings();
  return discountPercentFromSettings(settings, tierKey);
}

module.exports = {
  DEFAULT_TIERS,
  DEFAULT_LEVEL_STEP,
  DEFAULT_PROGRESSION,
  getProgressionSettings,
  tierForPoints,
  incrementTierPoints,
  incrementLevelPoints,
  getTierDiscountPercent,
  discountPercentFromSettings,
};
