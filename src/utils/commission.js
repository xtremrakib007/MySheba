// The commission a purchase earns, worked out exactly as the server does.
//
// A mirror of resolveCommission in functions/commissionService.js, reading the
// same settings/pricing document. The confirmation page used to estimate
// commission from rechargeProfitPercent, a different setting from the
// commissionRules the server actually credits by, so the page could promise a
// commission that never arrived. scripts/test-iimmpact-marketplace.js checks
// the two agree.

const DEFAULT_RULES = {
  recharge: { type: 'fixed', value: 0 },
  internet: { type: 'fixed', value: 0 },
  billTiers: [{ minAmount: 10, maxAmount: 50, fee: 0.10 }, { minAmount: 50.01, maxAmount: null, fee: 0.20 }],
  remittanceTiers: [{ minAmount: 1, maxAmount: 999, fee: 10 }, { minAmount: 1000, maxAmount: 1999, fee: 15 }, { minAmount: 2000, maxAmount: null, fee: 20 }],
  touchNGoFeePercent: 0.5,
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function tierFee(tiers, amount) {
  const value = num(amount);
  if (!Array.isArray(tiers)) return 0;
  const match = tiers.find((t) => {
    const min = num(t?.minAmount, 0);
    const max = t?.maxAmount === null || t?.maxAmount === undefined || t?.maxAmount === '' ? null : num(t.maxAmount, -1);
    return value >= min && (max === null || value <= max);
  });
  return match ? Math.max(0, num(match.fee)) : 0;
}

function ruleValue(rule, amount) {
  if (!rule || typeof rule !== 'object') return 0;
  const value = Math.max(0, num(rule.value));
  return rule.type === 'percent' ? Math.round(amount * value) / 100 : value;
}

function catalogOverride(settings, payload, role) {
  const list = Array.isArray(settings?.catalogProductPricing) ? settings.catalogProductPricing : [];
  const raw = payload?.raw || {};
  const id = String(raw.productId || raw.packageId || payload?.productId || '').trim();
  if (!id) return null;
  const service = String(payload?.service || raw.service || '').trim().toLowerCase();
  const country = String(raw.country || '').trim().toUpperCase();
  const operator = String(raw.operator || raw.provider || '').trim().toLowerCase();
  return list
    .filter((x) => x && x.active !== false && String(x.productId || '').trim() === id)
    .filter((x) => !x.service || String(x.service).trim().toLowerCase() === service)
    .filter((x) => !x.country || String(x.country).trim().toUpperCase() === country)
    .filter((x) => !x.operator || String(x.operator).trim().toLowerCase() === operator)
    .sort((a, b) => ((b.service ? 4 : 0) + (b.country ? 2 : 0) + (b.operator ? 1 : 0)) - ((a.service ? 4 : 0) + (a.country ? 2 : 0) + (a.operator ? 1 : 0)))[0] || null;
}

function isTouchNGo(payload) {
  const raw = payload?.raw || {};
  const text = [raw.operator, raw.provider, raw.biller, raw.productId, raw.packageId, raw.productName, payload?.operator, payload?.provider]
    .filter(Boolean).join(' ').toLowerCase();
  return /touch\s*['’]?n\s*go|touchngo/.test(text);
}

/** The commission credited back after a successful purchase, in MYR. */
export function resolveCommission(settings, { service, amount, role, payload } = {}) {
  // walletService zeroes these before crediting anything.
  if (service === 'remittance' || service === 'mobilebanking' || isTouchNGo(payload)) return 0;
  const rules = { ...DEFAULT_RULES, ...(settings?.commissionRules || {}) };
  const roleKey = String(role || 'customer').toLowerCase();
  const value = Math.max(0, num(amount));
  const override = catalogOverride(settings, payload, roleKey);
  const overrideRule = override?.commissions?.[roleKey];
  if (overrideRule) return Math.round(ruleValue(overrideRule, value) * 100) / 100;
  // Per product and role (commissionRules.products.<code>.<role>, set in the
  // superadmin app): one operator or product, e.g. Digi (DI), earns its own
  // commission. The code is the IIMMPACT product code the markup uses too.
  const raw = payload?.raw || {};
  const code = String(raw.productCode || raw.operatorCode || payload?.productCode || '').trim();
  const productRule = code && rules.products && rules.products[code] && rules.products[code][roleKey];
  if (productRule && typeof productRule === 'object' && service !== 'remittance' && service !== 'mobilebanking') {
    return Math.round(ruleValue(productRule, value) * 100) / 100;
  }
  // Per role (commissionRules.byRole.<role>.<service>, set in the superadmin
  // app). Rules used to be one value for everyone, so a customer earned the
  // same commission as a retailer; a customer now earns nothing on these
  // services unless a superadmin sets a customer rule.
  const PER_ROLE_SERVICES = ['recharge', 'internet', 'billpayment'];
  if (PER_ROLE_SERVICES.includes(service)) {
    const roleRule = rules.byRole && rules.byRole[roleKey] && rules.byRole[roleKey][service];
    if (roleRule && typeof roleRule === 'object') return Math.round(ruleValue(roleRule, value) * 100) / 100;
    if (roleKey === 'customer' || roleKey === 'user') return 0;
  }
  if (service === 'billpayment') return Math.round(tierFee(rules.billTiers, value) * 100) / 100;
  if (service === 'recharge') return Math.round(ruleValue(rules.recharge, value) * 100) / 100;
  if (service === 'internet') return Math.round(ruleValue(rules.internet, value) * 100) / 100;
  return 0;
}
