const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { logAudit, logServerError } = require('./logService');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_KEY_LENGTH = 200;
const DEFAULT_PRICING = {
  webviewAccessCost: 2,
  webviewSubmitCost: 2,
  paymentSuccessCost: 3,
  notepadCost: 0,
  myDocumentsCost: 0,
  salaryOtCost: 0,
  moduleSubscriptionDays: 30,
  webviewAccessWindowHours: 1,
};

function auth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function requestId(request) {
  const id = request.data?.requestId;
  if (typeof id !== 'string' || !REQUEST_ID_RE.test(id)) {
    throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  }
  return id;
}

function cleanKey(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_KEY_LENGTH || !/^[A-Za-z0-9_.:-]+$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Invalid charge key.');
  }
  return value;
}

function finiteNonNegative(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) {
    throw new HttpsError('failed-precondition', `${label} is invalid.`);
  }
  return n;
}

function priceForRole(pricing, key, role) {
  const roleValue = role && pricing.rolePricing?.[role]?.[key];
  return roleValue != null ? roleValue : pricing[key];
}

exports.chargeWallet = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = auth(request);
  const rid = requestId(request);
  const { kind, key } = request.data || {};
  const validKinds = ['webview_access', 'webview_submit', 'payment_success', 'module_subscription'];
  if (!validKinds.includes(kind)) throw new HttpsError('invalid-argument', 'Invalid charge.');
  const cleanKeyValue = cleanKey(key);
  const db = admin.firestore();

  await checkVelocity(db, uid, 'chargeWallet', { ip: getClientIp(request) });

  const userRef = db.collection('users').doc(uid);
  const opRef = db.collection('walletOperations').doc(`${uid}_chargeWallet_${rid}`);
  try {
    const result = await db.runTransaction(async (tx) => {
      const opSnap = await tx.get(opRef);
      if (opSnap.exists) {
        const op = opSnap.data() || {};
        if (op.uid !== uid || op.type !== 'chargeWallet' || op.kind !== kind || op.key !== cleanKeyValue) {
          throw new HttpsError('already-exists', 'This request ID is already in use.');
        }
        return { ...(op.result || {}), replay: true };
      }

      const [userSnap, pricingSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(db.collection('settings').doc('pricing')),
      ]);
      if (!userSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const user = userSnap.data() || {};
      if (user.suspended === true || user.inactive === true || user.disabled === true || user.active === false || user.mergedInto != null) {
        throw new HttpsError('permission-denied', 'Your account is not active.');
      }
      const pricing = { ...DEFAULT_PRICING, ...(pricingSnap.exists ? pricingSnap.data() : {}) };
      const balance = finiteNonNegative(user.walletBalance || 0, 'Wallet balance');

      let cost;
      let resultData;
      let field = null;
      let freeWindowMs = 0;
      const now = Date.now();

      if (kind === 'webview_access') {
        cost = finiteNonNegative(priceForRole(pricing, 'webviewAccessCost', user.role), 'Access charge');
        const hours = Number(pricing.webviewAccessWindowHours);
        if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 365) throw new HttpsError('failed-precondition', 'Access charge window is invalid.');
        freeWindowMs = hours * 3600000;
        const last = user.lastAccessCharge?.[cleanKeyValue];
        if (Number.isFinite(Number(last)) && freeWindowMs > 0 && now - Number(last) < freeWindowMs) resultData = { charged: false, freeUntil: Number(last) + freeWindowMs };
        else { field = `lastAccessCharge.${cleanKeyValue}`; resultData = { charged: true, cost, freeUntil: now + freeWindowMs }; }
      } else if (kind === 'webview_submit') {
        cost = finiteNonNegative(priceForRole(pricing, 'webviewSubmitCost', user.role), 'Submit charge');
        const last = user.webviewSubmitted?.[cleanKeyValue];
        if (last) resultData = { charged: false, submittedAt: last };
        else { field = `webviewSubmitted.${cleanKeyValue}`; resultData = { charged: true, cost, submittedAt: now }; }
      } else if (kind === 'payment_success') {
        cost = finiteNonNegative(priceForRole(pricing, 'paymentSuccessCost', user.role), 'Payment charge');
        const last = user.lastPaymentCharge?.[cleanKeyValue];
        if (last) resultData = { charged: false, chargedAt: last };
        else { field = `lastPaymentCharge.${cleanKeyValue}`; resultData = { charged: true, cost, chargedAt: now }; }
      } else {
        const moduleKeys = { notepad: 'notepadCost', myDocuments: 'myDocumentsCost', salaryOt: 'salaryOtCost' };
        const pricingKey = moduleKeys[cleanKeyValue];
        if (!pricingKey) throw new HttpsError('invalid-argument', 'Unknown module.');
        cost = finiteNonNegative(priceForRole(pricing, pricingKey, user.role), 'Module charge');
        const days = Number(pricing.moduleSubscriptionDays);
        if (!Number.isFinite(days) || days <= 0 || days > 3650) throw new HttpsError('failed-precondition', 'Module subscription period is invalid.');
        const last = user.moduleSubscription?.[cleanKeyValue];
        const windowMs = days * 86400000;
        if (Number.isFinite(Number(last)) && now - Number(last) < windowMs) resultData = { charged: false, subscribedUntil: Number(last) + windowMs };
        else { field = `moduleSubscription.${cleanKeyValue}`; resultData = { charged: true, cost, subscribedUntil: now + windowMs }; }
      }

      if (!resultData.charged) {
        tx.create(opRef, { uid, type: 'chargeWallet', kind, key: cleanKeyValue, requestId: rid, result: resultData, status: 'completed', createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return resultData;
      }
      if (!field) throw new HttpsError('failed-precondition', 'Wallet charge target is invalid.');
      if (balance < cost) throw new HttpsError('failed-precondition', `You need ${cost} pts.`);
      const newBalance = balance - cost;
      if (!Number.isSafeInteger(Math.round(newBalance * 100))) throw new HttpsError('failed-precondition', 'The resulting wallet balance is invalid.');
      const updates = { walletBalance: newBalance, [field]: now };
      tx.update(userRef, updates);
      tx.create(opRef, { uid, type: 'chargeWallet', kind, key: cleanKeyValue, requestId: rid, cost, status: 'completed', result: resultData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return resultData;
    });
    if (result.charged) await logAudit({ action: 'wallet_charged', targetUid: uid, performedBy: uid, performedByRole: 'user', details: { kind, key: cleanKeyValue, cost: result.cost, requestId: rid } });
    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('chargeWallet', error, { userId: uid, requestId: rid });
    throw new HttpsError('internal', 'Could not complete the wallet charge.');
  }
});