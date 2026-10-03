'use strict';
/**
 * Holding a wallet still.
 *
 * A freeze is not a suspension. A suspended account cannot sign in at all; a
 * frozen wallet signs in, sees its balance and its history, and cannot move
 * money while someone looks into it.
 *
 * It blocks DELIBERATE movement - spending, transferring, being topped up,
 * being funded. It never blocks a refund. A refund returns money already
 * taken, so refusing one would leave the customer frozen AND out of pocket for
 * an order that failed, which punishes them for our investigation. Every
 * reversal path is listed in scripts/audit-wallet-freeze.js so that exemption
 * is a decision on the record rather than a site someone forgot.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { logAudit } = require('./logService');

// Superadmin owns the money; support is who a customer reaches when something
// looks wrong, and waiting for a superadmin is how a drained wallet drains.
const FREEZER_ROLES = ['support', 'superadmin'];

/** True when this account's wallet is held. */
function isWalletFrozen(account) {
  return !!account && account.walletFrozen === true;
}

/**
 * Refuse a deliberate movement on a frozen wallet.
 *
 * `whose` names the side that is frozen, because "this wallet is frozen" on a
 * transfer leaves both people guessing which one.
 */
function assertWalletUnfrozen(account, whose = 'This wallet') {
  if (isWalletFrozen(account)) {
    const reason = String(account.walletFrozenReason || '').trim();
    throw new HttpsError('permission-denied',
      `${whose} is frozen${reason ? `: ${reason}` : '.'}${reason ? '' : ' Contact support.'}`);
  }
}

exports.isWalletFrozen = isWalletFrozen;
exports.assertWalletUnfrozen = assertWalletUnfrozen;
exports.FREEZER_ROLES = FREEZER_ROLES;

exports.setWalletFrozen = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const targetUid = String(request.data?.targetUid || '').trim();
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
  const frozen = request.data?.frozen === true;
  const reason = String(request.data?.reason || '').trim().slice(0, 500);
  if (frozen && !reason) throw new HttpsError('invalid-argument', 'A reason is required to freeze a wallet.');
  if (targetUid === uid) throw new HttpsError('failed-precondition', 'You cannot freeze your own wallet.');

  const result = await db.runTransaction(async (tx) => {
    const callerRef = db.collection('users').doc(uid);
    const targetRef = db.collection('users').doc(targetUid);
    const [callerSnap, targetSnap] = await Promise.all([tx.get(callerRef), tx.get(targetRef)]);
    const caller = callerSnap.exists ? (callerSnap.data() || {}) : null;
    if (!caller || !FREEZER_ROLES.includes(caller.role)) {
      throw new HttpsError('permission-denied', 'Only support or a superadmin can freeze a wallet.');
    }
    if (caller.suspended === true || caller.inactive === true || caller.disabled === true
        || caller.active === false || caller.mergedInto) {
      throw new HttpsError('permission-denied', 'Your account is not active.');
    }
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That account does not exist.');
    const target = targetSnap.data() || {};
    // Support can hold an ordinary wallet still; it cannot hold the wallet
    // that funds the chain, which would stop every top-up in the system.
    if (caller.role !== 'superadmin' && ['admin', 'superadmin'].includes(target.role)) {
      throw new HttpsError('permission-denied', 'Only a superadmin can freeze an admin or superadmin wallet.');
    }
    tx.update(targetRef, {
      walletFrozen: frozen,
      walletFrozenReason: frozen ? reason : '',
      walletFrozenBy: frozen ? uid : '',
      walletFrozenAt: frozen ? admin.firestore.FieldValue.serverTimestamp() : null,
    });
    return { role: caller.role, targetRole: target.role || '' };
  });

  await logAudit({
    action: frozen ? 'wallet_frozen' : 'wallet_unfrozen',
    targetUid, performedBy: uid, performedByRole: result.role, details: { reason },
  });
  return { frozen, targetUid };
});
