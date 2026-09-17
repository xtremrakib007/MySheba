const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const walletService = require('./walletService');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const RECHARGE_COUNTRIES = new Set(['BD', 'IN', 'NP', 'PK', 'PH', 'ID', 'MM', 'KH']);
const REMITTANCE_COUNTRIES = new Set(['BD', 'NP', 'PK', 'PH', 'LK', 'IN', 'ID', 'MM']);
const SERVICE_LABELS = {
  chargeRecharge: 'Recharge',
  chargeInternetPackage: 'Internet',
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

function isActiveAccount(profile) {
  return profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto;
}

async function assertActiveAccount(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Account not found.');
  if (!isActiveAccount(snap.data() || {})) throw new HttpsError('permission-denied', 'Your account is not active.');
}

async function recoverCompleted(db, uid, requestId, guardRef) {
  const recovered = await db.collection('transactions')
    .where('customerId', '==', uid)
    .where('raw.requestId', '==', requestId)
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

function validateCountry(name, payload) {
  const raw = payload?.raw || {};
  const country = raw.country == null ? '' : String(raw.country).trim().toUpperCase();
  if (name === 'chargeRemittance') {
    if (!country || !REMITTANCE_COUNTRIES.has(country)) {
      throw new HttpsError('invalid-argument', 'A supported remittance country is required.');
    }
  } else if (name === 'chargeRecharge' || name === 'chargeInternetPackage') {
    // Missing country preserves the existing Malaysia/default behavior. Explicit
    // unsupported countries must never silently fall back to a 1:1 exchange rate.
    if (country && country !== 'MY' && !RECHARGE_COUNTRIES.has(country)) {
      throw new HttpsError('invalid-argument', 'Unsupported recharge country.');
    }
    if (raw.country && raw.country !== country) raw.country = country;
  }
}

function sanitizeFinancialInputs(name, payload) {
  const raw = { ...(payload.raw || {}) };
  // These are reportable financial fields and must never be supplied by the
  // client. walletService calculates the authoritative debit as pointsCharged.
  delete payload.cost;
  delete payload.profit;

  const numericFields = name === 'chargeMobileBanking'
    ? ['myr']
    : name === 'chargeRemittance'
      ? ['sendAmt']
      : ['amount'];
  for (const field of numericFields) {
    if (raw[field] == null || raw[field] === '') continue;
    const value = Number(raw[field]);
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) {
      throw new HttpsError('invalid-argument', 'Invalid amount.');
    }
    raw[field] = Math.round(value * 100) / 100;
  }
  payload.raw = raw;
}

async function sanitizeRequest(request, requestId, name) {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Account not found.');
  const profile = snap.data() || {};
  if (!isActiveAccount(profile)) throw new HttpsError('permission-denied', 'Your account is not active.');
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
    service: SERVICE_LABELS[name],
    details: typeof incomingPayload.details === 'string' ? incomingPayload.details.slice(0, 2000) : '',
    raw: { ...(incomingPayload.raw || {}), requestId },
  };
  sanitizeFinancialInputs(name, payload);
  validateCountry(name, payload);

  return { ...request, data: { ...incomingData, payload, requestId, customer } };
}

function wrap(name) {
  return onCall({ enforceAppCheck: true }, async (request) => {
    const uid = requireAuth(request);
    const requestId = getRequestId(request);
    const db = admin.firestore();

    await assertActiveAccount(db, uid);

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
        return { id: existing.transactionId, cost: existing.cost || 0, replay: true };
      }
      const recovered = await recoverCompleted(db, uid, requestId, guardRef);
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
      const recovered = await recoverCompleted(db, uid, requestId, guardRef).catch(() => null);
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