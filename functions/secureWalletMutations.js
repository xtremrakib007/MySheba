const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const walletService = require('./walletService');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;

function requireRequest(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const requestId = request.data?.requestId;
  if (typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId)) {
    throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  }
  return { uid: request.auth.uid, requestId };
}

function safeResult(result) {
  if (!result || typeof result !== 'object') return {};
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v)));
}

function wrap(name) {
  return onCall(async (request) => {
    const { uid, requestId } = requireRequest(request);
    const db = admin.firestore();
    const opRef = db.collection('walletOperations').doc(`${uid}_${name}_${requestId}`);
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
      throw new HttpsError('internal', 'Wallet service is unavailable.');
    }

    try {
      const result = await fn.run({ ...request, data: { ...(request.data || {}), requestId } });
      await opRef.update({
        status: 'completed',
        result: safeResult(result),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return result;
    } catch (err) {
      await opRef.delete().catch(() => {});
      throw err;
    }
  });
}

exports.createSelfTopup = wrap('createSelfTopup');
