const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

const BATCH_SIZE = 400;
const COLLECTIONS = [
  { name: 'emailVerificationOtps', field: 'expiresAt' },
  { name: 'emailVerificationProofs', field: 'expiresAt' },
  { name: 'passwordResetEmailOtps', field: 'expiresAt' },
  { name: 'passwordResetProofs', field: 'expiresAt' },
  { name: 'mergeOtps', field: 'expiresAt' },
];

async function deleteExpiredCollection(db, name, field, now) {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(name).where(field, '<=', now).limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < BATCH_SIZE) break;
  }
  return deleted;
}

exports.cleanupExpiredVerificationArtifacts = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'UTC', region: 'asia-southeast1' },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    let deleted = 0;
    for (const item of COLLECTIONS) {
      deleted += await deleteExpiredCollection(db, item.name, item.field, now);
    }
    console.log('[verificationCleanup] deleted expired artifacts:', deleted);
  },
);
