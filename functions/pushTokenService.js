const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

function isValidExpoToken(token) {
  return typeof token === 'string' && token.length <= 256 && /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

function isValidFcmToken(token) {
  return typeof token === 'string' && token.length >= 20 && token.length <= 4096 && /^[A-Za-z0-9_:\-.]+$/.test(token);
}

function active(profile) {
  return profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto;
}

exports.registerPushToken = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  const { token, tokenType, platform } = request.data || {};
  if (!['expo', 'fcm'].includes(tokenType)) throw new HttpsError('invalid-argument', 'Invalid push token type.');
  if (tokenType === 'expo' ? !isValidExpoToken(token) : !isValidFcmToken(token)) {
    throw new HttpsError('invalid-argument', 'Invalid push token.');
  }
  const db = admin.firestore();
  const ref = db.collection('users').doc(request.auth.uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !active(snap.data())) throw new HttpsError('permission-denied', 'Account is not active.');
    const field = tokenType === 'expo' ? 'pushToken' : 'fcmToken';
    const data = { [field]: token, pushPlatform: typeof platform === 'string' && platform.length <= 32 ? platform : 'unknown', pushTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp() };
    tx.update(ref, data);
  });
  return { ok: true };
});
