// A single `settings/progression` document holds the Tier/Level loyalty
// system's editable rules - the tier ladder (name + order-count threshold),
// the Level step size, and each tier's promotion (fee discount % + display
// title/description). Same "one doc, subscribe once" shape as
// settingsService.js's settings/pricing.
//
// The actual Tier/Level NUMBERS on a user (tier, tierPoints, level,
// levelPoints) are never written from here or anywhere else client-side -
// they're server-computed only, by Firestore triggers in functions/index.js.
// This file only edits the RULES those triggers read - see the server-side
// progression service mirror of the defaults below (keep both in sync if
// they ever change).
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const SETTINGS_DOC = doc(db, 'settings', 'progression');

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

export const DEFAULT_LEVEL_STEP = 20;

function defaultPromotion() {
  return { discountPercent: 0, title: '', description: '', active: true };
}

const DEFAULT_PROMOTIONS = DEFAULT_TIERS.reduce((acc, t) => {
  acc[t.key] = defaultPromotion();
  return acc;
}, {});

export const DEFAULT_PROGRESSION = { tiers: DEFAULT_TIERS, levelStep: DEFAULT_LEVEL_STEP, promotions: DEFAULT_PROMOTIONS };

function withDefaults(data) {
  const tiers = Array.isArray(data?.tiers) && data.tiers.length ? data.tiers : DEFAULT_TIERS;
  const levelStep = Number(data?.levelStep) > 0 ? Number(data.levelStep) : DEFAULT_LEVEL_STEP;
  const promotions = { ...DEFAULT_PROMOTIONS, ...(data?.promotions || {}) };
  return { tiers, levelStep, promotions };
}

export function subscribeProgression(callback, onError) {
  return onSnapshot(SETTINGS_DOC, (snap) => callback(withDefaults(snap.exists() ? snap.data() : null)), onError);
}

export async function ensureProgression() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) {
    await setDoc(SETTINGS_DOC, { ...DEFAULT_PROGRESSION, updatedAt: serverTimestamp() });
    return DEFAULT_PROGRESSION;
  }
  return withDefaults(snap.data());
}

export async function updateTierPromotion(tierKey, patch) {
  const current = await ensureProgression();
  const existing = current.promotions[tierKey] || defaultPromotion();
  const next = { ...existing, ...patch };
  await setDoc(SETTINGS_DOC, { promotions: { [tierKey]: next }, updatedAt: serverTimestamp() }, { merge: true });
}

export function tierByKey(tiers, tierKey) {
  return tiers.find((t) => t.key === tierKey) || null;
}
