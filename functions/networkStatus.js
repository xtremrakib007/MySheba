'use strict';

// Is the biller or operator currently up?
//
// Purely advisory, and the strongest statement in iimmpact's own guide about
// it is what it must NOT do: "interruption warnings must NOT block the payment
// flow - users should still be able to proceed". A top-up during an
// interruption may be slow or may fail; it is not forbidden, and a customer who
// wants to try is entitled to.
//
// So unlike bill presentment, which has exactly one blocking answer, this has
// none at all - and says so by having no field that could express one. The
// only decision here is whether to put a sentence on the screen.
//
// Which makes the risk the opposite way round. The damage here is not a
// payment wrongly refused, it is a warning wrongly SHOWN: an "it might not go
// through" on a healthy product talks people out of paying for no reason. So
// only an explicit interruption warns, and everything else - a reply nobody
// has seen, an unreachable provider, a product with no status at all - is
// silence.

/** Trim, collapse whitespace, lowercase. */
function normalise(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
}

// Their guide names one status word. The value has been seen on `status` in
// their examples; the others are read in case the field moves, and reading
// extra keys cannot cause a false warning because the WORD still has to match.
const STATUS_KEYS = ['status', 'network_status', 'networkStatus', 'state', 'message'];

function firstStatusOf(body) {
  for (const key of STATUS_KEYS) {
    const value = body[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object') continue;
    return String(value);
  }
  return '';
}

/**
 * What a network status reply means.
 *
 * @param {object} data   the reply's `data` object, or {} when there was none.
 * @param {object} [opts] { reachable: false } when the call itself failed.
 * @returns {{ status: 'ok'|'interruption'|'unknown', raw: string }}
 */
function readNetworkStatus(data, opts = {}) {
  if (opts.reachable === false) return { status: 'unknown', raw: '' };
  const body = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const raw = firstStatusOf(body);
  const text = normalise(raw);
  if (!text) return { status: 'unknown', raw: '' };

  // Matched as a word rather than by equality: their guide gives the status as
  // `Interruption` but words it in prose elsewhere, and a reply of
  // "Interruption on this product" means the same thing. A substring match
  // would not - "no interruption" contains it and means the opposite.
  if (/\binterruptions?\b/.test(text) && !/\bno\b[^.]*\binterruptions?\b/.test(text)) {
    return { status: 'interruption', raw: String(raw).slice(0, 120) };
  }
  // Anything else that arrived is the product being fine, or a word we do not
  // recognise. Neither warrants a warning, and they are distinguished only so
  // a log can tell them apart.
  return { status: 'ok', raw: String(raw).slice(0, 120) };
}

/** The one sentence a customer sees, or '' for nothing. */
function interruptionNotice(result) {
  return result && result.status === 'interruption'
    ? 'This service is having problems right now. Your payment might be slow or might not go through - you can still continue.'
    : '';
}

module.exports = { readNetworkStatus, interruptionNotice, normalise, _test: { firstStatusOf, STATUS_KEYS } };
