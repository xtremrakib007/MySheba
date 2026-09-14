// Customer MYR wallet-to-wallet transfers.
//
// This is deliberately separate from the legacy staff point-transfer function.
// It treats walletBalance as a MYR amount, resolves the recipient server-side,
// and moves sender/recipient balances plus immutable ledger entries in one
// Firestore transaction. The client never writes walletBalance directly.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { checkIpAnomaly } = require('./anomalyService');
const { logAudit, logServerError } = require('./logService');

const MAX_TRANSFER_MYR = 10000;
const MIN_TRANSFER_MYR = 0.01;
const MAX_RECIPIENT_QUERY = 80;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9+]/g, '').replace(/^00/, '+');
}

function normalizeQuery(value) {
  return String(value || '').trim();
}

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function myrFromCents(value) {
  return value / 100;
}

function isKycApproved(profile) {
  return profile?.verified === true || profile?.verificationStatus === 'approved';
}

async function getProfile(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function resolveRecipient(db, query, senderUid) {
  const q = normalizeQuery(query);
  if (!q || q.length > MAX_RECIPIENT_QUERY) {
    throw new HttpsError('invalid-argument', 'Enter a valid phone number or Customer ID.');
  }

  // A confirmed recipient UID can be passed back from the preview step.
  let snap = await db.collection('users').doc(q).get();
  if (!snap.exists) snap = null;

  if (!snap) snap = await db.collection('users').where('userId', '==', q).limit(2).get();
  if (!snap || snap.empty) snap = await db.collection('users').where('customerId', '==', q).limit(2).get();

  if (!snap || snap.empty) {
    const phone = normalizePhone(q);
    if (phone) {
      snap = await db.collection('users').where('phone', '==', phone).limit(2).get();
      if (snap.empty && phone.startsWith('+')) {
        snap = await db.collection('users').where('phone', '==', phone.slice(1)).limit(2).get();
      }
    }
  }

  if (!snap || snap.empty) throw new HttpsError('not-found', 'No MySheba account was found for that recipient.');
  if (snap.size > 1) throw new HttpsError('failed-precondition', 'More than one account matches. Use the Customer ID.');

  const doc = snap.docs[0];
  const recipient = { id: doc.id, ...doc.data() };
  if (recipient.id === senderUid) throw new HttpsError('invalid-argument', "You can't transfer money to yourself.");
  if (recipient.mergedInto) throw new HttpsError('not-found', 'That account is no longer active.');
  if (recipient.role !== 'customer') throw new HttpsError('failed-precondition', 'Wallet transfers are currently available between customer wallets only.');
  if (!isKycApproved(recipient)) throw new HttpsError('failed-precondition', 'The recipient has not completed KYC yet.');

  return recipient;
}

exports.findWalletRecipient = onCall(async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const sender = await getProfile(db, uid);
  if (!sender) throw new HttpsError('not-found', 'Your account was not found.');
  if (sender.role !== 'customer') throw new HttpsError('permission-denied', 'Wallet-to-wallet transfers are for customer wallets.');
  if (!isKycApproved(sender)) throw new HttpsError('failed-precondition', 'Complete KYC before using wallet transfers.');

  const recipient = await resolveRecipient(db, request.data?.recipient, uid);
  return {
    uid: recipient.id,
    name: recipient.displayName || recipient.name || 'MySheba Customer',
    customerId: recipient.customerId || recipient.userId || '',
    phoneMasked: String(recipient.phone || '').replace(/(\d{3})\d+(\d{2})$/, '$1••••$2'),
  };
});

