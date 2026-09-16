const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { checkIpAnomaly } = require('./anomalyService');

const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_TRANSFER = 100000;
const MAX_NOTE_LENGTH = 500;

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}
function requireRequestId(request) {
  const id = request.data?.requestId;
  if (typeof id !== 'string' || !KEY_RE.test(id)) {
    throw new HttpsError('invalid-argument', 'requestId is required.');
  }
  return id;
}
async function profile(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}
function canTransferTo(role, caller, recipient) {
  if (role === 'dealer') return recipient.role === 'customer' && recipient.dealerId === caller.id;
  if (role === 'admin') return recipient.role === 'dealer';
  if (role === 'superadmin') return ['admin', 'dealer'].includes(recipient.role);
  return false;
}
function validBalance(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) return null;
  return n;
}

// A client retry must reuse requestId. The idempotency record and both
// balances are committed in ONE Firestore transaction, so two concurrent
// submissions with the same requestId can never debit twice.
exports.transferPoints = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const requestId = requireRequestId(request);
  const db = admin.firestore();
  const { toUid, amount, note } = request.data || {};
  const amt = Number(amount);
  const cleanNote = typeof note === 'string' ? note.trim() : '';

  if (typeof toUid !== 'string' || !toUid.trim()) {
    throw new HttpsError('invalid-argument', 'A recipient is required.');
  }
  if (toUid === callerUid) throw new HttpsError('invalid-argument', "You can't transfer points to yourself.");
  if (!Number.isFinite(amt) || amt <= 0 || amt > MAX_TRANSFER || !Number.isSafeInteger(Math.round(amt * 100))) {
    throw new HttpsError('invalid-argument', `Transfer amount must be greater than 0 and no more than ${MAX_TRANSFER.toLocaleString()} points.`);
  }
  if (cleanNote.length > MAX_NOTE_LENGTH) {
    throw new HttpsError('invalid-argument', `Note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }

  const caller = await profile(db, callerUid);
  if (!caller || !['dealer', 'admin', 'superadmin'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Your account cannot transfer points.');
  }
  const recipient = await profile(db, toUid);
  if (!recipient || recipient.mergedInto) throw new HttpsError('not-found', 'That account does not exist.');
  if (!canTransferTo(caller.role, caller, recipient)) {
    throw new HttpsError('permission-denied', 'You are not allowed to send points to that account.');
  }

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'transferPoints', { ip });
  const pricingSnap = await db.collection('settings').doc('pricing').get();
  const pricing = { dealerEarningPercent: 1.5, ...(pricingSnap.exists ? pricingSnap.data() : {}) };
  const isDealerToCustomer = caller.role === 'dealer' && recipient.role === 'customer';
  const earningPercent = isDealerToCustomer ? Number(pricing.dealerEarningPercent) || 0 : 0;
  const earning = Math.round(amt * (earningPercent / 100) * 100) / 100;

  const opRef = db.collection('walletOperations').doc(`${callerUid}_${requestId}`);
  const fromRef = db.collection('users').doc(callerUid);
  const toRef = db.collection('users').doc(toUid);
  const transferRef = db.collection('pointTransfers').doc();

  try {
    const result = await db.runTransaction(async (tx) => {
      const opSnap = await tx.get(opRef);
      if (opSnap.exists) {
        const op = opSnap.data();
        if (op.type !== 'transferPoints' || op.uid !== callerUid) {
          throw new HttpsError('failed-precondition', 'That request ID is already in use.');
        }
        if (op.toUid !== toUid || Number(op.amount) !== amt) {
          throw new HttpsError('failed-precondition', 'That request ID does not match this transfer.');
        }
        return { transferId: op.transferId, replay: true };
      }

      const fromSnap = await tx.get(fromRef);
      const toSnap = await tx.get(toRef);
      if (!fromSnap.exists || !toSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const fromBalance = validBalance(fromSnap.data().walletBalance);
      const toBalance = validBalance(toSnap.data().walletBalance);
      if (fromBalance === null || toBalance === null) {
        throw new HttpsError('failed-precondition', 'One of the account wallet balances is invalid.');
      }
      if (fromBalance < amt) throw new HttpsError('failed-precondition', 'Insufficient balance.');
      const resultingSenderBalance = fromBalance - amt + earning;
      const resultingRecipientBalance = toBalance + amt;
      if (!Number.isSafeInteger(Math.round(resultingSenderBalance * 100)) || !Number.isSafeInteger(Math.round(resultingRecipientBalance * 100))) {
        throw new HttpsError('failed-precondition', 'The transfer would create an invalid wallet balance.');
      }
      const dealerScope = caller.role === 'dealer' ? callerUid : caller.dealerId || null;

      tx.update(fromRef, { walletBalance: resultingSenderBalance });
      tx.update(toRef, { walletBalance: resultingRecipientBalance });
      tx.set(transferRef, {
        fromUid: callerUid, fromName: caller.name || '', fromRole: caller.role || '',
        toUid, toName: recipient.name || '', toRole: recipient.role || '',
        amount: amt, note: cleanNote, participants: [callerUid, toUid],
        dealerId: dealerScope, dealerEarningPercent: earningPercent || null,
        dealerEarning: earning || null, requestId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(opRef, {
        type: 'transferPoints', uid: callerUid, toUid, amount: amt,
        transferId: transferRef.id, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { transferId: transferRef.id, replay: false };
    });

    if (!result.replay) {
      await logAudit({ action: 'points_transferred', targetUid: toUid, performedBy: callerUid, performedByRole: caller.role, details: { amount: amt, earning: earning || null, requestId, ip } });
      await checkIpAnomaly(db, callerUid, ip, { action: 'transferPoints', role: caller.role });
    }
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('transferPoints', err, { userId: callerUid, requestId });
    throw new HttpsError('internal', 'Could not complete the transfer.');
  }
});
