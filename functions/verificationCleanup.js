const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { cleanupTrackedTemporaryAuthUsers } = require('./temporaryAuthCleanup');

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

async function clearExpiredUserChallenge(db, field, now) {
  let cleared = 0;
  while (true) {
    const snap = await db.collection('users').where(`${field}.expiresAt`, '<=', now).limit(BATCH_SIZE).get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const result = await db.runTransaction(async tx => {
        const current = await tx.get(doc.ref);
        if (!current.exists) return false;
        const challenge = current.data()?.[field];
        if (!challenge?.expiresAt?.toMillis || challenge.expiresAt.toMillis() > now.toMillis()) return false;
        tx.update(doc.ref, { [field]: admin.firestore.FieldValue.delete() });
        return true;
      });
      if (result) cleared += 1;
    }
    if (snap.size < BATCH_SIZE) break;
  }
  return cleared;
}

async function clearExpiredPendingDeviceApprovals(db, now) {
  let cleared = 0;
  while (true) {
    const snap = await db.collection('users').where('pendingDeviceApproval.requestedAt', '<=', now).limit(BATCH_SIZE).get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const result = await db.runTransaction(async tx => {
        const current = await tx.get(doc.ref);
        if (!current.exists) return false;
        const pending = current.data()?.pendingDeviceApproval;
        if (!pending?.requestedAt?.toMillis || pending.requestedAt.toMillis() > now.toMillis()) return false;
        tx.update(doc.ref, { pendingDeviceApproval: admin.firestore.FieldValue.delete() });
        return true;
      });
      if (result) cleared += 1;
    }
    if (snap.size < BATCH_SIZE) break;
  }
  return cleared;
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
    const expiredEmailChallenges = await clearExpiredUserChallenge(db, 'pendingDeviceEmailChallenge', now);
    const expiredPendingApprovals = await clearExpiredPendingDeviceApprovals(db, now);
    const cleanedTemporaryAuthUsers = await cleanupTrackedTemporaryAuthUsers();
    deleted += expiredEmailChallenges + expiredPendingApprovals;
    console.log('[verificationCleanup] deleted expired artifacts:', deleted, 'temporary auth users cleaned:', cleanedTemporaryAuthUsers);
  },
);
