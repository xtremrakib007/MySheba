const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const SUPPORTED_CURRENCIES = ['MYR', 'BDT', 'INR', 'NPR', 'PKR', 'IDR', 'PHP', 'MMK', 'KHR'];
const PROVIDER_URL = process.env.FX_RATES_URL || 'https://open.er-api.com/v6/latest/MYR';

function requireSuperadmin(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function requireRole(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  const role = snap.exists ? snap.data()?.role : null;
  if (role !== 'superadmin') throw new HttpsError('permission-denied', 'Only Superadmin can refresh exchange rates.');
}

function cleanRate(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

exports.refreshWalletExchangeRates = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireSuperadmin(request);
  await requireRole(uid);

  let response;
  try {
    const res = await fetch(PROVIDER_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);
    response = await res.json();
  } catch (error) {
    console.error('refreshWalletExchangeRates provider error', error);
    throw new HttpsError('unavailable', 'Live exchange-rate provider is unavailable right now.');
  }

  const rates = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    if (currency === 'MYR') {
      rates[currency] = 1;
      continue;
    }
    const rate = cleanRate(response?.rates?.[currency]);
    if (rate !== null) rates[currency] = rate;
  }

  if (Object.keys(rates).length < 2) {
    throw new HttpsError('failed-precondition', 'The live provider did not return usable exchange rates.');
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await admin.firestore().collection('settings').doc('walletExchangeRates').set({
    baseCurrency: 'MYR',
    provider: 'open.er-api.com',
    providerUrl: PROVIDER_URL,
    liveRates: rates,
    liveUpdatedAt: now,
    updatedAt: now,
    updatedBy: uid,
  }, { merge: true });

  return {
    baseCurrency: 'MYR',
    rates,
    provider: 'open.er-api.com',
    refreshed: true,
  };
});
