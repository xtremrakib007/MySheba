const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const DEALER_SERVICE = 'Mobile Banking';
const RESELLER_SERVICES = new Set(['Recharge', 'Internet', 'Bill Payment', 'Remittance']);
const SERVICE_ALIASES = {
  recharge: 'Recharge',
  internet: 'Internet',
  billpayment: 'Bill Payment',
  'bill payment': 'Bill Payment',
  mobilebanking: 'Mobile Banking',
  'mobile banking': 'Mobile Banking',
  remittance: 'Remittance',
};
function normalizeService(value) {
  const raw = String(value || '').trim();
  return SERVICE_ALIASES[raw.toLowerCase()] || raw;
}
const OPERATIONAL_RAW_FIELDS = new Set([
  'phone', 'senderName', 'senderPhone', 'senderCompany', 'senderPassportNo', 'senderPassportExpiry',
  'senderAddress', 'receiverFirstName', 'receiverLastName', 'receiverRelationship', 'receiverPhone',
  'receiverBankName', 'receiverAccountNumber', 'receiverBranch', 'receiverRoutingNumber',
  'receiverPickupNetwork', 'receiverIdType', 'receiverIdNumber', 'receiverPickupCity',
  'receiverWalletProvider', 'receiverWalletNumber', 'country', 'method', 'provider', 'category', 'accountNumber',
]);

function queueRole(service) {
  if (service === DEALER_SERVICE) return 'dealer';
  if (RESELLER_SERVICES.has(service)) return 'reseller';
  return null;
}

function sanitizeRaw(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const key of OPERATIONAL_RAW_FIELDS) {
    const value = raw[key];
    if (typeof value === 'string') out[key] = value.slice(0, 500);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

function sanitizeTransaction(id, tx) {
  const service = normalizeService(tx.service || tx.chargedServiceKind);
  const operatorRole = queueRole(service);
  if (!operatorRole) return null;
  return {
    transactionId: id,
    operatorRole,
    service,
    status: String(tx.status || 'pending'),
    approved: tx.approved === true,
    amount: Number.isFinite(Number(tx.amount)) ? Number(tx.amount) : 0,
    total: Number.isFinite(Number(tx.total)) ? Number(tx.total) : 0,
    customerPhone: typeof tx.customerPhone === 'string' ? tx.customerPhone.slice(0, 64) : '',
    details: typeof tx.details === 'string' ? tx.details.slice(0, 2000) : '',
    raw: sanitizeRaw(tx.raw),
    receiptUrl: typeof tx.receiptUrl === 'string' ? tx.receiptUrl.slice(0, 2048) : '',
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
  if (!queue || tx.rejected === true || !['pending', 'processing', 'completed'].includes(queue.status)) {
    await ref.delete().catch(() => {});
    return;
  }
  if (queue.status === 'completed' && !queue.claimedBy) {
    await ref.delete().catch(() => {});
    return;
  }
  await ref.set(queue, { merge: false });
}

exports.sanitizeTransaction = sanitizeTransaction;
exports.onTransactionQueueCreated = onDocumentCreated('transactions/{id}', async (event) => {
  const tx = event.data?.data();
  if (tx) await syncQueue(event.params.id, tx);
});
exports.onTransactionQueueUpdated = onDocumentUpdated('transactions/{id}', async (event) => {
  const tx = event.data?.after?.data();
  if (tx) await syncQueue(event.params.id, tx);
});
