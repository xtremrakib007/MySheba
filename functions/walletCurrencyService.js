const admin = require('firebase-admin');

const CURRENCY_BY_COUNTRY = {
  MY: 'MYR', BD: 'BDT', IN: 'INR', NP: 'NPR', PK: 'PKR',
  ID: 'IDR', PH: 'PHP', MM: 'MMK', KH: 'KHR',
};
const CURRENCY_BY_DIAL = {
  '60':'MYR','880':'BDT','91':'INR','977':'NPR','92':'PKR',
  '62':'IDR','63':'PHP','95':'MMK','855':'KHR',
};
const SUPPORTED = new Set(Object.values(CURRENCY_BY_COUNTRY));

function normalizeCurrency(value) {
  const c = String(value || '').trim().toUpperCase();
  if (!SUPPORTED.has(c)) throw new Error(`Unsupported wallet currency: ${c || 'empty'}`);
  return c;
}

function inferWalletCurrency(profile = {}) {
  const explicit = String(profile.walletCurrency || profile.walletBalanceCurrency || '').trim().toUpperCase();
  if (SUPPORTED.has(explicit)) return explicit;
  const country = String(profile.countryCode || profile.country || '').trim().toUpperCase();
  if (CURRENCY_BY_COUNTRY[country]) return CURRENCY_BY_COUNTRY[country];
  const dial = String(profile.phoneCountryCode || profile.dialCode || '').replace(/[^0-9]/g, '');
  if (CURRENCY_BY_DIAL[dial]) return CURRENCY_BY_DIAL[dial];
  return 'MYR';
}

function money(value, currency) {
  const n = Number(value);
  const digits = ['IDR','KHR','MMK'].includes(currency) ? 0 : 2;
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * (10 ** digits)))) {
    throw new Error('Invalid wallet amount.');
  }
  return Math.round(n * (10 ** digits)) / (10 ** digits);
}

async function getWalletCurrencyAndFx(db, profile) {
  const currency = inferWalletCurrency(profile);
  if (currency === 'MYR') return { currency, buyRate: 1, sellRate: 1, liveRate: 1, rateSource: 'base' };
  const snap = await db.collection('settings').doc('walletExchangeRates').get();
  const pair = snap.exists ? (snap.data()?.pairs?.[currency] || {}) : {};
  if (pair.active === false) throw new Error(`Wallet currency ${currency} is currently disabled.`);
  const buyRate = Number(pair.buyRate ?? pair.liveRate);
  const sellRate = Number(pair.sellRate ?? pair.liveRate);
  if (!Number.isFinite(buyRate) || buyRate <= 0 || !Number.isFinite(sellRate) || sellRate <= 0) {
    throw new Error(`Exchange rate for ${currency} is not configured.`);
  }
  return { currency, buyRate, sellRate, liveRate: Number(pair.liveRate) || null, rateSource: pair.buyRate != null || pair.sellRate != null ? 'admin' : 'live' };
}

function baseToWallet(baseAmount, fx) {
  const n = Number(baseAmount);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid base amount.');
  return money(n * fx.sellRate, fx.currency);
}

function walletToBase(walletAmount, fx) {
  const n = Number(walletAmount);
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid wallet amount.');
  return money(n / fx.buyRate, 'MYR');
}

module.exports = {
  CURRENCY_BY_COUNTRY, CURRENCY_BY_DIAL, SUPPORTED,
  normalizeCurrency, inferWalletCurrency, money,
  getWalletCurrencyAndFx, baseToWallet, walletToBase,
};