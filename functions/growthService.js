const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { logAudit } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

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
async function staff(uid, roles = ['admin','superadmin']) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  const p = snap.exists ? snap.data() : null;
  if (!p || !roles.includes(String(p.role || '').toLowerCase()) || !activeProfile(p)) {
    throw new HttpsError('permission-denied', 'You do not have access to Growth Center.');
  }
  return p;
}
function cleanText(v, max = 160) { return String(v || '').trim().slice(0, max); }
function money(v, max = 10000) { return Math.max(0, Math.min(max, Number(v) || 0)); }

exports.getReferralInfo = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists || !activeProfile(snap.data())) throw new HttpsError('permission-denied', 'Your account is not active.');
  let code = String(snap.data().referralCode || '').trim().toUpperCase();
  if (!/^MS[A-F0-9]{8}$/.test(code)) { code = makeCode(uid); await ref.update({ referralCode: code }); }
  const invited = await db.collection('users').where('referral.referredBy', '==', uid).limit(100).get();
  let qualified = 0;
  invited.forEach((d) => { if (d.data()?.referral?.status === 'qualified') qualified += 1; });
  return { code, inviteCount: invited.size, qualifiedCount: qualified };
});

exports.getGrowthConfig = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request); await staff(uid);
  const snap = await admin.firestore().collection('settings').doc('growth').get();
  const d = snap.exists ? snap.data() : {};
  return {
    referralEnabled: d.referralEnabled !== false,
    referralReward: Number.isFinite(Number(d.referralReward)) ? Number(d.referralReward) : 0,
    firstTransactionReward: Number.isFinite(Number(d.firstTransactionReward)) ? Number(d.firstTransactionReward) : 0,
    welcomeReward: Number.isFinite(Number(d.welcomeReward)) ? Number(d.welcomeReward) : 0,
    minimumTransaction: Number.isFinite(Number(d.minimumTransaction)) ? Number(d.minimumTransaction) : 0,
    updatedAt: d.updatedAt || null,
  };
});

exports.saveGrowthConfig = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request); await staff(uid, ['superadmin']);
  const d = request.data || {};
  const clean = {
    referralEnabled: d.referralEnabled !== false,
    referralReward: money(d.referralReward),
    firstTransactionReward: money(d.firstTransactionReward),
    welcomeReward: money(d.welcomeReward),
    minimumTransaction: money(d.minimumTransaction, 100000),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: uid,
  };
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
    name: cleanText(d.name, 80), code, type: ['promo','referral','acquisition'].includes(d.type) ? d.type : 'promo',
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
  const [users, customers, completed, qualified, pendingRewards, campaigns] = await Promise.all([
    count(db.collection('users')), count(db.collection('users').where('role','==','customer')),
    count(db.collection('transactions').where('status','==','completed')),
    count(db.collection('users').where('referral.status','==','qualified')),
    count(db.collection('growthRewardLedger').where('status','==','pending')),
    count(db.collection('growthCampaigns').where('active','==',true)),
  ]);
  return { users, customers, completedTransactions: completed, qualifiedReferrals: qualified, pendingRewards, activeCampaigns: campaigns };
});
