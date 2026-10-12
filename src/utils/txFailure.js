// What a customer is told about a transaction that did not complete.
//
// The server records the provider's own error on a failed order (apiError):
// "Provider HTTP 403: Forbidden", "Insufficient balance", ... That is for
// staff. A customer gets a short reason they can act on, and - since a
// definitive failure is refunded (walletService) - whether the money is back.
//
// Pure: data in, words out.

const LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  unknown: 'Under review',
};

/** The badge text for a transaction status. */
export function txStatusLabel(status) {
  const key = String(status || 'pending').toLowerCase();
  return LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

// Provider wording -> what the customer can do about it. The provider's own
// state (its balance, its gateway) is never repeated to a customer.
const REASONS = [
  [/price has changed|no longer available|reload the product|choose it again/i, 'The price or package changed. Please try again.'],
  [/invalid (mobile |phone )?(number|msisdn|account)|number (is )?not (valid|supported)|subscriber/i, 'The operator did not accept this number. Please check it and try again.'],
  [/denomination|amount (is )?not (allowed|valid)|invalid amount/i, 'This amount is not available for this number. Please choose another.'],
  [/not (supported|available) for this|unsupported operator|operator mismatch/i, 'This number belongs to a different operator. Please choose the right one.'],
];

/**
 * The reason line for a failed or unresolved transaction, or '' for any
 * other status.
 */
export function txFailureReason(item) {
  const status = String(item?.status || '').toLowerCase();
  if (status === 'unknown') return 'We are confirming the result with the provider. Your wallet will be refunded automatically if it did not go through.';
  if (status !== 'failed' && status !== 'cancelled') return '';
  const error = String(item?.apiError || item?.apiExecution?.error || item?.failureReason || '');
  const match = REASONS.find(([pattern]) => pattern.test(error));
  const reason = match ? match[1] : 'The provider could not complete this order.';
  return item?.apiRefunded ? `${reason} The amount was refunded to your wallet.` : reason;
}
