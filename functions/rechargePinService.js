const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertWalletUnfrozen } = require('./walletFreeze');
const crypto = require('crypto');
const progressionService = require('./progressionService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { executeConfiguredApi, resolveExecutionMode, providersForService } = require('./apiProviderService');
const { getWalletCurrencyAndFx, baseToWallet } = require('./walletCurrencyService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
// One session per platform: a phone and a browser can both be signed in,
// two phones cannot. See functions/sessionSlots.js.
const { sessionMatches } = require('./sessionSlots');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;
const PIN_SERVICE = 'Recharge PIN';
const PIN_STOCK_ADMIN_ROLES = new Set(['superadmin']);
const MAX_PIN_UPLOAD = 5000;
const PIN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{3,127}$/;
function requireSuperadmin(request) {
  const uid = requireAuth(request);
  return admin.firestore().collection('users').doc(uid).get().then(snap => {
    const user = snap.exists ? (snap.data() || {}) : null;
    if (!active(user) || !PIN_STOCK_ADMIN_ROLES.has(String(user.role || ''))) {
      throw new HttpsError('permission-denied', 'Only an active superadmin can manage Recharge PIN stock.');
    }
    return uid;
  });
}
function normalizeInventoryPin(entry) {
  const pin = typeof entry?.pin === 'string' ? entry.pin.trim() : '';
  const serial = typeof entry?.serial === 'string' ? entry.serial.trim().slice(0, 128) : '';
  if (!PIN_RE.test(pin)) throw new HttpsError('invalid-argument', 'Each Recharge PIN must be 4-128 letters/numbers or ._- characters.');
  return { pin, serial };
}
function inventoryDocId(pin) {
  return 'inventory_' + crypto.createHash('sha256').update(pin).digest('hex');
}
// Mirrors rechargePinBrands.MY in src/data/countries.js, which is what the
// picker renders. The two are separate files on separate sides of the wire and
// cannot import each other, so a test asserts they stay equal - adding a brand
// to the screen alone got as far as "Select a supported Malaysian mobile
// operator", from here, after the customer had already chosen it.
//
// Touch 'n Go is a wallet rather than a telco, and is here because it is sold
// as a voucher like the rest.
const MALAYSIA_OPERATORS = new Set(['Celcom', 'CelcomDigi', 'U Mobile', 'Hotlink', 'XOX', 'Tunetalk', 'Unifi', 'Yes', "Touch 'n Go eWallet"]);

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
  const cents = Math.round(n * 100);
  if (!Number.isFinite(n) || n <= 0 || !Number.isSafeInteger(cents) || Math.abs(n * 100 - cents) > 1e-9) {
    throw new HttpsError('invalid-argument', `${label} must be a valid amount with at most two decimal places.`);
  }
  return cents / 100;
}
function requireSessionMatch(request, user) {
  const sessionId = request.data?.sessionId, deviceId = request.data?.deviceId;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId) || typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('failed-precondition', 'Your secure session is missing. Please sign in again.');
  }
  if (!sessionMatches(user, { sessionId, deviceId })) {
    throw new HttpsError('permission-denied', 'This device session is no longer active. Please sign in again.');
  }
}
function requestIdOf(request) {
  const id = request.data?.requestId;
  if (typeof id !== 'string' || !REQUEST_ID_RE.test(id)) throw new HttpsError('invalid-argument', 'A valid requestId is required.');
  return id;
}

