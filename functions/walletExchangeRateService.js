const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const SUPPORTED_CURRENCIES = ['MYR', 'BDT', 'INR', 'NPR', 'PKR', 'IDR', 'PHP', 'MMK', 'KHR'];
const REMITTANCE_MAP = {
  BDT: ['remittanceBD_ACC', 'remittanceBD_CASH'],
  NPR: ['remittanceNP'],
  PKR: ['remittancePK'],
  PHP: ['remittancePH'],
  INR: ['remittanceIN'],
  IDR: ['remittanceID'],
  MMK: ['remittanceMM'],
};
const PROVIDER_URL = process.env.FX_RATES_URL || 'https://open.er-api.com/v6/latest/MYR';

function requireSuperadmin(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}
async function requireRole(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  const role = snap.exists ? snap.data()?.role : null;
  if (role !== 'superadmin') throw new HttpsError('permission-denied', 'Only Superadmin can manage live exchange rates.');
}
function cleanRate(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

exports.setRemittanceRateMode = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireSuperadmin(request);
  await requireRole(uid);
  const mode = String(request.data?.mode || '').toLowerCase();
  if (!['live', 'manual'].includes(mode)) throw new HttpsError('invalid-argument', 'Mode must be live or manual.');

  const db = admin.firestore();
  const ratesRef = db.collection('rates').doc('current');
  const snap = await ratesRef.get();
  const current = snap.exists ? snap.data() || {} : {};
  const live = current.remittanceLiveRates || {};
  const update = {
    remittanceRateMode: mode,
    remittanceRateSource: mode === 'live' ? 'wallet-fx-live' : 'manual',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: uid,
  };

  if (mode === 'live') {
    for (const [currency, keys] of Object.entries(REMITTANCE_MAP)) {
      const rate = cleanRate(live[currency]);
      if (rate === null) continue;
      for (const key of keys) update[key] = rate;
      if (currency === 'BDT') {
        update.BD_ACC = rate;
        update.BD_CASH = rate;
      } else {
        const legacy = { NPR:'NP', PKR:'PK', PHP:'PH', INR:'IN', IDR:'ID', MMK:'MM' }[currency];
        if (legacy) update[legacy] = rate;
      }
    }
    if (cleanRate(current.remittanceLiveFee) !== null) update.remittanceFee = Number(current.remittanceLiveFee);
  }

  await ratesRef.set(update, { merge: true });
  return { ok: true, mode, source: update.remittanceRateSource };
});

exports.refreshWalletExchangeRates = onCall({ enforceAppCheck: false }, async (request) => {
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

  const db = admin.firestore();
  const existingSnap = await db.collection('settings').doc('walletExchangeRates').get();
  const existingPairs = existingSnap.exists ? (existingSnap.data()?.pairs || {}) : {};
  const pairs = { ...existingPairs };
  for (const [currency, liveRate] of Object.entries(rates)) {
    if (currency === 'MYR') continue;
    pairs[currency] = { ...(pairs[currency] || {}), liveRate, active: pairs[currency]?.active !== false };
  }
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('settings').doc('walletExchangeRates').set({
    baseCurrency: 'MYR',
    provider: 'open.er-api.com',
    providerUrl: PROVIDER_URL,
    liveRates: rates,
    pairs,
    liveUpdatedAt: now,
    updatedAt: now,
    updatedBy: uid,
  }, { merge: true });

  const ratesRef = db.collection('rates').doc('current');
  const remittanceSnap = await ratesRef.get();
  const remittanceCurrent = remittanceSnap.exists ? remittanceSnap.data() || {} : {};
  const remittanceLiveRates = { ...(remittanceCurrent.remittanceLiveRates || {}) };
  for (const currency of Object.keys(REMITTANCE_MAP)) {
    if (cleanRate(rates[currency]) !== null) remittanceLiveRates[currency] = Number(rates[currency]);
  }
  const remittanceUpdate = {
    remittanceLiveRates,
    remittanceLiveUpdatedAt: now,
    remittanceRateSource: remittanceCurrent.remittanceRateMode === 'live' ? 'wallet-fx-live' : (remittanceCurrent.remittanceRateSource || 'manual'),
    updatedAt: now,
  };
  if (remittanceCurrent.remittanceRateMode === 'live') {
    for (const [currency, keys] of Object.entries(REMITTANCE_MAP)) {
      const rate = cleanRate(remittanceLiveRates[currency]);
      if (rate === null) continue;
      for (const key of keys) remittanceUpdate[key] = rate;
      if (currency === 'BDT') {
        remittanceUpdate.BD_ACC = rate;
        remittanceUpdate.BD_CASH = rate;
      } else {
        const legacy = { NPR:'NP', PKR:'PK', PHP:'PH', INR:'IN', IDR:'ID', MMK:'MM' }[currency];
        if (legacy) remittanceUpdate[legacy] = rate;
      }
    }
  }
  await ratesRef.set(remittanceUpdate, { merge: true });

  return {
    baseCurrency: 'MYR',
    rates,
    provider: 'open.er-api.com',
    refreshed: true,
    remittanceMode: remittanceCurrent.remittanceRateMode || 'manual',
  };
});