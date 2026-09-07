// PHASE 2 - MySheba Advertisement Feature Controls (Super Admin).
//
// The only writers of ad_settings/general and ad_feature_controls/{featureId}
// from the client's perspective, even though firestore.rules would also
// allow a superadmin to write those two collections directly (see the
// "PHASE 1 - Advertisement System" section of firestore.rules). Routed
// through callables instead of a direct client write so every change can
// be validated server-side AND logged to ad_audit_logs atomically -
// ad_audit_logs' own rule is `allow write: if false`, so a direct client
// write to ad_settings/ad_feature_controls would silently produce NO
// audit trail at all. logAdAudit (./logService.js) is the only writer of
// that collection, called from every function below after its Firestore
// write commits.
//
// Client call sites: src/firebase/adControlsService.js's updateAdSettings /
// updateAdFeatureControl / bulkUpdateAdFeatureControls.
//
// Security model: Super Admin ONLY (per the PHASE 2 brief's SECURITY
// section) - stricter than requireAdmin() in businessProfileService.js,
// which allows plain 'admin' too. A plain admin can still READ every ad
// collection (see firestore.rules), just never change these controls.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAdAudit, logServerError } = require('./logService');

const AD_SETTINGS_COLLECTION = 'ad_settings';
const AD_SETTINGS_DOC_ID = 'general';
const AD_FEATURE_CONTROLS_COLLECTION = 'ad_feature_controls';

// Mirrors FEATURE_IDS in src/constants/adFeatures.ts exactly - functions/
// is a separate deployable with no import path back into src/, so this
// list is intentionally duplicated here. Keep the two in sync by hand if
// a feature is ever added/removed.
const VALID_FEATURE_IDS = [
  'home',
  'mobile_recharge',
  'internet_package',
  'mobile_banking',
  'remittance',
  'air_ticket',
  'jobs',
  'accommodation',
  'buy_sell',
  'services',
  'community',
  'help_support',
];

// Mirrors AdSettings in src/types/ads.ts - the only fields
// AdFeatureControlsScreen's Global Controls section is allowed to change.
// defaultMaxImpressionsPerUser/defaultMaxClicksPerUser are deliberately
// left out - not exposed by this phase's screen, so not writable through
// it either.
const VALID_SETTINGS_FIELDS = [
  'adsEnabled',
  'directAdsEnabled',
  'admobEnabled',
  'bannerAdsEnabled',
  'nativeAdsEnabled',
  'interstitialAdsEnabled',
];

// Mirrors AdFeatureControl in src/types/ads.ts.
const VALID_FEATURE_CONTROL_FIELDS = ['adsEnabled', 'bannerEnabled', 'nativeEnabled', 'interstitialEnabled'];

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function requireSuperadmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || caller.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Only a Super Admin can manage advertisement controls.');
  }
  return caller;
}

/** Picks only the recognized boolean fields out of `changes`, validating
 * every value is actually a boolean. Throws invalid-argument on anything
 * unrecognized or non-boolean, rather than silently dropping/coercing it -
 * a superadmin control screen should never partially-apply a malformed
 * request without saying so. Returns null (not an empty object) if
 * nothing valid was in `changes`, so callers can tell "no-op" apart from
 * "everything filtered out". */
function pickValidBooleans(changes, allowedFields) {
  if (!changes || typeof changes !== 'object') return null;
  const picked = {};
  let any = false;
  Object.keys(changes).forEach((key) => {
    if (!allowedFields.includes(key)) {
      throw new HttpsError('invalid-argument', `Unknown field: ${key}`);
    }
    if (typeof changes[key] !== 'boolean') {
      throw new HttpsError('invalid-argument', `${key} must be true or false.`);
    }
    picked[key] = changes[key];
    any = true;
  });
  return any ? picked : null;
}

/**
 * Updates one or more Global Controls fields (Global Ads / Direct MySheba
 * Ads / Google AdMob / Banner Ads / Native Ads / Interstitial Ads) on
 * ad_settings/general. Creates the doc on first call (merge: true), same
 * "no separate ensure step" approach as setBusinessProfileStatus.
 * request.data: { changes: Partial<Pick<AdSettings, ...VALID_SETTINGS_FIELDS>> }
 */
