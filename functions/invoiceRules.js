/**
 * What an invoice is, and who is allowed to decide it.
 *
 * Two kinds are recorded here and they are not the same thing:
 *
 *   investment      money put INTO the business, kept so the history of who
 *                   funded what survives the person who arranged it.
 *   providerPayment money paid OUT to an API provider - the Success TopUp and
 *                   IIMMPACT settlements - kept so a balance top-up can be
 *                   tied to the invoice that authorised it.
 *
 * The point of the record is the pair of names on it. An invoice carries who
 * raised it and who approved it, each with the moment they did, because an
 * amount with one name on it proves nothing: the question anyone asks of a
 * payment months later is who decided, not who typed. That is also why
 * `approvalDecision` refuses self-approval. Without that rule both names can be
 * the same person and the second one is decoration.
 *
 * Pure: no Firestore, no clock, no randomness. Everything that decides whether
 * money is recorded as authorised is here and testable.
 */

const INVOICE_KINDS = ['investment', 'providerPayment'];
const INVOICE_STATUSES = ['pending', 'approved', 'rejected'];
// Two decimal places, and far below the point where cents stop being exact.
const MAX_AMOUNT = 100000000;

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * An amount that can be stored and added up without losing cents.
 *
 * Returns null rather than throwing, so the caller decides which error its
 * transport should raise.
 */
function money(value) {
  const amount = typeof value === 'number' ? value : Number(text(value, 40));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) return null;
  // Rejects 10.005 and anything else that is not a whole number of cents.
  if (Math.abs(amount * 100 - cents) > 1e-9) return null;
  return cents / 100;
}

/**
 * The fields of a new invoice, or a reason it is not one.
 *
 * @returns {{ ok: true, invoice: object } | { ok: false, reason: string }}
 */
function readInvoice(input) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  const kind = text(data.kind, 40);
  if (!INVOICE_KINDS.includes(kind)) {
    return { ok: false, reason: 'An invoice must be either an investment or a provider payment.' };
  }

  // Who the money moved between. Named rather than implied: a provider payment
  // whose payee is blank cannot be reconciled against anything later.
  const party = text(data.party, 200);
  if (!party) return { ok: false, reason: 'Name who this invoice is for.' };

  const amount = money(data.amount);
  if (amount === null) {
    return { ok: false, reason: 'Enter an amount in whole cents, above zero.' };
  }

  const currency = text(data.currency, 8).toUpperCase() || 'MYR';
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, reason: 'Currency must be a three-letter code.' };

  // Free text the finance team writes for itself. Optional, because forcing a
  // note produces "." and teaches people the field means nothing.
  const reference = text(data.reference, 100);
  const notes = text(data.notes, 2000);

  return { ok: true, invoice: { kind, party, amount, currency, reference, notes } };
}

/**
 * May this person approve or reject this invoice?
 *
 * The self-approval rule is the one that matters. Everything else here is
 * ordinary state checking; this is the control that makes the two names on the
 * record mean something.
 */
function approvalDecision({ invoice, actorUid }) {
  const uid = text(actorUid, 128);
  if (!uid) return { ok: false, reason: 'Sign in required.' };
  if (!invoice || typeof invoice !== 'object') return { ok: false, reason: 'That invoice no longer exists.' };

  const status = text(invoice.status, 40);
  if (status !== 'pending') {
    // Named, because "cannot approve" sends somebody looking for a permission
    // problem when the answer is that a colleague already decided it.
    return { ok: false, reason: `This invoice was already ${status || 'decided'}.` };
  }

  if (text(invoice.createdBy, 128) === uid) {
    return { ok: false, reason: 'An invoice must be approved by somebody other than the person who raised it.' };
  }

  return { ok: true, reason: '' };
}

/**
 * The invoice number: MSI-<year>-<sequence>, zero padded.
 *
 * Sequence is supplied by the caller from a counter it holds in a transaction,
 * so this stays pure and the uniqueness lives where it can actually be
 * guaranteed.
 */
function invoiceNumber(year, sequence) {
  const y = Number(year);
  const n = Number(sequence);
  if (!Number.isInteger(y) || y < 2000 || y > 9999) return '';
  if (!Number.isInteger(n) || n < 1 || n > 999999) return '';
  return 'MSI-' + y + '-' + String(n).padStart(5, '0');
}

module.exports = {
  INVOICE_KINDS, INVOICE_STATUSES, MAX_AMOUNT,
  money, readInvoice, approvalDecision, invoiceNumber,
};
