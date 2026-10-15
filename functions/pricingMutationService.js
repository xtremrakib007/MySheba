'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { logAudit } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { enforceRequestEnvelope } = require('./securityGateway');

const ALLOWED_KEYS = new Set([
  'dealerEarningPercent','rechargeCostPercent','rechargeProfitPercent',
  'rechargePointCostPerUnit','internetPointCostPerUnit','billPaymentPointCostPerUnit',
  'webviewAccessCost','webviewSubmitCost','paymentSuccessCost','notepadCost',
  'myDocumentsCost','salaryOtCost','moduleSubscriptionDays','webviewAccessWindowHours',
  'rolePricing','catalogProductPricing','commissionRules','markups'
]);
const { MARKUP_SERVICES, PRICE_ROLES, MAX_PERCENT: MARKUP_MAX_PERCENT, MAX_FIXED: MARKUP_MAX_FIXED } = require('./markupService');
const ROLES = ['customer','retail','dealer','reseller','admin'];
const MAX_MONEY = 100000;
const MAX_PERCENT = 100;

function active(p) {
  return p && p.suspended !== true && p.disabled !== true && p.inactive !== true &&
    p.active !== false && !p.mergedInto;
}
function requireRecentAuth(request) {
  const authTime = Number(request.auth?.token?.auth_time || 0);
  if (!Number.isFinite(authTime) || authTime <= 0) {
    throw new HttpsError('failed-precondition', 'Recent authentication is required for pricing changes.');
  }
  if (Math.floor(Date.now() / 1000) - authTime > 15 * 60) {
    throw new HttpsError('failed-precondition', 'Recent authentication expired. Sign in again before changing pricing.');
  }
}
function finite(v, label, min=0, max=MAX_MONEY) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpsError('invalid-argument', label + ' is outside the allowed range.');
  }
  return Math.round(n * 100) / 100;
}
function rule(v, label) {
  if (!v || typeof v !== 'object') throw new HttpsError('invalid-argument', label + ' is invalid.');
  const type = String(v.type || '');
  if (!['fixed','percent'].includes(type)) throw new HttpsError('invalid-argument', label + ' type is invalid.');
  const max = type === 'percent' ? MAX_PERCENT : MAX_MONEY;
  return { type, value: finite(v.value, label + ' value', 0, max) };
}
function tiers(v, label) {
  if (!Array.isArray(v) || v.length > 50) throw new HttpsError('invalid-argument', label + ' must be a tier list.');
  const out = v.map((t, i) => {
    if (!t || typeof t !== 'object') throw new HttpsError('invalid-argument', label + ' tier ' + i + ' is invalid.');
    const min = finite(t.minAmount, label + ' minimum', 0, MAX_MONEY);
    const max = t.maxAmount === null || t.maxAmount === undefined || t.maxAmount === '' ? null : finite(t.maxAmount, label + ' maximum', 0, MAX_MONEY);
    const fee = finite(t.fee, label + ' fee', 0, MAX_MONEY);
    if (max !== null && max < min) throw new HttpsError('invalid-argument', label + ' tier ' + i + ' has maximum below minimum.');
    return { minAmount:min, maxAmount:max, fee };
  }).sort((a,b)=>a.minAmount-b.minAmount);
  for (let i=1;i<out.length;i++) {
    const prev=out[i-1], cur=out[i];
    if (prev.maxAmount === null || cur.minAmount <= prev.maxAmount) {
      throw new HttpsError('invalid-argument', label + ' tiers overlap.');
    }
  }
  return out;
}
function cleanCommissionRules(v) {
  if (!v || typeof v !== 'object') throw new HttpsError('invalid-argument','Commission rules are invalid.');
  return {
    recharge: rule(v.recharge, 'Recharge commission'),
    internet: rule(v.internet, 'Internet commission'),
    billTiers: tiers(v.billTiers, 'Bill commission'),
    remittanceTiers: tiers(v.remittanceTiers, 'Remittance fee'),
    touchNGoFeePercent: finite(v.touchNGoFeePercent, 'Touch n Go fee percent', 0, MAX_PERCENT),
    ...(v.byRole !== undefined ? { byRole: cleanRoleCommissions(v.byRole) } : {}),
    ...(v.products !== undefined ? { products: cleanProductCommissions(v.products) } : {}),
  };
}
// commissionRules.byRole: { retail: { recharge: { type, value }, ... }, ... }
const ROLE_COMMISSION_SERVICES = ['recharge', 'internet', 'billpayment'];
function cleanRoleCommissions(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpsError('invalid-argument', 'Role commissions are invalid.');
  const out = {};
  for (const [role, byService] of Object.entries(v)) {
    if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Unknown commission role: ' + String(role).slice(0, 20));
    if (!byService || typeof byService !== 'object' || Array.isArray(byService)) throw new HttpsError('invalid-argument', role + ' commissions are invalid.');
    const row = {};
    for (const [service, r] of Object.entries(byService)) {
      if (!ROLE_COMMISSION_SERVICES.includes(service)) throw new HttpsError('invalid-argument', 'Unknown commission service: ' + String(service).slice(0, 30));
      if (r === null || r === undefined) continue;
      row[service] = rule(r, role + ' ' + service + ' commission');
    }
    if (Object.keys(row).length) out[role] = row;
  }
  return out;
}
// commissionRules.products: { DI: { retail: { type, value }, customer: ... }, ... }
// keyed by the IIMMPACT product code (Digi = DI), the same code markups use.
const PRODUCT_CODE_RE = /^[A-Za-z0-9_.:-]{1,100}$/;
function cleanProductCommissions(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpsError('invalid-argument', 'Product commissions are invalid.');
  const entries = Object.entries(v);
  if (entries.length > 2000) throw new HttpsError('invalid-argument', 'Too many product commissions.');
  const out = {};
  for (const [code, byRole] of entries) {
    if (!PRODUCT_CODE_RE.test(code)) throw new HttpsError('invalid-argument', 'Invalid product code: ' + String(code).slice(0, 40));
    if (!byRole || typeof byRole !== 'object' || Array.isArray(byRole)) throw new HttpsError('invalid-argument', code + ' commissions are invalid.');
    const row = {};
    for (const [role, r] of Object.entries(byRole)) {
      if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Unknown commission role: ' + String(role).slice(0, 20));
      if (r === null || r === undefined) continue;
      row[role] = rule(r, code + ' ' + role + ' commission');
    }
    if (Object.keys(row).length) out[code] = row;
  }
  return out;
}
function cleanCatalog(list) {
  if (!Array.isArray(list) || list.length > 5000) throw new HttpsError('invalid-argument','Catalog pricing is invalid.');
  return list.map((x,i)=>{
    if (!x || typeof x !== 'object') throw new HttpsError('invalid-argument','Catalog pricing entry ' + i + ' is invalid.');
    const out={...x};
    out.id=String(x.id||'').trim().slice(0,100);
    out.service=String(x.service||'').trim().slice(0,40);
    out.country=String(x.country||'').trim().toUpperCase().slice(0,2);
    out.operator=String(x.operator||'').trim().slice(0,80);
    out.productId=String(x.productId||'').trim().slice(0,160);
    out.productName=String(x.productName||'').trim().slice(0,200);
    out.costPrice=finite(x.costPrice||0,'Catalog cost price',0,MAX_MONEY);
    out.currency=String(x.currency||'MYR').trim().toUpperCase().slice(0,8);
    out.active=x.active !== false;
    out.prices={};
    for(const role of ROLES) if(x.prices?.[role] !== undefined) out.prices[role]=finite(x.prices[role], 'Catalog '+role+' price',0,MAX_MONEY);
    out.commissions={};
    for(const role of ROLES) if(x.commissions?.[role] !== undefined) out.commissions[role]=rule(x.commissions[role], 'Catalog '+role+' commission');
    if(!out.id || !out.productId) throw new HttpsError('invalid-argument','Catalog product id is required.');
    return out;
  });
}
function cleanRolePricing(v) {
  if (!v || typeof v !== 'object') throw new HttpsError('invalid-argument','Role pricing is invalid.');
  const out={};
  for(const role of ROLES) {
    if(v[role] === undefined) continue;
    if(!v[role] || typeof v[role] !== 'object') throw new HttpsError('invalid-argument','Role pricing for '+role+' is invalid.');
    out[role]={};
    for(const [key,val] of Object.entries(v[role])) out[role][String(key).slice(0,80)]=finite(val,'Role pricing '+role,0,MAX_MONEY);
  }
  return out;
}
// { percent, fixed } with both in range; an all-zero rule is dropped rather
// than stored, so "no markup" has one spelling.
function markupRule(v, label) {
  if (!v || typeof v !== 'object') throw new HttpsError('invalid-argument', label + ' is invalid.');
  const percent = finite(v.percent || 0, label + ' percent', 0, MARKUP_MAX_PERCENT);
  const fixed = finite(v.fixed || 0, label + ' fixed amount', 0, MARKUP_MAX_FIXED);
  return percent || fixed ? { percent, fixed } : null;
}
function cleanMarkups(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpsError('invalid-argument', 'Markups are invalid.');
  const out = { services: {}, countries: {}, products: {} };
  for (const [service, rule] of Object.entries(v.services || {})) {
    if (!MARKUP_SERVICES.includes(service)) throw new HttpsError('invalid-argument', 'Unknown markup service: ' + service.slice(0, 40));
    const clean = markupRule(rule, service + ' markup');
    if (clean) out.services[service] = clean;
  }
  const countries = Object.entries(v.countries || {});
  const products = Object.entries(v.products || {});
  if (countries.length > 500 || products.length > 5000) throw new HttpsError('invalid-argument', 'Too many markup rules.');
  for (const [key, rule] of countries) {
    const [service, cc] = String(key).split(':');
    if (!MARKUP_SERVICES.includes(service) || !/^[A-Z]{2}$/.test(String(cc || ''))) throw new HttpsError('invalid-argument', 'Country markup key must look like recharge:ID.');
    const clean = markupRule(rule, key + ' markup');
    if (clean) out.countries[service + ':' + cc] = clean;
  }
  for (const [code, rule] of products) {
    const productCode = String(code).trim();
    if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(productCode)) throw new HttpsError('invalid-argument', 'Product markup code is invalid.');
    const clean = markupRule(rule, productCode + ' markup');
    if (clean) out.products[productCode] = clean;
  }
  // Set prices per product, face amount and buyer role (markupService.setPriceFor).
  const prices = Object.entries(v.prices || {});
  if (prices.length > 5000) throw new HttpsError('invalid-argument', 'Too many set prices.');
  out.prices = {};
  for (const [key, byRole] of prices) {
    const m = /^([A-Za-z0-9_.:-]{1,100})\|(\d{1,7}\.\d{2})$/.exec(String(key));
    if (!m || !byRole || typeof byRole !== 'object' || Array.isArray(byRole)) throw new HttpsError('invalid-argument', 'Set price key must look like DI|5.00.');
    const row = {};
    for (const [role, value] of Object.entries(byRole)) {
      if (!PRICE_ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Unknown price role: ' + String(role).slice(0, 20));
      if (value === null || value === '' || value === undefined) continue;
      row[role] = finite(value, key + ' ' + role + ' price', 0.01, MAX_MONEY);
    }
    if (Object.keys(row).length) out.prices[m[1] + '|' + m[2]] = row;
  }
  return out;
}
function cleanValue(key, value) {
  if (key === 'markups') return cleanMarkups(value);
  if (key === 'commissionRules') return cleanCommissionRules(value);
  if (key === 'catalogProductPricing') return cleanCatalog(value);
  if (key === 'rolePricing') return cleanRolePricing(value);
  if (key.includes('Percent')) return finite(value,key,0,MAX_PERCENT);
  if (key === 'moduleSubscriptionDays') return finite(value,key,1,3650);
  if (key === 'webviewAccessWindowHours') return finite(value,key,0,8760);
  return finite(value,key,0,MAX_MONEY);
}

