import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';

export const WALLET_CURRENCIES = [
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', country: 'MY' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', country: 'BD' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', country: 'IN' },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: 'रू', country: 'NP' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', country: 'PK' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', country: 'ID' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', country: 'PH' },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', country: 'MM' },
  { code: 'KHR', name: 'Cambodian Riel', symbol: '៛', country: 'KH' },
];

export const DEFAULT_WALLET_FX = {
  baseCurrency: 'MYR',
  pairs: Object.fromEntries(WALLET_CURRENCIES.filter((c) => c.code !== 'MYR').map((c) => [
    c.code, { liveRate: null, buyRate: null, sellRate: null, active: true }
  ])),
};

const RATES_DOC = doc(db, 'settings', 'walletExchangeRates');

export function subscribeWalletExchangeRates(callback, onError) {
  return onSnapshot(RATES_DOC, (snap) => {
    const raw = snap.exists() ? snap.data() : {};
    const pairs = { ...DEFAULT_WALLET_FX.pairs, ...(raw.pairs || {}) };
    callback({ ...DEFAULT_WALLET_FX, ...raw, pairs });
  }, onError);
}

export async function updateWalletExchangePair(currency, patch) {
  if (!WALLET_CURRENCIES.some((c) => c.code === currency)) throw new Error('Unsupported wallet currency.');
  const clean = {};
  for (const key of ['buyRate', 'sellRate', 'liveRate']) {
    if (patch[key] !== undefined) {
      const value = patch[key] === null || patch[key] === '' ? null : Number(patch[key]);
      if (value !== null && (!Number.isFinite(value) || value <= 0)) throw new Error('Enter a valid positive exchange rate.');
      clean[key] = value;
    }
  }
  if (patch.active !== undefined) clean.active = !!patch.active;
  if (!Object.keys(clean).length) return;
  await setDoc(RATES_DOC, {
    [`pairs.${currency}`]: clean,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function refreshLiveWalletExchangeRates() {
  const fn = httpsCallable(functions, 'refreshWalletExchangeRates');
  const result = await fn({});
  return result.data;
}

export function formatWalletAmount(amount, currency, locale) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'IDR' || currency === 'KHR' || currency === 'MMK' ? 0 : 2,
      maximumFractionDigits: currency === 'IDR' || currency === 'KHR' || currency === 'MMK' ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function convertFromBase(amount, currency, pair) {
  const rate = Number(pair?.sellRate ?? pair?.liveRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Number(amount) * rate;
}

export function convertToBase(amount, currency, pair) {
  const rate = Number(pair?.buyRate ?? pair?.liveRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Number(amount) / rate;
}
