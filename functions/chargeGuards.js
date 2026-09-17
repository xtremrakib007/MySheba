const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const walletService = require('./walletService');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const SERVICE_BY_CALLABLE = {
  chargeRecharge: 'recharge',
  chargeInternetPackage: 'internet',
  chargeMobileBanking: 'mobilebanking',
  chargeRemittance: 'remittance',
};

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function getRequestId(request) {
  const requestId = request.data?.requestId;
  if (typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId)) {
    throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  }
  return requestId;
}

async function recoverCompleted(db, uid, requestId, service, guardRef) {
  const recovered = await db.collection('transactions')
    .where('customerId', '==', uid)
    .where('raw.requestId', '==', requestId)
    .where('chargedServiceKind', '==', service)
    .limit(1)
    .get();
  if (recovered.empty) return null;
  const txDoc = recovered.docs[0];
  const txData = txDoc.data() || {};
  const cost = Number(txData.pointsCharged ?? txData.cost ?? 0);
  if (!Number.isFinite(cost) || cost < 0) return null;
  await guardRef.set({
    status: 'completed', transactionId: txDoc.id, cost,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id: txDoc.id, cost, replay: true };
}

async function sanitizeRequest(request, requestId, callableName) {
  const uid = requireAuth(request);
  const service = SERVICE_BY_CALLABLE[callableName];
  if (!service) throw new HttpsError('internal', 'Unknown charge service.');
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Account not found.');
  const profile = snap.data() || {};
  const balance = Number(profile.walletBalance || 0);
  if (!Number.isFinite(balance) || balance < 0 || !Number.isSafeInteger(Math.round(balance * 100))) {
    throw new HttpsError('failed-precondition', 'Wallet balance is invalid.');
  }

  const customer = {
    uid,
    phone: profile.phone || '',
    resellerId: profile.resellerId || null,
    dealerId: profile.dealerId || null,
    role: profile.role || '',
  };

  const incomingData = request.data || {};
  const incomingPayload = incomingData.payload || {};
  const payload = {
    ...incomingPayload,
    // These fields are accounting metadata. Never let the caller choose them.
    service,
    cost: 0,
    profit: 0,
    raw: { ...(incomingPayload.raw || {}), requestId },
  };

  return { ...request, data: { ...incomingData, payload, requestId, customer } };
}

function wrap(name) {
  return onCall(async (request) => {
    const uid = requireAuth(request);
    const requestId = getRequestId(request);
    const service = SERVICE_BY_CALLABLE[name];
    if (!service) throw new HttpsError('internal', 'Unknown charge service.');
    const db = admin.firestore();
    const guardRef = db.collection('chargeRequests').doc(`${uid}_${requestId}`);

    let existing = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(guardRef);
      if (snap.exists) { existing = snap.data(); return; }
      tx.create(guardRef, {
        uid, requestId, callable: name, service, status: 'processing',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (existing) {
      if (existing.callable !== name || existing.service !== service) {
        throw new HttpsError('already-exists', 'This request ID was already used for another operation.');
      }
      if (existing.status === 'completed' && existing.transactionId) {
        return { id: existing.transactionId, cost: existing.cost || 0, replay: true };
      }
      const recovered = await recoverCompleted(db, uid, requestId, service, guardRef);
      if (recovered) return recovered;
      throw new HttpsError('aborted', 'This order is already being processed. Please wait and check your transaction history.');
    }

    const fn = walletService[name];
    if (!fn || typeof fn.run !== 'function') {
      await guardRef.delete().catch(() => {});
      throw new HttpsError('internal', 'Charge service is unavailable.');
    }

    try {
      const safeRequest = await sanitizeRequest(request, requestId, name);
      const result = await fn.run(safeRequest);
      await guardRef.update({
        status: 'completed', transactionId: result?.id || null,
        cost: Number(result?.cost || 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return result;
    } catch (err) {
      // A wallet transaction can commit before the callable response or guard
      // update fails. Recover the committed transaction before releasing the
      // guard; otherwise a retry could charge the same request twice.
      const recovered = await recoverCompleted(db, uid, requestId, service, guardRef).catch(() => null);
      if (recovered) return recovered;
      await guardRef.delete().catch(() => {});
      throw err;
    }
  });
}

exports.chargeRecharge = wrap('chargeRecharge');
exports.chargeInternetPackage = wrap('chargeInternetPackage');
exports.chargeMobileBanking = wrap('chargeMobileBanking');
exports.chargeRemittance = wrap('chargeRemittance');