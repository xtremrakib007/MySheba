const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { logAudit } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const DEFAULT_GROWTH_CONFIG = {
  referralEnabled: true,
  referralReward: 5,
  referralNewUserReward: 0,
  referralMinimumSpend: 50,
  referralQualificationDays: 30,
  referralMonthlyCap: 0,
  firstTransactionReward: 0,
  welcomeReward: 0,
  minimumTransaction: 0,
};

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}
function activeProfile(u) {
  return u && u.active !== false && u.disabled !== true && u.suspended !== true && u.inactive !== true && !u.mergedInto;
}
function makeCode(uid) {
  return 'MS' + crypto.createHash('sha256').update(String(uid)).digest('hex').slice(0, 8).toUpperCase();
}
async function staff(uid, roles = ['admin', 'superadmin']) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  const p = snap.exists ? snap.data() : null;
  if (!p || !roles.includes(String(p.role || '').toLowerCase()) || !activeProfile(p)) {
    throw new HttpsError('permission-denied', 'You do not have access to Growth Center.');
  }
  return p;
}
function cleanText(v, max = 160) { return String(v || '').trim().slice(0, max); }
function money(v, max = 10000) { return Math.max(0, Math.min(max, Number(v) || 0)); }
function integer(v, min, max) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
function normalizeGrowthConfig(d = {}) {
  return {
    referralEnabled: d.referralEnabled !== false,
    referralReward: Number.isFinite(Number(d.referralReward)) ? money(d.referralReward) : DEFAULT_GROWTH_CONFIG.referralReward,
    referralNewUserReward: Number.isFinite(Number(d.referralNewUserReward)) ? money(d.referralNewUserReward) : DEFAULT_GROWTH_CONFIG.referralNewUserReward,
    referralMinimumSpend: Number.isFinite(Number(d.referralMinimumSpend)) ? money(d.referralMinimumSpend, 100000) : DEFAULT_GROWTH_CONFIG.referralMinimumSpend,
    referralQualificationDays: integer(d.referralQualificationDays, 1, 365) || DEFAULT_GROWTH_CONFIG.referralQualificationDays,
    referralMonthlyCap: integer(d.referralMonthlyCap, 0, 100000) || DEFAULT_GROWTH_CONFIG.referralMonthlyCap,
    firstTransactionReward: Number.isFinite(Number(d.firstTransactionReward)) ? money(d.firstTransactionReward) : DEFAULT_GROWTH_CONFIG.firstTransactionReward,
    welcomeReward: Number.isFinite(Number(d.welcomeReward)) ? money(d.welcomeReward) : DEFAULT_GROWTH_CONFIG.welcomeReward,
    minimumTransaction: Number.isFinite(Number(d.minimumTransaction)) ? money(d.minimumTransaction, 100000) : DEFAULT_GROWTH_CONFIG.minimumTransaction,
    updatedAt: d.updatedAt || null,
  };
}
function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function referralView(doc, config) {
  const d = doc.data() || {};
  const r = d.referral || {};
  const spend = Math.max(0, Number(r.qualifyingSpend) || 0);
  const minimum = Math.max(0, Number(r.minimumSpend ?? config.referralMinimumSpend) || 0);
  const remaining = Math.max(0, minimum - spend);
  const deadlineMs = timestampMillis(r.qualificationDeadlineAt);
  return {
    uid: doc.id,
    name: String(d.name || d.displayName || 'MySheba User').slice(0, 120),
    status: String(r.status || 'registered'),
    qualifyingSpend: spend,
    minimumSpend: minimum,
    remainingSpend: remaining,
    progressPercent: minimum > 0 ? Math.min(100, Math.round((spend / minimum) * 100)) : 100,
    qualificationDeadlineAt: deadlineMs || null,
    rewardStatus: String(r.rewardStatus || ''),
    rewardAmount: Number(r.rewardAmount || 0),
    qualifiedAt: timestampMillis(r.qualifiedAt) || null,
    rewardedAt: timestampMillis(r.rewardedAt) || null,
    fraudReview: r.fraudReview === true,
  };
}

exports.getReferralInfo = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists || !activeProfile(snap.data())) throw new HttpsError('permission-denied', 'Your account is not active.');

  const settingsSnap = await db.collection('settings').doc('growth').get();
  const config = normalizeGrowthConfig(settingsSnap.exists ? settingsSnap.data() : {});
  let code = String(snap.data().referralCode || '').trim().toUpperCase();
  if (!/^MS[A-F0-9]{8}$/.test(code)) {
    code = makeCode(uid);
    await ref.update({ referralCode: code });
  }

  const invited = await db.collection('users')
    .where('referral.referredBy', '==', uid)
    .limit(100)
    .get();

  const referrals = invited.docs
    .map(doc => referralView(doc, config))
    .sort((a, b) => (b.qualifiedAt || b.rewardedAt || 0) - (a.qualifiedAt || a.rewardedAt || 0));

  return {
    enabled: config.referralEnabled,
    code,
    reward: config.referralReward,
    newUserReward: config.referralNewUserReward,
    minimumSpend: config.referralMinimumSpend,
    qualificationDays: config.referralQualificationDays,
    inviteCount: referrals.length,
    qualifiedCount: referrals.filter(x => x.status === 'qualified' || x.status === 'rewarded').length,
    rewardedCount: referrals.filter(x => x.rewardStatus === 'rewarded').length,
    referrals,
  };
});

