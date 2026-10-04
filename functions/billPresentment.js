'use strict';

// Reading a bill before paying it.
//
// iimmpact's bill presentment answers in prose. `data.message` is one of four
// sentences and `data.error_message` one of four more, and those strings - not
// an HTTP code, not a boolean - are the whole contract. They are reproduced
// here verbatim from their integration guide.
//
// The rule that matters is which of them may stop a payment, and the answer is
// ONE of them:
//
//   "Invalid account no"  the number is wrong. Paying it would send money to
//                         an account that does not exist, so this blocks.
//
// Everything else lets the customer carry on. Presentment is advisory and in
// Beta: a biller that does not support it, a provider having a bad afternoon,
// a message nobody has seen before, a network that times out - none of those
// are a reason to stand between somebody and their electricity bill. So the
// default here is NOT to block, and anything unrecognised takes that default.
// Getting this backwards is not a visible bug; it is a bill payment screen
// that quietly stops working for a biller whose wording changed.

/** Trim, collapse runs of whitespace, drop a trailing full stop, lowercase. */
function normalise(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .toLowerCase();
}

// data.message, as their guide writes them.
const VALID = 'account no is valid';
const INVALID_ACCOUNT = 'invalid account no';
const UNAVAILABLE_FOR_PRODUCT = 'bill presentment is unavailable for this product';
const SERVICE_UNAVAILABLE = 'service unavailable. please try again later';

// Which bill fields may be shown, and the key names to look for. Only fields
// that actually arrive are returned: their guide is explicit that a label with
// nothing behind it must not be rendered, because which fields a biller
// publishes varies per biller.
//
// An allowlist rather than passing the response through, because the response
// is a third party's and everything in it would otherwise reach the screen.
const FIELD_MAP = [
  { key: 'customerName', label: 'Account name', keys: ['customer_name', 'customerName', 'account_name', 'name'] },
  { key: 'billNumber', label: 'Bill number', keys: ['bill_number', 'bill_no', 'invoice_no', 'invoice_number', 'reference'] },
  { key: 'billDate', label: 'Bill date', keys: ['bill_date', 'statement_date', 'billDate'] },
  { key: 'dueDate', label: 'Due date', keys: ['due_date', 'dueDate', 'payment_due_date'] },
  { key: 'minimumAmount', label: 'Minimum payable', keys: ['minimum_amount', 'min_amount', 'minimumAmount'] },
  { key: 'outstanding', label: 'Outstanding', keys: ['outstanding_amount', 'amount_due', 'outstanding', 'total_amount', 'bill_amount', 'amount'] },
];

function firstOf(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object') continue;
    return value;
  }
  return undefined;
}

/** A money-ish value as a number, or null when it is not one. */
function toAmount(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * What a bill presentment reply means.
 *
 * @param {object} data   the reply's `data` object, or {} when there was none.
 * @param {object} [opts] { reachable: false } when the call itself failed.
 * @returns {{
 *   status: 'valid'|'invalid-account'|'unavailable'|'unknown',
 *   blocking: boolean,
 *   message: string,          what to put on screen, or '' for nothing
 *   fields: Array<{key,label,value}>,
 *   outstanding: number|null, the amount to offer as a prefill, or null
 * }}
 */
function readBillPresentment(data, opts = {}) {
  const body = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  // A failed call is not a verdict on the account. Say nothing and let the
  // payment through.
  if (opts.reachable === false) {
    return { status: 'unavailable', blocking: false, message: '', fields: [], outstanding: null };
  }

  const message = normalise(body.message);

  // `data.message` alone decides this, and deliberately so. `error_message` can
  // also read "Invalid account no", but their table keys the decision on
  // `message` and says every OTHER error still lets the customer pay - so
  // blocking on error_message as well would refuse payments their own
  // documentation permits. It is used only for what to put on screen, where
  // "Ref-2 is required" or "The provided biller code is invalid" tells the
  // customer something they can act on and the generic message does not.
  if (message === INVALID_ACCOUNT) {
    return {
      status: 'invalid-account',
      blocking: true,
      message: String(body.error_message || body.errorMessage || body.message || 'That account number was not recognised.').slice(0, 300),
      fields: [],
      outstanding: null,
    };
  }

  if (message === VALID) {
    const fields = [];
    for (const field of FIELD_MAP) {
      const value = firstOf(body, field.keys);
      if (value === undefined) continue;
      fields.push({ key: field.key, label: field.label, value: String(value).slice(0, 120) });
    }
    return {
      status: 'valid',
      blocking: false,
      message: '',
      fields,
      outstanding: toAmount(firstOf(body, FIELD_MAP[FIELD_MAP.length - 1].keys)),
    };
  }

  if (message === UNAVAILABLE_FOR_PRODUCT || message === SERVICE_UNAVAILABLE) {
    return { status: 'unavailable', blocking: false, message: '', fields: [], outstanding: null };
  }

  // Anything else: a new message, a reworded one, an error we have no table
  // entry for. Show no bill, block nothing.
  return { status: 'unknown', blocking: false, message: '', fields: [], outstanding: null };
}

module.exports = { readBillPresentment, normalise, toAmount, FIELD_MAP, _test: { firstOf } };
