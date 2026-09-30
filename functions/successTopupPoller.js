const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const crypto = require('crypto');

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

  if (!match.apiKey || !match.secretKey) {
    console.error('Success TopUp provider is missing server-side credentials.');
    return null;
  }
  return match;
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

async function settle(txRef, provider, providerStatus, message) {
  const normalized = String(providerStatus || '').toLowerCase();
  if (!['success', 'cancel', 'processing'].includes(normalized)) return 'unknown-status';

  return db.runTransaction(async tx => {
    const snap = await tx.get(txRef);
    if (!snap.exists) return 'missing';
    const order = snap.data() || {};

    if (order.executionMode !== 'api' || order.apiExecution?.providerId !== provider.id) return 'provider-mismatch';

    const apiExecution = {
      ...(order.apiExecution || {}),
      status: normalized === 'success' ? 'accepted' : normalized,
      providerId: provider.id,
      providerName: provider.name || 'Success TopUp',
      providerStatus,
      providerMessage: message || null,
      polledAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (normalized === 'processing') {
      if (order.status === 'pending' || order.status === 'unknown') {
        tx.update(txRef, { status: 'processing', apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      } else {
        tx.update(txRef, { apiExecution, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
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
  { schedule: 'every 1 minutes', timeoutSeconds: 120, memory: '256MiB' },
  async () => {
    const provider = await getProvider();
    if (!provider) return;

    // Unknown transactions are included: a provider timeout/HTTP 503 can
    // happen after the provider accepted the request but before MySheba received
    // a usable response. Polling the original transaction ID is safe; resending
    // the recharge is not.
    const [pendingSnap, processingSnap, unknownSnap] = await Promise.all([
      db.collection(TRANSACTIONS).where('status', '==', 'pending').limit(200).get(),
      db.collection(TRANSACTIONS).where('status', '==', 'processing').limit(200).get(),
      db.collection(TRANSACTIONS).where('status', '==', 'unknown').limit(200).get(),
    ]);
    // Include pending: a request can remain in this state when the initial
    // provider call times out before the transaction receives provider metadata.
    // We query status only and filter API transactions below to avoid requiring
    // a new composite Firestore index for this recovery path.
    const now = Date.now();
    const candidates = [...pendingSnap.docs, ...processingSnap.docs, ...unknownSnap.docs]
      .filter(doc => {
        const data = doc.data() || {};
        const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0;
        // Give the original provider request time to finish before checking it.
        return data.service === 'Recharge'
          && data.executionMode === 'api'
          && createdAt > 0
          && now - createdAt >= 60 * 1000;
      })
      .sort((a, b) => {
        const aTime = a.data().createdAt?.toMillis?.() || 0;
        const bTime = b.data().createdAt?.toMillis?.() || 0;
        return aTime - bTime;
      })
      .slice(0, 100); // Bound provider API traffic while prioritizing oldest orders.

    for (const doc of candidates) {
      const data = doc.data() || {};

      const trxid = String(data.raw?.requestId || data.apiExecution?.requestId || data.apiExecution?.providerTransactionId || '');
      if (!trxid) continue;

      let transactionProviderId = data.apiExecution?.providerId || null;
      // Backfill older unknown transactions, which predate provider metadata on
      // the transaction document, from the atomic execution claim.
      if (!transactionProviderId && data.customerId) {
        try {
          const executionKey = crypto.createHash('sha256')
            .update(`recharge|${data.customerId}|${trxid}`)
            .digest('hex');
          const executionSnap = await db.collection('apiExecutions').doc(executionKey).get();
          transactionProviderId = executionSnap.exists ? executionSnap.data()?.providerId || null : null;
        } catch (lookupError) {
          console.error('Could not recover provider for uncertain recharge', doc.id);
          continue;
        }
      }
      if (transactionProviderId !== provider.id) continue;

      try {
        const result = await checkStatus(trxid, provider);
        if (!result?.result || !result?.status) continue;
        await settle(doc.ref, provider, result.status, result.message || null);
      } catch (error) {
        console.error('Success TopUp status poll failed', doc.id, String(error?.message || error));
      }
    }
  }
);
