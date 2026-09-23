const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { hasCapability } = require('./accessControl');
const { logAudit, logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { checkIpAnomaly } = require('./anomalyService');

const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_TRANSFER = 100000;
const MAX_NOTE_LENGTH = 500;
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const SECURITY_PIN_RE = /^\d{4,8}$/;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;
function requireSessionMatch(request, user) {
  const sessionId = request.data?.sessionId, deviceId = request.data?.deviceId;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId) || typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) throw new HttpsError('failed-precondition', 'Your secure session is missing. Please sign in again.');
  if (user.activeSessionId !== sessionId || user.activeDeviceId !== deviceId) throw new HttpsError('permission-denied', 'This device session is no longer active. Please sign in again.');
}
function hashPin(pin, salt) { return require('crypto').scryptSync(pin, salt, 64).toString('hex'); }

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
function active(account) {
  return !!account && account.suspended !== true && account.inactive !== true && account.disabled !== true && account.active !== false && account.mergedInto == null;
}
function canTransferTo(role, caller, recipient) {
  if (role === 'dealer') return recipient.role === 'customer' && recipient.dealerId === caller.id;
  if (role === 'admin') return recipient.role === 'dealer';
  if (role === 'superadmin') return ['admin', 'dealer'].includes(recipient.role);
  return false;
}
function validBalance(value) {
  const n = value == null ? 0 : Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) return null;
  return n;
}
function parseMoney(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_TRANSFER) return null;
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > Number.EPSILON * Math.max(1, Math.abs(value * 100))) return null;
    return value;
  }
  if (typeof value !== 'string' || !MONEY_RE.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_TRANSFER ? n : null;
}