exports.getGrowthConfig = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request); await staff(uid);
  const snap = await admin.firestore().collection('settings').doc('growth').get();
  return normalizeGrowthConfig(snap.exists ? snap.data() : {});
});

exports.saveGrowthConfig = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request); await staff(uid, ['superadmin']);
  const d = request.data || {};
  const clean = {
    referralEnabled: d.referralEnabled !== false,
    referralReward: money(d.referralReward, 10000),
    referralNewUserReward: money(d.referralNewUserReward, 10000),
    referralMinimumSpend: money(d.referralMinimumSpend, 100000),
    referralQualificationDays: integer(d.referralQualificationDays, 1, 365),
    referralMonthlyCap: integer(d.referralMonthlyCap, 0, 100000),
    firstTransactionReward: money(d.firstTransactionReward),
    welcomeReward: money(d.welcomeReward),
    minimumTransaction: money(d.minimumTransaction, 100000),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: uid,
  };
  if (clean.referralReward <= 0 && clean.referralEnabled) {
    throw new HttpsError('invalid-argument', 'Referral reward must be greater than zero when the referral program is enabled.');
  }
  if (clean.referralMinimumSpend <= 0 && clean.referralEnabled) {
    throw new HttpsError('invalid-argument', 'Referral minimum spend must be greater than zero when the referral program is enabled.');
  }
  await admin.firestore().collection('settings').doc('growth').set(clean, { merge: true });
  await logAudit({ action: 'growth_config_updated', targetUid: null, performedBy: uid, performedByRole: 'superadmin', details: clean });
  return { saved: true };
});

exports.listGrowthCampaigns = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request); await staff(uid);
  const snap = await admin.firestore().collection('growthCampaigns').orderBy('updatedAt', 'desc').limit(100).get();
  return { campaigns: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
});

exports.saveGrowthCampaign = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request); await staff(uid, ['superadmin']);
  const d = request.data || {};
  const id = cleanText(d.id, 64).replace(/[^A-Za-z0-9_-]/g, '') || crypto.randomBytes(8).toString('hex');
  const code = cleanText(d.code, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!cleanText(d.name, 80)) throw new HttpsError('invalid-argument', 'Campaign name is required.');
  if (code && code.length < 4) throw new HttpsError('invalid-argument', 'Promo code must be at least 4 characters.');
  const start = d.startAt ? new Date(d.startAt) : null;
  const end = d.endAt ? new Date(d.endAt) : null;
  if (start && Number.isNaN(start.getTime())) throw new HttpsError('invalid-argument', 'Campaign start date is invalid.');
  if (end && Number.isNaN(end.getTime())) throw new HttpsError('invalid-argument', 'Campaign end date is invalid.');
  if (start && end && end <= start) throw new HttpsError('invalid-argument', 'Campaign end must be after start.');
  const doc = {
    name: cleanText(d.name, 80), code, type: ['promo', 'referral', 'acquisition'].includes(d.type) ? d.type : 'promo',
    active: d.active !== false, rewardAmount: money(d.rewardAmount), minimumTransaction: money(d.minimumTransaction, 100000),
    service: cleanText(d.service, 60), audience: cleanText(d.audience, 120),
    startAt: start ? admin.firestore.Timestamp.fromDate(start) : null,
    endAt: end ? admin.firestore.Timestamp.fromDate(end) : null,
    budget: money(d.budget, 1000000), updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: uid,
  };
  await admin.firestore().collection('growthCampaigns').doc(id).set(doc, { merge: true });
  await logAudit({ action: 'growth_campaign_saved', targetUid: null, performedBy: uid, performedByRole: 'superadmin', details: { id, ...doc } });
  return { saved: true, id };
});

exports.deleteGrowthCampaign = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request); await staff(uid, ['superadmin']);
  const id = cleanText(request.data?.id, 64);
  if (!id) throw new HttpsError('invalid-argument', 'Campaign ID is required.');
  await admin.firestore().collection('growthCampaigns').doc(id).delete();
  await logAudit({ action: 'growth_campaign_deleted', targetUid: null, performedBy: uid, performedByRole: 'superadmin', details: { id } });
  return { deleted: true };
});

exports.getGrowthDashboard = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request); await staff(uid);
  const db = admin.firestore();
  const count = async (q) => { try { return (await q.count().get()).data().count || 0; } catch (_) { return 0; } };
  const [users, customers, completed, qualified, rewarded, pendingRewards, campaigns] = await Promise.all([
    count(db.collection('users')), count(db.collection('users').where('role', '==', 'customer')),
    count(db.collection('transactions').where('status', '==', 'completed')),
    count(db.collection('users').where('referral.status', '==', 'qualified')),
    count(db.collection('growthRewardLedger').where('kind', '==', 'referral').where('status', '==', 'rewarded')),
    count(db.collection('growthRewardLedger').where('status', 'in', ['pending', 'pending_cap'])),
    count(db.collection('growthCampaigns').where('active', '==', true)),
  ]);
  return { users, customers, completedTransactions: completed, qualifiedReferrals: qualified, rewardedReferrals: rewarded, pendingRewards, activeCampaigns: campaigns };
});
