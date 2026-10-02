const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const COLLECTION = 'api_webhooks';
const PROVIDERS = 'api_providers';
const EVENTS = 'apiWebhookEvents';
// Stats live in their own collection on purpose. Both saveApiWebhook and the
// Success TopUp auto-provision write the config document with merge:false, so
// anything kept beside the config would be erased every time the provider is
// re-saved - and the delivery history is exactly what you need after a
// re-save, to see whether the new token actually works.
const STATS = 'apiWebhookStats';
const PROJECT_ID = 'satulink-solutions';
const REGION = 'us-central1';

function clean(v, max = 500) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function assertSuperadmin(db, request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  return db.doc('users/' + request.auth.uid).get().then((snap) => {
    const p = snap.exists ? snap.data() : null;
    if (!p || p.role !== 'superadmin' || p.suspended === true || p.inactive === true || p.disabled === true || p.active === false || p.mergedInto) {
      throw new HttpsError('permission-denied', 'Superadmin access required.');
    }
  });
}
/**
 * What the screen needs to answer "is this webhook actually working?".
 *
 * Timestamps go out as epoch milliseconds: a Firestore Timestamp does not
 * survive the callable's JSON encoding as anything the client can read.
 */
function deliverySummary(stat) {
  const s = stat || {};
  const at = s.lastReceivedAt;
  return {
    lastReceivedAt: at && typeof at.toMillis === 'function' ? at.toMillis() : null,
    lastStatus: clean(s.lastStatus, 100),
    lastTransactionId: clean(s.lastTransactionId, 200),
    lastMatched: s.lastMatched === true,
    matchedCount: Number(s.matchedCount || 0),
    unmatchedCount: Number(s.unmatchedCount || 0),
    mismatchedCount: Number(s.mismatchedCount || 0),
    duplicateCount: Number(s.duplicateCount || 0),
  };
}

function endpointUrl(providerId) {
  return 'https://' + REGION + '-' + PROJECT_ID + '.cloudfunctions.net/apiWebhook?providerId=' + encodeURIComponent(providerId);
}
function pathGet(obj, path) {
  const p = clean(path, 200);
  return p ? p.split('.').reduce((v, k) => v == null ? undefined : v[k], obj) : undefined;
}
function validateConfig(data) {
  const providerId = clean(data.providerId, 100);
  const authHeader = clean(data.authHeader, 100) || 'x-webhook-token';
  const webhookToken = clean(data.webhookToken, 1000);
  const transactionIdPath = clean(data.transactionIdPath, 200) || 'transactionId';
  const statusPath = clean(data.statusPath, 200) || 'status';
  const messagePath = clean(data.messagePath, 200) || 'message';
  const successStatus = clean(data.successStatus, 100) || 'Success';
  const processingStatus = clean(data.processingStatus, 100) || 'Processing';
  const cancelStatus = clean(data.cancelStatus, 100) || 'Cancel';
  const enabled = data.enabled !== false;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(providerId)) throw new HttpsError('invalid-argument', 'Invalid provider id.');
  if (!/^[!#$%&'*+.^_|~0-9A-Za-z-]{1,100}$/.test(authHeader)) throw new HttpsError('invalid-argument', 'Invalid webhook header name.');
  if (enabled && !webhookToken) throw new HttpsError('invalid-argument', 'Webhook token is required when webhook is enabled.');
  return { providerId, enabled, authHeader, webhookToken, transactionIdPath, statusPath, messagePath, successStatus, processingStatus, cancelStatus };
}

exports.listApiWebhooks = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.collection(COLLECTION).limit(100).get();
  const providerIds = snap.docs.map((d) => d.data()?.providerId || d.id).filter(Boolean);
  const providerSnaps = await Promise.all(providerIds.map((id) => db.collection(PROVIDERS).doc(id).get()));
  const providerNames = Object.fromEntries(providerSnaps.map((p) => [p.id, p.exists ? String(p.data()?.name || '') : '']));
  const statSnaps = await Promise.all(providerIds.map((id) => db.collection(STATS).doc(id).get()));
  const stats = Object.fromEntries(statSnaps.map((p) => [p.id, p.exists ? (p.data() || {}) : {}]));
  return {
    webhooks: snap.docs.map((d) => {
      const x = d.data() || {};
      const providerId = x.providerId || d.id;
      const successTopUp = providerNames[providerId] === 'Success TopUp';
      return {
        id: d.id,
        providerId,
        enabled: x.enabled !== false,
        authHeader: x.authHeader || 'x-webhook-token',
        transactionIdPath: x.transactionIdPath || 'transactionId',
        statusPath: x.statusPath || 'status',
        messagePath: x.messagePath || 'message',
        successStatus: x.successStatus || 'Success',
        processingStatus: x.processingStatus || 'Processing',
        cancelStatus: x.cancelStatus || 'Cancel',
        hasWebhookToken: Boolean(x.webhookToken),
        webhookToken: '',
        webhookUrl: endpointUrl(providerId),
        delivery: deliverySummary(stats[providerId]),
      };
    }),
  };
});

