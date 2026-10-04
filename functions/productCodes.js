'use strict';

// What the provider calls the operator a customer picked.
//
// Our screens say "Hotlink" and "U Mobile" because that is what people call
// them. A provider's API wants a code - and the code differs per provider, per
// country and even per PRODUCT: iimmpact sells Hotlink airtime and Hotlink
// internet as two different products with two different codes. So this is a
// property of the provider record, not of the operator, and it is configured
// rather than compiled in.
//
// Nothing is guessed here, and that is the whole point of the file. There are
// 37 non-Bangladesh operators across the eight countries the app sells
// recharge for, iimmpact's documentation names a code for none of them, and a
// guessed code is a real top-up sent to the wrong product with the customer's
// money. `listProviderProductCodes` exists so the real list can be read from
// the provider itself instead.
//
// Three maps live on a provider record and they are deliberately separate,
// because they hold three different code sets for the same names:
//
//   operatorProductCodes  one code per operator, for a CHARGE (airtime).
//   catalogOperatorCodes  one or more codes per operator, for browsing a
//                         per-number catalogue (internet plans). A list,
//                         because CelcomDigi could be Celcom or Digi.
//   billerProductCodes    one code per biller, for bills.

/** The operator->code map a provider declares for charging, or null. */
function operatorCodeMap(provider) {
  const map = provider && provider.operatorProductCodes;
  return map && typeof map === 'object' && !Array.isArray(map) && Object.keys(map).length ? map : null;
}

/**
 * Whether this provider expects product codes at all.
 *
 * A provider with no map is one that takes operator names directly, which is
 * every provider that worked before this existed. A provider WITH a map is
 * saying "I need codes" - and an operator missing from it is then a gap to
 * refuse on rather than a name to send and hope.
 */
function declaresOperatorCodes(provider) {
  return operatorCodeMap(provider) !== null;
}

/** The provider's code for one operator, or '' when it has none. */
function operatorProductCode(provider, operatorName) {
  const map = operatorCodeMap(provider);
  if (!map) return '';
  const code = map[String(operatorName || '').trim()];
  return typeof code === 'string' ? code.trim() : '';
}

module.exports = { operatorCodeMap, declaresOperatorCodes, operatorProductCode };