exports.purchaseRechargePin = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const requestId = requestIdOf(request);
  const db = admin.firestore();
  const input = request.data || {};
  const country = typeof input.country === 'string' ? input.country.trim().toUpperCase().slice(0, 2) : 'MY';
  const operator = typeof input.operator === 'string' ? input.operator.trim().slice(0, 80) : '';
  const productCode = typeof input.productCode === 'string' ? input.productCode.trim().slice(0, 100) : '';
  const subproductCode = typeof input.subproductCode === 'string' ? input.subproductCode.trim().slice(0, 200) : '';
  const productName = typeof input.productName === 'string' ? input.productName.trim().slice(0, 200) : '';
  const denomination = safeNumber(input.amount, 'Recharge PIN amount');
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpsError('invalid-argument', 'A valid two-letter country code is required.');
  // IIMMPACT PIN products are catalog-driven for every country the provider
  // serves. Do not hard-code Malaysia-only support here: provider reach and the
  // per-country API mode below decide whether this country can be processed.
  if (country === 'MY' && (!operator || !MALAYSIA_OPERATORS.has(operator)) && !productCode) {
    throw new HttpsError('invalid-argument', 'Select a supported Malaysian operator or an IIMMPACT voucher product.');
  }
  if (!operator && !productCode) throw new HttpsError('invalid-argument', 'Select a voucher product before purchasing.');

  const profileRef = db.collection('users').doc(uid);
  const txId = crypto.createHash('sha256').update(`${uid}|recharge-pin|${requestId}`).digest('hex').slice(0, 40);
  const txRef = db.collection('transactions').doc(txId);

  // The same rule every other service uses, rather than a gate of its own.
  // This read only modes[service] - the service-wide default - and ignored the
  // country matrix entirely, so switching Malaysia to API for Recharge PIN
  // changed nothing and every voucher was refused with "not configured for API
  // processing yet". DEFAULT_MODES is 'legacy' for everything, so that was
  // every voucher, always.
  //
  const settingsSnap = await db.collection('api_settings').doc('service_modes').get();
  const apiSettings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
  const pinProviders = await providersForService(db, PIN_SERVICE);
  const mode = resolveExecutionMode({ country, service: PIN_SERVICE, settings: apiSettings, providers: pinProviders });
  if (mode !== 'api') throw new HttpsError('failed-precondition', 'Recharge PIN is not configured for API processing yet.');

  const pricingSnap = await db.collection('settings').doc('pricing').get();
  const pricing = pricingSnap.exists ? pricingSnap.data() || {} : {};

  const tierSettings = await progressionService.getProgressionSettings();
  const userSnap = await profileRef.get();
  if (!userSnap.exists || !active(userSnap.data())) {
    throw new HttpsError('permission-denied', 'Only active accounts can purchase Recharge PINs.');
  }
  const callerRole = String(userSnap.data()?.role || 'customer');
  const priceMultiplier = Number(
    pricing.rolePricing?.[callerRole]?.rechargePointCostPerUnit ??
    pricing.rechargePointCostPerUnit ??
    1
  );
  if (!Number.isFinite(priceMultiplier) || priceMultiplier <= 0) {
    throw new HttpsError('failed-precondition', 'Recharge PIN pricing is not configured correctly.');
  }
  requireSessionMatch(request, userSnap.data());
  // The purchase only. The refund below returns money already taken, and a
  // frozen customer must not be left out of pocket for a PIN they never got.
  assertWalletUnfrozen(userSnap.data(), 'Your wallet');
  await checkVelocity(db, uid, 'rechargePin', { ip: getClientIp(request) });
  const discount = progressionService.discountPercentFromSettings(tierSettings, userSnap.data().tier);
  const cost = Math.round(denomination * priceMultiplier * (1 - discount / 100) * 100) / 100;
  let walletFx;
  try { walletFx = await getWalletCurrencyAndFx(db, userSnap.data()); } catch (fxErr) { throw new HttpsError('failed-precondition', fxErr.message || 'Wallet currency is not configured.'); }
  const walletCost = baseToWallet(cost, walletFx);
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isSafeInteger(Math.round(cost * 100))) throw new HttpsError('failed-precondition', 'Recharge PIN price is invalid.');

  const reserved = await db.runTransaction(async tx => {
    const pinRef = db.collection('rechargePins').doc(txRef.id);
    const [user, existing, pinDoc] = await Promise.all([tx.get(profileRef), tx.get(txRef), tx.get(pinRef)]);
    if (existing.exists) {
      const d = existing.data() || {};
      if (d.customerId !== uid) throw new HttpsError('permission-denied', 'This request ID belongs to another account.');
      if (pinDoc.exists && pinDoc.data()?.customerId === uid && typeof pinDoc.data()?.pin === 'string' && pinDoc.data().pin) {
        if (d.status === 'failed' && d.apiRefunded === true) throw new HttpsError('failed-precondition', 'This Recharge PIN was already refunded and requires support reconciliation.');
        if (d.status !== 'completed' || d.rechargePinAvailable !== true) {
          tx.update(txRef, {
            status: 'completed', rechargePinAvailable: true, apiRefunded: false,
            apiExecution: { ...(d.apiExecution || {}), status: 'accepted', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        return { replay: true, id: txRef.id, cost: Number(d.cost) || 0, pin: pinDoc.data().pin, operator: d.operator || pinDoc.data().operator || operator, amount: Number(d.amount) || Number(pinDoc.data().amount) || denomination };
      }
      if (d.status === 'unknown') throw new HttpsError('unavailable', 'The provider outcome is uncertain. Please verify the provider before retrying.');
      if (d.status === 'pending' || d.status === 'processing') {
        const updatedAt = d.updatedAt?.toMillis ? d.updatedAt.toMillis() : 0;
        if (updatedAt > 0 && Date.now() - updatedAt >= 15 * 60 * 1000) {
          tx.update(txRef, { status: 'unknown', apiExecution: { status: 'unknown', error: 'Processing timed out before the provider outcome was confirmed. Reconciliation is required.', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          throw new HttpsError('unavailable', 'This Recharge PIN request timed out while processing. The provider outcome must be reconciled before retrying.');
        }
        throw new HttpsError('aborted', 'This Recharge PIN request is already being processed.');
      }
      throw new HttpsError('failed-precondition', 'This Recharge PIN request has already failed.');
    }
    if (!user.exists || !active(user.data())) throw new HttpsError('permission-denied', 'Your account is not active.');
    const balance = Number(user.data().walletBalance || 0);
    if (!Number.isFinite(balance) || balance < 0 || !Number.isSafeInteger(Math.round(balance * 100))) throw new HttpsError('failed-precondition', 'Wallet balance is invalid.');
    if (balance < walletCost) throw new HttpsError('failed-precondition', `You need ${walletCost.toFixed(2)} ${walletFx.currency} in your wallet to buy this PIN.`);
    tx.update(profileRef, { walletBalance: balance - walletCost, walletCurrency: walletFx.currency });
    tx.create(txRef, {
      service: PIN_SERVICE, customerId: uid, customerRole: callerRole, customerPhone: user.data().phone || '',
      operator, productCode: productCode || null, subproductCode: subproductCode || null, productName: productName || null, country, amount: denomination, total: denomination, denominationCurrency: 'MYR', currency: walletFx.currency, walletCurrency: walletFx.currency, cost: walletCost, walletCost, baseCostMyr: cost, fxRate: walletFx.sellRate, fxRateType: 'sell', fxRateSource: walletFx.rateSource,
      tierDiscountPercent: discount, executionMode: 'api', status: 'processing', rechargePinAvailable: false,
      apiRefunded: false, raw: { requestId, country, operator, productCode, subproductCode, productName, amount: denomination, packageCode: productCode || String(denomination) },
      createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { replay: false, id: txRef.id, cost: walletCost, baseCostMyr: cost, pin: null, operator, amount: denomination, currency: walletFx.currency, fxRate: walletFx.sellRate };
  });

  if (reserved.replay) return reserved;
  let providerSucceeded = false;
  try {
    const api = await executeConfiguredApi(PIN_SERVICE, {
      amount: denomination, total: denomination, details: `${country} Recharge PIN • ${productName || operator || productCode}`,
      raw: { requestId, country, operator, productCode, subproductCode, productName, amount: denomination, packageCode: productCode || String(denomination) }
    }, { uid, phone: userSnap.data().phone || '' }, requestId, {});
    const voucherSecret = api.secret || api.providerPin || api.deliveryLink || '';
    if (!voucherSecret) throw new HttpsError('unavailable', 'The Recharge PIN provider completed but no voucher PIN or delivery link could be recovered. Please contact support before retrying.');
    providerSucceeded = true;
    await txRef.update({
      apiExecution: { status: 'accepted', providerId: api.providerId, providerName: api.providerName, responseId: api.responseId || null, message: api.message || null, providerSucceeded: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('rechargePins').doc(txRef.id).set({
      transactionId: txRef.id, customerId: uid, operator, country, productCode: productCode || null, subproductCode: subproductCode || null, productName: productName || null, amount: denomination,
      currency: 'MYR', pin: api.secret || api.providerPin || null, deliveryLink: api.deliveryLink || null, deliveryNote: api.deliveryNote || null, expiry: api.expiry || null, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await txRef.update({
      status: 'completed', rechargePinAvailable: true,
      apiExecution: { status: 'accepted', providerId: api.providerId, providerName: api.providerName, responseId: api.responseId || null, message: api.message || null, providerSucceeded: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { id: txRef.id, cost: walletCost, baseCostMyr: reserved.baseCostMyr, pin: api.secret || api.providerPin || null, deliveryLink: api.deliveryLink || null, deliveryNote: api.deliveryNote || null, operator, productCode, subproductCode, productName, country, amount: denomination, currency: walletFx.currency, fxRate: walletFx.sellRate };
  } catch (e) {
    const unavailable = String(e?.code || '') === 'unavailable';
    if (unavailable || providerSucceeded) {
      const message = providerSucceeded
        ? 'The provider issued the Recharge PIN, but MySheba could not finish recording the transaction. Do not retry automatically; reconcile the voucher and transaction first.'
        : String(e?.message || 'Provider outcome is uncertain').slice(0, 500);
      await txRef.update({ status: 'unknown', apiExecution: { status: 'unknown', providerSucceeded, error: message, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      throw providerSucceeded ? new HttpsError('unavailable', message) : e;
    }
    await db.runTransaction(async tx => {
      const [u, t] = await Promise.all([tx.get(profileRef), tx.get(txRef)]);
      if (!t.exists || t.data().status !== 'processing' || t.data().apiRefunded === true) return;
      const balance = Number(u.data()?.walletBalance || 0), refund = Number(reserved.cost || 0);
      if (!Number.isFinite(balance) || !Number.isFinite(refund) || refund <= 0 || !Number.isSafeInteger(Math.round((balance + refund) * 100))) {
        throw new HttpsError('failed-precondition', 'The provider failed and the wallet could not be safely refunded. Please contact support.');
      }
      tx.update(profileRef, { walletBalance: balance + refund });
      tx.update(txRef, { status: 'failed', apiRefunded: true, apiError: String(e?.message || 'Provider execution failed').slice(0, 500), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    throw e instanceof HttpsError ? e : new HttpsError('failed-precondition', 'Recharge PIN provider rejected the request.');
  }
});

exports.rechargePinStock = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  await requireSuperadmin(request);
  const snap = await admin.firestore().collection('rechargePins').where('inventory', '==', true).get();
  const now = Date.now();
  const rows = new Map();
  snap.forEach(doc => {
    const d = doc.data() || {};
    const country = String(d.country || 'MY').toUpperCase();
    const operator = String(d.operator || '');
    const denomination = Number(d.denomination || d.amount || 0);
    const currency = String(d.currency || 'MYR').toUpperCase();
    const key = [country, operator, denomination, currency].join('|');
    const row = rows.get(key) || { country, operator, denomination, currency, available: 0, expired: 0 };
    const expires = d.expiresAt?.toMillis ? d.expiresAt.toMillis() : (d.expiresAt ? Date.parse(d.expiresAt) : 0);
    if (expires && expires <= now) row.expired += 1;
    else if (d.status !== 'expired') row.available += 1;
    rows.set(key, row);
  });
  return { rows: Array.from(rows.values()).sort((a,b) => (a.country + '|' + a.operator + '|' + a.denomination).localeCompare(b.country + '|' + b.operator + '|' + b.denomination)) };
});

exports.uploadRechargePins = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = await requireSuperadmin(request);
  const input = request.data || {};
  const country = String(input.country || '').trim().toUpperCase().slice(0, 2);
  const operator = String(input.operator || '').trim().slice(0, 80);
  const currency = String(input.currency || 'MYR').trim().toUpperCase().slice(0, 8);
  const denomination = safeNumber(input.denomination, 'Recharge PIN denomination');
  const expiresAtRaw = input.expiresAt == null || input.expiresAt === '' ? null : String(input.expiresAt).trim();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpsError('invalid-argument', 'country must be a 2-letter ISO code.');
  if (!operator) throw new HttpsError('invalid-argument', 'operator is required.');
  if (!/^[A-Z]{3,8}$/.test(currency)) throw new HttpsError('invalid-argument', 'currency is invalid.');
  let expiresAt = null;
  if (expiresAtRaw) {
    const ms = Date.parse(expiresAtRaw);
    if (!Number.isFinite(ms) || ms <= Date.now()) throw new HttpsError('invalid-argument', 'expiresAt must be a valid future date.');
    expiresAt = admin.firestore.Timestamp.fromMillis(ms);
  }
  if (!Array.isArray(input.pins) || input.pins.length < 1 || input.pins.length > MAX_PIN_UPLOAD) throw new HttpsError('invalid-argument', 'pins must contain 1-' + MAX_PIN_UPLOAD + ' entries.');
  const entries = input.pins.map(normalizeInventoryPin);
  const unique = new Map(entries.map(e => [e.pin, e]));
  if (unique.size !== entries.length) throw new HttpsError('invalid-argument', 'The upload contains duplicate PINs.');
  const db = admin.firestore();
  const refs = entries.map(e => db.collection('rechargePins').doc(inventoryDocId(e.pin)));
  const existing = new Set();
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await db.getAll(...refs.slice(i, i + 300));
    snaps.forEach((s, j) => { if (s.exists) existing.add(i + j); });
  }
  const batchId = crypto.randomUUID();
  let added = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    let batchAdds = 0;
    for (let j = i; j < Math.min(i + 400, entries.length); j++) {
      if (existing.has(j)) continue;
      const e = entries[j];
      batch.create(refs[j], {
        inventory: true, batchId, uploadedBy: uid, country, operator, denomination, amount: denomination,
        currency, pin: e.pin, serial: e.serial || null, status: 'available', expiresAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      added += 1; batchAdds += 1;
    }
    if (batchAdds) await batch.commit();
  }
  await db.collection('auditLogs').add({
    action: 'recharge_pin_inventory_uploaded', performedBy: uid, batchId, country, operator, currency,
    denomination, added, duplicates: existing.size, createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { added, duplicates: existing.size, batchId };
});

exports.getRechargePin = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const transactionId = typeof request.data?.transactionId === 'string' ? request.data.transactionId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(transactionId)) throw new HttpsError('invalid-argument', 'Invalid transaction ID.');
  const db = admin.firestore();
  const profileSnap = await db.collection('users').doc(uid).get();
  if (!profileSnap.exists || !active(profileSnap.data())) throw new HttpsError('permission-denied', 'Your account is not active.');
  requireSessionMatch(request, profileSnap.data());
  await checkVelocity(db, uid, 'rechargePin', { ip: getClientIp(request) });
  const txSnap = await db.collection('transactions').doc(transactionId).get();
  if (!txSnap.exists || txSnap.data()?.customerId !== uid || txSnap.data()?.service !== PIN_SERVICE) throw new HttpsError('not-found', 'Recharge PIN transaction not found.');
  if (txSnap.data()?.status !== 'completed' || txSnap.data()?.rechargePinAvailable !== true) throw new HttpsError('failed-precondition', 'This Recharge PIN is not available yet.');
  const pinSnap = await db.collection('rechargePins').doc(transactionId).get();
  if (!pinSnap.exists || pinSnap.data()?.customerId !== uid) throw new HttpsError('not-found', 'Recharge PIN is unavailable. Contact support if you were charged.');
  return { id: transactionId, operator: pinSnap.data()?.operator || txSnap.data()?.operator || '', amount: Number(pinSnap.data()?.amount || txSnap.data()?.amount || 0), currency: txSnap.data()?.currency || 'MYR', fxRate: Number(txSnap.data()?.fxRate || 1), pin: pinSnap.data()?.pin || '' };
});
