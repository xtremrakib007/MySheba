const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertWalletUnfrozen } = require('./walletFreeze');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { logAudit, logServerError } = require('./logService');
const { getWalletCurrencyAndFx, baseToWallet } = require('./walletCurrencyService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { enforceRequestEnvelope } = require('./securityGateway');
const { addWalletLedgerEntry } = require('./walletLedgerService');
// One session per platform: a phone and a browser can both be signed in,
// two phones cannot. See functions/sessionSlots.js.
const { sessionMatches } = require('./sessionSlots');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;
function requireSessionMatch(request, user) {
  const sessionId = request.data?.sessionId;
  const deviceId = request.data?.deviceId;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId) || typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) throw new HttpsError('failed-precondition', 'Your secure session is missing. Please sign in again.');
  if (!sessionMatches(user, { sessionId, deviceId })) throw new HttpsError('permission-denied', 'This device session is no longer active. Please sign in again.');
}
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

exports.chargeWallet = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  enforceRequestEnvelope(request, { maxBytes: 16 * 1024 });
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
      // Revalidate the current account/session before returning any idempotent result.
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const liveUser = userSnap.data() || {};
      requireSessionMatch(request, liveUser);
      if (liveUser.suspended === true || liveUser.inactive === true || liveUser.disabled === true || liveUser.active === false || liveUser.mergedInto != null) {
        throw new HttpsError('permission-denied', 'Your account is not active.');
      }

      const opSnap = await tx.get(opRef);
      if (opSnap.exists) {
        const op = opSnap.data() || {};
        if (op.uid !== uid || op.type !== 'chargeWallet' || op.kind !== kind || op.key !== cleanKeyValue) {
          throw new HttpsError('already-exists', 'This request ID is already in use.');
        }
        return { ...(op.result || {}), replay: true };
      }

      const pricingSnap = await tx.get(db.collection('settings').doc('pricing'));
      if (!userSnap.exists) throw new HttpsError('not-found', 'Account not found.');
      const user = userSnap.data() || {};
      requireSessionMatch(request, user);
      if (user.suspended === true || user.inactive === true || user.disabled === true || user.active === false || user.mergedInto != null) {
        throw new HttpsError('permission-denied', 'Your account is not active.');
      }
      const pricing = { ...DEFAULT_PRICING, ...(pricingSnap.exists ? pricingSnap.data() : {}) };
      const balance = finiteNonNegative(user.walletBalance == null ? 0 : user.walletBalance, 'Wallet balance');
      let walletFx;
      try { walletFx = await getWalletCurrencyAndFx(db, user); } catch (fxErr) { throw new HttpsError('failed-precondition', fxErr.message || 'Wallet currency is not configured.'); }

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
      assertWalletUnfrozen(user, 'Your wallet');
      if (!field) throw new HttpsError('failed-precondition', 'Wallet charge target is invalid.');
      const walletCost = baseToWallet(cost, walletFx);
      if (balance < walletCost) throw new HttpsError('failed-precondition', `You need ${walletCost.toFixed(2)} ${walletFx.currency} in your wallet.`);
      const newBalance = balance - walletCost;
      resultData = { ...resultData, baseCostMyr: cost, walletCost, currency: walletFx.currency, fxRate: walletFx.sellRate, fxRateType: 'sell', fxRateSource: walletFx.rateSource };
      if (!Number.isSafeInteger(Math.round(newBalance * 100))) throw new HttpsError('failed-precondition', 'The resulting wallet balance is invalid.');
      const updates = { walletBalance: newBalance, walletCurrency: walletFx.currency, walletBalanceCurrency: walletFx.currency, [field]: now };
      tx.update(userRef, updates);
      addWalletLedgerEntry(tx, db, {
        uid,
        type: 'wallet_service_debit',
        direction: 'debit',
        currency: walletFx.currency,
        amount: walletCost,
        balanceBefore: balance,
        balanceAfter: newBalance,
        relatedTransactionId: opRef.id,
        idempotencyKey: rid,
        source: 'service_charge',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.create(opRef, { uid, type: 'chargeWallet', kind, key: cleanKeyValue, requestId: rid, cost, walletCost: resultData.walletCost, currency: resultData.currency, fxRate: resultData.fxRate, fxRateType: resultData.fxRateType, status: 'completed', result: resultData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return resultData;
    });
    if (result.charged) await logAudit({ action: 'wallet_charged', targetUid: uid, performedBy: uid, performedByRole: 'user', details: { kind, key: cleanKeyValue, cost: result.walletCost ?? result.cost, baseCostMyr: result.baseCostMyr ?? result.cost, currency: result.currency || 'MYR', fxRate: result.fxRate || 1, requestId: rid } });
    return result;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('chargeWallet', error, { userId: uid, requestId: rid });
    throw new HttpsError('internal', 'Could not complete the wallet charge.');
  }
});