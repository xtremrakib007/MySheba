'use strict';

// MySheba's own price on top of the provider's.
//
// A provider (IIMMPACT, Success TopUp) states what a product costs; MySheba
// sells it at that price plus a markup a superadmin sets in settings/pricing:
//
//   markups: {
//     services:  { recharge: { percent: 2, fixed: 0 }, billpayment: {...}, ... },
//     countries: { 'recharge:ID': { percent: 3, fixed: 0.5 }, ... },
//     products:  { 'YESPIN': { percent: 0, fixed: 0.2 }, ... },
//   }
//
// The most specific rule wins: a product's own, then the service in that
// country (international top-up is priced per destination), then the service.
// A rule is `amount * (1 + percent/100) + fixed`, rounded to the sen.
//
// Remittance and mobile banking are payouts with fees of their own and are
// never marked up here. src/utils/markup.js is the app's copy of this file,
// so the price shown before confirming is the price charged; a test keeps the
// two identical.

const MARKUP_SERVICES = ['recharge', 'internet', 'offerpacks', 'entertainment', 'billpayment', 'esim', 'iimmpact', 'rechargePin'];
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
function markupRuleFor(pricing, { service, country, productCode } = {}) {
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
function applyMarkup(pricing, { service, country, productCode, amount } = {}) {
  const base = Math.round(num(amount) * 100) / 100;
  const rule = markupRuleFor(pricing, { service, country, productCode });
  if (!rule || !(base > 0)) return { amount: base, markup: 0 };
  const marked = Math.round((base * (1 + rule.percent / 100) + rule.fixed) * 100) / 100;
  return { amount: marked, markup: Math.round((marked - base) * 100) / 100 };
}

module.exports = { MARKUP_SERVICES, MAX_PERCENT, MAX_FIXED, cleanRule, markupRuleFor, applyMarkup };
