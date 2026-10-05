/**
 * One table of status badge colours, for every screen that shows a status.
 *
 * There were four of these, hand-kept, and they had drifted: the admin home
 * knew nine statuses, the dealer home three, and NONE of them knew `failed` -
 * which the server writes on a transaction whenever a provider execution does
 * not come back (walletService, rechargePinService, apiWebhookService). Two of
 * the four looked the status up without a fallback, so the first failed
 * recharge to reach an admin's home screen read `undefined.bg` and took the
 * whole app down to the error boundary.
 *
 * So the lookup is a function, not a table anybody can index directly. A
 * status nobody planned for returns the unknown badge instead of undefined,
 * which is the difference between a grey chip and a crash.
 */

const AMBER = { bg: '#FFF8E1', text: '#F57F17' };   // waiting on somebody
const BLUE = { bg: '#E3F2FD', text: '#1565C0' };    // under way
const GREEN = { bg: '#E8F5E9', text: '#2E7D32' };   // done, and went well
const RED = { bg: '#FDECEA', text: '#C62828' };     // done, and did not
const PURPLE = { bg: '#EDE7F6', text: '#5E35B1' };  // part-way through a two-step review
const GREY = { bg: '#ECEFF1', text: '#546E7A' };    // nobody knows

const STATUS_BADGES = {
  // Transactions, as functions/ writes them.
  pending: AMBER,
  accepted: BLUE,
  processing: BLUE,
  completed: GREEN,
  failed: RED,
  rejected: RED,
  // The provider answered, but not with an answer. Grey rather than red: it
  // is not a failure yet, it is a question for reconciliation.
  unknown: GREY,

  // Top-ups and wallet funding.
  verified: PURPLE,
  approved: GREEN,

  // Travel inquiries.
  new: AMBER,
  contacted: BLUE,
  closed: GREEN,

  // Support tickets.
  open: AMBER,
  in_progress: BLUE,
  resolved: GREEN,
};

/** The badge for a status, and never undefined. */
function statusBadge(status) {
  const key = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return STATUS_BADGES[key] || GREY;
}

/**
 * What to print in the chip.
 *
 * Beside the colours because the same missing status broke both: the line
 * under the crash was `tx.status.toUpperCase()`, which throws on exactly the
 * values that have no badge.
 */
function statusLabel(status, fallback = 'UNKNOWN') {
  const text = typeof status === 'string' ? status.trim() : '';
  return text ? text.toUpperCase() : fallback;
}

export { STATUS_BADGES, statusBadge, statusLabel };