exports.saveApiWebhook = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const id = clean(request.data?.providerId, 100);
  if (!id) throw new HttpsError('invalid-argument', 'Provider id is required.');
  const providerRef = db.collection(PROVIDERS).doc(id);
  const webhookRef = db.collection(COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const providerSnap = await tx.get(providerRef);
    const currentSnap = await tx.get(webhookRef);
    const callerSnap = await tx.get(db.collection('users').doc(request.auth.uid));
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || caller.role !== 'superadmin' || caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) {
      throw new HttpsError('permission-denied', 'Your account is no longer active.');
    }
    if (!providerSnap.exists) throw new HttpsError('not-found', 'API provider not found.');
    const incoming = { ...(request.data || {}) };
    const current = currentSnap.exists ? (currentSnap.data() || {}) : {};
    if (!incoming.webhookToken || incoming.webhookToken === '••••••••') incoming.webhookToken = current.webhookToken || '';
    const data = validateConfig(incoming);
    tx.set(webhookRef, { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: false });
  });
  return { ok: true, providerId: id, webhookUrl: endpointUrl(id) };
});

exports.deleteApiWebhook = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const id = clean(request.data?.providerId, 100);
  if (!id) throw new HttpsError('invalid-argument', 'Provider id is required.');
  await db.collection(COLLECTION).doc(id).delete();
  return { ok: true };
});

async function findTransaction(db, providerId, providerTransactionId) {
  const byRequest = await db.collection('transactions').where('raw.requestId', '==', providerTransactionId).limit(2).get();
  const requestMatches = byRequest.docs.filter((d) => {
    const data = d.data() || {};
    return data.executionMode === 'api' && data.status !== 'failed' && data.status !== 'unknown';
  });
  if (requestMatches.length === 1) return requestMatches[0];
  const byResponse = await db.collection('transactions').where('apiExecution.responseId', '==', providerTransactionId).limit(2).get();
  const responseMatches = byResponse.docs.filter((d) => {
    const data = d.data() || {};
    return data.executionMode === 'api' && data.apiExecution?.providerId === providerId;
  });
  if (responseMatches.length === 1) return responseMatches[0];

  // An id this provider sent us on an earlier callback. The first webhook for
  // an order may arrive unmatched, but once any code path has recorded the
  // provider's own reference, later callbacks for that order can be matched by
  // it - so Processing-then-Success does not land half in the unmatched log.
  const byProviderRef = await db.collection('transactions').where('apiExecution.providerTransactionId', '==', providerTransactionId).limit(2).get();
  const providerRefMatches = byProviderRef.docs.filter((d) => {
    const data = d.data() || {};
    return data.executionMode === 'api' && data.apiExecution?.providerId === providerId;
  });
  if (providerRefMatches.length === 1) return providerRefMatches[0];
  return null;
}

