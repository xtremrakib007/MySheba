// MySheba's own price on top of the provider's - the app's copy.
//
// Identical to functions/markupService.js, which is what actually charges:
// this copy exists so the price shown before confirming is the price taken.
// scripts/test-iimmpact-marketplace.js fails if the two disagree. See that
// file for how markups are configured.

export const MARKUP_SERVICES = ['recharge', 'internet', 'offerpacks', 'entertainment', 'billpayment', 'esim', 'iimmpact', 'rechargePin'];
const MAX_PERCENT = 100;
const MAX_FIXED = 1000;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function cleanRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const percent = Math.min(MAX_PERCENT, Math.max(0, num(rule.percent)));
  const fixed = Math.min(MAX_FIXED, Math.max(0, num(rule.fixed)));
  return percent || fixed ? { percent, fixed } : null;
}

/** The rule that applies to one sale, or null when MySheba adds nothing. */
export function markupRuleFor(pricing, { service, country, productCode } = {}) {
  if (!MARKUP_SERVICES.includes(service)) return null;
  const markups = (pricing && pricing.markups) || {};
  const code = String(productCode || '').trim();
  const cc = String(country || '').trim().toUpperCase();
  return (code && cleanRule(markups.products?.[code]))
    || (cc && cleanRule(markups.countries?.[`${service}:${cc}`]))
    || cleanRule(markups.services?.[service])
    || null;
}

/**
 * The selling price for a provider price. `markup` is what MySheba added, so
 * a receipt or report can show it separately.
 */
export function applyMarkup(pricing, { service, country, productCode, amount } = {}) {
  const base = Math.round(num(amount) * 100) / 100;
  const rule = markupRuleFor(pricing, { service, country, productCode });
  if (!rule || !(base > 0)) return { amount: base, markup: 0 };
  const marked = Math.round((base * (1 + rule.percent / 100) + rule.fixed) * 100) / 100;
  return { amount: marked, markup: Math.round((marked - base) * 100) / 100 };
}

