const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const MAX_DEVICE_ID_LENGTH = 100;
const MAX_SESSION_ID_LENGTH = 128;

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function requireString(value, maxLength, message) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new HttpsError('invalid-argument', message);
  }
  return value.trim();
}

function activeProfile(profile) {
  return !!profile &&
    profile.suspended !== true &&
    profile.inactive !== true &&
    profile.disabled !== true &&
    profile.active !== false &&
    profile.mergedInto == null;
}

exports.validateActiveSession = onCall({ enforceAppCheck: false }, async (request) => {
  const uid = requireAuth(request);
  const deviceId = requireString(request.data?.deviceId, MAX_DEVICE_ID_LENGTH, 'Missing or invalid device id.');
  const sessionId = requireString(request.data?.sessionId, MAX_SESSION_ID_LENGTH, 'Missing or invalid session id.');
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
  const profile = snap.data() || {};
  if (!activeProfile(profile)) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  if (profile.activeSessionId !== sessionId || profile.activeDeviceId !== deviceId) {
    throw new HttpsError('failed-precondition', 'This device session is no longer active. Please sign in again.');
  }
  return { valid: true };
});
