// Backfills a unique numeric userId onto accounts that predate this
// feature. Called lazily by the client after login when the profile has no
// userId yet. Existing accounts are returned unchanged.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assignUniqueUserId } = require('./userId');
const { logServerError } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

exports.ensureUserId = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
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

  let reservedUserId = null;
  try {
    reservedUserId = await assignUniqueUserId(db, uid);
    // Do not blindly overwrite a value assigned concurrently by another
    // invocation. A transaction makes the lazy backfill race-safe.
    const result = await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists) throw new HttpsError('not-found', 'Profile not found.');
      const currentUserId = current.data()?.userId;
      if (currentUserId) return currentUserId;
      tx.update(ref, { userId: reservedUserId });
      return reservedUserId;
    });

    // If another invocation won the race while this invocation was reserving
    // an ID, release the reservation created by this invocation. Likewise,
    // only the reservation whose uid matches ours may be removed.
    if (result !== reservedUserId) {
      const idRef = db.collection('userIds').doc(String(reservedUserId));
      await db.runTransaction(async (tx) => {
        const idSnap = await tx.get(idRef);
        if (idSnap.exists && idSnap.data()?.uid === uid) tx.delete(idRef);
      }).catch(() => {});
    }
    return { uid, userId: result };
  } catch (err) {
    if (reservedUserId) {
      const idRef = db.collection('userIds').doc(String(reservedUserId));
      await db.runTransaction(async (tx) => {
        const idSnap = await tx.get(idRef);
        if (idSnap.exists && idSnap.data()?.uid === uid) tx.delete(idRef);
      }).catch(() => {});
    }
    if (err instanceof HttpsError) throw err;
    await logServerError('ensureUserId', err, { userId: uid });
    throw new HttpsError('internal', 'Could not assign a user ID.');
  }
});