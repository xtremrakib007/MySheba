const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

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

function cleanRate(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

exports.refreshRemittanceRatesAutomatically = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'UTC', timeoutSeconds: 60, memory: '256MiB' },
  async () => {
    const db = admin.firestore();
    const res = await fetch(PROVIDER_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);
    const response = await res.json();

    const liveRates = {};
    for (const currency of Object.keys(REMITTANCE_MAP)) {
      const rate = cleanRate(response?.rates?.[currency]);
      if (rate !== null) liveRates[currency] = rate;
    }
    if (Object.keys(liveRates).length === 0) throw new Error('FX provider returned no remittance rates.');

    const ref = db.collection('rates').doc('current');
    const snap = await ref.get();
    const current = snap.exists ? snap.data() || {} : {};
    const mode = String(current.remittanceRateMode || 'manual').toLowerCase();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const update = {
      remittanceLiveRates: { ...(current.remittanceLiveRates || {}), ...liveRates },
      remittanceLiveUpdatedAt: now,
      remittanceRateSource: mode === 'live' ? 'wallet-fx-live-auto' : (current.remittanceRateSource || 'manual'),
      updatedAt: now,
    };

    if (mode === 'live') {
      for (const [currency, keys] of Object.entries(REMITTANCE_MAP)) {
        const rate = liveRates[currency];
        if (rate === undefined) continue;
        for (const key of keys) update[key] = rate;
        if (currency === 'BDT') {
          update.BD_ACC = rate;
          update.BD_CASH = rate;
        } else {
          const legacy = { NPR:'NP', PKR:'PK', PHP:'PH', INR:'IN', IDR:'ID', MMK:'MM' }[currency];
          if (legacy) update[legacy] = rate;
        }
      }
    }

    await ref.set(update, { merge: true });
    return { updated: Object.keys(liveRates).length, mode };
  }
);
