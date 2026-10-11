// Provider amount options as DenominationGrid cards.
//
// IIMMPACT describes an option in several ways at once - a label ("RM5",
// "Unlimited 7 days"), a face value (`denomination`, in the product's
// `denomination_currency`) and a sell price in MYR. A card wants one headline
// and at most one line under it:
//
//   - the headline is the face value in the currency it is bought in: "RM 5"
//     for a Malaysian reload, "IDR 50,000" for an Indonesian one;
//   - the caption is the label, unless the label only restates that amount;
//   - "Pay RM x" is what the wallet is charged, which the card hides when it
//     equals a ringgit face value.
//
// Pure: no React, no network.

const s = (v) => (v == null ? '' : String(v).trim());

function money(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });
}

/** The MYR price IIMMPACT sells an option at, or NaN. */
export function optionPrice(option) {
  const n = Number(option?.price?.amount ?? option?.price ?? option?.amount ?? option?.denomination);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

// "RM5", "RM 5.00", "MYR 10", "5" - a label that says nothing the headline does not.
const AMOUNT_ONLY = /^(rm|myr)?\s*[\d.,]+\s*(rm|myr)?$/i;

/**
 * One card per option.
 *
 * `payFor(price)` turns the provider's MYR price into what the wallet pays
 * (MySheba's markup, the PIN multiplier); the default is the price itself.
 */
export function denominationItems(options, { product, payFor = (price) => price, keyOf } = {}) {
  return (Array.isArray(options) ? options : []).map((option, index) => {
    const price = optionPrice(option);
    const currency = s(option?.denomination_currency || product?.denomination_currency || option?.price?.currency || 'MYR').toUpperCase();
    const denomination = Number(option?.denomination);
    const label = s(option?.label || option?.description || option?.name);
    const foreign = currency !== 'MYR' && Number.isFinite(denomination) && denomination > 0;
    const face = foreign ? NaN : (Number.isFinite(denomination) && denomination > 0 ? denomination : price);
    const value = foreign
      ? `${currency} ${money(denomination)}`
      : Number.isFinite(face) ? `RM ${money(face)}` : (label || s(option?.code) || 'Amount');
    const restates = !label || AMOUNT_ONLY.test(label) || label === value;
    const caption = [restates ? '' : label, s(option?.validity)].filter(Boolean).join(' • ');
    const pay = Number.isFinite(price) ? Math.round(Number(payFor(price)) * 100) / 100 : NaN;
    return {
      key: keyOf ? keyOf(option, index) : s(option?.code) || String(index),
      value,
      caption,
      face: foreign ? undefined : face,
      pay,
      option,
    };
  });
}

/** Cards for a plain list of ringgit amounts (a product with fixed denominations). */
export function amountItems(amounts, { payFor = (amount) => amount } = {}) {
  return (Array.isArray(amounts) ? amounts : [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((amount) => ({ key: String(amount), value: `RM ${money(amount)}`, caption: '', face: amount, pay: Math.round(Number(payFor(amount)) * 100) / 100, amount }));
}
