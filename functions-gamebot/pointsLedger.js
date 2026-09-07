// gamePoints/{uid}         -> { balance, updatedAt }
// gamePointsLedger/{id}    -> { uid, roomId, game, delta, reason, createdAt }
//
// Deliberately separate from src/firebase/walletService.js and
// functions/walletService.js — no real money ever passes through here.
// Every balance change is a ledger entry + a transaction-safe increment,
// so the balance can always be reconstructed/audited from the ledger.

const admin = require('firebase-admin');

const STARTING_POINTS = 100;
const POINTS_COLLECTION = 'gamePoints';
const LEDGER_COLLECTION = 'gamePointsLedger';

function db() {
  return admin.firestore();
}

/** Ensures a gamePoints doc exists for uid, seeding STARTING_POINTS on first use. */
async function ensurePointsAccount(uid) {
  const ref = db().collection(POINTS_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      balance: STARTING_POINTS,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return STARTING_POINTS;
  }
  return snap.data().balance;
}

async function getBalance(uid) {
  return ensurePointsAccount(uid);
}

/**
 * Applies a signed delta to uid's balance inside a transaction and writes
 * a ledger row. delta > 0 credits, delta < 0 debits. Throws if a debit
 * would take the balance below zero (never allow negative points).
 */
async function applyDelta(uid, roomId, game, delta, reason) {
  const pointsRef = db().collection(POINTS_COLLECTION).doc(uid);
  const ledgerRef = db().collection(LEDGER_COLLECTION).doc();

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(pointsRef);
    const current = snap.exists ? snap.data().balance : STARTING_POINTS;
    const next = current + delta;

    if (next < 0) {
      throw new Error(`Insufficient points: uid=${uid} balance=${current} delta=${delta}`);
    }

    tx.set(
      pointsRef,
      { balance: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    tx.set(ledgerRef, {
      uid,
      roomId,
      game,
      delta,
      reason,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function deductEntryFee(uid, roomId, game, entryFee) {
  await applyDelta(uid, roomId, game, -Math.abs(entryFee), 'entry_fee');
}

async function creditWinnings(uid, roomId, game, amount) {
  await applyDelta(uid, roomId, game, Math.abs(amount), 'pot_winnings');
}

module.exports = {
  STARTING_POINTS,
  getBalance,
  ensurePointsAccount,
  deductEntryFee,
  creditWinnings,
  applyDelta,
};
