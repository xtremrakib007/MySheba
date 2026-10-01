const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

const COLLECTION = 'api_webhooks';
const PROVIDERS = 'api_providers';
const EVENTS = 'apiWebhookEvents';
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

exports.listApiWebhooks = onCall({ enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  await assertSuperadmin(db, request);
  const snap = await db.collection(COLLECTION).get();
  const providerIds = snap.docs.map((d) => d.data()?.providerId || d.id).filter(Boolean);
  const providerSnaps = await Promise.all(providerIds.map((id) => db.collection(PROVIDERS).doc(id).get()));
  const providerNames = Object.fromEntries(providerSnaps.map((p) => [p.id, p.exists ? String(p.data()?.name || '') : '']));
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
        webhookToken: successTopUp ? String(x.webhookToken || '') : '',
        webhookUrl: endpointUrl(providerId),
      };
    }),
  };
});

exports.saveApiWebhook = onCall({ enforceAppCheck: true }, async (request) => {
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

exports.deleteApiWebhook = onCall({ enforceAppCheck: true }, async (request) => {
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
  return null;
}

function safeText(value, max = 500) {
  return (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') ? String(value).slice(0, max) : '';
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

  if (providerMismatch) return res.status(202).json({ ok: true, matched: false });
  return res.status(200).json({ ok: true, duplicate });
});