exports.savePricingSettings = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  enforceRequestEnvelope(request, { maxBytes: 512 * 1024 });
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Sign in required.');
  requireRecentAuth(request);
  const uid=request.auth.uid;
  const db=admin.firestore();
  await checkVelocity(db, uid, 'savePricingSettings', { ip: getClientIp(request) });
  const snap=await db.collection('users').doc(uid).get();
  const profile=snap.exists?snap.data():null;
  if(!active(profile) || profile.role !== 'superadmin') throw new HttpsError('permission-denied','Only a superadmin can change pricing.');
  const key=String(request.data?.key||'');
  if(!ALLOWED_KEYS.has(key)) throw new HttpsError('invalid-argument','Unsupported pricing field.');
  const value=cleanValue(key, request.data?.value);
  const ref=db.collection('settings').doc('pricing');
  const beforeSnap=await ref.get();
  const before=beforeSnap.exists?beforeSnap.data()||{}:{};
  // A deep merge would keep a markup rule the admin just deleted, so markups
  // replace the whole field; the other keys keep their existing merge.
  const writeOptions = key === 'markups' ? { mergeFields: [key, 'updatedBy', 'updatedAt'] } : { merge: true };
  let publicValue = value;
  if (key === 'commissionRules') {
    // Written whole so a role rule the superadmin removed is really gone; a
    // save that does not mention byRole (the admin web's older editor) keeps
    // the stored one.
    if (value.byRole === undefined && before.commissionRules && before.commissionRules.byRole) value.byRole = before.commissionRules.byRole;
    if (value.products === undefined && before.commissionRules && before.commissionRules.products) value.products = before.commissionRules.products;
  }
  if (key === 'catalogProductPricing') {
    // settings/pricing is readable by every signed-in user (the app prices
    // from it), so MySheba's provider cost stays out of it: costs are kept in
    // settings/pricingPrivate, which only the server and a superadmin read.
    // The list is written whole, so a cost left behind by an older save is
    // removed from the public document here too.
    const costs = {};
    publicValue = value.map(({ costPrice, ...entry }) => { costs[entry.id] = Number(costPrice) || 0; return entry; });
    await db.collection('settings').doc('pricingPrivate').set({ catalogCosts: costs, updatedBy: uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { mergeFields: ['catalogCosts', 'updatedBy', 'updatedAt'] });
  }
  await ref.set({[key]:publicValue,updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},(key === 'catalogProductPricing' || key === 'commissionRules') ? { mergeFields: [key, 'updatedBy', 'updatedAt'] } : writeOptions);
  await logAudit({action:'pricing_settings_changed',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{key,before:before[key] ?? null,after:value,reason:String(request.data?.reason||'').slice(0,200)}});
  return {ok:true,key};
});
exports._test = { cleanMarkups, cleanCommissionRules };
