const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const walletTransferService = require('./walletTransferService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

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

exports.walletTransfer = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const requestId = getRequestId(request);
  const db = admin.firestore();
  const opRef = db.collection('walletOperations').doc(`${uid}_walletTransfer_${requestId}`);

  let existing = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(opRef);
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
