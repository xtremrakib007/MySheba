const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { inferWalletCurrency } = require('./walletCurrencyService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const MAX_AMOUNT = 100000;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const ALLOWED_ROLES = ['customer', 'dealer', 'reseller'];
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;
function requireSessionMatch(request, user) { const sessionId=request.data?.sessionId, deviceId=request.data?.deviceId; if(typeof sessionId!=='string'||!SESSION_ID_RE.test(sessionId)||typeof deviceId!=='string'||!DEVICE_ID_RE.test(deviceId)) throw new HttpsError('failed-precondition','Your secure session is missing. Please sign in again.'); if(user.activeSessionId!==sessionId||user.activeDeviceId!==deviceId) throw new HttpsError('permission-denied','This device session is no longer active. Please sign in again.'); }


async function validateReceiptUrl(url, uid) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new HttpsError('invalid-argument', 'The payment receipt URL is invalid.'); }
  if (parsed.hostname !== 'firebasestorage.googleapis.com' || parsed.pathname !== '/v0/b/' + admin.storage().bucket().name + '/o/' ) {
    const marker = '/o/';
    const idx = parsed.pathname.indexOf(marker);
    if (parsed.hostname !== 'firebasestorage.googleapis.com' || idx < 0 || !parsed.pathname.startsWith('/v0/b/')) throw new HttpsError('invalid-argument', 'The payment receipt must be a valid MySheba receipt.');
  }
  const marker = '/o/';
  const idx = parsed.pathname.indexOf(marker);
  if (idx < 0) throw new HttpsError('invalid-argument', 'The payment receipt URL is invalid.');
  let objectPath;
  try { objectPath = decodeURIComponent(parsed.pathname.slice(idx + marker.length)); } catch (_) { throw new HttpsError('invalid-argument', 'The payment receipt URL is invalid.'); }
  if (!objectPath || objectPath.includes('\\') || objectPath.split('/').includes('..') || !objectPath.startsWith('topup-receipts/' + uid + '/')) throw new HttpsError('permission-denied', 'The payment receipt does not belong to your account.');
  const bucket = admin.storage().bucket();
  let file;
  try { file = bucket.file(objectPath); const [exists] = await file.exists(); if (!exists) throw new HttpsError('failed-precondition', 'The payment receipt could not be found.'); const [meta] = await file.getMetadata(); const size = Number(meta.size); if (!Number.isFinite(size) || size <= 0 || size >= 10 * 1024 * 1024 || typeof meta.contentType !== 'string' || !meta.contentType.startsWith('image/')) throw new HttpsError('failed-precondition', 'The payment receipt is invalid.'); } catch (err) { if (err instanceof HttpsError) throw err; throw new HttpsError('failed-precondition', 'The payment receipt could not be verified.'); }
  return objectPath;
}

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const requestId = request.data?.requestId;
  if (typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId)) {
    throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  }
  return { uid: request.auth.uid, requestId };
}

function validMoney(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return null;
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > Number.EPSILON * Math.max(1, Math.abs(value * 100))) return null;
    return value;
  }
  if (typeof value !== 'string' || !MONEY_RE.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? n : null;
}

exports.submitTopupRequest = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const { uid, requestId } = requireAuth(request);
  const db = admin.firestore();
  const data = request.data || {};
  const amount = validMoney(data.amount);
  if (amount === null) throw new HttpsError('invalid-argument', 'Enter a valid top-up amount.');
  const method = String(data.method || 'transfer').trim().slice(0, 40);
  const bankName = String(data.bankName || '').trim().slice(0, 120);
  const refNo = String(data.refNo || '').trim().slice(0, 120);
  const receiptUrl = String(data.receiptUrl || '').trim().slice(0, 2048);
  if (!receiptUrl) throw new HttpsError('invalid-argument', 'A payment receipt is required.');

  await checkVelocity(db, uid, 'submitTopupRequest', { ip: getClientIp(request) });

  const userRef = db.collection('users').doc(uid);
  const operationRef = db.collection('topupSubmissionOperations').doc(`${uid}_${requestId}`);
  // Fast-path an existing request before validating the upload again. Replays
  // still require a live account/session; only the receipt revalidation is skipped.
  const existingUserSnap = await userRef.get();
  if (!existingUserSnap.exists) throw new HttpsError('not-found', 'User account not found.');
  const existingUser = existingUserSnap.data() || {};
  requireSessionMatch(request, existingUser);
  if (existingUser.suspended === true || existingUser.inactive === true || existingUser.disabled === true || existingUser.active === false || existingUser.mergedInto != null) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  if (!ALLOWED_ROLES.includes(existingUser.role)) throw new HttpsError('permission-denied', 'This account cannot submit wallet top-ups.');
  const existingOperation = await operationRef.get();
  if (existingOperation.exists) {
    const op = existingOperation.data() || {};
    if (op.uid !== uid || op.requestId !== requestId || Number(op.amount) !== amount) {
      throw new HttpsError('already-exists', 'That request ID is already used for another top-up.');
    }
    return { id: op.topupId, replay: true };
  }
  await validateReceiptUrl(receiptUrl, uid);
  try {
    const result = await db.runTransaction(async tx => {
      // Revalidate the live account/session before returning an idempotent replay.
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'User account not found.');
      const liveUser = userSnap.data() || {};
      requireSessionMatch(request, liveUser);
      if (liveUser.suspended === true || liveUser.inactive === true || liveUser.disabled === true || liveUser.active === false || liveUser.mergedInto != null) {
        throw new HttpsError('permission-denied', 'Your account is not active.');
      }
      if (!ALLOWED_ROLES.includes(liveUser.role)) throw new HttpsError('permission-denied', 'This account cannot submit wallet top-ups.');

      const opSnap = await tx.get(operationRef);
      if (opSnap.exists) {
        const op = opSnap.data() || {};
        if (op.uid !== uid || op.requestId !== requestId || Number(op.amount) !== amount) {
          throw new HttpsError('already-exists', 'That request ID is already used for another top-up.');
        }
        return { id: op.topupId, replay: true };
      }

      const user = liveUser;
      if (user.suspended === true || user.inactive === true || user.disabled === true || user.active === false || user.mergedInto != null) {
        throw new HttpsError('permission-denied', 'Your account is not active.');
      }
      if (!ALLOWED_ROLES.includes(user.role)) throw new HttpsError('permission-denied', 'This account cannot submit wallet top-ups.');

      const topupRef = db.collection('topups').doc();
      const walletCurrency = inferWalletCurrency(user);
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.create(topupRef, {
        userId: uid,
        userPhone: String(user.phone || '').slice(0, 40),
        userName: String(user.name || user.displayName || '').slice(0, 160),
        userRole: user.role,
        amount,
        points: amount,
        method,
        bankName,
        refNo,
        receiptUrl,
        status: 'pending',
        rejectReason: '',
        requestId,
        createdAt: now,
        updatedAt: now,
      });
      tx.create(operationRef, {
        uid,
        requestId,
        amount,
        topupId: topupRef.id,
        status: 'created',
        createdAt: now,
      });
      return { id: topupRef.id, replay: false };
    });
    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Could not submit the top-up request.');
  }
});
