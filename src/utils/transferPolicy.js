// Who may send wallet money to whom.
//
// A mirror of canTransferTo in functions/secureTransfer.js. The server is the
// authority and still refuses anything this lets through - this exists so the
// app can stop offering a transfer it knows will be refused.
//
// Without it, the Send To list showed every account in the management pool,
// including ones the rule forbids. A superadmin could pick a customer, type
// an amount, enter their security PIN, and only then be told "you are not
// allowed to send to that account" - the rule was right, the app just asked
// for a PIN before applying it.
//
// scripts/test-transfer-policy.js reads the server's copy and compares the
// two across every role pair, so this cannot drift away from it.

/** Roles that may send at all. */
export const SENDER_ROLES = ['dealer', 'admin', 'superadmin'];

/**
 * @param {string} senderRole  the sender's role
 * @param {string} senderUid   the sender's uid, for the dealer's own-customer rule
 * @param {{role?: string, dealerId?: string}} recipient
 */
export function canTransferTo(senderRole, senderUid, recipient) {
  const role = recipient && recipient.role;
  // A dealer funds only the customers who belong to them.
  if (senderRole === 'dealer') return role === 'customer' && !!senderUid && recipient.dealerId === senderUid;
  if (senderRole === 'admin') return role === 'dealer';
  if (senderRole === 'superadmin') return role === 'admin' || role === 'dealer';
  return false;
}

/** Who a sender may actually be shown, from a pool of accounts. */
export function eligibleRecipients(senderRole, senderUid, accounts) {
  return (accounts || []).filter((a) => a && a.id !== senderUid && canTransferTo(senderRole, senderUid, a));
}

/** Why the list is empty, in the sender's own terms. */
export function recipientHint(senderRole) {
  if (senderRole === 'dealer') return 'You can send to customers assigned to you.';
  if (senderRole === 'admin') return 'You can send to dealers.';
  if (senderRole === 'superadmin') return 'You can send to admins and dealers.';
  return 'Your account cannot send wallet money.';
}
