const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const walletService = require('./walletService');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;

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

function operationKey(uid, name, requestId) {
  return `${uid}_${name}_${requestId}`;
}

function resultFields(result) {
  const safe = result && typeof result === 'object' ? result : {};
  return Object.fromEntries(Object.entries(safe).filter(([, value]) => (
    value === null || ['string', 'number', 'boolean'].includes(typeof value)
  )));
}

function wrap(name) {
  return onCall(async (request) => {
    const uid = requireAuth(request);
    const requestId = getRequestId(request);
    const db = admin.firestore();
    const opRef = db.collection('walletOperations').doc(operationKey(uid, name, requestId));

    let existing = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(opRef);
      if (snap.exists) existing = snap.data();
      else tx.create(opRef, {
        uid,
        type: name,
        requestId,
        status: 'processing',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (existing) {
      if (existing.uid !== uid || existing.type !== name || existing.requestId !== requestId) {
        throw new HttpsError('already-exists', 'This request ID is already in use.');
      }
      if (existing.status === 'completed') return { ...(existing.result || {}), replay: true };
      throw new HttpsError('aborted', 'This operation is already being processed. Please wait and check your history.');
    }

    const fn = walletService[name];
    if (!fn || typeof fn.run !== 'function') {
      await opRef.delete().catch(() => {});
      throw new HttpsError('internal', 'Game Points service is unavailable.');
    }

    try {
      const safeRequest = { ...request, data: { ...(request.data || {}), requestId } };
      const result = await fn.run(safeRequest);
      const safeResult = resultFields(result);
      await opRef.update({
        status: 'completed',
        result: safeResult,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return result;
    } catch (err) {
      await opRef.delete().catch(() => {});
      throw err;
    }
  });
}

exports.chargeGamePoints = wrap('chargeGamePoints');
exports.withdrawGamePoints = wrap('withdrawGamePoints');
exports.transferGamePoints = wrap('transferGamePoints');
