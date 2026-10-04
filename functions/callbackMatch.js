'use strict';

// Does a provider's callback describe the transaction it claims to?
//
// The refid already identifies the order - findTransaction looks it up by the
// reference we sent - so this is a second opinion on top of that: the provider
// recommends checking the product, the account and the amount as well before
// letting a callback settle anything. A callback carrying our refid but
// somebody else's account number is not about our order.
//
// The rule is "reject what is PRESENT AND DIFFERENT", and the alternative is
// worse in a way that is completely silent. Rejecting on an ABSENT field means
// a provider that happens not to send one - or sends it under another name, or
// nests it one level deeper than we look - fails every callback it ever makes.
// The order then sits at `processing` for ever: the customer's wallet is
// already debited, the top-up already happened, and the only trace is a
// mismatch counter nobody watches. There is no poller to rescue it either,
// since that one is hardcoded to Success TopUp.
//
// So an absent value is not evidence of anything and is not treated as
// evidence. A value that is present and different still rejects, which is the
// tampering this exists to catch.
//
// The amount used to be the exception, compared unconditionally while the
// other two were guarded. That asymmetry is the bug this file was extracted to
// fix - and extracted precisely because it decides whether money settles, so
// it is worth being able to state rather than read.

function text(value, max) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, max) : '';
}

/** Cents, or null when there is no number to compare. */
function cents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/**
 * @param {object} callbackData  the callback's own `data` object.
 * @param {object} requestCheck  what we sent, recorded at dispatch.
 * @returns {{ ok: boolean, field: string }} `field` names what disagreed.
 */
function matchesCallbackRequest(callbackData, requestCheck) {
  const expected = requestCheck && typeof requestCheck === 'object' && !Array.isArray(requestCheck) ? requestCheck : null;
  // Nothing recorded to compare against - an order dispatched before this
  // existed, or by a provider that records none.
  if (!expected) return { ok: true, field: '' };
  const got = callbackData && typeof callbackData === 'object' && !Array.isArray(callbackData) ? callbackData : {};

  for (const [field, max] of [['product', 100], ['account', 200]]) {
    const want = text(expected[field], max);
    const have = text(got[field], max);
    if (want && have && have !== want) return { ok: false, field };
  }

  const wantAmount = cents(expected.amount);
  const haveAmount = cents(got.amount);
  if (wantAmount !== null && haveAmount !== null && wantAmount !== haveAmount) {
    return { ok: false, field: 'amount' };
  }
  return { ok: true, field: '' };
}

module.exports = { matchesCallbackRequest, _test: { text, cents } };
