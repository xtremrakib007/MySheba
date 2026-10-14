import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../firebase/config';

export const WALLET_FX_CURRENCIES = [
  ['BDT', 'Bangladesh'], ['INR', 'India'], ['NPR', 'Nepal'], ['PKR', 'Pakistan'],
  ['IDR', 'Indonesia'], ['PHP', 'Philippines'], ['MMK', 'Myanmar'], ['KHR', 'Cambodia'],
] as const;

export const REMITTANCE_FX_CURRENCIES = [
  ['BDT', 'Bangladesh'], ['INR', 'India'], ['NPR', 'Nepal'], ['PKR', 'Pakistan'],
  ['PHP', 'Philippines'], ['IDR', 'Indonesia'], ['MMK', 'Myanmar'],
] as const;

export async function fetchWalletFx() {
  const snap = await getDoc(doc(db, 'settings', 'walletExchangeRates'));
  return snap.exists() ? snap.data() : { baseCurrency: 'MYR', pairs: {}, liveRates: {} };
}
export function subscribeWalletFx(callback: (data: any) => void) {
  return onSnapshot(doc(db, 'settings', 'walletExchangeRates'), (snap) => {
    callback(snap.exists() ? snap.data() : { baseCurrency: 'MYR', pairs: {}, liveRates: {} });
  });
}
export async function saveWalletFxPair(currency: string, values: { buyRate: number; sellRate: number; active: boolean }) {
  if (!Number.isFinite(values.buyRate) || values.buyRate <= 0 || !Number.isFinite(values.sellRate) || values.sellRate <= 0) throw new Error('Buy and sell rates must both be positive numbers.');
  if (values.sellRate < values.buyRate) throw new Error('Sell rate must not be lower than buy rate.');
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in to change rates.');
  const profileSnap = await getDoc(doc(db, 'users', uid));
  const role = profileSnap.exists() ? profileSnap.data()?.role : null;
  // firestore.rules lets only a superadmin write this document.
  if (role !== 'superadmin') throw new Error('Only a Superadmin can change wallet rates.');
  // A nested map, not a `pairs.BDT` key: setDoc does not read dots as a path,
  // so that wrote a top-level field literally named "pairs.BDT", which the
  // rules' key allowlist refused on every save. merge:true still merges
  // pairs field by field, so the other currencies are kept.
  await setDoc(doc(db, 'settings', 'walletExchangeRates'), {
    baseCurrency: 'MYR',
    pairs: { [currency]: { buyRate: values.buyRate, sellRate: values.sellRate, active: values.active, manuallyUpdatedAt: serverTimestamp() } },
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }, { merge: true });
}
export async function refreshWalletFx() {
  const fn = httpsCallable(functions, 'refreshWalletExchangeRates');
  const result = await fn({});
  return result.data as any;
}
export async function setRemittanceRateMode(mode: 'live' | 'manual') {
  const fn = httpsCallable(functions, 'setRemittanceRateMode');
  const result = await fn({ mode });
  return result.data as any;
}
