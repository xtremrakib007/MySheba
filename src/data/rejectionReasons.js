// The reasons staff actually give, so the common ones are a tap.
//
// A free-text box got one-word answers - "wrong", "no" - which tell the
// customer nothing and leave nobody able to count why orders fail. These fill
// the box rather than replacing it: the reason is still ordinary text, still
// editable, and anything not listed is still typed. Nothing downstream has to
// know these exist.
//
// Written as the customer will read them, because that is where they end up:
// on the rejected order, under "Reason".

/** A dealer, reseller or admin turning down a service order. */
export const TRANSACTION_REJECT_REASONS = [
  'Wrong mobile number',
  'Wrong operator selected',
  'Number not reachable',
  'Amount not available for this operator',
  'Duplicate order',
  'Customer asked to cancel',
  'Operator service is down',
];

/** Finance or an admin turning down a wallet top-up. */
export const TOPUP_REJECT_REASONS = [
  'Payment not received',
  'Receipt is unreadable',
  'Receipt does not match the amount',
  'Receipt already used for another top-up',
  'Sender name does not match the account',
  'Paid to the wrong account',
];

/** An approver turning down a staff wallet funding request. */
export const FUNDING_REJECT_REASONS = [
  'Not enough balance right now',
  'Amount is higher than needed',
  'Send a separate request per branch',
  'Already funded earlier today',
];
