'use strict';
/**
 * The one place a cost becomes the number a customer sees and pays.
 *
 * A package is listed in the destination country's currency and charged in the
 * customer's wallet currency, and four things sit between the two: the
 * recharge rate, the per-unit price for that role, the tier discount, and the
 * wallet sell rate. Compute any of them in a second place and the price on the
 * screen stops matching the price on the wallet - which is exactly what a
 * client-side "approximately" line did, showing the rate conversion alone and
 * omitting the other three.
 *
 * So the charge path and the listing both call walletChargeFor, and neither
 * owns the arithmetic.
 */
const { baseToWallet } = require('./walletCurrencyService');

/**
 * Per-unit price key per chargeable service. Absent means a multiplier of 1.
 *
 * Offer packs and entertainment each have their own key, both defaulting to
 * no markup, so they sell at the converted rate. Both used to read
 * internetPointCostPerUnit, which meant a markup put on internet packages
 * silently applied to them as well - and neither is meant to carry one.
 * Internet keeps its own, which is the only one of the three that marks up.
 */
const PER_UNIT_PRICE_KEYS = {
  recharge: 'rechargePointCostPerUnit',
  internet: 'internetPointCostPerUnit',
  offerpacks: 'offerPacksPointCostPerUnit',
  entertainment: 'entertainmentPointCostPerUnit',
  billpayment: 'billPaymentPointCostPerUnit',
  mobilebanking: null,
  remittance: null,
  esim: null,
};

function priceForRole(pricing, key, role) {
  const v = role && pricing && pricing.rolePricing && pricing.rolePricing[role] && pricing.rolePricing[role][key];
  return v != null ? v : (pricing ? pricing[key] : undefined);
}

/**
 * The per-unit multiplier, where unset and zero both mean "no markup".
 * A negative or non-numeric one is a misconfiguration, not a discount.
 */
function safePrice(pricing, key, role) {
  const raw = priceForRole(pricing, key, role);
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error('Pricing configuration is invalid.');
  return n === 0 ? 1 : n;
}

/**
 * baseAmount is already in MYR, the base currency: for a foreign order that is
 * the catalogue price divided by the recharge rate.
 *
 * Returns both numbers because the transaction records the MYR cost and debits
 * the wallet one, and they must come from the same calculation.
 */
function walletChargeFor({ baseAmount, unitPrice = 1, discountPercent = 0, fx }) {
  const base = Number(baseAmount) * (Number(unitPrice) || 1);
  const discount = Number(discountPercent) || 0;
  const baseCostMyr = Math.round(base * (1 - discount / 100) * 100) / 100;
  if (!Number.isFinite(baseCostMyr) || baseCostMyr < 0 || !Number.isSafeInteger(Math.round(baseCostMyr * 100))) {
    throw new Error('Wallet charge is invalid.');
  }
  return { baseCostMyr, walletCost: baseToWallet(baseCostMyr, fx), currency: fx.currency };
}

module.exports = { PER_UNIT_PRICE_KEYS, priceForRole, safePrice, walletChargeFor };
