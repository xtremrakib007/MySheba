// Admin approve/reject of identity verification requests - server-side review.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
const { finalizeKycFaceTemplate } = require('./faceVerificationService');

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

function validStorageUrl(url, uid) {
  if (typeof url !== 'string' || url.length > 4096) return false;
  let parsed;
  try { parsed = new URL(url); } catch (_) { return false; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'firebasestorage.googleapis.com') return false;
  const bucket = admin.storage().bucket().name;
  const prefix = `/v0/b/${bucket}/o/`;
  if (!parsed.pathname.startsWith(prefix)) return false;
  let objectPath;
  try { objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length)); } catch (_) { return false; }
  const expectedPrefix = `verification-documents/${uid}/`;
  if (!objectPath.startsWith(expectedPrefix)) return false;
  const fileName = objectPath.slice(expectedPrefix.length);
  return !!fileName && !fileName.includes('\\0') && !fileName.split('/').some((part) => part === '..');
}

function validateRequestData(data, uid) {
  const documentTypes = ['Passport', 'MyKad / National ID', 'Work Permit / ID', "Driver's License"];
  const genders = ['Male', 'Female', 'Other'];
  if (!data || data.uid !== uid || data.status !== 'pending') throw new HttpsError('failed-precondition', 'Invalid KYC request state.');
  if (typeof data.name !== 'string' || data.name.trim().length < 2 || data.name.length > 120) throw new HttpsError('failed-precondition', 'Invalid legal name.');
  if (typeof data.phone !== 'string' || data.phone.length > 40) throw new HttpsError('failed-precondition', 'Invalid phone number.');
  if (!documentTypes.includes(data.documentType)) throw new HttpsError('failed-precondition', 'Invalid document type.');
  if (typeof data.documentNumber !== 'string' || data.documentNumber.trim().length < 3 || data.documentNumber.length > 80) throw new HttpsError('failed-precondition', 'Invalid document number.');
  if (typeof data.nationality !== 'string' || data.nationality.trim().length < 2 || data.nationality.length > 80) throw new HttpsError('failed-precondition', 'Invalid nationality.');
  if (typeof data.dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth)) throw new HttpsError('failed-precondition', 'Invalid date of birth.');
  if (!genders.includes(data.gender)) throw new HttpsError('failed-precondition', 'Invalid gender.');
  if (typeof data.address !== 'string' || data.address.trim().length < 5 || data.address.length > 500) throw new HttpsError('failed-precondition', 'Invalid residential address.');
  if (data.documentType === 'Passport') {
    if (typeof data.passportExpiryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.passportExpiryDate)) throw new HttpsError('failed-precondition', 'Passport expiry date is required.');
  } else if (data.passportExpiryDate) throw new HttpsError('failed-precondition', 'Passport expiry date is only valid for passports.');
  if (!validStorageUrl(data.frontDocumentUrl, uid) || !validStorageUrl(data.documentUrl, uid)) throw new HttpsError('failed-precondition', 'The identity document upload is invalid.');
  if (data.documentType !== 'Passport' && !validStorageUrl(data.backDocumentUrl, uid)) throw new HttpsError('failed-precondition', 'The back of the identity document is required.');
  if (!validStorageUrl(data.selfieUrl, uid)) throw new HttpsError('failed-precondition', 'The verified face image is missing.');
  if (data.liveFaceVerified !== true) throw new HttpsError('failed-precondition', 'Live face verification is required.');
}

exports.approveVerification = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);
  const { targetUid } = request.data || {};
  if (!targetUid || typeof targetUid !== 'string') throw new HttpsError('invalid-argument', 'targetUid is required.');
  const reqRef = db.collection('verificationRequests').doc(targetUid);
  const userRef = db.collection('users').doc(targetUid);
  try {
    await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new HttpsError('not-found', 'That verification request does not exist.');
      const reqData = reqSnap.data();
      validateRequestData(reqData, targetUid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');
      if (userSnap.data()?.verificationStatus === 'approved' || userSnap.data()?.verified === true) throw new HttpsError('failed-precondition', 'This user is already verified.');
      await finalizeKycFaceTemplate(tx, db, targetUid);
      tx.update(reqRef, { status: 'approved', note: '', rejectionReason: '', reviewedBy: callerUid, reviewedAt: admin.firestore.FieldValue.serverTimestamp(), biometricVerified: true });
      tx.update(userRef, { verified: true, verificationStatus: 'approved' });
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
  if (!targetUid || typeof targetUid !== 'string') throw new HttpsError('invalid-argument', 'targetUid is required.');
  const reqRef = db.collection('verificationRequests').doc(targetUid);
  const userRef = db.collection('users').doc(targetUid);
  const cleanReason = String(reason || '').trim().slice(0, 500);
  if (!cleanReason) throw new HttpsError('invalid-argument', 'A rejection reason is required.');
  try {
    await db.runTransaction(async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new HttpsError('not-found', 'That verification request does not exist.');
      if (reqSnap.data().status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      tx.update(reqRef, { status: 'rejected', note: cleanReason, rejectionReason: cleanReason, reviewedBy: callerUid, reviewedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.update(userRef, { verified: false, verificationStatus: 'rejected' });
      tx.delete(db.collection('pendingBiometricTemplates').doc(targetUid));
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('rejectVerification', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', 'Could not reject this request.');
  }
  await logAudit({ action: 'verification_rejected', targetUid, performedBy: callerUid, performedByRole: caller.role, details: { reason: cleanReason } });
  return { ok: true };
});
