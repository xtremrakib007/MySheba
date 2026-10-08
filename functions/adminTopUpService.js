const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { assertWalletUnfrozen } = require('./walletFreeze');

// Kept as an explicit policy marker for legacy clients/tests. The callable
// itself is disabled: even superadmin cannot mint wallet value directly.
const INSTANT_TOPUP_ROLES = ['superadmin'];

exports.adminTopUpPoints = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const snap = await db.collection('users').doc(request.auth.uid).get();
  const profile = snap.exists ? (snap.data() || {}) : null;
  if (!profile || profile.disabled === true || profile.suspended === true || profile.inactive === true || profile.active === false) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  assertWalletUnfrozen(profile, 'Your wallet');
  throw new HttpsError(
    'failed-precondition',
    'Direct administrative wallet credit is disabled. Use the approved wallet funding workflow.'
  );
});
