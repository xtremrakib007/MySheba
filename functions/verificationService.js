// Admin approve/reject of identity verification requests - server-side review.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { hasCapability } = require('./accessControl');
const { logAudit, logServerError } = require('./logService');
const { finalizeKycFaceTemplate } = require('./faceVerificationService');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

// Staff who may hold the 'users' capability (functions/accessControl.js).
const STAFF_ROLES = ['admin', 'superadmin', 'support', 'finance'];

async function requireAdmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || !STAFF_ROLES.includes(caller.role) || caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) {
    throw new HttpsError('permission-denied', 'Your account cannot review verification requests.');
  }
  // KYC review is user administration.
  if (!(await hasCapability(db, callerUid, caller, 'users'))) throw new HttpsError('permission-denied', 'Your account cannot review verification requests.');
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

async function assertVerificationObject(url, uid) {
  if (!validStorageUrl(url, uid)) throw new HttpsError('failed-precondition', 'The identity document upload is invalid.');
  const bucket = admin.storage().bucket();
  let objectPath;
  try {
    const parsed = new URL(url);
    objectPath = decodeURIComponent(parsed.pathname.slice(("/v0/b/" + bucket.name + "/o/").length));
    if (!objectPath || objectPath.includes('\\\\') || objectPath.split('/').some((part) => part === '..')) throw new Error('invalid path');
    const [metadata] = await bucket.file(objectPath).getMetadata();
    const size = Number(metadata?.size);
    const contentType = String(metadata?.contentType || '');
    if (!Number.isFinite(size) || size <= 0 || size >= 10 * 1024 * 1024 || !contentType.startsWith('image/')) throw new Error('invalid metadata');
  } catch (_) {
    throw new HttpsError('failed-precondition', 'The uploaded identity document could not be verified.');
  }
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

exports.approveVerification = onCall({ enforceAppCheck: true }, async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);
  const { targetUid } = request.data || {};
  if (!targetUid || typeof targetUid !== 'string') throw new HttpsError('invalid-argument', 'targetUid is required.');
  const reqRef = db.collection('verificationRequests').doc(targetUid);
  const userRef = db.collection('users').doc(targetUid);
  // Declared before the try, not inside it. `let` is block-scoped, so the
  // declaration that used to sit inside the try was out of scope by the time
  // logAudit read it after the catch - and that read is AFTER the
  // transaction commits. Approving a verification therefore wrote the
  // approval, then threw ReferenceError on the way out: the admin saw a
  // failure, retried, and got "This user is already verified." The person
  // was approved the whole time. rejectVerification already declares it
  // here, which is why only approve was broken.
  let reviewedByRole = '';
  try {
    const requestSnap = await reqRef.get();
    if (!requestSnap.exists) throw new HttpsError('not-found', 'That verification request does not exist.');
    const requestData = requestSnap.data();
    validateRequestData(requestData, targetUid);
    const urls = [requestData.frontDocumentUrl, requestData.documentUrl, requestData.selfieUrl];
    if (requestData.documentType !== 'Passport') urls.push(requestData.backDocumentUrl);
    for (const url of urls) await assertVerificationObject(url, targetUid);

    await db.runTransaction(async (tx) => {
      const callerSnap = await tx.get(db.collection('users').doc(callerUid));
      const currentCaller = callerSnap.exists ? callerSnap.data() : null;
      if (!currentCaller || !STAFF_ROLES.includes(currentCaller.role) || currentCaller.suspended === true || currentCaller.inactive === true || currentCaller.disabled === true || currentCaller.active === false || currentCaller.mergedInto) {
        throw new HttpsError('permission-denied', 'Your account can no longer review verification requests.');
      }
      reviewedByRole = currentCaller.role;
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
  await logAudit({ action: 'verification_approved', targetUid, performedBy: callerUid, performedByRole: reviewedByRole });
  return { ok: true };
});

exports.rejectVerification = onCall({ enforceAppCheck: true }, async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);
  const { targetUid, reason } = request.data || {};
  if (!targetUid || typeof targetUid !== 'string') throw new HttpsError('invalid-argument', 'targetUid is required.');
  const reqRef = db.collection('verificationRequests').doc(targetUid);
  const userRef = db.collection('users').doc(targetUid);
  const cleanReason = String(reason || '').trim().slice(0, 500);
  if (!cleanReason) throw new HttpsError('invalid-argument', 'A rejection reason is required.');
  let reviewedByRole = '';
  try {
    await db.runTransaction(async (tx) => {
      const callerSnap = await tx.get(db.collection('users').doc(callerUid));
      const currentCaller = callerSnap.exists ? callerSnap.data() : null;
      if (!currentCaller || !STAFF_ROLES.includes(currentCaller.role) || currentCaller.suspended === true || currentCaller.inactive === true || currentCaller.disabled === true || currentCaller.active === false || currentCaller.mergedInto) {
        throw new HttpsError('permission-denied', 'Your account can no longer review verification requests.');
      }
      reviewedByRole = currentCaller.role;
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new HttpsError('not-found', 'That verification request does not exist.');
      if (reqSnap.data().status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');
      tx.update(reqRef, { status: 'rejected', note: cleanReason, rejectionReason: cleanReason, reviewedBy: callerUid, reviewedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.update(userRef, { verified: false, verificationStatus: 'rejected' });
      tx.delete(db.collection('pendingBiometricTemplates').doc(targetUid));
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('rejectVerification', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', 'Could not reject this request.');
  }
  await logAudit({ action: 'verification_rejected', targetUid, performedBy: callerUid, performedByRole: reviewedByRole, details: { reason: cleanReason } });
  return { ok: true };
});
