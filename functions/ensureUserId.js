// Backfills a unique numeric userId onto accounts that predate this
// feature (created before assignUniqueUserId existed in older registration
// or user-management paths). Called lazily by the client right after a
// normal phone+PIN login when the fetched profile has no userId yet - see
// src/firebase/authService.js login(). A no-op (just echoes back the existing
// one) for every account created after this shipped, since those already got
// a userId at creation time.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assignUniqueUserId } = require('./userId');
const { logServerError } = require('./logService');

exports.ensureUserId = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = request.auth.uid;
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Profile not found.');
  }
  const existing = snap.data().userId;
  if (existing) return { uid, userId: existing };

  try {
    const userId = await assignUniqueUserId(db, uid);
    await ref.update({ userId });
    return { uid, userId };
  } catch (err) {
    await logServerError('ensureUserId', err, { userId: uid });
    throw new HttpsError('internal', 'Could not assign a user ID.');
  }
});
