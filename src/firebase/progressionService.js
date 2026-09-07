// A single `settings/progression` document holds the Tier/Level loyalty
// system's editable rules - the tier ladder (name + order-count threshold),
// the Level step size, and each tier's promotion (fee discount % + display
// title/description). Same "one doc, subscribe once" shape as
// settingsService.js's settings/pricing.
//
// The actual Tier/Level NUMBERS on a user (tier, tierPoints, level,
// levelPoints) are never written from here or anywhere else client-side -
// they're server-computed only, by Firestore triggers in
// functions/index.js (onTransactionUpdated/onInquiryUpdated/
// onChatMessageCreated/onGamePointsLedgerCreated), which is also what
// enforces the fee discount at charge time (functions/walletService.js's
// chargeProductPurchase). This file only edits the RULES those triggers
// read - see progressionService.js in functions/ for the server-side
// mirror of the defaults below (keep both in sync if they ever change).
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const SETTINGS_DOC = doc(db, 'settings', 'progression');

// Ordered low -> high. minPoints is a count of qualifying completed
// service orders (Recharge/Internet/Mobile Banking/Remittance/Flight
// ticket confirmations), not a monetary amount.
export const DEFAULT_TIERS = [
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
// of qualifying chat messages + chat-game entry-fee spends combined.
export const DEFAULT_LEVEL_STEP = 20;

function defaultPromotion() {
  return { discountPercent: 0, title: '', description: '', active: true };
}

const DEFAULT_PROMOTIONS = DEFAULT_TIERS.reduce((acc, t) => {
  acc[t.key] = defaultPromotion();
  return acc;
}, {});

export const DEFAULT_PROGRESSION = {
  tiers: DEFAULT_TIERS,
  levelStep: DEFAULT_LEVEL_STEP,
  promotions: DEFAULT_PROMOTIONS,
};

/** Merges a raw settings/progression doc (or its absence) over the
 * defaults above - same "doc may not exist yet" shape as
 * settingsService.js's subscribePricing. */
function withDefaults(data) {
  const tiers = Array.isArray(data?.tiers) && data.tiers.length ? data.tiers : DEFAULT_TIERS;
  const levelStep = Number(data?.levelStep) > 0 ? Number(data.levelStep) : DEFAULT_LEVEL_STEP;
  const promotions = { ...DEFAULT_PROMOTIONS, ...(data?.promotions || {}) };
  return { tiers, levelStep, promotions };
}

export function subscribeProgression(callback, onError) {
  return onSnapshot(
    SETTINGS_DOC,
    (snap) => callback(withDefaults(snap.exists() ? snap.data() : null)),
    onError
  );
}

export async function ensureProgression() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) {
    await setDoc(SETTINGS_DOC, { ...DEFAULT_PROGRESSION, updatedAt: serverTimestamp() });
    return DEFAULT_PROGRESSION;
  }
  return withDefaults(snap.data());
}

/** Updates one tier's promotion fields (discountPercent/title/description/
 * active) - superadmin-only, enforced in firestore.rules' settings/{id}
 * rule (id == 'progression' requires isSuperadmin()). Merges onto whatever
 * that tier's promotion already has, so a partial patch (e.g. just
 * toggling `active`) doesn't clobber the rest. */
export async function updateTierPromotion(tierKey, patch) {
  const current = await ensureProgression();
  const existing = current.promotions[tierKey] || defaultPromotion();
  const next = { ...existing, ...patch };
  await setDoc(
    SETTINGS_DOC,
    { promotions: { [tierKey]: next }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Display helper: the tier object (label etc.) a raw tierKey resolves to,
 * or null if unset/unknown. Used by ProfileScreen and similar to render a
 * user's own tier without duplicating the tiers list lookup everywhere. */
export function tierByKey(tiers, tierKey) {
  return tiers.find((t) => t.key === tierKey) || null;
}