exports.updateAdSettings = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireSuperadmin(db, callerUid);

  const changes = pickValidBooleans((request.data || {}).changes, VALID_SETTINGS_FIELDS);
  if (!changes) throw new HttpsError('invalid-argument', 'No valid settings changes were provided.');

  const ref = db.collection(AD_SETTINGS_COLLECTION).doc(AD_SETTINGS_DOC_ID);
  try {
    await ref.set(
      { ...changes, updatedBy: callerUid, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    await logServerError('updateAdSettings', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not update advertisement Global Controls.');
  }

  await logAdAudit({
    action: 'settings_change',
    targetType: 'ad_settings',
    targetId: AD_SETTINGS_DOC_ID,
    performedBy: callerUid,
    details: { changes, performedByRole: caller.role },
  });

  return { ok: true };
});

/**
 * Updates one feature's controls (Ads / Banner / Native / Interstitial)
 * on ad_feature_controls/{featureId}. Creates the doc on first call,
 * pre-filled with featureId/featureName so a partial doc is never left
 * without them.
 * request.data: { featureId: FeatureId, changes: Partial<Pick<AdFeatureControl, ...VALID_FEATURE_CONTROL_FIELDS>> }
 */
exports.updateAdFeatureControl = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireSuperadmin(db, callerUid);

  const { featureId } = request.data || {};
  if (!featureId || !VALID_FEATURE_IDS.includes(featureId)) {
    throw new HttpsError('invalid-argument', 'featureId is missing or not recognized.');
  }
  const changes = pickValidBooleans((request.data || {}).changes, VALID_FEATURE_CONTROL_FIELDS);
  if (!changes) throw new HttpsError('invalid-argument', 'No valid control changes were provided.');

  const ref = db.collection(AD_FEATURE_CONTROLS_COLLECTION).doc(featureId);
  try {
    await ref.set(
      {
        featureId,
        ...changes,
        updatedBy: callerUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    await logServerError('updateAdFeatureControl', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not update this feature\'s advertisement controls.');
  }

  await logAdAudit({
    action: 'settings_change',
    targetType: 'ad_feature_control',
    targetId: featureId,
    performedBy: callerUid,
    details: { changes, performedByRole: caller.role },
  });

  return { ok: true };
});

/**
 * Applies the same `changes` to every featureId in `featureIds` in one
 * batched write, with a single ad_audit_logs entry covering the whole
 * bulk action - backs the Enable All / Disable All buttons on
 * AdFeatureControlsScreen (client confirms with the user before calling
 * this; this function does not ask again).
 * request.data: { featureIds: FeatureId[], changes: Partial<Pick<AdFeatureControl, ...VALID_FEATURE_CONTROL_FIELDS>> }
 */
exports.bulkUpdateAdFeatureControls = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireSuperadmin(db, callerUid);

  const { featureIds } = request.data || {};
  if (!Array.isArray(featureIds) || featureIds.length === 0) {
    throw new HttpsError('invalid-argument', 'featureIds must be a non-empty array.');
  }
  const uniqueIds = Array.from(new Set(featureIds));
  const unknown = uniqueIds.filter((id) => !VALID_FEATURE_IDS.includes(id));
  if (unknown.length) {
    throw new HttpsError('invalid-argument', `Unknown featureId(s): ${unknown.join(', ')}`);
  }
  const changes = pickValidBooleans((request.data || {}).changes, VALID_FEATURE_CONTROL_FIELDS);
  if (!changes) throw new HttpsError('invalid-argument', 'No valid control changes were provided.');

  try {
    const batch = db.batch();
    uniqueIds.forEach((featureId) => {
      const ref = db.collection(AD_FEATURE_CONTROLS_COLLECTION).doc(featureId);
      batch.set(
        ref,
        {
          featureId,
          ...changes,
          updatedBy: callerUid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  } catch (err) {
    await logServerError('bulkUpdateAdFeatureControls', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not apply this bulk advertisement control change.');
  }

  await logAdAudit({
    action: 'settings_change',
    targetType: 'ad_feature_control',
    targetId: 'bulk',
    performedBy: callerUid,
    details: { changes, featureIds: uniqueIds, performedByRole: caller.role },
  });

  return { ok: true };
});
