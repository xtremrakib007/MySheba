import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

export const WALLET_FX_CURRENCIES = [
  ['BDT', 'Bangladesh'],
  ['INR', 'India'],
  ['NPR', 'Nepal'],
  ['PKR', 'Pakistan'],
  ['IDR', 'Indonesia'],
  ['PHP', 'Philippines'],
  ['MMK', 'Myanmar'],
  ['KHR', 'Cambodia'],
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
  if (!Number.isFinite(values.buyRate) || values.buyRate <= 0 || !Number.isFinite(values.sellRate) || values.sellRate <= 0) {
    throw new Error('Buy and sell rates must both be positive numbers.');
  }
  if (values.sellRate < values.buyRate) {
    throw new Error('Sell rate must not be lower than buy rate.');
  }
  await setDoc(doc(db, 'settings', 'walletExchangeRates'), {
    baseCurrency: 'MYR',
    [`pairs.${currency}`]: {
      buyRate: values.buyRate,
      sellRate: values.sellRate,
      active: values.active,
      manuallyUpdatedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function refreshWalletFx() {
  const fn = httpsCallable(functions, 'refreshWalletExchangeRates');
  const result = await fn({});
  return result.data as any;
}
