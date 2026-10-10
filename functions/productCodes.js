'use strict';

// What the provider calls the thing a customer is buying.
//
// Our screens say "Hotlink" and "60 UC" because that is what people call them.
// A provider's API wants a code - and the code differs per provider, per
// country and per PRODUCT. iimmpact sells Hotlink airtime, a Hotlink voucher
// and a Hotlink internet plan as three products under three codes, so "the code
// for Hotlink" is not a question with one answer. It depends on what is being
// sold, which is why every lookup here takes the service.
//
// What a map is keyed BY also depends on the service. Airtime and vouchers are
// bought per operator; a game top-up is not - nobody buys "PUBG", they buy
// "60 UC" - so Entertainment is keyed by the pack.
//
// Nothing is guessed. There are 37 non-Bangladesh operators and 30 game packs,
// iimmpact's documentation names a code for none of them, and a guessed code
// spends a customer's money on the wrong product. `listProviderProductCodes`
// reads the real list from the provider instead.
//
// Five maps live on a provider record, deliberately separate, because they hold
// five different code sets:
//
//   operatorProductCodes  one code per operator, for charging airtime.
//   pinProductCodes       one code per operator, for a voucher PIN.
//   gameProductCodes      one code per PACK, for a game top-up.
//   catalogOperatorCodes  one or more codes per operator, for browsing a
//                         per-number catalogue (internet plans). A list,
//                         because CelcomDigi could be Celcom or Digi.
//   billerProductCodes    one code per biller, for bills.

/** Which map a service charges from. */
const FIELD_BY_SERVICE = {
  'recharge pin': 'pinProductCodes',
  entertainment: 'gameProductCodes',
  // Bill Payment is keyed by the selected biller, not a mobile operator.
  'bill payment': 'billerProductCodes',
  billpayment: 'billerProductCodes',
};
const DEFAULT_FIELD = 'operatorProductCodes';
const ALL_FIELDS = ['operatorProductCodes', 'pinProductCodes', 'gameProductCodes', 'catalogOperatorCodes', 'billerProductCodes'];

/** What that map is keyed by, for a service. */
const SUBJECT_BY_SERVICE = {
  entertainment: 'packageId',
  'bill payment': 'provider',
  billpayment: 'provider',
};
const DEFAULT_SUBJECT = 'operator';

function serviceKey(service) {
  return String(service || '').trim().toLowerCase();
}

function codeFieldFor(service) {
  return FIELD_BY_SERVICE[serviceKey(service)] || DEFAULT_FIELD;
}

/** The field of an order that names what is being bought, for a service. */
function codeSubjectKeyFor(service) {
  return SUBJECT_BY_SERVICE[serviceKey(service)] || DEFAULT_SUBJECT;
}

/** What this order is buying, as the map would name it. */
function codeSubjectFor(service, raw) {
  const value = (raw || {})[codeSubjectKeyFor(service)];
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function nonEmptyMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length ? value : null;
}

/** The map this service charges from, or null. */
function productCodeMap(provider, service) {
  return provider ? nonEmptyMap(provider[codeFieldFor(service)]) : null;
}

/**
 * Whether this provider works in product codes at all.
 *
 * A provider with no map anywhere takes names directly, which is every provider
 * that worked before this existed. A provider with ANY map is saying "I need
 * codes" - and a missing code for the service being sold is then a gap to
 * refuse on rather than a name to send and hope. Deliberately ANY rather than
 * the service's own map: a record with airtime codes and no game codes is
 * misconfigured, and sending an empty product is worse than saying so.
 */
function declaresProductCodes(provider) {
  return Boolean(provider) && ALL_FIELDS.some((field) => nonEmptyMap(provider[field]));
}

// A map's value is normally just a code. Two other forms exist because two real
// products cannot be expressed by one:
//
//   { "10": "C10", "30": "C30" }   a voucher range sold as one product PER
//                                  denomination, so the amount picks the code.
//   { code: "X", amount: "4.20" }  a fixed product whose amount the provider
//                                  sets. Ours is the customer's SELL price and
//                                  sending that buys the wrong thing or is
//                                  refused; this is the figure to send instead.
//
// They compose: a per-denomination entry's leaf may itself carry an amount.
function leafCode(entry) {
  if (typeof entry === 'string') return entry.trim();
  const object = nonEmptyMap(entry);
  return object && typeof object.code === 'string' ? object.code.trim() : '';
}
function leafAmount(entry) {
  const object = nonEmptyMap(entry);
  if (!object) return null;
  const amount = Number(object.amount);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}
function isPerDenomination(entry) {
  const object = nonEmptyMap(entry);
  return Boolean(object) && object.code === undefined;
}

/** The map entry for one purchase, after resolving any per-denomination layer. */
function entryFor(provider, subject, { service, denomination } = {}) {
  const map = productCodeMap(provider, service);
  if (!map) return undefined;
  const entry = map[String(subject || '').trim()];
  if (entry === undefined || entry === null) return undefined;
  if (!isPerDenomination(entry)) return entry;
  // Matched on the number rather than the text, so "10", "10.00" and 10 are
  // the same denomination - a voucher priced 10.00 by one screen and 10 by
  // another is one product.
  const wanted = Number(denomination);
  if (!Number.isFinite(wanted)) return undefined;
  for (const [key, value] of Object.entries(entry)) {
    if (Number(key) === wanted) return value;
  }
  return undefined;
}

/** The provider's code for one purchase, or '' when it has none. */
function productCodeFor(provider, subject, options) {
  return leafCode(entryFor(provider, subject, options));
}

/** The amount the provider wants for it, when the map states one. */
function productAmountFor(provider, subject, options) {
  return leafAmount(entryFor(provider, subject, options));
}

/**
 * Any one of a subject's codes, for a question that is about the subject
 * rather than about the exact product - network status, which only ever
 * decides whether to show a sentence.
 *
 * Picking one from a per-denomination range is safe in a way picking between
 * Celcom and Digi is not: every code in that range belongs to the same
 * operator, so an interruption affecting one affects them all.
 */
function anyProductCodeFor(provider, subject, service) {
  const map = productCodeMap(provider, service);
  if (!map) return '';
  const entry = map[String(subject || '').trim()];
  if (!isPerDenomination(entry)) return leafCode(entry);
  for (const value of Object.values(entry)) {
    const code = leafCode(value);
    if (code) return code;
  }
  return '';
}

module.exports = {
  productCodeMap, declaresProductCodes, productCodeFor, productAmountFor, anyProductCodeFor,
  codeFieldFor, codeSubjectKeyFor, codeSubjectFor,
  FIELD_BY_SERVICE, SUBJECT_BY_SERVICE, DEFAULT_FIELD, DEFAULT_SUBJECT, ALL_FIELDS,
};
