const admin = require('firebase-admin');

const COLLECTION = 'temporaryAuthCleanup';
const RETRY_AFTER_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function refFor(uid) {
  return admin.firestore().collection(COLLECTION).doc(String(uid));
}

async function trackTemporaryAuthUser({ uid, purpose, targetUid = null, email = null }) {
  if (!uid) return;
  const now = Date.now();
  await refFor(uid).set({
    uid: String(uid),
    purpose: String(purpose || 'unknown'),
    targetUid: targetUid ? String(targetUid) : null,
    email: email ? String(email).toLowerCase() : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    retryAfter: admin.firestore.Timestamp.fromMillis(now + RETRY_AFTER_MS),
    expiresAt: admin.firestore.Timestamp.fromMillis(now + MAX_AGE_MS),
  }, { merge: true });
}

async function deleteTrackedTemporaryAuthUser(uid) {
  if (!uid) return true;
  try {
    await admin.auth().deleteUser(uid);
    await refFor(uid).delete().catch(() => {});
    return true;
  } catch (err) {
    await refFor(uid).set({
      lastError: String(err?.message || 'Auth user deletion failed').slice(0, 500),
      retryAfter: admin.firestore.Timestamp.fromMillis(Date.now() + RETRY_AFTER_MS),
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});
    return false;
  }
}

async function cleanupTrackedTemporaryAuthUsers() {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const snap = await db.collection(COLLECTION).where('retryAfter', '<=', now).limit(100).get();
  let cleaned = 0;
  for (const doc of snap.docs) {
    const item = doc.data() || {};
    if (!item.uid) {
      await doc.ref.delete().catch(() => {});
      continue;
    }
    // Never discard the tracking record merely because its bookkeeping TTL
    // elapsed: doing so could orphan the temporary Firebase Auth user forever.
    // Attempt deletion even after MAX_AGE_MS and retain the record on failure
    // so the scheduled cleanup can retry it later.
    if (item.expiresAt?.toMillis && item.expiresAt.toMillis() <= now.toMillis()) {
      if (await deleteTrackedTemporaryAuthUser(item.uid)) cleaned += 1;
      continue;
    }
    if (await deleteTrackedTemporaryAuthUser(item.uid)) cleaned += 1;
  }
  return cleaned;
}

exports.trackTemporaryAuthUser = trackTemporaryAuthUser;
exports.deleteTrackedTemporaryAuthUser = deleteTrackedTemporaryAuthUser;
exports.cleanupTrackedTemporaryAuthUsers = cleanupTrackedTemporaryAuthUsers;
