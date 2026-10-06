// PHASE 2 - MySheba Advertisement Feature Controls (Super Admin).
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const admin = require('firebase-admin');
const { logAdAudit, logServerError } = require('./logService');

const AD_SETTINGS_COLLECTION = 'ad_settings';
const AD_SETTINGS_DOC_ID = 'general';
const AD_FEATURE_CONTROLS_COLLECTION = 'ad_feature_controls';
const VALID_FEATURE_IDS = ['home','mobile_recharge','internet_package','mobile_banking','remittance','air_ticket','jobs','buy_sell','services','help_support'];

// Not every Global Control is a switch any more. The AdMob banner unit id is
// a string, and it lives here - in Firestore, behind this audit-logged
// callable - rather than in the native build config on purpose: the AdMob APP
// id has to be baked into AndroidManifest and needs a new build to change,
// while this one can be set, corrected or cleared from the app.
//
// ITS SHAPE IS WORTH CHECKING HARD. An AdMob app id and an ad unit id are
// pasted off the same console page and differ by one character -
//
//   app id       ca-app-pub-5028998697615030~7504898532    (tilde)
//   ad unit id   ca-app-pub-5028998697615030/1234567890    (slash)
//
// - and the app id in this field is not an error anyone would see. It is a
// banner slot that silently never fills, which gets reported weeks later as
// "the ads do not work". So it is rejected here, at the only write path.
const AD_UNIT_ID_PATTERN = /^ca-app-pub-\d{16}\/\d{10}$/;
const SETTINGS_FIELD_TYPES = {
  adsEnabled: 'boolean',
  directAdsEnabled: 'boolean',
  bannerAdsEnabled: 'boolean',
  nativeAdsEnabled: 'boolean',
  interstitialAdsEnabled: 'boolean',
  admobEnabled: 'boolean',
  admobBannerUnitId: 'adUnitId',
};
const VALID_FEATURE_CONTROL_FIELDS = ['adsEnabled','bannerEnabled','nativeEnabled','interstitialEnabled'];

