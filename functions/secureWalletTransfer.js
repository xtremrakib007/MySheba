const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const walletTransferService = require('./walletTransferService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { sessionMatches } = require('./sessionSlots');
const { enforceRequestEnvelope } = require('./securityGateway');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;

function requireActiveSession(request, profile) {
  const sessionId = request.data?.sessionId;
  const deviceId = request.data?.deviceId;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)
      || typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('failed-precondition', 'Your secure session is missing. Please sign in again.');
  }
  if (!sessionMatches(profile, { sessionId, deviceId })) {
    throw new HttpsError('permission-denied', 'This device session is no longer active. Please sign in again.');
  }
}

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function getRequestId(request) {
  const id = request.data?.requestId;
  if (typeof id !== 'string' || !REQUEST_ID_RE.test(id)) {
    throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  }
  return id;
}

exports.walletTransfer = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  enforceRequestEnvelope(request, { maxBytes: 16 * 1024 });
  const uid = requireAuth(request);
  const requestId = getRequestId(request);
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const opRef = db.collection('walletOperations').doc(`${uid}_walletTransfer_${requestId}`);

  let existing = null;
  await db.runTransaction(async (tx) => {
    // Validate the live account and device session in the same transaction as
    // the idempotency lookup. Otherwise a revoked session could replay a
    // completed request (or recover an in-flight transfer) without reaching
    // walletTransferService, where the normal session guard lives.
    const userSnap = await tx.get(userRef);
    const snap = await tx.get(opRef);
    if (!userSnap.exists) throw new HttpsError('not-found', 'Account not found.');
    const profile = userSnap.data() || {};
    if (profile.suspended === true || profile.inactive === true || profile.disabled === true
        || profile.active === false || profile.mergedInto != null) {
      throw new HttpsError('permission-denied', 'Your account is not active.');
    }
    requireActiveSession(request, profile);
    if (snap.exists) {
      existing = snap.data();
      return;
    }
    tx.create(opRef, {
      type: 'walletTransfer',
      uid,
      requestId,
      status: 'processing',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  if (existing) {
    if (existing.type !== 'walletTransfer' || existing.uid !== uid) {
      throw new HttpsError('failed-precondition', 'That request ID is already in use.');
    }
    if (existing.status === 'completed' && existing.transferId) {
      return { transferId: existing.transferId, amount: Number(existing.amount || 0), currency: existing.currency || 'MYR', recipientAmount: Number(existing.recipientAmount || 0), recipientCurrency: existing.recipientCurrency || 'MYR', baseAmountMyr: Number(existing.baseAmountMyr || 0), fxRate: Number(existing.fxRate || 0), recipientFxRate: Number(existing.recipientFxRate || 0), replay: true };
    }

    const recovered = await db.collection('walletTransfers')
      .where('participants', 'array-contains', uid)
      .where('requestId', '==', requestId)
      .limit(1)
      .get();
    if (!recovered.empty) {
      const doc = recovered.docs[0];
      const data = doc.data() || {};
      await opRef.update({
        status: 'completed',
        transferId: doc.id,
        amount: Number(data.amount || 0),
        currency: data.currency || 'MYR',
        recipientAmount: Number(data.recipientAmount || 0),
        recipientCurrency: data.recipientCurrency || 'MYR',
        baseAmountMyr: Number(data.baseAmountMyr || 0),
        fxRate: Number(data.senderFxRate || 0),
        recipientFxRate: Number(data.recipientFxRate || 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { transferId: doc.id, amount: Number(data.amount || 0), currency: data.currency || 'MYR', recipientAmount: Number(data.recipientAmount || 0), recipientCurrency: data.recipientCurrency || 'MYR', baseAmountMyr: Number(data.baseAmountMyr || 0), fxRate: Number(data.senderFxRate || 0), recipientFxRate: Number(data.recipientFxRate || 0), replay: true };
    }
    throw new HttpsError('aborted', 'This transfer is already being processed. Please wait and check your transfer history.');
  }

  try {
    const safeRequest = { ...request, data: { ...(request.data || {}), requestId } };
    const fn = walletTransferService.walletTransfer;
    if (!fn || typeof fn.run !== 'function') throw new HttpsError('internal', 'Wallet transfer service is unavailable.');
    const result = await fn.run(safeRequest);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(opRef);
      if (!snap.exists) return;
      tx.update(opRef, {
        status: 'completed',
        transferId: result?.transferId || null,
        amount: Number(result?.amount || 0),
        currency: result?.currency || 'MYR',
        recipientAmount: Number(result?.recipientAmount || 0),
        recipientCurrency: result?.recipientCurrency || 'MYR',
        baseAmountMyr: Number(result?.baseAmountMyr || 0),
        fxRate: Number(result?.fxRate || 0),
        recipientFxRate: Number(result?.recipientFxRate || 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (result?.transferId) {
        tx.update(db.collection('walletTransfers').doc(result.transferId), { requestId });
      }
    });
    return result;
  } catch (err) {
    await opRef.delete().catch(() => {});
    throw err;
  }
});
