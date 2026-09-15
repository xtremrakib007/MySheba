// Admin approve/reject of identity verification requests - server-side review.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');

const FACE_DUPLICATE_THRESHOLD = 0.82;
const EMBEDDING_SIZE = 512;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function requireAdmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || !['admin', 'superadmin'].includes(caller.role)) throw new HttpsError('permission-denied', 'Only an admin can review verification requests.');
  return caller;
}

function normalizeEmbedding(value) {
  if (!Array.isArray(value)) return null;
  const vector = value.slice(0, EMBEDDING_SIZE).map(Number);
  if (vector.length < 64 || vector.some((n) => !Number.isFinite(n))) return null;
  return vector;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (!aa || !bb) return -1;
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

async function findDuplicateFace(db, targetUid, candidate) {
  if (!candidate) return null;

  const templates = await db.collection('biometricTemplates').get();
  for (const snap of templates.docs) {
    if (snap.id === targetUid) continue;
    const match = cosineSimilarity(candidate, normalizeEmbedding(snap.data().embedding));
    if (match >= FACE_DUPLICATE_THRESHOLD) return { uid: snap.id, similarity: match };
  }

  // Compatibility check for approvals created before templates were introduced.
  const approved = await db.collection('verificationRequests')
    .where('status', '==', 'approved')
    .where('faceRecognitionVerified', '==', true)
    .get();

  for (const snap of approved.docs) {
    if (snap.id === targetUid) continue;
    const match = cosineSimilarity(candidate, normalizeEmbedding(snap.data().faceEmbedding));
    if (match >= FACE_DUPLICATE_THRESHOLD) return { uid: snap.id, similarity: match };
  }

  return null;
}

exports.approveVerification = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);
  const { targetUid } = request.data || {};
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
  const reqRef = db.collection('verificationRequests').doc(targetUid);
  const userRef = db.collection('users').doc(targetUid);

  try {
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) throw new HttpsError('not-found', 'That verification request does not exist.');
    const reqData = reqSnap.data();
    if (reqData.status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');

    const candidate = normalizeEmbedding(reqData.faceEmbedding);
    if (!candidate) {
      throw new HttpsError('failed-precondition', 'Face recognition is required before KYC approval.');
    }

    const duplicate = await findDuplicateFace(db, targetUid, candidate);
    if (duplicate) {
      await reqRef.update({
        status: 'rejected',
        note: 'Duplicate biometric identity detected.',
        rejectionReason: 'This face is already associated with another verified KYC identity.',
        biometricDuplicate: true,
        biometricSimilarity: Number(duplicate.similarity.toFixed(4)),
        reviewedBy: callerUid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await logAudit({
        action: 'verification_rejected_duplicate_face',
        targetUid,
        performedBy: callerUid,
        performedByRole: caller.role,
        details: { matchedUid: duplicate.uid, similarity: Number(duplicate.similarity.toFixed(4)) },
      });
      throw new HttpsError('already-exists', 'This face is already registered to another verified KYC identity.');
    }

    await db.runTransaction(async (tx) => {
      const freshReq = await tx.get(reqRef);
      if (!freshReq.exists || freshReq.data().status !== 'pending') {
        throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      }
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');

      tx.update(reqRef, {
        status: 'approved',
        note: '',
        rejectionReason: '',
        biometricDuplicate: false,
        reviewedBy: callerUid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        faceEmbedding: admin.firestore.FieldValue.delete(),
      });
      tx.update(userRef, { verified: true, verificationStatus: 'approved' });
      tx.set(db.collection('biometricTemplates').doc(targetUid), {
        uid: targetUid,
        embedding: candidate,
        model: reqData.faceRecognitionModel || 'MobileFaceNet',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('approveVerification', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', 'Could not approve this request.');
  }

  await logAudit({ action: 'verification_approved', targetUid, performedBy: callerUid, performedByRole: caller.role });
  return { ok: true };
});

exports.rejectVerification = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);
  const { targetUid, reason } = request.data || {};
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
  const reqRef = db.collection('verificationRequests').doc(targetUid);
  const cleanReason = String(reason || '').trim();
  try {
    await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new HttpsError('not-found', 'That verification request does not exist.');
      if (reqSnap.data().status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      tx.update(reqRef, { status: 'rejected', note: cleanReason, rejectionReason: cleanReason, reviewedBy: callerUid, reviewedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('rejectVerification', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', 'Could not reject this request.');
  }
  await logAudit({ action: 'verification_rejected', targetUid, performedBy: callerUid, performedByRole: caller.role, details: { reason: cleanReason } });
  return { ok: true };
});
