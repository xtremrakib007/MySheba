// What a typed IIMMPACT amount costs in ringgit.
//
// An open-amount product (international top-up) takes its face amount in the
// product's own currency - BDT 100 - and is sold at that amount times
// denomination_unit_price, then IIMMPACT's price adjustment. This is the app's
// copy of iimmpactCustomerPrice in functions/apiProviderService.js, which is
// what the server charges; the order must carry the same figure or the server
// refuses it as a changed price. A test keeps the two identical.
//
// Returns 0 when it cannot be worked out.
export function iimmpactCustomerPrice(faceAmount, product) {
  const amount = Number(faceAmount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const currency = String(product?.denomination_currency || '').toUpperCase();
  const unit = Number(product?.denomination_unit_price);
  const base = currency && currency !== 'MYR' && Number.isFinite(unit) && unit > 0
    ? amount * unit
    : amount;
  const pricing = product?.pricing || {};
  const multiplier = Number(pricing.unit_price);
  let price = Number.isFinite(multiplier)
    ? (multiplier < 0 ? base + multiplier : base * multiplier)
    : base;
  const adjustment = pricing.price_adjustment;
  if (adjustment && typeof adjustment === 'object') {
    const value = Number(adjustment.value);
    if (Number.isFinite(value)) {
      price = String(adjustment.type || '').toLowerCase() === 'percentage'
        ? price * value
        : price + value;
    }
  }
  return Math.round(price * 100) / 100;
}

/**
 * Whether the app can price a typed amount for this product: a ringgit
 * product always can; a foreign-currency one only once the catalogue carries
 * its unit price (catalogues saved before that field existed do not).
 */
export function canPriceTypedAmount(product) {
  const currency = String(product?.denomination_currency || '').toUpperCase();
  if (currency === 'MYR') return true;
  if (!currency) return false;
  const unit = Number(product?.denomination_unit_price);
  return Number.isFinite(unit) && unit > 0;
}
