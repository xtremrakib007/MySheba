// PHASE 3 - MySheba Advertisement System - Banner creative deletion.
//
// storage.rules sets `allow delete: if false` on every ads/{banners,
// native,interstitial,advertisers}/{fileName} path (see that file's
// "PHASE 1 - Advertisement System" section) - Storage delete is
// deliberately not exposed to ANY client, superadmin or not, so a bad
// client-side path (or a compromised admin session) can never be used to
// wipe an arbitrary Storage file by guessing its path. This callable is
// the one server-side door through that: it re-checks superadmin via the
// Admin SDK (which bypasses storage.rules entirely) and only ever
// operates on paths under the ads/ prefix.
//
// Client call site: src/firebase/adService.js's deleteBannerCreative,
// called from BannerAdFormModal.js (replacing/discarding an image) and
// BannerManagementScreen.js (deleting a banner outright).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function requireSuperadmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || caller.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Only a Super Admin can manage advertisement creatives.');
  }
  return caller;
}

/**
 * Deletes one or more Storage files, restricted to paths under `ads/` -
 * anything else is rejected outright rather than silently skipped, so a
 * caller passing an unexpected path finds out immediately instead of
 * assuming a delete happened. Missing files (already deleted, or never
 * uploaded) are treated as success, not an error - the caller's goal
 * ("this path should not exist") is already satisfied.
 * request.data: { storagePaths: string[] }
 */
exports.deleteAdCreative = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  await requireSuperadmin(db, callerUid);

  const { storagePaths } = request.data || {};
  if (!Array.isArray(storagePaths) || storagePaths.length === 0) {
    throw new HttpsError('invalid-argument', 'storagePaths must be a non-empty array.');
  }
  const invalid = storagePaths.filter((p) => typeof p !== 'string' || !p.startsWith('ads/'));
  if (invalid.length) {
    throw new HttpsError('invalid-argument', 'Every storage path must be under ads/.');
  }

  const bucket = admin.storage().bucket();
  try {
    await Promise.all(
      storagePaths.map((path) => bucket.file(path).delete({ ignoreNotFound: true }))
    );
  } catch (err) {
    await logServerError('deleteAdCreative', err, { userId: callerUid, storagePaths });
    throw new HttpsError('internal', 'Could not delete one or more advertisement files.');
  }

  return { ok: true, deleted: storagePaths.length };
});
