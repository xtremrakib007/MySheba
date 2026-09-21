const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const walletService = require('./walletService');
const { checkVelocity, getClientIp } = require('./rateLimitService');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const SERVICE_BY_CALLABLE = {
  chargeRecharge: 'Recharge',
  chargeInternetPackage: 'Internet',
  chargeBillPayment: 'Bill Payment',
  chargeMobileBanking: 'Mobile Banking',
  chargeRemittance: 'Remittance',
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

async function recoverChargedRequest(db, uid, requestId, guardRef, expectedService) {
  const recovered = await db.collection('transactions')
    .where('customerId', '==', uid)
    .where('raw.requestId', '==', requestId)
    .where('service', '==', expectedService)
    .limit(1)
    .get();
  if (recovered.empty) return null;
  const txDoc = recovered.docs[0];
  const txData = txDoc.data() || {};
  if (txData.status === 'unknown') {
    throw new HttpsError('unavailable', 'The API request outcome is uncertain. Check the provider before retrying.');
  }
  // Only a completed transaction proves that the downstream service
  // completed. Pending/processing means the wallet charge exists but the
  // provider/service still needs to be resumed through the idempotent runner.
  // Never mark those states completed here or the customer could receive a
  // false success without receiving the purchased service.
  if (txData.status !== 'completed') return null;
  const rawCost = txData.pointsCharged ?? txData.cost;
  const cost = Number(rawCost);
  if (!Number.isFinite(cost) || cost < 0 || !Number.isSafeInteger(Math.round(cost * 100))) return null;
  await guardRef.set({
    status: 'completed', transactionId: txDoc.id, cost,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return {
    id: txDoc.id,
    cost,
    collectionPin: typeof txData.pin === 'string' ? txData.pin : '',
    replay: true,
  };
}

async function sanitizeRequest(request, requestId) {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Account not found.');
  const profile = snap.data() || {};
  if (profile.suspended === true || profile.inactive === true || profile.disabled === true || profile.active === false || profile.mergedInto != null) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  if (profile.role !== 'customer') {
    throw new HttpsError('permission-denied', 'Only customer accounts can submit service orders.');
  }
  const balance = profile.walletBalance == null ? 0 : Number(profile.walletBalance);
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
    raw: { ...(incomingPayload.raw || {}), requestId },
  };

  return { ...request, data: { ...incomingData, payload, requestId, customer } };
}

function wrap(name) {
  return onCall({ enforceAppCheck: true }, async (request) => {
    const uid = requireAuth(request);
    const requestId = getRequestId(request);
    const db = admin.firestore();
    const guardRef = db.collection('chargeRequests').doc(`${uid}_${requestId}`);

    let existing = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(guardRef);
      if (snap.exists) { existing = snap.data(); return; }
      tx.create(guardRef, {
        uid, requestId, callable: name, status: 'processing',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (existing) {
      if (existing.callable !== name) throw new HttpsError('already-exists', 'This request ID was already used for another operation.');
      if (existing.status === 'completed' && existing.transactionId) {
        const replayCost = existing.cost == null ? 0 : Number(existing.cost);
        if (!Number.isFinite(replayCost) || replayCost < 0 || !Number.isSafeInteger(Math.round(replayCost * 100))) throw new HttpsError('failed-precondition', 'The stored charge result is invalid.');
        return { id: existing.transactionId, cost: replayCost, replay: true };
      }
      const recovered = await recoverChargedRequest(db, uid, requestId, guardRef, SERVICE_BY_CALLABLE[name]);
      if (recovered) return recovered;

      // A committed transaction can exist while the first invocation was
      // interrupted before the configured provider call completed. Resume
      // through the internal runner, not the Firebase onCall wrapper.
      const fn = walletService.runChargeProduct;
      if (typeof fn !== 'function') throw new HttpsError('internal', 'Charge service is unavailable.');
      const safeRequest = await sanitizeRequest(request, requestId);
      const result = await fn(safeRequest, SERVICE_BY_CALLABLE[name].toLowerCase().replace(' ', ''));
      await guardRef.set({
        status: 'completed',
        transactionId: result?.id || null,
        cost: result?.cost == null ? 0 : Number(result.cost),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return result;
    }

    try {
      await checkVelocity(db, uid, 'chargeService', { ip: getClientIp(request) });

      const fn = walletService[name];
      if (!fn || typeof fn.run !== 'function') {
        throw new HttpsError('internal', 'Charge service is unavailable.');
      }
      const safeRequest = await sanitizeRequest(request, requestId);
      const result = await fn.run(safeRequest);
      await guardRef.update({
        status: 'completed', transactionId: result?.id || null,
        cost: result?.cost == null ? 0 : Number(result.cost),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return result;
    } catch (err) {
      const recovered = await recoverChargedRequest(db, uid, requestId, guardRef, SERVICE_BY_CALLABLE[name]).catch((err) => { if (err?.code === 'unavailable') throw err; return null; });
      if (recovered) return recovered;
      if (err?.code !== 'unavailable') await guardRef.delete().catch(() => {});
      throw err;
    }
  });
}

exports.chargeRecharge = wrap('chargeRecharge');
exports.chargeInternetPackage = wrap('chargeInternetPackage');
exports.chargeBillPayment = wrap('chargeBillPayment');
exports.chargeMobileBanking = wrap('chargeMobileBanking');
exports.chargeRemittance = wrap('chargeRemittance');
