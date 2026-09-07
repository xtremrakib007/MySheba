// A single `rates/current` document holds every exchange rate the app
// shows (mobile banking + remittance). Kept as one doc so the Rate popup and
// Admin > Rates tab can subscribe with a single read instead of a query.
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const RATES_DOC = doc(db, 'rates', 'current');

export const DEFAULT_RATES = {
  mobileBanking: 110.5,
  BD_ACC: 30.26,
  BD_CASH: 30.11,
  NP: 37.65,
  PK: 67.79,
  PH: 15.05,
  LK: 81.99,
  IN: 23.5,
  ID: 230,
  MM: 966,
  remittanceFee: 7.0,
  // Recharge/Internet Package rate, per non-Malaysia country - kept
  // separate from mobileBanking and the remittance rates above (see
  // data/countries.js RECHARGE_RATE_KEYS/amountToPoints) since recharge
  // margins are admin-set independently.
  rechargeBD: 30.26,
  rechargeIN: 23.5,
  rechargeNP: 37.65,
  rechargeID: 230,
  rechargePK: 67.79,
  rechargeMM: 966,
  rechargePH: 15.05,
  rechargeKH: 900,
};

/** Ensures the rates doc exists (first run) then returns current values. */
export async function ensureRates() {
  const snap = await getDoc(RATES_DOC);
  if (!snap.exists()) {
    await setDoc(RATES_DOC, { ...DEFAULT_RATES, updatedAt: serverTimestamp() });
    return { ...DEFAULT_RATES };
  }
  return snap.data();
}

export function subscribeRates(callback, onError) {
  return onSnapshot(
    RATES_DOC,
    (snap) => callback(snap.exists() ? { ...DEFAULT_RATES, ...snap.data() } : DEFAULT_RATES),
    onError
  );
}

export async function updateRate(key, value) {
  await setDoc(RATES_DOC, { [key]: value, updatedAt: serverTimestamp() }, { merge: true });
}