exports.transferPoints = onCall({ enforceAppCheck: false }, async (request) => {
  const callerUid = requireAuth(request);
  const requestId = requireRequestId(request);
  const db = admin.firestore();
  const { toUid, amount, note, securityPin } = request.data || {};
  if (typeof securityPin !== 'string' || !SECURITY_PIN_RE.test(securityPin)) throw new HttpsError('invalid-argument', 'Enter your 4-8 digit security PIN.');
  const amt = parseMoney(amount);
  const cleanNote = typeof note === 'string' ? note.trim() : '';

  if (typeof toUid !== 'string' || !toUid.trim()) throw new HttpsError('invalid-argument', 'A recipient is required.');
  if (toUid === callerUid) throw new HttpsError('invalid-argument', "You can't transfer points to yourself.");
  if (amt === null) throw new HttpsError('invalid-argument', `Transfer amount must be greater than 0 and no more than ${MAX_TRANSFER.toLocaleString()} points, with at most 2 decimal places.`);
  if (cleanNote.length > MAX_NOTE_LENGTH) throw new HttpsError('invalid-argument', `Note must be ${MAX_NOTE_LENGTH} characters or fewer.`);

  const caller = await profile(db, callerUid);
  if (!active(caller) || !['dealer', 'admin', 'superadmin'].includes(caller.role)) throw new HttpsError('permission-denied', 'Your account cannot transfer points.');
  // Staff transfers are payment operations; dealers keep their own transfers.
  if (caller.role !== 'dealer' && !(await hasCapability(db, callerUid, caller, 'finance'))) throw new HttpsError('permission-denied', 'Your account does not handle payments.');
  const recipient = await profile(db, toUid);
  if (!active(recipient)) throw new HttpsError('failed-precondition', 'The recipient account is not active.');
  if (!canTransferTo(caller.role, caller, recipient)) throw new HttpsError('permission-denied', 'You are not allowed to send points to that account.');

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'transferPoints', { ip });
  const pricingSnap = await db.collection('settings').doc('pricing').get();
  const pricing = { dealerEarningPercent: 1.5, ...(pricingSnap.exists ? pricingSnap.data() : {}) };
  const isDealerToCustomer = caller.role === 'dealer' && recipient.role === 'customer';
  const rawEarningPercent = pricing.dealerEarningPercent;
  const earningPercent = isDealerToCustomer ? Number(rawEarningPercent) : 0;
  if (isDealerToCustomer && (!Number.isFinite(earningPercent) || earningPercent < 0 || earningPercent > 100)) {
    throw new HttpsError('failed-precondition', 'Dealer earning configuration is invalid. Please contact an administrator.');
  }
  const amountCents = Math.round(amt * 100);
  const earningCents = isDealerToCustomer ? Math.round(amountCents * (earningPercent / 100)) : 0;
  const earning = earningCents / 100;

  const opRef = db.collection('walletOperations').doc(`${callerUid}_${requestId}`);
  const fromRef = db.collection('users').doc(callerUid);
  const toRef = db.collection('users').doc(toUid);
  const transferRef = db.collection('pointTransfers').doc();
  const pinRef = db.collection('securityPins').doc(callerUid);

  try {
    // Check an already-completed request before consuming another PIN attempt.
    // This keeps retries idempotent and prevents a valid replay from locking the PIN.
    const existingOp = await opRef.get();
    if (existingOp.exists) {
      const op = existingOp.data() || {};
      if (op.type !== 'transferPoints' || op.uid !== callerUid || op.toUid !== toUid || Number(op.amount) !== amt || op.requestId !== requestId) {
        throw new HttpsError('failed-precondition', 'That request ID is already in use.');
      }
      if (op.transferId) return { transferId: op.transferId, replay: true };
      throw new HttpsError('aborted', 'This transfer is still being processed. Please retry shortly.');
    }

    const pinResult = await db.runTransaction(async (tx) => {
      const pinSnap = await tx.get(pinRef);
      if (!pinSnap.exists) return { valid: false, code: 'missing' };
      const pinData = pinSnap.data() || {};
      const lockedUntil = pinData.lockedUntil?.toMillis ? pinData.lockedUntil.toMillis() : 0;
      if (lockedUntil > Date.now()) return { valid: false, code: 'locked' };
      if (typeof pinData.hash !== 'string' || !/^[0-9a-f]{128}$/i.test(pinData.hash) || typeof pinData.salt !== 'string' || pinData.salt.length < 16) return { valid: false, code: 'invalid' };
      const actual = Buffer.from(hashPin(securityPin, pinData.salt), 'hex');
      const expected = Buffer.from(pinData.hash, 'hex');
      if (actual.length !== expected.length || !require('crypto').timingSafeEqual(actual, expected)) {
        const attempts = Number.isInteger(pinData.attempts) && pinData.attempts >= 0 ? pinData.attempts + 1 : 1;
        tx.update(pinRef, attempts >= MAX_PIN_ATTEMPTS
          ? { attempts: 0, lockedUntil: admin.firestore.Timestamp.fromMillis(Date.now() + PIN_LOCKOUT_MS), updatedAt: admin.firestore.FieldValue.serverTimestamp() }
          : { attempts, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { valid: false, code: attempts >= MAX_PIN_ATTEMPTS ? 'locked' : 'incorrect' };
      }
      tx.update(pinRef, { attempts: 0, lockedUntil: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { valid: true };
    });

    if (!pinResult.valid) {
      if (pinResult.code === 'missing') throw new HttpsError('failed-precondition', 'Set up your security PIN before transferring points.');
      if (pinResult.code === 'locked') throw new HttpsError('resource-exhausted', 'Too many security PIN attempts. Try again later.');
      if (pinResult.code === 'invalid') throw new HttpsError('failed-precondition', 'Your security PIN needs to be reset before use.');
      throw new HttpsError('permission-denied', 'Incorrect security PIN.');
    }

    const result = await db.runTransaction(async (tx) => {
      const opSnap = await tx.get(opRef);
      if (opSnap.exists) {
        const op = opSnap.data();
        if (op.type !== 'transferPoints' || op.uid !== callerUid) throw new HttpsError('failed-precondition', 'That request ID is already in use.');
        if (op.toUid !== toUid || Number(op.amount) !== amt) throw new HttpsError('failed-precondition', 'That request ID does not match this transfer.');
        return { transferId: op.transferId, replay: true };
      }
      const fromSnap = await tx.get(fromRef);
      const toSnap = await tx.get(toRef);
      if (!fromSnap.exists || !toSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const fromData = fromSnap.data();
      const toData = toSnap.data();
      requireSessionMatch(request, fromData);
      if (!active(fromData) || !active(toData)) throw new HttpsError('failed-precondition', 'Both accounts must be active.');
      if (fromData.role !== caller.role || toData.role !== recipient.role) throw new HttpsError('failed-precondition', 'Account status changed. Please retry.');
      const fromBalance = validBalance(fromData.walletBalance);
      const toBalance = validBalance(toData.walletBalance);
      if (fromBalance === null || toBalance === null) throw new HttpsError('failed-precondition', 'One of the account wallet balances is invalid.');
      if (fromBalance < amt) throw new HttpsError('failed-precondition', 'Insufficient balance.');
      const fromBalanceCents = Math.round(fromBalance * 100);
      const toBalanceCents = Math.round(toBalance * 100);
      const resultingSenderBalanceCents = fromBalanceCents - amountCents + earningCents;
      const resultingRecipientBalanceCents = toBalanceCents + amountCents;
      if (!Number.isSafeInteger(resultingSenderBalanceCents) || resultingSenderBalanceCents < 0 || !Number.isSafeInteger(resultingRecipientBalanceCents)) throw new HttpsError('failed-precondition', 'The transfer would create an invalid wallet balance.');
      const resultingSenderBalance = resultingSenderBalanceCents / 100;
      const resultingRecipientBalance = resultingRecipientBalanceCents / 100;
      const dealerScope = caller.role === 'dealer' ? callerUid : caller.dealerId || null;
      tx.update(fromRef, { walletBalance: resultingSenderBalance });
      tx.update(toRef, { walletBalance: resultingRecipientBalance });
      tx.set(transferRef, { fromUid: callerUid, fromName: caller.name || '', fromRole: caller.role || '', toUid, toName: recipient.name || '', toRole: recipient.role || '', amount: amt, note: cleanNote, participants: [callerUid, toUid], dealerId: dealerScope, dealerEarningPercent: earningPercent || null, dealerEarning: earning || null, requestId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.set(opRef, { type: 'transferPoints', uid: callerUid, requestId, toUid, amount: amt, transferId: transferRef.id, status: 'completed', createdAt: admin.firestore.FieldValue.serverTimestamp() });
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
