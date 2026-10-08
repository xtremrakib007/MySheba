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
  'rolePricing','catalogProductPricing','commissionRules'
]);
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
  };
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
function cleanValue(key, value) {
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
  await ref.set({[key]:value,updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'pricing_settings_changed',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{key,before:before[key] ?? null,after:value,reason:String(request.data?.reason||'').slice(0,200)}});
  return {ok:true,key};
});
