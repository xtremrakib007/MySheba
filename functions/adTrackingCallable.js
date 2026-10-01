const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { checkVelocity, checkAnonymousAdVelocity, getClientIp } = require('./rateLimitService');

const PLACEMENTS = new Set([
  'HOME_TOP','HOME_MIDDLE','HOME_BOTTOM','RECHARGE_TOP','RECHARGE_BOTTOM','INTERNET_TOP','INTERNET_BOTTOM',
  'MOBILE_BANKING_TOP','MOBILE_BANKING_BOTTOM','REMITTANCE_TOP','REMITTANCE_BOTTOM','FLIGHT_TOP','FLIGHT_BOTTOM',
  'JOBS_TOP','JOBS_BOTTOM','ACCOMMODATION_TOP','ACCOMMODATION_BOTTOM','BUY_SELL_TOP','BUY_SELL_BOTTOM',
  'SERVICES_TOP','SERVICES_BOTTOM','COMMUNITY_TOP','COMMUNITY_BOTTOM','HELP_SUPPORT_TOP','HELP_SUPPORT_BOTTOM'
]);
const FEATURES = new Set(['home','mobile_recharge','internet_package','mobile_banking','remittance','air_ticket','jobs','accommodation','buy_sell','services','community','help_support']);
const AD_TYPES = new Set(['banner','native','interstitial','sponsored']);
const CLICK_ACTIONS = new Set(['none','url','internal','whatsapp','phone']);
const MAX = { adId:128, campaignId:128, placementId:64, feature:64, sessionId:128 };

function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function activeProfile(profile) { return !!profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && profile.active !== false && !profile.mergedInto; }

exports.recordAdEvent = onCall({ enforceAppCheck: true }, async (request) => {
  const data = request.data || {};
  const kind = data.kind === 'click' ? 'click' : data.kind === 'impression' ? 'impression' : null;
  if (!kind) throw new HttpsError('invalid-argument', 'Invalid ad event type.');

  const adId = text(data.adId, MAX.adId);
  const campaignId = text(data.campaignId, MAX.campaignId);
  const placementId = text(data.placementId, MAX.placementId);
  const feature = text(data.feature, MAX.feature);
  const sessionId = text(data.sessionId, MAX.sessionId);
  const adType = text(data.adType, 32).toLowerCase() || 'banner';
  const clickAction = text(data.clickAction, 32).toLowerCase() || 'none';
  if (!adId || !PLACEMENTS.has(placementId) || !FEATURES.has(feature) || !sessionId || !AD_TYPES.has(adType)) {
    throw new HttpsError('invalid-argument', 'Invalid ad event data.');
  }
  if (kind === 'click' && !CLICK_ACTIONS.has(clickAction)) throw new HttpsError('invalid-argument', 'Invalid click action.');

  const db = admin.firestore();
  const ip = getClientIp(request);
  const uid = request.auth?.uid || null;
  if (uid) {
    const profileSnap = await db.collection('users').doc(uid).get();
    if (!activeProfile(profileSnap.exists ? profileSnap.data() : null)) throw new HttpsError('permission-denied', 'Your account is not active.');
    await checkVelocity(db, uid, kind === 'click' ? 'ad_click' : 'ad_impression', { ip });
  } else {
    await checkAnonymousAdVelocity(db, ip, kind === 'click' ? 'ad_click' : 'ad_impression');
  }

  const adSnap = await db.collection('advertisements').doc(adId).get();
  if (!adSnap.exists) return { ok: false };
  const ad = adSnap.data() || {};
  if (ad.status !== 'active') return { ok: false };
  if (Array.isArray(ad.placements) && !ad.placements.includes(placementId)) return { ok: false };
  if (ad.campaignId && campaignId !== ad.campaignId) return { ok: false };
  if (String(ad.adType || 'banner').toLowerCase() !== adType) return { ok: false };

  const nowMs = Date.now();
  const startMs = ad.startAt && typeof ad.startAt.toMillis === 'function' ? ad.startAt.toMillis() : null;
  const endMs = ad.endAt && typeof ad.endAt.toMillis === 'function' ? ad.endAt.toMillis() : null;
  if (startMs !== null && nowMs < startMs) return { ok: false };
  if (endMs !== null && nowMs >= endMs) return { ok: false };

  // A client retry can otherwise create a fresh event document every time.
  // Make the same ad/session/action within one 30-second bucket idempotent.
  const bucket = Math.floor(nowMs / 30000);
  const eventKey = crypto.createHash('sha256')
    .update(`${kind}|${adId}|${placementId}|${feature}|${sessionId}|${bucket}`)
    .digest('hex');
  const ref = db.collection(kind === 'click' ? 'ad_clicks' : 'ad_impressions').doc(eventKey);
  const existing = await ref.get();
  if (existing.exists) return { ok: true, duplicate: true };
  const payload = { adId, campaignId: campaignId || ad.campaignId || null, placementId, feature, adType, sessionId, createdAt: admin.firestore.FieldValue.serverTimestamp() };
  if (uid) payload.userId = uid;
  if (kind === 'click') payload.clickAction = clickAction;
  try {
    await ref.create(payload);
  } catch (err) {
    if (err?.code === 6 || err?.code === 'already-exists') return { ok: true, duplicate: true };
    throw err;
  }
  return { ok: true };
});
