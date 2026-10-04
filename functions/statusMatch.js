'use strict';

// Does a provider's status value count as a configured one?
//
// A single configured value stays a single value. A COMMA-SEPARATED setting
// means "any of these", which exists because providers spell the same outcome
// more than one way, and both alternatives to supporting a list are wrong:
// matching only one spelling mishandles every transaction that used the other,
// and matching none accepts an outright failure as a success.
//
// iimmpact is the live example, and it has two of these:
//
//   * `POST /v2/topup` answers `Succesful`, with one s, documented as a legacy
//     quirk that cannot be changed - while `/v2/transactions` answers
//     `Successful`. Both have to mean success.
//
//   * a voided transaction answers `Refund`, which is as much a reason to give
//     the customer their money back as `Failed` is. With only one of the two
//     configurable, a `Refund` callback would have left the customer charged
//     for a transaction the provider had already reversed.
//
// Comparison is case-insensitive on trimmed text because a status is a human
// label, not an identifier. `true`/`false` still compare as themselves, which
// is what providers reporting a boolean `result` rely on.
function matchesStatus(actual, configured) {
  if (configured == null || configured === '') return false;
  const want = String(configured).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!want.length) return false;
  // An absent value matches nothing. Without this, a configured value of
  // "undefined" or a response missing the field entirely would compare equal.
  if (actual == null) return false;
  return want.includes(String(actual).trim().toLowerCase());
}

module.exports = { matchesStatus };
