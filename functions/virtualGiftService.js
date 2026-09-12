const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

/**
 * Secure virtual-gift purchase. The gift price is read from the server-side
 * virtualGifts catalogue and the sender's gamePoints balance is debited in
 * the same Firestore transaction as the gift ledger entry.
 */
exports.sendVirtualGift = onCall(async (request) => {
  const senderUid = requireAuth(request);
  const data = request.data || {};
  const giftId = String(data.giftId || '').trim();
  const recipientUid = String(data.recipientUid || '').trim();
  const chatType = String(data.chatType || '').trim();
  const chatId = String(data.chatId || '').trim();
  const idempotencyKey = String(data.idempotencyKey || '').trim();

  if (!giftId || !recipientUid || !chatType || !chatId) {
    throw new HttpsError('invalid-argument', 'giftId, recipientUid, chatType and chatId are required.');
  }
  if (senderUid === recipientUid) {
    throw new HttpsError('invalid-argument', 'You cannot send a gift to yourself.');
  }
  if (!['direct', 'group', 'room'].includes(chatType)) {
    throw new HttpsError('invalid-argument', 'Unsupported chat type.');
  }

  const db = admin.firestore();
  const giftRef = db.collection('virtualGifts').doc(giftId);
  const senderRef = db.collection('gamePoints').doc(senderUid);
  const recipientRef = db.collection('users').doc(recipientUid);
  const ledgerRef = idempotencyKey
    ? db.collection('virtualGiftTransactions').doc(`${senderUid}_${idempotencyKey}`)
    : db.collection('virtualGiftTransactions').doc();

  try {
    const result = await db.runTransaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.get(ledgerRef);
        if (existing.exists) return { ...existing.data(), transactionId: existing.id, alreadyProcessed: true };
      }

      const [giftSnap, senderSnap, recipientSnap] = await Promise.all([
        tx.get(giftRef),
        tx.get(senderRef),
        tx.get(recipientRef),
      ]);

      if (!giftSnap.exists) throw new HttpsError('not-found', 'That gift does not exist.');
      const gift = giftSnap.data();
      if (gift.enabled === false) throw new HttpsError('failed-precondition', 'That gift is currently unavailable.');
      if (!recipientSnap.exists) throw new HttpsError('not-found', 'Recipient not found.');

      const price = Number(gift.price || 0);
      if (!Number.isFinite(price) || price <= 0) {
        throw new HttpsError('failed-precondition', 'That gift has an invalid price.');
      }

      const currentBalance = senderSnap.exists ? Number(senderSnap.data().balance || 0) : 0;
      if (currentBalance < price) {
        throw new HttpsError('failed-precondition', `Not enough Game Points. You need ${price} Game Points.`);
      }

      const newBalance = Math.round((currentBalance - price) * 100) / 100;
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.set(senderRef, { balance: newBalance, updatedAt: now }, { merge: true });

      const entry = {
        senderUid,
        recipientUid,
        giftId,
        giftName: String(gift.name || ''),
        imageUrl: String(gift.imageUrl || ''),
        animationUrl: String(gift.animationUrl || ''),
        animationType: String(gift.animationType || 'gif'),
        price,
        gamePointsDebited: price,
        chatType,
        chatId,
        status: 'completed',
        createdAt: now,
      };
      tx.set(ledgerRef, entry);
      return { ...entry, transactionId: ledgerRef.id, gamePointsBalance: newBalance, alreadyProcessed: false };
    });

    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('sendVirtualGift failed', err);
    throw new HttpsError('internal', 'Could not send the virtual gift right now.');
  }
});
