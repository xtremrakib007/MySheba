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

const admin = require('firebase-admin');

function progressionDocRef() {
  return admin.firestore().collection('settings').doc('progression');
}

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

const DEFAULT_LEVEL_STEP = 20;

function defaultPromotion() {
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

async function getProgressionSettings() {
  const snap = await progressionDocRef().get();
  if (!snap.exists) return DEFAULT_PROGRESSION;
  const data = snap.data() || {};
  const tiers = Array.isArray(data.tiers) && data.tiers.length ? data.tiers : DEFAULT_TIERS;
  const levelStep = Number(data.levelStep) > 0 ? Number(data.levelStep) : DEFAULT_LEVEL_STEP;
  const promotions = { ...DEFAULT_PROMOTIONS, ...(data.promotions || {}) };
  return { tiers, levelStep, promotions };
}

function tierForPoints(tiers, points) {
  let current = tiers[0];
  for (const t of tiers) if (points >= t.minPoints) current = t;
  return current;
}

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

function discountPercentFromSettings(settings, tierKey) {
  if (!tierKey) return 0;
  const promo = settings.promotions[tierKey];
  if (!promo || !promo.active) return 0;
  const pct = Number(promo.discountPercent);
  return Number.isFinite(pct) && pct > 0 ? Math.min(pct, 100) : 0;
}

async function getTierDiscountPercent(tierKey) {
  if (!tierKey) return 0;
  const settings = await getProgressionSettings();
  return discountPercentFromSettings(settings, tierKey);
}

// index.js already imports this module directly. Registering the new
// transaction callables on that parent export lets Firebase Functions expose
// them without duplicating or restructuring the large existing index module.
const transactionService = require('./transactionService');
if (module.parent && module.parent.exports) {
  module.parent.exports.approveTransaction = transactionService.approveTransaction;
  module.parent.exports.acceptTransaction = transactionService.acceptTransaction;
  module.parent.exports.completeTransaction = transactionService.completeTransaction;
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
