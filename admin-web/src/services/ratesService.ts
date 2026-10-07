// Admin Web service for the platform's service rates. Ported field-for-field
// from the mobile app's src/firebase/ratesService.js: the rates live in ONE
// document, rates/current, with named fields — not in a `rates` collection of
// per-service rows. Anything written anywhere else is invisible to the app.
//
// Permissions mirror the mobile service and firestore.rules' rates/current
// clause: an admin may change Mobile Banking and Remittance rates (including
// their legacy aliases); Recharge/Internet rates are superadmin-only.

import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { AdminRole } from '../contexts/AuthContext';

const RATES_DOC = doc(db, 'rates', 'current');

export const DEFAULT_RATES: Record<string, number> = {
  mobileBanking: 110.5,

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

  // Legacy aliases, kept in sync so older app builds read the same value.
  BD_ACC: 30.26,
  BD_CASH: 30.11,
  NP: 37.65,
  PK: 67.79,
  PH: 15.05,
  LK: 81.99,
  IN: 23.5,
  ID: 230,
  MM: 966,

  rechargeBD: 30.26,
  rechargeIN: 23.5,
  rechargeNP: 37.65,
  rechargeID: 230,
  rechargePK: 67.79,
  rechargeMM: 966,
  rechargePH: 15.05,
  rechargeKH: 900,
};

const LEGACY_REMITTANCE_ALIASES: Record<string, string> = {
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

const ADMIN_EDITABLE_RATE_KEYS = new Set<string>([
  'mobileBanking',
  'remittanceFee',
  ...Object.values(LEGACY_REMITTANCE_ALIASES),
  ...Object.keys(LEGACY_REMITTANCE_ALIASES),
]);

export const RECHARGE_RATE_KEYS = new Set<string>([
  'rechargeBD', 'rechargeIN', 'rechargeNP', 'rechargeID',
  'rechargePK', 'rechargeMM', 'rechargePH', 'rechargeKH', 'rechargeTH',
]);

export type Rates = Record<string, number>;

export interface RateField { key: string; label: string }

export const MOBILE_RATE_FIELDS: RateField[] = [
  { key: 'mobileBanking', label: 'Mobile Banking — 1 MYR = BDT' },
];

export const REMITTANCE_RATE_FIELDS: RateField[] = [
  { key: 'remittanceFee', label: 'Remittance Transfer Fee — MYR' },
  { key: 'remittanceBD_ACC', label: 'Remittance BDT — Bank Account' },
  { key: 'remittanceBD_CASH', label: 'Remittance BDT — Cash Pickup' },
  { key: 'remittanceNP', label: 'Remittance NPR' },
  { key: 'remittancePK', label: 'Remittance PKR' },
  { key: 'remittancePH', label: 'Remittance PHP' },
  { key: 'remittanceLK', label: 'Remittance LKR' },
  { key: 'remittanceIN', label: 'Remittance INR' },
  { key: 'remittanceID', label: 'Remittance IDR' },
  { key: 'remittanceMM', label: 'Remittance MMK' },
];

export const RECHARGE_RATE_FIELDS: RateField[] = [
  { key: 'rechargeBD', label: 'Recharge/Internet — BDT' },
  { key: 'rechargeIN', label: 'Recharge/Internet — INR' },
  { key: 'rechargeNP', label: 'Recharge/Internet — NPR' },
  { key: 'rechargeID', label: 'Recharge/Internet — IDR' },
  { key: 'rechargePK', label: 'Recharge/Internet — PKR' },
  { key: 'rechargeMM', label: 'Recharge/Internet — MMK' },
  { key: 'rechargePH', label: 'Recharge/Internet — PHP' },
  { key: 'rechargeKH', label: 'Recharge/Internet — KHR' },
  { key: 'rechargeTH', label: 'Recharge/Internet — THB' },
];

/** Fills in defaults and mirrors legacy remittance fields onto their
 * canonical names, exactly as the mobile app does when it reads the doc. */
export function normalizeRates(raw: Record<string, unknown> = {}): Rates {
  const merged: Rates = { ...DEFAULT_RATES, ...(raw as Rates) };
  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_REMITTANCE_ALIASES)) {
    if (raw[canonicalKey] == null && raw[legacyKey] != null) {
      merged[canonicalKey] = Number(raw[legacyKey]);
    }
    merged[legacyKey] = merged[canonicalKey];
  }
  return merged;
}

export async function fetchRates(): Promise<Rates> {
  const snap = await getDoc(RATES_DOC);
  return normalizeRates(snap.exists() ? snap.data() : {});
}

/** Live updates, so a rate changed from the mobile admin screen shows here. */
export function subscribeRates(
  onUpdate: (rates: Rates) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    RATES_DOC,
    (snap) => onUpdate(normalizeRates(snap.exists() ? snap.data() : {})),
    (err) => onError(err as Error)
  );
}

export function canEditRate(key: string, role: AdminRole | undefined): boolean {
  if (role === 'superadmin') return true;
  if (role !== 'admin') return false;
  return !RECHARGE_RATE_KEYS.has(key) && ADMIN_EDITABLE_RATE_KEYS.has(key);
}

/**
 * Writes one rate onto rates/current, keeping the legacy alias in step so
 * older builds and the mobile admin screen read the same number. The role
 * check mirrors the mobile service; firestore.rules enforces it for real.
 */
export async function updateRate(key: string, value: number, role: AdminRole | undefined): Promise<void> {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a valid positive rate.');
  if (role !== 'admin' && role !== 'superadmin') throw new Error('Only Admin or Superadmin can change service rates.');
  if (role === 'admin' && RECHARGE_RATE_KEYS.has(key)) throw new Error('Only Superadmin can change Recharge/Internet rates.');
  if (role === 'admin' && !ADMIN_EDITABLE_RATE_KEYS.has(key)) throw new Error('Admin can change Mobile Banking and Remittance rates only.');

  const canonicalKey = LEGACY_REMITTANCE_ALIASES[key] || key;
  const payload: Record<string, unknown> = { [canonicalKey]: value, updatedAt: serverTimestamp() };
  const legacyKey = Object.keys(LEGACY_REMITTANCE_ALIASES).find(
    (candidate) => LEGACY_REMITTANCE_ALIASES[candidate] === canonicalKey
  );
  if (legacyKey && legacyKey !== canonicalKey) payload[legacyKey] = value;

  await setDoc(RATES_DOC, payload, { merge: true });
}
