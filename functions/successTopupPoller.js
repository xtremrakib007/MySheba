const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const providerSecretService = require('./providerSecretService');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PROVIDERS = 'api_providers';
const TRANSACTIONS = 'transactions';
const SUCCESS_TOPUP_HOST = 'api.successtopup.com';
const STATUS_URL = 'https://api.successtopup.com/api/status';

async function getProvider() {
  const snap = await db.collection(PROVIDERS)
    .where('service', '==', 'Recharge')
    .where('active', '==', true)
    .limit(20)
    .get();

  const match = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(p => String(p.name || '').trim().toLowerCase() === 'success topup');

  if (!match) return null;
  try {
    const u = new URL(match.baseUrl);
    if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== SUCCESS_TOPUP_HOST) {
      console.error('Success TopUp provider has an unexpected base URL.');
      return null;
    }
  } catch {
    return null;
  }

  try {
    const credentials = await providerSecretService.getCredentials(match);
    if (!credentials.apiKey || !credentials.secretKey) {
      console.error('Success TopUp provider is missing server-side credentials.');
      return null;
    }
    return { ...match, apiKey: credentials.apiKey, secretKey: credentials.secretKey };
  } catch (error) {
    console.error('Success TopUp provider credentials could not be loaded.', String(error?.message || error));
    return null;
  }
}

async function checkStatus(trxid, provider) {
  const response = await fetch(STATUS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      trxid,
      successtopup_key: provider.apiKey,
      successtopup_secret: provider.secretKey,
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error('Success TopUp status HTTP ' + response.status);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Invalid Success TopUp status response.'); }
  return data;
}

const MAX_PROVIDER_PROCESSING_MS = 5 * 60 * 1000;

async function settle(txRef, provider, providerStatus, message, timedOut = false) {
  const normalized = String(providerStatus || '').toLowerCase();
  if (!['success', 'cancel', 'processing'].includes(normalized)) return 'unknown-status';

  return db.runTransaction(async tx => {
    const snap = await tx.get(txRef);
    if (!snap.exists) return 'missing';
    const order = snap.data() || {};

    if (order.executionMode !== 'api' || order.apiExecution?.providerId !== provider.id) return 'provider-mismatch';

    const apiExecution = {
      ...(order.apiExecution || {}),
      providerId: provider.id,
      providerName: provider.name || 'Success TopUp',
      providerStatus,
      providerMessage: message || null,
      polledAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (normalized === 'processing') {
      // Do not leave an API order in pending/processing indefinitely. Five
      // minutes is the maximum customer-visible provider wait. If the
      // provider still says Processing after that point, move to UNKNOWN
      // rather than guessing success or issuing an unsafe refund. An admin
      // can then reconcile it against the provider reference.
      if (timedOut) {
        tx.update(txRef, {
          status: 'unknown',
          apiExecution: {
            ...apiExecution,
            status: 'unknown',
            timedOut: true,
            error: 'Provider remained in Processing for more than 5 minutes. Reconciliation is required.',
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return 'unknown-timeout';
      }
      tx.update(txRef, {
        status: 'processing',
        apiExecution,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return 'processing';
    }

    if (normalized === 'success') {
      if (order.status === 'failed' || order.apiRefunded === true) {
        tx.update(txRef, { apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return 'already-final';
      }
      tx.update(txRef, {
        status: 'completed',
        apiExecution,
        completedAt: order.completedAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return 'completed';
    }

    if (order.apiRefunded === true || order.status === 'failed') {
      tx.update(txRef, { apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return 'already-refunded';
    }

    const uid = String(order.customerId || '');
    const refund = Number(order.pointsCharged ?? order.cost);
    if (!uid || !Number.isFinite(refund) || refund < 0 || !Number.isSafeInteger(Math.round(refund * 100))) {
      throw new Error('Invalid refund state for transaction ' + txRef.id);
    }

    const userRef = db.collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error('Customer account missing for ' + txRef.id);

    const balance = Number(userSnap.data()?.walletBalance || 0);
    if (!Number.isFinite(balance) || balance < 0 || !Number.isSafeInteger(Math.round((balance + refund) * 100))) {
      throw new Error('Invalid customer wallet state for ' + txRef.id);
    }

    tx.update(userRef, { walletBalance: balance + refund });
    tx.update(txRef, {
      status: 'failed',
      apiRefunded: true,
      apiError: message || 'Success TopUp cancelled the transaction.',
      apiExecution,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return 'failed-refunded';
  });
}

exports.pollSuccessTopUpStatus = onSchedule(
  { schedule: 'every 5 minutes', timeoutSeconds: 120, memory: '256MiB' },
  async () => {
    const provider = await getProvider();
    if (!provider) return;

    // Process both pending and processing API orders. A crash can leave the
    // transaction document in pending after the wallet charge was committed;
    // those orders must still be reconciled instead of waiting forever.
    const [pendingSnap, processingSnap] = await Promise.all([
      db.collection(TRANSACTIONS).where('status', '==', 'pending').limit(50).get(),
      db.collection(TRANSACTIONS).where('status', '==', 'processing').limit(50).get(),
    ]);

    const docs = [...pendingSnap.docs, ...processingSnap.docs];
    for (const doc of docs) {
      const data = doc.data() || {};
      if (data.apiExecution?.providerId !== provider.id || data.executionMode !== 'api') continue;

      const trxid = String(data.raw?.requestId || data.apiExecution?.providerTransactionId || '');
      if (!trxid) continue;

      const updatedAtMs = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0;
      const timedOut = updatedAtMs > 0 && Date.now() - updatedAtMs >= MAX_PROVIDER_PROCESSING_MS;

      try {
        const result = await checkStatus(trxid, provider);
        if (!result?.result || !result?.status) {
          // No usable provider status after the five-minute deadline is still
          // an uncertain outcome. Never auto-refund an external side effect.
          if (timedOut) {
            await settle(doc.ref, provider, 'processing', 'Provider did not return a final status within 5 minutes.', true);
          }
          continue;
        }
        await settle(doc.ref, provider, result.status, result.message || null, timedOut);
      } catch (error) {
        console.error('Success TopUp status poll failed', doc.id, String(error?.message || error));
        if (timedOut) {
          try {
            await settle(doc.ref, provider, 'processing', 'Provider status could not be confirmed within 5 minutes.', true);
          } catch (timeoutError) {
            console.error('Success TopUp timeout settlement failed', doc.id, String(timeoutError?.message || timeoutError));
          }
        }
      }
    }
  }
);