function requireAuth(request) { if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.'); return request.auth.uid; }
async function requireSuperadmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || caller.role !== 'superadmin') throw new HttpsError('permission-denied', 'Only a Super Admin can manage advertisement controls.');
  if (caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) throw new HttpsError('permission-denied', 'Your account is not active.');
  return caller;
}
// The Global Controls, which are no longer all booleans. Same contract as
// pickValidBooleans below - unknown field or wrong type throws, nothing is
// coerced - just with a type per field.
function pickValidSettings(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  const picked = {};
  let any = false;
  Object.keys(changes).forEach((key) => {
    const type = SETTINGS_FIELD_TYPES[key];
    if (!type) throw new HttpsError('invalid-argument', `Unknown field: ${key}`);
    const value = changes[key];
    if (type === 'boolean') {
      if (typeof value !== 'boolean') throw new HttpsError('invalid-argument', `${key} must be true or false.`);
      picked[key] = value;
    } else {
      if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${key} must be text.`);
      const trimmed = value.trim();
      // '' is how the field is cleared, and clearing it turns AdMob off for
      // the slot rather than leaving a half-configured one behind.
      if (trimmed && !AD_UNIT_ID_PATTERN.test(trimmed)) {
        throw new HttpsError(
          'invalid-argument',
          'That is not an AdMob banner ad unit id. It looks like ca-app-pub-0000000000000000/0000000000 - note the slash. An id with a ~ in it is the app id, which is set in the app build, not here.',
        );
      }
      picked[key] = trimmed;
    }
    any = true;
  });
  return any ? picked : null;
}

function pickValidBooleans(changes, allowedFields) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  const picked = {};
  let any = false;
  Object.keys(changes).forEach((key) => { if (!allowedFields.includes(key)) throw new HttpsError('invalid-argument', `Unknown field: ${key}`); if (typeof changes[key] !== 'boolean') throw new HttpsError('invalid-argument', `${key} must be true or false.`); picked[key] = changes[key]; any = true; });
  return any ? picked : null;
}

exports.updateAdSettings = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const callerUid = requireAuth(request); const db = admin.firestore(); const caller = await requireSuperadmin(db, callerUid);
  const changes = pickValidSettings((request.data || {}).changes);
  if (!changes) throw new HttpsError('invalid-argument', 'No valid settings changes were provided.');
  const ref = db.collection(AD_SETTINGS_COLLECTION).doc(AD_SETTINGS_DOC_ID);
  try { await db.runTransaction(async (tx) => { const callerSnap = await tx.get(db.collection('users').doc(callerUid)); const currentCaller = callerSnap.exists ? callerSnap.data() : null; if (!currentCaller || currentCaller.role !== 'superadmin' || currentCaller.suspended === true || currentCaller.inactive === true || currentCaller.disabled === true || currentCaller.active === false || currentCaller.mergedInto) throw new HttpsError('permission-denied','Your account can no longer manage advertisement controls.'); tx.set(ref, { ...changes, updatedBy: callerUid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); }); } catch (err) { if (err instanceof HttpsError) throw err; await logServerError('updateAdSettings', err, { userId: callerUid }); throw new HttpsError('internal', 'Could not update advertisement Global Controls.'); }
  await logAdAudit({ action:'settings_change', targetType:'ad_settings', targetId:AD_SETTINGS_DOC_ID, performedBy:callerUid, details:{changes, performedByRole:caller.role} });
  return { ok:true };
});

exports.updateAdFeatureControl = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const callerUid = requireAuth(request); const db = admin.firestore(); const caller = await requireSuperadmin(db, callerUid);
  const { featureId } = request.data || {};
  if (!featureId || !VALID_FEATURE_IDS.includes(featureId)) throw new HttpsError('invalid-argument', 'featureId is missing or not recognized.');
  const changes = pickValidBooleans((request.data || {}).changes, VALID_FEATURE_CONTROL_FIELDS);
  if (!changes) throw new HttpsError('invalid-argument', 'No valid control changes were provided.');
  const ref = db.collection(AD_FEATURE_CONTROLS_COLLECTION).doc(featureId);
  try { await db.runTransaction(async (tx) => { const callerSnap = await tx.get(db.collection('users').doc(callerUid)); const currentCaller = callerSnap.exists ? callerSnap.data() : null; if (!currentCaller || currentCaller.role !== 'superadmin' || currentCaller.suspended === true || currentCaller.inactive === true || currentCaller.disabled === true || currentCaller.active === false || currentCaller.mergedInto) throw new HttpsError('permission-denied','Your account can no longer manage advertisement controls.'); tx.set(ref, { featureId, ...changes, updatedBy:callerUid, updatedAt:admin.firestore.FieldValue.serverTimestamp() }, { merge:true }); }); } catch (err) { if (err instanceof HttpsError) throw err; await logServerError('updateAdFeatureControl', err, {userId:callerUid}); throw new HttpsError('internal', 'Could not update this feature\'s advertisement controls.'); }
  await logAdAudit({ action:'settings_change', targetType:'ad_feature_control', targetId:featureId, performedBy:callerUid, details:{changes, performedByRole:caller.role} });
  return {ok:true};
});

exports.bulkUpdateAdFeatureControls = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const callerUid = requireAuth(request); const db = admin.firestore(); const caller = await requireSuperadmin(db, callerUid);
  const { featureIds } = request.data || {};
  if (!Array.isArray(featureIds) || featureIds.length === 0 || featureIds.length > VALID_FEATURE_IDS.length) throw new HttpsError('invalid-argument', 'featureIds must be a non-empty array within the supported feature limit.');
  const uniqueIds = Array.from(new Set(featureIds));
  const unknown = uniqueIds.filter((id) => !VALID_FEATURE_IDS.includes(id));
  if (unknown.length) throw new HttpsError('invalid-argument', `Unknown featureId(s): ${unknown.join(', ')}`);
  const changes = pickValidBooleans((request.data || {}).changes, VALID_FEATURE_CONTROL_FIELDS);
  if (!changes) throw new HttpsError('invalid-argument', 'No valid control changes were provided.');
  try {
    await db.runTransaction(async (tx) => { const callerSnap = await tx.get(db.collection('users').doc(callerUid)); const currentCaller = callerSnap.exists ? callerSnap.data() : null; if (!currentCaller || currentCaller.role !== 'superadmin' || currentCaller.suspended === true || currentCaller.inactive === true || currentCaller.disabled === true || currentCaller.active === false || currentCaller.mergedInto) throw new HttpsError('permission-denied','Your account can no longer manage advertisement controls.'); uniqueIds.forEach((featureId) => tx.set(db.collection(AD_FEATURE_CONTROLS_COLLECTION).doc(featureId), {featureId,...changes,updatedBy:callerUid,updatedAt:admin.firestore.FieldValue.serverTimestamp()}, {merge:true})); });
  } catch (err) { if (err instanceof HttpsError) throw err; await logServerError('bulkUpdateAdFeatureControls', err, {userId:callerUid}); throw new HttpsError('internal', 'Could not apply this bulk advertisement control change.'); }
  await logAdAudit({ action:'settings_change', targetType:'ad_feature_control', targetId:'bulk', performedBy:callerUid, details:{changes,featureIds:uniqueIds,performedByRole:caller.role} });
  return {ok:true};
});