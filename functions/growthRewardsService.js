const admin = require('firebase-admin');
const { inferWalletCurrency, money } = require('./walletCurrencyService');

const QUALIFYING = new Set(['Recharge']);
const DEFAULTS = {
  referralEnabled: true,
  referralReward: 5,
  referralNewUserReward: 0,
  referralMinimumSpend: 50,
  referralQualificationDays: 30,
  referralMonthlyCap: 0,
};

function number(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return number(value);
}
function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}
function active(profile) {
  return !!profile &&
    profile.active !== false &&
    profile.disabled !== true &&
    profile.suspended !== true &&
    profile.inactive !== true &&
    !profile.mergedInto;
}
function normalizeConfig(d = {}) {
  return {
    referralEnabled: d.referralEnabled !== false,
    referralReward: Math.max(0, number(d.referralReward, DEFAULTS.referralReward)),
    referralNewUserReward: Math.max(0, number(d.referralNewUserReward, DEFAULTS.referralNewUserReward)),
    referralMinimumSpend: Math.max(0, number(d.referralMinimumSpend, DEFAULTS.referralMinimumSpend)),
    referralQualificationDays: Math.max(1, Math.min(365, Math.round(number(d.referralQualificationDays, DEFAULTS.referralQualificationDays)))),
    referralMonthlyCap: Math.max(0, Math.round(number(d.referralMonthlyCap, DEFAULTS.referralMonthlyCap))),
  };
}
function amountFromTransaction(tx) {
  const n = number(tx.total ?? tx.amount ?? 0);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return 0;
  return Math.round(n * 100) / 100;
}
function qualificationDeadline(referral, customer, config) {
  const stored = timestampMillis(referral.qualificationDeadlineAt);
  if (stored) return stored;
  const registered = timestampMillis(referral.registeredAt) || timestampMillis(customer.createdAt);
  return registered ? registered + config.referralQualificationDays * 86400000 : 0;
}
function walletAmountFromBase(baseAmount, currency, rates) {
  if (currency === 'MYR') return { currency, amount: money(baseAmount, currency), fxRate: 1, rateSource: 'base' };
  const pair = rates?.pairs?.[currency] || {};
  if (pair.active === false) throw new Error(`Wallet currency ${currency} is currently disabled.`);
  const sellRate = number(pair.sellRate ?? pair.liveRate);
  if (!Number.isFinite(sellRate) || sellRate <= 0) throw new Error(`Exchange rate for ${currency} is not configured.`);
  return { currency, amount: money(baseAmount * sellRate, currency), fxRate: sellRate, rateSource: pair.sellRate != null ? 'admin' : 'live' };
}
async function updateReferralProgress(db, transactionId, tx, settings) {
  if (!tx || tx.status !== 'completed') return;
  if (!QUALIFYING.has(String(tx.service || tx.chargedServiceKind || '').trim())) return;

  const uid = String(tx.customerId || '').trim();
  if (!uid) return;

  const customerRef = db.collection('users').doc(uid);
  const rewardRef = db.collection('growthRewardLedger').doc(`referral_${uid}`);
  const eventRef = db.collection('growthReferralEvents').doc(`${uid}_${transactionId}`);
  const customerSnap = await customerRef.get();
  if (!customerSnap.exists) return;
  const customer = customerSnap.data() || {};
  const referral = customer.referral || {};
  const referrerUid = String(referral.referredBy || '').trim();
  if (!referrerUid || customer.role !== 'customer' || !active(customer)) return;
  if (referral.status === 'rewarded' || referral.rewardStatus === 'rewarded') return;

  const amount = amountFromTransaction(tx);
  if (!amount) return;

  const config = normalizeConfig(settings);
  if (!config.referralEnabled || config.referralReward <= 0 || config.referralMinimumSpend <= 0) return;

  const deadline = qualificationDeadline(referral, customer, config);
  if (deadline && Date.now() > deadline) {
    await customerRef.update({
      'referral.status': 'expired',
      'referral.rewardStatus': 'expired',
      'referral.expiredAt': admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  const referrerRef = db.collection('users').doc(referrerUid);
  const ratesRef = db.collection('settings').doc('walletExchangeRates');
  const counterRef = db.collection('growthReferralCounters').doc(referrerUid);
  const result = await db.runTransaction(async (t) => {
    const [liveCustomerSnap, referrerSnap, rewardSnap, eventSnap, ratesSnap, counterSnap] = await Promise.all([
      t.get(customerRef),
      t.get(referrerRef),
      t.get(rewardRef),
      t.get(eventRef),
      t.get(ratesRef),
      t.get(counterRef),
    ]);

    if (!liveCustomerSnap.exists || !referrerSnap.exists) return { state: 'missing' };
    if (eventSnap.exists) return { state: 'duplicate' };

    const liveCustomer = liveCustomerSnap.data() || {};
    const liveReferral = liveCustomer.referral || {};
    if (liveReferral.status === 'rewarded' || liveReferral.rewardStatus === 'rewarded') {
      t.create(eventRef, { transactionId, customerId: uid, amount, status: 'already_rewarded', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return { state: 'already_rewarded' };
    }

    const liveReferrer = referrerSnap.data() || {};
    if (!active(liveCustomer) || liveCustomer.role !== 'customer' || !active(liveReferrer) || liveReferrer.role !== 'customer') {
      t.create(eventRef, { transactionId, customerId: uid, amount, status: 'blocked', reason: 'inactive_account', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return { state: 'blocked' };
    }
    if (liveReferrerUidEquals(liveCustomer, referrerUid) === false) {
      t.create(eventRef, { transactionId, customerId: uid, amount, status: 'blocked', reason: 'referrer_mismatch', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return { state: 'blocked' };
    }

    const liveDeadline = qualificationDeadline(liveReferral, liveCustomer, config);
    if (liveDeadline && Date.now() > liveDeadline) {
      t.update(customerRef, {
        referral: {
          ...liveReferral,
          status: 'expired',
          rewardStatus: 'expired',
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
      t.create(eventRef, { transactionId, customerId: uid, amount, status: 'expired', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return { state: 'expired' };
    }

    const currentSpend = Math.max(0, number(liveReferral.qualifyingSpend));
    const newSpend = Math.round((currentSpend + amount) * 100) / 100;
    const minimum = config.referralMinimumSpend;
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (newSpend < minimum) {
      t.update(customerRef, {
        referral: {
          ...liveReferral,
          status: 'qualifying',
          qualifyingSpend: newSpend,
          minimumSpend: minimum,
          qualificationDeadlineAt: liveDeadline ? admin.firestore.Timestamp.fromMillis(liveDeadline) : null,
          lastQualifyingTransactionId: transactionId,
          lastQualifyingAt: now,
        },
      });
      t.create(eventRef, { transactionId, customerId: uid, amount, cumulativeSpend: newSpend, status: 'qualifying', createdAt: now });
      return { state: 'qualifying', spend: newSpend };
    }

    if (rewardSnap.exists) {
      const existing = rewardSnap.data() || {};
      t.update(customerRef, {
        referral: {
          ...liveReferral,
          status: 'qualified',
          qualifyingSpend: newSpend,
          minimumSpend: minimum,
          qualifiedAt: liveReferral.qualifiedAt || now,
          qualifyingTransactionId: liveReferral.qualifyingTransactionId || transactionId,
          rewardStatus: existing.status || 'pending',
          rewardAmount: Number(existing.amount || config.referralReward),
        },
      });
      t.create(eventRef, { transactionId, customerId: uid, amount, cumulativeSpend: newSpend, status: 'already_ledgered', createdAt: now });
      return { state: 'already_ledgered' };
    }

    const currentMonth = monthKey();
    const counter = counterSnap.exists ? counterSnap.data() || {} : {};
    const monthlyCount = counter.month === currentMonth ? Math.max(0, Math.round(number(counter.rewardedCount))) : 0;
    if (config.referralMonthlyCap > 0 && monthlyCount >= config.referralMonthlyCap) {
      t.update(customerRef, {
        referral: {
          ...liveReferral,
          status: 'qualified',
          qualifyingSpend: newSpend,
          minimumSpend: minimum,
          qualifiedAt: liveReferral.qualifiedAt || now,
          qualifyingTransactionId: liveReferral.qualifyingTransactionId || transactionId,
          rewardStatus: 'pending_cap',
          rewardAmount: config.referralReward,
        },
      });
      t.create(rewardRef, {
        uid: referrerUid,
        referredUid: uid,
        kind: 'referral',
        amount: config.referralReward,
        currency: 'MYR',
        sourceTransactionId: transactionId,
        reason: 'Referred customer completed the qualifying top-up',
        status: 'pending_cap',
        createdAt: now,
      });
      t.create(eventRef, { transactionId, customerId: uid, amount, cumulativeSpend: newSpend, status: 'pending_cap', createdAt: now });
      return { state: 'pending_cap' };
    }

    const rates = ratesSnap.exists ? ratesSnap.data() || {} : {};
    const referrerCurrency = inferWalletCurrency(liveReferrer);
    let rewardWallet;
    try {
      rewardWallet = walletAmountFromBase(config.referralReward, referrerCurrency, rates);
    } catch (err) {
      t.create(rewardRef, {
        uid: referrerUid,
        referredUid: uid,
        kind: 'referral',
        amount: config.referralReward,
        currency: 'MYR',
        sourceTransactionId: transactionId,
        reason: 'Referred customer completed the qualifying top-up',
        status: 'pending',
        error: String(err.message || err).slice(0, 200),
        createdAt: now,
      });
      t.update(customerRef, {
        referral: {
          ...liveReferral,
          status: 'qualified',
          qualifyingSpend: newSpend,
          minimumSpend: minimum,
          qualifiedAt: liveReferral.qualifiedAt || now,
          qualifyingTransactionId: liveReferral.qualifyingTransactionId || transactionId,
          rewardStatus: 'pending',
          rewardAmount: config.referralReward,
        },
      });
      t.create(eventRef, { transactionId, customerId: uid, amount, cumulativeSpend: newSpend, status: 'pending', createdAt: now });
      return { state: 'pending' };
    }

    const digits = ['IDR', 'KHR', 'MMK'].includes(rewardWallet.currency) ? 0 : 2;
    const currentBalance = number(liveReferrer.walletBalance);
    const balanceMinor = Math.round(currentBalance * (10 ** digits));
    const rewardMinor = Math.round(rewardWallet.amount * (10 ** digits));
    if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 0 || !Number.isSafeInteger(rewardMinor) || rewardMinor <= 0 || !Number.isSafeInteger(balanceMinor + rewardMinor)) {
      throw new Error('Referrer wallet balance is invalid.');
    }

    const nextBalance = (balanceMinor + rewardMinor) / (10 ** digits);
    const ledgerRef = rewardRef;
    t.update(referrerRef, {
      walletBalance: nextBalance,
      walletCurrency: rewardWallet.currency,
      walletBalanceCurrency: rewardWallet.currency,
      walletUpdatedAt: now,
    });
    t.create(ledgerRef, {
      uid: referrerUid,
      referredUid: uid,
      kind: 'referral',
      type: 'referral_reward',
      direction: 'credit',
      amount: rewardWallet.amount,
      amountMinor: rewardMinor,
      currency: rewardWallet.currency,
      baseAmountMyr: config.referralReward,
      fxRate: rewardWallet.fxRate,
      sourceTransactionId: transactionId,
      reason: 'Referral reward: referred customer completed RM50 qualifying top-up',
      status: 'rewarded',
      createdAt: now,
    });
    if (config.referralNewUserReward > 0) {
      const newUserRewardRef = db.collection('growthRewardLedger').doc(`referral_new_user_${uid}`);
      const newUserCurrency = inferWalletCurrency(liveCustomer);
      let newUserReward = walletAmountFromBase(config.referralNewUserReward, newUserCurrency, rates);
      const newDigits = ['IDR', 'KHR', 'MMK'].includes(newUserReward.currency) ? 0 : 2;
      const newBalanceMinor = Math.round(number(liveCustomer.walletBalance) * (10 ** newDigits));
      const newRewardMinor = Math.round(newUserReward.amount * (10 ** newDigits));
      if (!Number.isSafeInteger(newBalanceMinor) || newBalanceMinor < 0 || !Number.isSafeInteger(newRewardMinor) || newRewardMinor <= 0 || !Number.isSafeInteger(newBalanceMinor + newRewardMinor)) throw new Error('Referred customer wallet balance is invalid.');
      t.update(customerRef, {
        walletBalance: (newBalanceMinor + newRewardMinor) / (10 ** newDigits),
        walletCurrency: newUserReward.currency,
        walletBalanceCurrency: newUserReward.currency,
        walletUpdatedAt: now,
      });
      t.create(newUserRewardRef, {
        uid,
        referredUid: uid,
        referrerUid,
        kind: 'referral_new_user',
        type: 'referral_new_user_reward',
        direction: 'credit',
        amount: newUserReward.amount,
        amountMinor: newRewardMinor,
        currency: newUserReward.currency,
        baseAmountMyr: config.referralNewUserReward,
        fxRate: newUserReward.fxRate,
        sourceTransactionId: transactionId,
        reason: 'New customer referral reward after qualifying top-up',
        status: 'rewarded',
        createdAt: now,
      });
    }

    t.update(customerRef, {
      referral: {
        ...liveReferral,
        status: 'rewarded',
        qualifyingSpend: newSpend,
        minimumSpend: minimum,
        qualifiedAt: liveReferral.qualifiedAt || now,
        qualifyingTransactionId: liveReferral.qualifyingTransactionId || transactionId,
        rewardStatus: 'rewarded',
        rewardAmount: config.referralReward,
        rewardedAt: now,
        rewardLedgerId: rewardRef.id,
      },
    });
    t.set(counterRef, {
      month: currentMonth,
      rewardedCount: monthlyCount + 1,
      updatedAt: now,
    }, { merge: true });
    t.create(eventRef, { transactionId, customerId: uid, amount, cumulativeSpend: newSpend, status: 'rewarded', createdAt: now });

    return { state: 'rewarded', referrerUid, amount: config.referralReward };
  });

  return result;
}
function liveReferrerUidEquals(customer, referrerUid) {
  return String(customer?.referral?.referredBy || '').trim() === String(referrerUid || '').trim();
}

exports.handleCompletedTransaction = async (transactionId, tx) => {
  if (!tx || tx.status !== 'completed') return;
  const settingsSnap = await admin.firestore().collection('settings').doc('growth').get();
  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
  await updateReferralProgress(admin.firestore(), transactionId, tx, settings);

  // Keep the older optional first/welcome reward ledger behavior for existing
  // campaigns, but do not let it interfere with the referral reward.
  const service = String(tx.service || tx.chargedServiceKind || '').trim();
  const uid = String(tx.customerId || '').trim();
  if (!uid || !['Recharge', 'Internet', 'Bill Payment', 'Mobile Banking', 'Remittance'].includes(service)) return;
  const firstReward = Math.max(0, number(settings.firstTransactionReward));
  const welcomeReward = Math.max(0, number(settings.welcomeReward));
  if (!firstReward && !welcomeReward) return;

  const db = admin.firestore();
  const customerRef = db.collection('users').doc(uid);
  const customerSnap = await customerRef.get();
  if (!customerSnap.exists || !active(customerSnap.data())) return;
  const txAmount = amountFromTransaction(tx);
  const minimum = Math.max(0, number(settings.minimumTransaction));
  if (!txAmount || txAmount < minimum) return;

  const firstRef = db.collection('growthRewardLedger').doc(`first_${uid}`);
  const welcomeRef = db.collection('growthRewardLedger').doc(`welcome_${uid}`);
  const ordered = await db.collection('transactions').where('customerId', '==', uid).where('status', '==', 'completed').limit(100).get();
  const first = ordered.docs
    .slice()
    .sort((a, b) => timestampMillis(a.data()?.completedAt || a.data()?.createdAt) - timestampMillis(b.data()?.completedAt || b.data()?.createdAt))[0];
  if (!first || first.id !== transactionId) return;

  await db.runTransaction(async t => {
    const reads = await Promise.all([t.get(firstRef), t.get(welcomeRef)]);
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (firstReward > 0 && !reads[0].exists) {
      t.create(firstRef, { uid, kind: 'first_transaction', amount: firstReward, currency: 'MYR', sourceTransactionId: transactionId, reason: 'First qualifying transaction', status: 'pending', createdAt: now });
    }
    if (welcomeReward > 0 && !reads[1].exists) {
      t.create(welcomeRef, { uid, kind: 'welcome', amount: welcomeReward, currency: 'MYR', sourceTransactionId: transactionId, reason: 'New customer welcome reward', status: 'pending', createdAt: now });
    }
  });
};
