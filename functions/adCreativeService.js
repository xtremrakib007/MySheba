// PHASE 3 - MySheba Advertisement System - Banner creative deletion.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function activeAccount(user) {
  return user && user.suspended !== true && user.inactive !== true && user.disabled !== true && !user.mergedInto;
}

async function requireSuperadmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || caller.role !== 'superadmin' || !activeAccount(caller)) {
    throw new HttpsError('permission-denied', 'Only an active Super Admin can manage advertisement creatives.');
  }
  return caller;
}

exports.deleteAdCreative = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  await requireSuperadmin(db, callerUid);

  const { storagePaths } = request.data || {};
  if (!Array.isArray(storagePaths) || storagePaths.length === 0 || storagePaths.length > 20) {
    throw new HttpsError('invalid-argument', 'storagePaths must contain 1 to 20 paths.');
  }
  const normalized = storagePaths.map(p => typeof p === 'string' ? p.trim() : p);
  const invalid = normalized.filter((p) => typeof p !== 'string' || !/^ads\/(banners|native|interstitial)\/[^/]+$/.test(p));
  if (invalid.length) throw new HttpsError('invalid-argument', 'Every storage path must be a valid advertisement creative path.');

  try {
    const latest = await db.collection('users').doc(callerUid).get();
    if (!latest.exists || latest.data().role !== 'superadmin' || !activeAccount(latest.data())) {
      throw new HttpsError('permission-denied', 'This Super Admin account is not active.');
    }
    const bucket = admin.storage().bucket();
    await Promise.all(normalized.map(path => bucket.file(path).delete({ ignoreNotFound: true })));
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('deleteAdCreative', err, { userId: callerUid, storagePaths: normalized });
    throw new HttpsError('internal', 'Could not delete one or more advertisement files.');
  }
  return { ok: true, deleted: normalized.length };
});
