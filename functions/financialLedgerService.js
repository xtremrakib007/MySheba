const admin = require('firebase-admin');

async function recordCompletedTransaction(transactionId, txData) {
  if (!transactionId || !txData || txData.status !== 'completed') return { recorded: false };
  const db = admin.firestore();
  const ref = db.collection('financialLedger').doc(String(transactionId));
  const snap = await ref.get();
  if (snap.exists) return { recorded: false, duplicate: true };

  const amount = Number(txData.total ?? txData.amount ?? 0);
  const currency = String(txData.currency || txData.walletCurrency || 'MYR').toUpperCase();
  const entry = {
    ledgerId: ref.id,
    transactionId: String(transactionId),
    customerId: String(txData.customerId || ''),
    service: String(txData.service || ''),
    providerId: String(txData.providerId || txData.apiProvider || ''),
    providerReference: String(txData.providerReference || txData.providerTransactionId || txData.apiExecution?.providerReference || ''),
    amount: Number.isFinite(amount) ? amount : 0,
    currency,
    walletCharge: Number(txData.walletCharge ?? txData.total ?? txData.amount ?? 0) || 0,
    providerCost: Number(txData.providerCost ?? txData.cost ?? 0) || 0,
    profit: Number(txData.profit ?? 0) || 0,
    status: 'completed',
    immutable: true,
    source: 'transaction_completion',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await ref.create(entry);
  return { recorded: true, id: ref.id };
}

module.exports = { recordCompletedTransaction };
