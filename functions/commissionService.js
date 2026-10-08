const admin = require('firebase-admin');

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
    .sort((a,b) => ((b.service?4:0)+(b.country?2:0)+(b.operator?1:0))-((a.service?4:0)+(a.country?2:0)+(a.operator?1:0)))[0] || null;
}

function resolveCommission(settings, { service, amount, role, payload } = {}) {
  const rules = { ...DEFAULT_RULES, ...(settings?.commissionRules || {}) };
  const roleKey = String(role || 'customer').toLowerCase();
  const value = Math.max(0, num(amount));
  const override = catalogOverride(settings, payload, roleKey);
  const overrideRule = override?.commissions?.[roleKey];
  if (overrideRule) return Math.round(ruleValue(overrideRule, value) * 100) / 100;

  if (service === 'mobilebanking') return 0;
  if (service === 'billpayment') return Math.round(tierFee(rules.billTiers, value) * 100) / 100;
  if (service === 'remittance') return Math.round(tierFee(rules.remittanceTiers, value) * 100) / 100;
  if (service === 'recharge') return Math.round(ruleValue(rules.recharge, value) * 100) / 100;
  if (service === 'internet') return Math.round(ruleValue(rules.internet, value) * 100) / 100;
  return 0;
}

function isTouchNGo(payload) {
  const raw = payload?.raw || {};
  const text = [raw.operator, raw.provider, raw.biller, raw.productId, raw.packageId, raw.productName, payload?.operator, payload?.provider]
    .filter(Boolean).join(' ').toLowerCase();
  return /touch\s*['’]?n\s*go|touchngo/.test(text);
}

function touchNGoFee(settings, payload, amount) {
  if (!isTouchNGo(payload)) return 0;
  const pct = Math.max(0, num(settings?.commissionRules?.touchNGoFeePercent, DEFAULT_RULES.touchNGoFeePercent));
  return Math.round(Math.max(0, num(amount)) * pct) / 100;
}

const MAX_COMMISSION_BY_ROLE = { customer: 100, retail: 100, reseller: 100, dealer: 100, admin: 100 };
function enforceCommissionLimit(amount, role) {
  const n = Math.max(0, num(amount));
  const max = MAX_COMMISSION_BY_ROLE[String(role || 'customer').toLowerCase()] ?? 100;
  if (n > max) throw new Error('Commission exceeds the configured safety limit.');
  return Math.round(n * 100) / 100;
}
function addCommissionLedgerEntry(tx, db, { uid, amount, transactionId, currency, balanceBefore, balanceAfter, role, service }) {
  const safeAmount = enforceCommissionLimit(amount, role);
  if (!(safeAmount > 0)) return;
  const ref = db.collection('commissionLedger').doc();
  tx.set(ref, {
    userId: uid,
    role,
    service,
    amount: safeAmount,
    currency,
    transactionId,
    status: 'earned',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    balanceBefore,
    balanceAfter,
  });
}

module.exports = { DEFAULT_RULES, resolveCommission, touchNGoFee, addCommissionLedgerEntry, isTouchNGo, tierFee, enforceCommissionLimit };
