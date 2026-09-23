const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { hasCapability } = require('./accessControl');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const STAFF_ROLES = ['admin', 'superadmin', 'support', 'finance'];
const MAX_AMOUNT = 100000;

function requireRequest(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const requestId = request.data?.requestId;
  if (typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId)) {
    throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  }
  return { uid: request.auth.uid, requestId };
}

function safeText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function validMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT && Number.isSafeInteger(Math.round(n * 100)) ? n : null;
}

function validBalance(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? n : null;
}

function isActiveAccount(account) {
  return account && account.suspended !== true && account.inactive !== true && account.disabled !== true && !account.mergedInto;
}

exports.createSelfTopup = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const { uid, requestId } = requireRequest(request);
  const db = admin.firestore();
  const data = request.data || {};
  const amount = validMoney(data.amount);
  const method = safeText(data.method || 'transfer', 40);
  const bankName = safeText(data.bankName, 120);
  const refNo = safeText(data.refNo, 120);
  const receiptUrl = safeText(data.receiptUrl, 2048);

  if (amount === null) throw new HttpsError('invalid-argument', 'Enter a valid amount.');

  // Crediting your own wallet is a payment operation.
  const callerProfileSnap = await db.collection('users').doc(uid).get();
  if (!callerProfileSnap.exists || !(await hasCapability(db, uid, callerProfileSnap.data(), 'finance'))) {
    throw new HttpsError('permission-denied', 'Your account cannot self top-up.');
  }

  await checkVelocity(db, uid, 'createSelfTopup', { ip: getClientIp(request) });

  const callerRef = db.collection('users').doc(uid);
  const opRef = db.collection('walletOperations').doc(`${uid}_createSelfTopup_${requestId}`);
  const topupRef = db.collection('selfTopups').doc();

  try {
    const result = await db.runTransaction(async (tx) => {
      const opSnap = await tx.get(opRef);
      if (opSnap.exists) {
        const op = opSnap.data() || {};
        if (op.uid !== uid || op.type !== 'createSelfTopup' || op.requestId !== requestId) {
          throw new HttpsError('already-exists', 'This request ID is already in use.');
        }
        if (Number(op.amount) !== amount) {
          throw new HttpsError('failed-precondition', 'That request ID does not match this top-up.');
        }
        return { id: op.topupId, replay: true };
      }

      const callerSnap = await tx.get(callerRef);
      if (!callerSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const caller = callerSnap.data() || {};
      if (!isActiveAccount(caller) || !STAFF_ROLES.includes(caller.role)) {
        throw new HttpsError('permission-denied', 'Your account cannot self top-up.');
      }

      const currentBalance = validBalance(caller.walletBalance);
      if (currentBalance === null) throw new HttpsError('failed-precondition', 'Wallet balance is invalid.');
      const newBalance = currentBalance + amount;
      if (!Number.isSafeInteger(Math.round(newBalance * 100))) {
        throw new HttpsError('failed-precondition', 'Wallet balance is too large.');
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.update(callerRef, { walletBalance: newBalance });
      tx.set(topupRef, {
        userId: uid,
        userPhone: safeText(caller.phone, 40),
        userName: safeText(caller.name || caller.displayName, 160),
        userRole: caller.role,
        amount,
        points: amount,
        method,
        bankName,
        refNo,
        receiptUrl,
        status: 'approved',
        requestId,
        createdAt: now,
        updatedAt: now,
      });
      tx.set(opRef, {
        uid,
        type: 'createSelfTopup',
        requestId,
        amount,
        topupId: topupRef.id,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      });
      return { id: topupRef.id, replay: false };
    });

    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Could not complete the self top-up.');
  }
});
