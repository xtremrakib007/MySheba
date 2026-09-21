const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const progressionService = require('./progressionService');
const { executeConfiguredApi } = require('./apiProviderService');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const PIN_SERVICE = 'Recharge PIN';

function active(u) {
  return !!u && u.suspended !== true && u.inactive !== true && u.disabled !== true &&
    u.active !== false && u.mergedInto == null;
}

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function safeNumber(v, label) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || !Number.isSafeInteger(Math.round(n * 100))) {
    throw new HttpsError('invalid-argument', `${label} must be greater than zero.`);
  }
  return Math.round(n * 100) / 100;
}

function requestIdOf(request) {
  const id = request.data?.requestId;
  if (typeof id !== 'string' || !REQUEST_ID_RE.test(id)) {
    throw new HttpsError('invalid-argument', 'A valid requestId is required.');
  }
  return id;
}

exports.purchaseRechargePin = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const requestId = requestIdOf(request);
  const db = admin.firestore();
  const input = request.data || {};
  const operator = typeof input.operator === 'string' ? input.operator.trim().slice(0, 80) : '';
  const denomination = safeNumber(input.amount, 'Recharge PIN amount');
  if (!operator) throw new HttpsError('invalid-argument', 'Select a Malaysian mobile operator.');

  const profileRef = db.collection('users').doc(uid);
  const txId = crypto.createHash('sha256').update(`${uid}|recharge-pin|${requestId}`).digest('hex').slice(0, 40);
  const txRef = db.collection('transactions').doc(txId);

  const settingsSnap = await db.collection('api_settings').doc('service_modes').get();
  const mode = settingsSnap.exists ? settingsSnap.data()?.modes?.[PIN_SERVICE] || 'legacy' : 'legacy';
  if (mode !== 'api') {
    throw new HttpsError('failed-precondition', 'Recharge PIN is not configured for API processing yet.');
  }

  const pricingSnap = await db.collection('settings').doc('pricing').get();
  const pricing = pricingSnap.exists ? pricingSnap.data() || {} : {};
  const priceMultiplier = Number(pricing.rolePricing?.customer?.rechargePointCostPerUnit ?? pricing.rechargePointCostPerUnit ?? 1);
  if (!Number.isFinite(priceMultiplier) || priceMultiplier <= 0) {
    throw new HttpsError('failed-precondition', 'Recharge PIN pricing is not configured correctly.');
  }

  const tierSettings = await progressionService.getProgressionSettings();
  const userSnap = await profileRef.get();
  if (!userSnap.exists || !active(userSnap.data()) || userSnap.data().role !== 'customer') {
    throw new HttpsError('permission-denied', 'Only active customer accounts can purchase Recharge PINs.');
  }
  const discount = progressionService.discountPercentFromSettings(tierSettings, userSnap.data().tier);
  const cost = Math.round(denomination * priceMultiplier * (1 - discount / 100) * 100) / 100;
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isSafeInteger(Math.round(cost * 100))) {
    throw new HttpsError('failed-precondition', 'Recharge PIN price is invalid.');
  }

  const reserved = await db.runTransaction(async tx => {
    const pinRef = db.collection('rechargePins').doc(txRef.id);
    const [user, existing, pinDoc] = await Promise.all([tx.get(profileRef), tx.get(txRef), tx.get(pinRef)]);
    if (existing.exists) {
      const d = existing.data() || {};
      if (d.customerId !== uid) throw new HttpsError('permission-denied', 'This request ID belongs to another account.');
      if (d.status === 'completed' && d.rechargePinAvailable === true && pinDoc.exists && typeof pinDoc.data()?.pin === 'string' && pinDoc.data().pin) {
        return { replay: true, id: txRef.id, cost: Number(d.cost) || 0, pin: pinDoc.data().pin, operator: d.operator || operator, amount: Number(d.amount) || denomination };
      }
      if (d.status === 'unknown') throw new HttpsError('unavailable', 'The provider outcome is uncertain. Please verify the provider before retrying.');
      if (d.status === 'pending' || d.status === 'processing') throw new HttpsError('aborted', 'This Recharge PIN request is already being processed.');
      throw new HttpsError('failed-precondition', 'This Recharge PIN request has already failed.');
    }
    if (!user.exists || !active(user.data()) || user.data().role !== 'customer') {
      throw new HttpsError('permission-denied', 'Your customer account is not active.');
    }
    const balance = Number(user.data().walletBalance || 0);
    if (!Number.isFinite(balance) || balance < 0 || !Number.isSafeInteger(Math.round(balance * 100))) {
      throw new HttpsError('failed-precondition', 'Wallet balance is invalid.');
    }
    if (balance < cost) throw new HttpsError('failed-precondition', `You need ${cost} pts - top up your wallet first.`);
    tx.update(profileRef, { walletBalance: balance - cost });
    tx.create(txRef, {
      service: PIN_SERVICE, customerId: uid, customerRole: 'customer',
      customerPhone: user.data().phone || '', operator, amount: denomination, total: denomination,
      cost, pointsCharged: cost, tierDiscountPercent: discount, executionMode: 'api',
      status: 'processing', rechargePinAvailable: false, apiRefunded: false, raw: { requestId, country: 'MY', operator },
      createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { replay: false, id: txRef.id, cost, pin: null, operator, amount: denomination };
  });

  if (reserved.replay) return reserved;

  try {
    const api = await executeConfiguredApi(PIN_SERVICE, {
      amount: denomination,
      total: denomination,
      details: `Malaysia Recharge PIN • ${operator}`,
      raw: { requestId, country: 'MY', operator, amount: denomination, packageCode: String(denomination) }
    }, { uid, phone: userSnap.data().phone || '' }, requestId, { extractPath: undefined });

    if (!api.secret) {
      throw new HttpsError('unavailable', 'The Recharge PIN provider completed but the voucher PIN could not be recovered. Please contact support before retrying.');
    }

    await db.collection('rechargePins').doc(txRef.id).set({
      transactionId: txRef.id, customerId: uid, operator, amount: denomination,
      pin: api.secret, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await txRef.update({
      status: 'completed',
      rechargePinAvailable: true,
      apiExecution: { status: 'accepted', providerId: api.providerId, providerName: api.providerName, responseId: api.responseId || null, message: api.message || null, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { id: txRef.id, cost: reserved.cost, pin: api.secret, operator, amount: denomination };
  } catch (e) {
    const unavailable = String(e?.code || '') === 'unavailable';
    if (unavailable) {
      await txRef.update({ status: 'unknown', apiExecution: { status: 'unknown', error: String(e?.message || 'Provider outcome is uncertain').slice(0, 500), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      throw e;
    }
    await db.runTransaction(async tx => {
      const [u, t] = await Promise.all([tx.get(profileRef), tx.get(txRef)]);
      if (!t.exists || t.data().status !== 'processing' || t.data().apiRefunded === true) return;
      const balance = Number(u.data()?.walletBalance || 0);
      const refund = Number(reserved.cost || 0);
      if (!Number.isFinite(balance) || !Number.isFinite(refund) || refund <= 0 || !Number.isSafeInteger(Math.round((balance + refund) * 100))) {
        throw new HttpsError('failed-precondition', 'The provider failed and the wallet could not be safely refunded. Please contact support.');
      }
      tx.update(profileRef, { walletBalance: balance + refund });
      tx.update(txRef, { status: 'failed', apiRefunded: true, apiError: String(e?.message || 'Provider execution failed').slice(0, 500), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    throw e instanceof HttpsError ? e : new HttpsError('failed-precondition', 'Recharge PIN provider rejected the request.');
  }

exports.getRechargePin = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const transactionId = typeof request.data?.transactionId === 'string' ? request.data.transactionId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(transactionId)) throw new HttpsError('invalid-argument', 'Invalid transaction ID.');
  const db = admin.firestore();
  const txSnap = await db.collection('transactions').doc(transactionId).get();
  if (!txSnap.exists || txSnap.data()?.customerId !== uid || txSnap.data()?.service !== PIN_SERVICE) {
    throw new HttpsError('not-found', 'Recharge PIN transaction not found.');
  }
  if (txSnap.data()?.status !== 'completed' || txSnap.data()?.rechargePinAvailable !== true) {
    throw new HttpsError('failed-precondition', 'This Recharge PIN is not available yet.');
  }
  const pinSnap = await db.collection('rechargePins').doc(transactionId).get();
  if (!pinSnap.exists || pinSnap.data()?.customerId !== uid) {
    throw new HttpsError('not-found', 'Recharge PIN is unavailable. Contact support if you were charged.');
  }
  return { id: transactionId, operator: pinSnap.data()?.operator || txSnap.data()?.operator || '', amount: Number(pinSnap.data()?.amount || txSnap.data()?.amount || 0), pin: pinSnap.data()?.pin || '' };
});

});
