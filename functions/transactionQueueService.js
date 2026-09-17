const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const DEALER_SERVICE = 'Mobile Banking';
const RESELLER_SERVICES = new Set(['Recharge', 'Internet', 'Remittance']);

function queueRole(service) {
  if (service === DEALER_SERVICE) return 'dealer';
  if (RESELLER_SERVICES.has(service)) return 'reseller';
  return null;
}

function sanitizeTransaction(id, tx) {
  const operatorRole = queueRole(tx.service);
  if (!operatorRole) return null;

  // Only fields required by Dealer/Reseller processing UI are copied.
  // Never mirror raw payloads, wallet metadata, customer ids, or financial audit fields.
  return {
    transactionId: id,
    operatorRole,
    service: String(tx.service || ''),
    status: String(tx.status || 'pending'),
    approved: tx.approved === true,
    amount: Number.isFinite(Number(tx.amount)) ? Number(tx.amount) : 0,
    total: Number.isFinite(Number(tx.total)) ? Number(tx.total) : 0,
    customerPhone: typeof tx.customerPhone === 'string' ? tx.customerPhone.slice(0, 64) : '',
    details: typeof tx.details === 'string' ? tx.details.slice(0, 2000) : '',
    receiverPhone: typeof tx.raw?.phone === 'string' ? tx.raw.phone.slice(0, 64) : '',
    dealerId: tx.dealerId || null,
    resellerId: tx.resellerId || null,
    claimedBy: tx.claimedBy || null,
    claimedByRole: tx.claimedByRole || null,
    claimedByName: typeof tx.claimedByName === 'string' ? tx.claimedByName.slice(0, 200) : '',
    createdAt: tx.createdAt || null,
    updatedAt: tx.updatedAt || null,
  };
}

async function syncQueue(id, tx) {
  const ref = admin.firestore().collection('transactionQueue').doc(id);
  const queue = sanitizeTransaction(id, tx);

  // Rejected orders and unsupported services must never remain in an operator queue.
  if (!queue || tx.rejected === true || !['pending', 'processing', 'completed'].includes(queue.status)) {
    await ref.delete().catch(() => {});
    return;
  }

  // Completed orders remain only for the operator who actually claimed them.
  // Pending orders are visible only to the appropriate service role.
  if (queue.status === 'completed' && !queue.claimedBy) {
    await ref.delete().catch(() => {});
    return;
  }

  await ref.set(queue, { merge: false });
}

exports.onTransactionQueueCreated = onDocumentCreated('transactions/{id}', async event => {
  const tx = event.data?.data();
  if (tx) await syncQueue(event.params.id, tx);
});

exports.onTransactionQueueUpdated = onDocumentUpdated('transactions/{id}', async event => {
  const tx = event.data?.after?.data();
  if (tx) await syncQueue(event.params.id, tx);
});
