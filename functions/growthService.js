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

exports.getReferralInfo = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists || !activeProfile(snap.data())) throw new HttpsError('permission-denied', 'Your account is not active.');

  let code = String(snap.data().referralCode || '').trim().toUpperCase();
  if (!/^MS[A-F0-9]{8}$/.test(code)) {
    code = makeCode(uid);
    await ref.update({ referralCode: code });
  }

  const invited = await db.collection('users').where('referral.referredBy', '==', uid).limit(100).get();
  let qualified = 0;
  invited.forEach((d) => {
    if (d.data()?.referral?.status === 'qualified') qualified += 1;
  });
  return { code, inviteCount: invited.size, qualifiedCount: qualified };
});

exports.getGrowthConfig = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const u = await db.collection('users').doc(uid).get();
  if (!u.exists || !['admin', 'superadmin'].includes(String(u.data()?.role || '').toLowerCase())) {
    throw new HttpsError('permission-denied', 'Only admins can view growth settings.');
  }
  const snap = await db.collection('settings').doc('growth').get();
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
  const uid = requireAuth(request);
  const db = admin.firestore();
  const u = await db.collection('users').doc(uid).get();
  if (!u.exists || String(u.data()?.role || '').toLowerCase() !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Only superadmin can change growth settings.');
  }
  const d = request.data || {};
  const clean = {
    referralEnabled: d.referralEnabled !== false,
    referralReward: Math.max(0, Math.min(10000, Number(d.referralReward) || 0)),
    firstTransactionReward: Math.max(0, Math.min(10000, Number(d.firstTransactionReward) || 0)),
    welcomeReward: Math.max(0, Math.min(10000, Number(d.welcomeReward) || 0)),
    minimumTransaction: Math.max(0, Math.min(100000, Number(d.minimumTransaction) || 0)),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: uid,
  };
  await db.collection('settings').doc('growth').set(clean, { merge: true });
  await logAudit({ action: 'growth_config_updated', targetUid: null, performedBy: uid, performedByRole: 'superadmin', details: clean });
  return { saved: true };
});