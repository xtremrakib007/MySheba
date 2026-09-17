const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');

const MAX_AMOUNT = 100000;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const ALLOWED_ROLES = ['customer', 'dealer', 'reseller'];

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

exports.submitTopupRequest = onCall({ enforceAppCheck: true }, async request => {
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
  try {
    const result = await db.runTransaction(async tx => {
      const opSnap = await tx.get(operationRef);
      if (opSnap.exists) {
        const op = opSnap.data() || {};
        if (op.uid !== uid || op.requestId !== requestId || Number(op.amount) !== amount) {
          throw new HttpsError('already-exists', 'That request ID is already used for another top-up.');
        }
        return { id: op.topupId, replay: true };
      }

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'User account not found.');
      const user = userSnap.data() || {};
      if (user.suspended === true || user.inactive === true || user.disabled === true || user.active === false || user.mergedInto != null) {
        throw new HttpsError('permission-denied', 'Your account is not active.');
      }
      if (!ALLOWED_ROLES.includes(user.role)) throw new HttpsError('permission-denied', 'This account cannot submit wallet top-ups.');

      const topupRef = db.collection('topups').doc();
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