exports.walletTransfer = onCall(async (request) => {
  const senderUid = requireAuth(request);
  const db = admin.firestore();
  const sender = await getProfile(db, senderUid);
  if (!sender) throw new HttpsError('not-found', 'Your account was not found.');
  if (sender.role !== 'customer') throw new HttpsError('permission-denied', 'Wallet-to-wallet transfers are for customer wallets.');
  if (!isKycApproved(sender)) throw new HttpsError('failed-precondition', 'Complete KYC before using wallet transfers.');

  const amountCents = cents(request.data?.amount);
  if (!Number.isInteger(amountCents) || amountCents < 1) {
    throw new HttpsError('invalid-argument', 'Enter a valid MYR amount.');
  }
  if (amountCents < cents(MIN_TRANSFER_MYR)) {
    throw new HttpsError('invalid-argument', `Minimum transfer is MYR ${MIN_TRANSFER_MYR.toFixed(2)}.`);
  }
  if (amountCents > cents(MAX_TRANSFER_MYR)) {
    throw new HttpsError('invalid-argument', `Maximum transfer is MYR ${MAX_TRANSFER_MYR.toFixed(2)} per transaction.`);
  }

  const recipient = await resolveRecipient(db, request.data?.recipient, senderUid);
  const recipientUid = recipient.id;
  const note = String(request.data?.note || '').trim().slice(0, 120);
  const ip = getClientIp(request);
  await checkVelocity(db, senderUid, 'walletTransfer', { ip });

  const senderRef = db.collection('users').doc(senderUid);
  const recipientRef = db.collection('users').doc(recipientUid);
  const transferRef = db.collection('walletTransfers').doc();
  const senderLedgerRef = db.collection('walletLedger').doc();
  const recipientLedgerRef = db.collection('walletLedger').doc();

  try {
    await db.runTransaction(async (tx) => {
      const senderSnap = await tx.get(senderRef);
      const recipientSnap = await tx.get(recipientRef);
      if (!senderSnap.exists || !recipientSnap.exists) throw new HttpsError('not-found', 'Wallet account not found.');

      const senderData = senderSnap.data();
      const recipientData = recipientSnap.data();
      if (senderData.role !== 'customer' || recipientData.role !== 'customer') {
        throw new HttpsError('permission-denied', 'Only customer wallets can use this transfer.');
      }
      if (!isKycApproved(senderData)) throw new HttpsError('failed-precondition', 'Complete KYC before using wallet transfers.');
      if (!isKycApproved(recipientData)) throw new HttpsError('failed-precondition', 'The recipient has not completed KYC yet.');

      const senderBalanceCents = cents(senderData.walletBalance);
      const recipientBalanceCents = cents(recipientData.walletBalance);
      if (senderBalanceCents < amountCents) throw new HttpsError('failed-precondition', 'Insufficient wallet balance.');

      const senderAfter = senderBalanceCents - amountCents;
      const recipientAfter = recipientBalanceCents + amountCents;
      const now = admin.firestore.FieldValue.serverTimestamp();

      tx.update(senderRef, { walletBalance: myrFromCents(senderAfter), walletBalanceCurrency: 'MYR', walletUpdatedAt: now });
      tx.update(recipientRef, { walletBalance: myrFromCents(recipientAfter), walletBalanceCurrency: 'MYR', walletUpdatedAt: now });

      tx.set(transferRef, {
        type: 'wallet_transfer',
        currency: 'MYR',
        fromUid: senderUid,
        fromName: senderData.displayName || senderData.name || '',
        toUid: recipientUid,
        toName: recipientData.displayName || recipientData.name || '',
        amount: myrFromCents(amountCents),
        amountMinor: amountCents,
        note,
        status: 'completed',
        participants: [senderUid, recipientUid],
        createdAt: now,
      });

      tx.set(senderLedgerRef, {
        uid: senderUid,
        type: 'wallet_transfer_debit',
        direction: 'debit',
        currency: 'MYR',
        amount: myrFromCents(amountCents),
        amountMinor: amountCents,
        transferId: transferRef.id,
        counterpartyUid: recipientUid,
        balanceAfter: myrFromCents(senderAfter),
        note,
        createdAt: now,
      });

      tx.set(recipientLedgerRef, {
        uid: recipientUid,
        type: 'wallet_transfer_credit',
        direction: 'credit',
        currency: 'MYR',
        amount: myrFromCents(amountCents),
        amountMinor: amountCents,
        transferId: transferRef.id,
        counterpartyUid: senderUid,
        balanceAfter: myrFromCents(recipientAfter),
        note,
        createdAt: now,
      });
    });

    await logAudit({
      action: 'wallet_transfer',
      targetUid: recipientUid,
      performedBy: senderUid,
      performedByRole: 'customer',
      details: { transferId: transferRef.id, amount: myrFromCents(amountCents), currency: 'MYR', ip },
    });
    await checkIpAnomaly(db, senderUid, ip, { action: 'walletTransfer', role: 'customer' });

    return {
      transferId: transferRef.id,
      amount: myrFromCents(amountCents),
      currency: 'MYR',
      recipient: {
        uid: recipientUid,
        name: recipient.name || recipient.displayName || 'MySheba Customer',
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('walletTransfer', err, { userId: senderUid, recipientUid });
    throw new HttpsError('internal', 'Could not complete the wallet transfer.');
  }
});
