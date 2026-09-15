import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';

const RATES_DOC = doc(db, 'rates', 'current');

// Customer-facing/service rates are intentionally independent:
// - mobileBanking: Mobile Banking payout rate
// - remittance*: Remittance payout rates
// - recharge*: Recharge/Internet conversion rates
// A remittance rate must never silently reuse the Mobile Banking or
// Recharge/Internet rate.
export const DEFAULT_RATES = {
  mobileBanking: 110.5,

  // Remittance rates. Bangladesh keeps separate bank-account/cash rates.
  remittanceBD_ACC: 30.26,
  remittanceBD_CASH: 30.11,
  remittanceNP: 37.65,
  remittancePK: 67.79,
  remittancePH: 15.05,
  remittanceLK: 81.99,
  remittanceIN: 23.5,
  remittanceID: 230,
  remittanceMM: 966,
  remittanceFee: 7.0,

  // Legacy aliases are retained so existing admin screens/older clients keep
  // working. normalizeRates() always exposes them from the remittance values.
  BD_ACC: 30.26,
  BD_CASH: 30.11,
  NP: 37.65,
  PK: 67.79,
  PH: 15.05,
  LK: 81.99,
  IN: 23.5,
  ID: 230,
  MM: 966,

  // Recharge/Internet rates are a separate rate table. These are used for
  // server-side conversion only; customers do not need to see these rates.
  rechargeBD: 30.26,
  rechargeIN: 23.5,
  rechargeNP: 37.65,
  rechargeID: 230,
  rechargePK: 67.79,
  rechargeMM: 966,
  rechargePH: 15.05,
  rechargeKH: 900,
};

const LEGACY_REMITTANCE_ALIASES = {
  BD_ACC: 'remittanceBD_ACC',
  BD_CASH: 'remittanceBD_CASH',
  NP: 'remittanceNP',
  PK: 'remittancePK',
  PH: 'remittancePH',
  LK: 'remittanceLK',
  IN: 'remittanceIN',
  ID: 'remittanceID',
  MM: 'remittanceMM',
  remittanceFee: 'remittanceFee',
};

const ADMIN_EDITABLE_RATE_KEYS = new Set([
  'mobileBanking',
  'remittanceFee',
  ...Object.values(LEGACY_REMITTANCE_ALIASES),
  ...Object.keys(LEGACY_REMITTANCE_ALIASES),
]);

const RECHARGE_RATE_KEYS = new Set([
  'rechargeBD', 'rechargeIN', 'rechargeNP', 'rechargeID',
  'rechargePK', 'rechargeMM', 'rechargePH', 'rechargeKH',
]);

function normalizeRates(raw = {}) {
  const merged = { ...DEFAULT_RATES, ...raw };

  // Migrate legacy remittance fields in memory when an older rates/current
  // document has not yet received the new canonical field.
  Object.entries(LEGACY_REMITTANCE_ALIASES).forEach(([legacyKey, canonicalKey]) => {
    if (raw[canonicalKey] == null && raw[legacyKey] != null) {
      merged[canonicalKey] = Number(raw[legacyKey]);
    }
    merged[legacyKey] = merged[canonicalKey];
  });

  return merged;
}

/** Ensures the rates doc exists (first run) then returns current values. */
export async function ensureRates() {
  const snap = await getDoc(RATES_DOC);
  if (!snap.exists()) {
    await setDoc(RATES_DOC, { ...DEFAULT_RATES, updatedAt: serverTimestamp() });
    return { ...DEFAULT_RATES };
  }
  return normalizeRates(snap.data());
}

export function subscribeRates(callback, onError) {
  return onSnapshot(
    RATES_DOC,
    (snap) => callback(normalizeRates(snap.exists() ? snap.data() : DEFAULT_RATES)),
    onError
  );
}

/**
 * Update a service rate.
 * Admin: Mobile Banking + Remittance only.
 * Superadmin: all rate tables, including Recharge/Internet.
 */
export async function updateRate(key, value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error('Enter a valid positive rate.');

  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in to change rates.');

  const profileSnap = await getDoc(doc(db, 'users', uid));
  const role = profileSnap.exists() ? profileSnap.data()?.role : null;
  if (!['admin', 'superadmin'].includes(role)) {
    throw new Error('Only Admin or Superadmin can change service rates.');
  }

  const isRechargeRate = RECHARGE_RATE_KEYS.has(key);
  if (role === 'admin' && isRechargeRate) {
    throw new Error('Only Superadmin can change Recharge/Internet rates.');
  }
  if (role === 'admin' && !ADMIN_EDITABLE_RATE_KEYS.has(key)) {
    throw new Error('Admin can change Mobile Banking and Remittance rates only.');
  }

  const canonicalKey = LEGACY_REMITTANCE_ALIASES[key] || key;
  const payload = { [canonicalKey]: num, updatedAt: serverTimestamp() };

  // Keep legacy fields synchronized so the existing Admin Rates screen and
  // older app builds display the same Remittance value instead of a stale
  // number while the canonical service-specific fields are being adopted.
  const legacyKey = Object.keys(LEGACY_REMITTANCE_ALIASES).find(
    (candidate) => LEGACY_REMITTANCE_ALIASES[candidate] === canonicalKey
  );
  if (legacyKey && legacyKey !== canonicalKey) payload[legacyKey] = num;

  await setDoc(RATES_DOC, payload, { merge: true });
}