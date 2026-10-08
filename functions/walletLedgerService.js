'use strict';

/**
 * Immutable wallet journal helper.
 *
 * walletBalance remains a fast cache used by the existing application, while
 * every controlled financial mutation also records a server-owned immutable
 * entry in walletLedger. Callers must invoke this inside the same Firestore
 * transaction as the balance mutation.
 */
function addWalletLedgerEntry(tx, db, entry) {
  const ref = db.collection('walletLedger').doc();
  tx.create(ref, {
    uid: String(entry.uid || ''),
    type: String(entry.type || 'wallet_mutation'),
    direction: entry.direction === 'debit' ? 'debit' : 'credit',
    currency: String(entry.currency || 'MYR').toUpperCase(),
    amount: Number(entry.amount || 0),
    balanceBefore: Number(entry.balanceBefore || 0),
    balanceAfter: Number(entry.balanceAfter || 0),
    relatedTransactionId: entry.relatedTransactionId ? String(entry.relatedTransactionId) : null,
    relatedUserId: entry.relatedUserId ? String(entry.relatedUserId) : null,
    providerReference: entry.providerReference ? String(entry.providerReference) : null,
    idempotencyKey: entry.idempotencyKey ? String(entry.idempotencyKey) : null,
    source: String(entry.source || 'wallet'),
    createdAt: entry.createdAt || require('firebase-admin').firestore.FieldValue.serverTimestamp(),
    immutable: true,
  });
  return ref;
}

module.exports = { addWalletLedgerEntry };