function safeText(value, max = 500) {
  return (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') ? String(value).slice(0, max) : '';
}

/**
 * Delivery history, so a webhook that is quietly matching nothing is visible.
 *
 * An unmatched callback answers 202 and files the payload - correct for the
 * provider, who should not retry forever, but it means a webhook pointed at the
 * wrong provider id, or sending an id we never stored, looks exactly like one
 * that works. Counting both outcomes is what turns that into something a
 * superadmin can read off the screen.
 *
 * Never allowed to fail the delivery: we have already committed the wallet and
 * transaction writes by this point, and answering non-2xx would make the
 * provider resend a callback we have fully applied.
 */
async function recordDelivery(db, providerId, fields) {
  try {
    await db.collection(STATS).doc(providerId).set({
      ...fields,
      providerId,
      lastReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('apiWebhook stats write failed', providerId, String(error?.message || error));
  }
}

exports.apiWebhook = onRequest({ region: REGION, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const providerId = clean(req.query?.providerId, 100);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(providerId)) return res.status(400).send('Invalid providerId');

  const db = admin.firestore();
  const configSnap = await db.collection(COLLECTION).doc(providerId).get();
  if (!configSnap.exists) return res.status(404).send('Webhook not configured');
  const config = configSnap.data() || {};
  if (config.enabled === false) return res.status(404).send('Webhook disabled');

  const supplied = String(req.get(config.authHeader || 'x-webhook-token') || '');
  const expected = String(config.webhookToken || '');
  if (!expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(401).send('Invalid webhook token');
  }

  if (req.rawBody && req.rawBody.length > 1024 * 1024) return res.status(413).send('Webhook payload too large');
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const transactionId = safeText(pathGet(body, config.transactionIdPath || 'transactionId'), 200);
  const status = safeText(pathGet(body, config.statusPath || 'status'), 100);
  const message = safeText(pathGet(body, config.messagePath || 'message'), 500);
  if (!transactionId || !status) return res.status(400).send('Missing transactionId or status');

  const txDoc = await findTransaction(db, providerId, transactionId);
  if (!txDoc) {
    await db.collection('apiWebhookUnmatched').add({
      providerId, transactionId, status, message, body: JSON.stringify(body).slice(0, 10000),
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await recordDelivery(db, providerId, {
      unmatchedCount: admin.firestore.FieldValue.increment(1),
      lastTransactionId: transactionId, lastStatus: status, lastMatched: false,
    });
    return res.status(202).json({ ok: true, matched: false });
  }

  const txRef = txDoc.ref;
  const eventKey = crypto.createHash('sha256').update(JSON.stringify({ providerId, transactionId, status, updatedAt: body.updatedAt || null, body })).digest('hex');
  const eventRef = db.collection(EVENTS).doc(eventKey);

  let duplicate = false;
  let providerMismatch = false;
  await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    const orderSnap = await tx.get(txRef);
    if (eventSnap.exists) { duplicate = true; return; }
    if (!orderSnap.exists) throw new Error('Transaction disappeared.');
    const order = orderSnap.data() || {};
    const apiExecution = {
      ...(order.apiExecution || {}),
      providerId,
      providerTransactionId: transactionId,
      providerStatus: status,
      providerMessage: message,
      webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // A webhook is only allowed to mutate an API-dispatched transaction that
    // belongs to this provider. Never let a provider callback settle a legacy
    // transaction or a transaction owned by another provider.
    if (order.executionMode !== 'api' || order.apiExecution?.providerId !== providerId) {
      providerMismatch = true;
      return;
    }

    if (status === config.cancelStatus) {
      if (order.apiRefunded !== true) {
        const customerId = String(order.customerId || '');
        const refund = Number(order.pointsCharged ?? order.cost);
        if (!customerId || !Number.isFinite(refund) || refund < 0 || !Number.isSafeInteger(Math.round(refund * 100))) throw new Error('Invalid transaction refund state.');
        const userRef = db.collection('users').doc(customerId);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error('Customer account not found.');
        const balance = Number(userSnap.data()?.walletBalance || 0);
        if (!Number.isFinite(balance) || balance < 0 || !Number.isSafeInteger(Math.round((balance + refund) * 100))) throw new Error('Invalid customer wallet state.');
        tx.update(userRef, { walletBalance: balance + refund });
        tx.update(txRef, { status: 'failed', apiRefunded: true, apiError: message || 'Provider cancelled the transaction.', apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      } else {
        tx.update(txRef, { apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    } else if (status === config.successStatus) {
      // Never resurrect a transaction that has already been refunded/failed.
      // Provider callbacks can arrive out of order, so a late Success after
      // Cancel must not undo the refund or mark the order completed again.
      if (order.apiRefunded === true || order.status === 'failed') {
        tx.update(txRef, { apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      } else {
        tx.update(txRef, { status: 'completed', apiExecution, completedAt: order.completedAt || admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    } else if (status === config.processingStatus) {
      if (order.apiRefunded !== true && order.status !== 'failed' && order.status !== 'completed') tx.update(txRef, { status: 'processing', apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      else tx.update(txRef, { apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      tx.update(txRef, { apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    tx.create(eventRef, {
      providerId, transactionId, status, message,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      transactionRef: txRef.path,
    });
  });

  if (providerMismatch) {
    await recordDelivery(db, providerId, {
      mismatchedCount: admin.firestore.FieldValue.increment(1),
      lastTransactionId: transactionId, lastStatus: status, lastMatched: false,
    });
    return res.status(202).json({ ok: true, matched: false });
  }
  await recordDelivery(db, providerId, {
    matchedCount: admin.firestore.FieldValue.increment(duplicate ? 0 : 1),
    duplicateCount: admin.firestore.FieldValue.increment(duplicate ? 1 : 0),
    lastTransactionId: transactionId, lastStatus: status, lastMatched: true,
  });
  return res.status(200).json({ ok: true, duplicate });
});


/**
 * Show the superadmin the webhook token again.
 *
 * It is generated for them, shown once in an alert when the Success TopUp
 * provider is saved, and then never again - listApiWebhooks deliberately
 * returns an empty string for it. Dismiss that alert and setup cannot be
 * finished, because the token still has to be pasted into the provider's own
 * API settings page. This is the superadmin's own credential and they can
 * already rotate it; refusing to redisplay it protects nothing and strands the
 * integration.
 */
exports.revealApiWebhookToken = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const id = clean(request.data?.providerId, 100);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid provider id.');
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Webhook is not configured for this provider.');
  const token = String(snap.data()?.webhookToken || '');
  if (!token) throw new HttpsError('failed-precondition', 'No webhook token is stored. Rotate the token to generate one.');
  console.log('apiWebhook token revealed', id, 'by', request.auth.uid);
  return { providerId: id, webhookToken: token, webhookUrl: endpointUrl(id) };
});

/**
 * Issue a new webhook token, returning it once.
 *
 * The provider documents rotation as something you do from their API settings
 * page, so the two have to be changed together: callbacks signed with the old
 * token are rejected from the moment this returns until the new one is pasted
 * in on their side. The caller is told that plainly rather than discovering it
 * as a run of 401s.
 */
exports.rotateApiWebhookToken = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const id = clean(request.data?.providerId, 100);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid provider id.');
  const ref = db.collection(COLLECTION).doc(id);
  const token = crypto.randomBytes(32).toString('hex');
  await db.runTransaction(async (tx) => {
    const callerSnap = await tx.get(db.collection('users').doc(request.auth.uid));
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || caller.role !== 'superadmin' || caller.suspended === true || caller.inactive === true || caller.disabled === true || caller.active === false || caller.mergedInto) {
      throw new HttpsError('permission-denied', 'Your account is no longer active.');
    }
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Webhook is not configured for this provider.');
    tx.update(ref, { webhookToken: token, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
  });
  console.log('apiWebhook token rotated', id, 'by', request.auth.uid);
  return { providerId: id, webhookToken: token, webhookUrl: endpointUrl(id) };
});

/**
 * The callbacks that arrived but matched no transaction.
 *
 * This is the diagnostic for the one thing that can still be wrong after the
 * URL and token are in place: the provider identifying the transaction by a
 * reference we never stored. Seeing the actual ids they send is what tells you
 * which field to map, instead of guessing at it.
 *
 * Ordered by receipt and filtered in memory so this needs no composite index -
 * a diagnostic that first requires a deploy to read is no use when you are
 * trying to find out why a deploy did not work.
 */
exports.listApiWebhookUnmatched = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const id = clean(request.data?.providerId, 100);
  const snap = await db.collection('apiWebhookUnmatched').orderBy('receivedAt', 'desc').limit(50).get();
  const rows = snap.docs
    .map((d) => d.data() || {})
    .filter((x) => !id || x.providerId === id)
    .slice(0, 10)
    .map((x) => ({
      providerId: clean(x.providerId, 100),
      transactionId: clean(x.transactionId, 200),
      status: clean(x.status, 100),
      message: clean(x.message, 500),
      receivedAt: x.receivedAt && typeof x.receivedAt.toMillis === 'function' ? x.receivedAt.toMillis() : null,
    }));
  return { unmatched: rows };
});
