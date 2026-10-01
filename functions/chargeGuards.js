const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const walletService = require('./walletService');
const { checkVelocity, getClientIp } = require('./rateLimitService');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const SERVICE_BY_CALLABLE = {
  chargeRecharge: 'Recharge',
  chargeInternetPackage: 'Internet',
  chargeEntertainment: 'Entertainment',
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
  // walletService uses this same deterministic transaction ID. Recovering by
  // document ID avoids a composite/nested-field query and guarantees that a
  // request ID cannot accidentally recover another transaction.
  const transactionId = crypto.createHash('sha256')
    .update(`${uid}|${String(expectedService || '').trim().toLowerCase().replace(/\\s+/g, '')}|${requestId}`)
    .digest('hex')
    .slice(0, 40);
  const txDoc = await db.collection('transactions').doc(transactionId).get();
  if (!txDoc.exists) return null;
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
  // Customer-facing financial services are available to every active role.
  // Role-specific management permissions remain enforced by their own callables;
  // these service charges only require an active authenticated account.

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
  return onCall({ enforceAppCheck: false }, async (request) => {
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
        const replayTx = await db.collection('transactions').doc(existing.transactionId).get();
        if (!replayTx.exists) {
          throw new HttpsError('failed-precondition', 'The stored charge record is missing. Please contact support before retrying.');
        }
        const replayData = replayTx.data() || {};
        if (replayData.customerId !== uid ||
            replayData.service !== SERVICE_BY_CALLABLE[name] ||
            replayData.status !== 'completed') {
          throw new HttpsError('failed-precondition', 'The stored charge record is inconsistent. Please contact support before retrying.');
        }
        const storedCost = Number(replayData.pointsCharged ?? replayData.cost);
        if (!Number.isFinite(storedCost) || storedCost < 0 ||
            !Number.isSafeInteger(Math.round(storedCost * 100)) ||
            Math.abs(storedCost - replayCost) > 0.01) {
          throw new HttpsError('failed-precondition', 'The stored charge amount is inconsistent. Please contact support before retrying.');
        }
        return {
          id: existing.transactionId,
          cost: storedCost,
          collectionPin: typeof replayData.pin === 'string' ? replayData.pin : '',
          replay: true,
        };
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

      const fn = walletService.runChargeProduct;
      if (typeof fn !== 'function') {
        throw new HttpsError('internal', 'Charge service is unavailable.');
      }
      const safeRequest = await sanitizeRequest(request, requestId);
      const serviceKey = SERVICE_BY_CALLABLE[name].toLowerCase().replace(' ', '');
      const result = await fn(safeRequest, serviceKey);
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
exports.chargeEntertainment = wrap('chargeEntertainment');
exports.chargeBillPayment = wrap('chargeBillPayment');
exports.chargeMobileBanking = wrap('chargeMobileBanking');
exports.chargeRemittance = wrap('chargeRemittance');
