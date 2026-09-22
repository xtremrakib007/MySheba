const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const MAX_AMOUNT = 100000;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const ALLOWED_ROLES = ['customer', 'dealer', 'reseller'];

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const requestId = request.data?.requestId;
  if (typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId)) throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  return { uid: request.auth.uid, requestId };
}
function isActive(user) { return user && user.suspended !== true && user.inactive !== true && user.disabled !== true && !user.mergedInto; }
function validMoney(value) { const n = Number(value); return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT && Number.isSafeInteger(Math.round(n * 100)) ? n : null; }

async function validateReceiptUrl(value, uid) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048) {
    throw new HttpsError('invalid-argument', 'A valid payment receipt is required.');
  }
  let url;
  try { url = new URL(value); } catch { throw new HttpsError('invalid-argument', 'Invalid payment receipt URL.'); }
  if (url.protocol !== 'https:') throw new HttpsError('invalid-argument', 'Payment receipt must use HTTPS.');

  const bucket = admin.storage().bucket().name;
  const encodedPrefix = `topup-receipts/${uid}/`;
  let objectPath = null;
  if (url.hostname === 'firebasestorage.googleapis.com') {
    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (match) {
      if (decodeURIComponent(match[1]) !== bucket) throw new HttpsError('invalid-argument', 'Receipt belongs to an invalid storage bucket.');
      objectPath = decodeURIComponent(match[2]);
    }
  } else if (url.hostname === 'storage.googleapis.com') {
    const match = url.pathname.match(/^\/([^/]+)\/(.+)$/);
    if (match) {
      if (decodeURIComponent(match[1]) !== bucket) throw new HttpsError('invalid-argument', 'Receipt belongs to an invalid storage bucket.');
      objectPath = decodeURIComponent(match[2]);
    }
  }
  if (!objectPath || !objectPath.startsWith(encodedPrefix) || objectPath.includes('..')) {
    throw new HttpsError('invalid-argument', 'Receipt must be uploaded to your top-up receipt storage area.');
  }
  const file = admin.storage().bucket().file(objectPath);
  try {
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size || 0);
    const contentType = String(metadata.contentType || '').toLowerCase();
    if (!Number.isFinite(size) || size < 1 || size > 10 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Receipt file is invalid.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) throw new HttpsError('invalid-argument', 'Receipt must be a JPEG, PNG, or WebP image.');
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('invalid-argument', 'Receipt file could not be verified.');
  }
  return value;
}

exports.submitTopupRequest = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const { uid, requestId } = requireAuth(request); const db = admin.firestore(); const data = request.data || {};
  const amount = validMoney(data.amount); if (amount === null) throw new HttpsError('invalid-argument', 'Enter a valid top-up amount.');
  const method = String(data.method || 'transfer').trim().slice(0, 40), bankName = String(data.bankName || '').trim().slice(0, 120), refNo = String(data.refNo || '').trim().slice(0, 120), receiptUrl = String(data.receiptUrl || '').trim().slice(0, 2048);
  if (!receiptUrl) throw new HttpsError('invalid-argument', 'A payment receipt is required.');
  const validatedReceiptUrl = await validateReceiptUrl(receiptUrl, uid);
  await checkVelocity(db, uid, 'submitTopupRequest', { ip: getClientIp(request) });
  const userRef = db.collection('users').doc(uid), operationRef = db.collection('topupSubmissionOperations').doc(`${uid}_${requestId}`);
  try {
    return await db.runTransaction(async tx => {
      const opSnap = await tx.get(operationRef);
      if (opSnap.exists) { const op = opSnap.data() || {}; if (op.uid !== uid || op.requestId !== requestId || Number(op.amount) !== amount) throw new HttpsError('already-exists', 'That request ID is already used for another top-up.'); return { id: op.topupId, replay: true }; }
      const userSnap = await tx.get(userRef); if (!userSnap.exists) throw new HttpsError('not-found', 'User account not found.');
      const user = userSnap.data() || {}; if (!isActive(user) || !ALLOWED_ROLES.includes(user.role)) throw new HttpsError('permission-denied', 'This account cannot submit wallet top-ups.');
      const topupRef = db.collection('topups').doc(), now = admin.firestore.FieldValue.serverTimestamp();
      tx.create(topupRef, { userId: uid, userPhone: String(user.phone || '').slice(0, 40), userName: String(user.name || user.displayName || '').slice(0, 160), userRole: user.role, amount, points: amount, method, bankName, refNo, receiptUrl: validatedReceiptUrl, status: 'pending', rejectReason: '', requestId, createdAt: now, updatedAt: now });
      tx.create(operationRef, { uid, requestId, amount, topupId: topupRef.id, status: 'created', createdAt: now });
      return { id: topupRef.id, replay: false };
    });
  } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('internal', 'Could not submit the top-up request.'); }
});
