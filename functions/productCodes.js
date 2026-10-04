'use strict';

// What the provider calls the operator a customer picked.
//
// Our screens say "Hotlink" and "U Mobile" because that is what people call
// them. A provider's API wants a code - and the code differs per provider, per
// country and per PRODUCT. iimmpact sells Hotlink airtime, Hotlink internet
// and a Hotlink voucher as three different products with three different
// codes, so "the code for Hotlink" is not a question with one answer. It is a
// property of the provider record AND of the service being sold.
//
// Nothing is guessed here, and that is the whole point of the file. There are
// 37 non-Bangladesh operators across the eight countries the app sells
// recharge for, iimmpact's documentation names a code for none of them, and a
// guessed code is a real top-up sent to the wrong product with the customer's
// money. `listProviderProductCodes` exists so the real list can be read from
// the provider itself instead.
//
// Four maps live on a provider record, deliberately separate, because they hold
// four different code sets for the same names:
//
//   operatorProductCodes  one code per operator, for charging airtime.
//   pinProductCodes       one code per operator, for a voucher PIN. A separate
//                         product from airtime, and separately priced.
//   catalogOperatorCodes  one or more codes per operator, for browsing a
//                         per-number catalogue (internet plans). A list,
//                         because CelcomDigi could be Celcom or Digi.
//   billerProductCodes    one code per biller, for bills.

/** Which map a service charges from. */
const FIELD_BY_SERVICE = {
  'Recharge PIN': 'pinProductCodes',
};
const DEFAULT_FIELD = 'operatorProductCodes';
const ALL_FIELDS = ['operatorProductCodes', 'pinProductCodes', 'catalogOperatorCodes', 'billerProductCodes'];

function codeFieldFor(service) {
  return FIELD_BY_SERVICE[String(service || '').trim()] || DEFAULT_FIELD;
}

function nonEmptyMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length ? value : null;
}

/** The operator->code map this service charges from, or null. */
function operatorCodeMap(provider, service) {
  return provider ? nonEmptyMap(provider[codeFieldFor(service)]) : null;
}

/**
 * Whether this provider works in product codes at all.
 *
 * A provider with no map anywhere is one that takes operator names directly,
 * which is every provider that worked before this existed. A provider with ANY
 * map is saying "I need codes" - and an operator missing from the map for the
 * service being sold is then a gap to refuse on rather than a name to send and
 * hope. Deliberately ANY rather than the service's own map: a record that has
 * airtime codes but no voucher codes is misconfigured, and sending an empty
 * product is worse than saying so.
 */
function declaresOperatorCodes(provider) {
  return Boolean(provider) && ALL_FIELDS.some((field) => nonEmptyMap(provider[field]));
}

/**
 * The provider's code for one operator on one service, or '' when it has none.
 *
 * A map's value is normally one code for every denomination, because the
 * denomination travels separately as the amount. Some voucher ranges are sold
 * as a product PER denomination instead - a RM10 Hotlink voucher and a RM30 one
 * being different products - so a value may also be an object keyed by
 * denomination. Which it is is the provider's business, not something to guess,
 * and the product list shows which.
 */
function operatorProductCode(provider, operatorName, { service, denomination } = {}) {
  const map = operatorCodeMap(provider, service);
  if (!map) return '';
  const entry = map[String(operatorName || '').trim()];
  if (typeof entry === 'string') return entry.trim();
  const byDenomination = nonEmptyMap(entry);
  if (!byDenomination) return '';
  // Matched on the number rather than the text, so "10", "10.00" and 10 are
  // the same denomination - a voucher priced 10.00 by one screen and 10 by
  // another is one product.
  const wanted = Number(denomination);
  if (!Number.isFinite(wanted)) return '';
  for (const [key, code] of Object.entries(byDenomination)) {
    if (Number(key) === wanted && typeof code === 'string' && code.trim()) return code.trim();
  }
  return '';
}

/**
 * Any one of an operator's codes for a service, for a question that is about
 * the operator rather than about the product - network status, which only ever
 * decides whether to show a sentence.
 *
 * Picking one from a per-denomination range is safe in a way picking between
 * Celcom and Digi is not: every code in that range belongs to the same
 * operator, so an interruption affecting one affects them all.
 */
function anyOperatorProductCode(provider, operatorName, service) {
  const map = operatorCodeMap(provider, service);
  if (!map) return '';
  const entry = map[String(operatorName || '').trim()];
  if (typeof entry === 'string') return entry.trim();
  const byDenomination = nonEmptyMap(entry);
  if (!byDenomination) return '';
  const first = Object.values(byDenomination).find((code) => typeof code === 'string' && code.trim());
  return first ? first.trim() : '';
}

module.exports = {
  operatorCodeMap, declaresOperatorCodes, operatorProductCode, anyOperatorProductCode,
  codeFieldFor, FIELD_BY_SERVICE, DEFAULT_FIELD, ALL_FIELDS,
};
