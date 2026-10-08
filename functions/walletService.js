const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const admin = require('firebase-admin');
const { assertWalletUnfrozen } = require('./walletFreeze');
const crypto = require('crypto');
const progressionService = require('./progressionService');
// The charge and the price shown on the package list come from this one module.
const walletPricing = require('./walletPricing');
const { logAudit, logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { checkIpAnomaly } = require('./anomalyService');
const apiProviderService = require('./apiProviderService');
const { executeConfiguredApi } = apiProviderService;
const catalog = require('./successTopUpCatalog');
// The generic engine, used directly for everything that is not Success TopUp.
// Going through the wrapper above would pin providerName to 'Success TopUp'
// and look for a Malaysian plan in a Bangladeshi provider's catalogue.
const providerCatalog = require('./providerCatalog');
const { getWalletCurrencyAndFx, baseToWallet } = require('./walletCurrencyService');
// One session per platform: a phone and a browser can both be signed in,
// two phones cannot. See functions/sessionSlots.js.
const { sessionMatches } = require('./sessionSlots');
const { requireConsent } = require('./consentRecord');
const { addWalletLedgerEntry } = require('./walletLedgerService');
const { resolveCommission, touchNGoFee, addCommissionLedgerEntry, tierFee } = require('./commissionService');

const DEFAULT_PRICING={dealerEarningPercent:1.5,webviewAccessCost:2,webviewSubmitCost:2,paymentSuccessCost:3,webviewAccessWindowHours:1,notepadCost:0,myDocumentsCost:0,salaryOtCost:0,moduleSubscriptionDays:30};
const DEFAULT_RATES={mobileBanking:110.5,BD_ACC:30.26,BD_CASH:30.11,NP:37.65,PK:67.79,PH:15.05,LK:81.99,IN:23.5,ID:230,MM:966,remittanceFee:7,rechargeBD:30.26,rechargeIN:23.5,rechargeNP:37.65,rechargeID:230,rechargePK:67.79,rechargeMM:966,rechargePH:15.05,rechargeKH:900};
const RECHARGE_RATE_KEYS={BD:'rechargeBD',IN:'rechargeIN',NP:'rechargeNP',ID:'rechargeID',PK:'rechargePK',MM:'rechargeMM',PH:'rechargePH',KH:'rechargeKH'};
const SESSION_ID_RE=/^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE=/^[A-Za-z0-9-]{16,100}$/;
const REQUEST_ID_RE=/^[A-Za-z0-9_-]{16,128}$/;
// Only these fields of a client's `raw` survive to the provider. Anything a
// service needs and this omits is silently dropped, which is the quietest
// failure in the file: the order is placed, the money moves, and the provider
// refuses it over a field that was never sent.
//
// That is what happened to recharge. `operator` was missing here - from the one
// service that is entirely about which operator - so every Bangladesh recharge
// reached Success TopUp with no operator and came back "Invalid operator
// [400]". Internet, Offer Packs and Entertainment all listed it; recharge did
// not.
const TRANSACTION_RAW_FIELDS = {
  recharge: new Set(['phone', 'country', 'amount', 'operator']),
  internet: new Set(['phone', 'country', 'amount', 'provider', 'operator', 'operatorCode', 'packageId', 'package', 'packageCostAmount', 'subproductCode']),
  offerpacks: new Set(['phone', 'country', 'amount', 'provider', 'operator', 'operatorCode', 'packageId', 'package', 'packageCostAmount']),
  entertainment: new Set(['country', 'amount', 'gameKey', 'game', 'packageId', 'package', 'playerId', 'serverId']),
  // billerCode/ref2/icNumber are JomPAY's own three fields and subproductCode
  // is what iimmpact calls a chosen plan. Without them here the screen collects
  // an IC the provider never sees, and JomPAY refuses the payment for the
  // AMLA reason - visible only as a rejection from the provider.
  billpayment: new Set(['phone', 'country', 'amount', 'provider', 'category', 'accountNumber', 'billNumber', 'mobileNumber', 'monthName', 'note', 'billerCode', 'ref2', 'icNumber', 'subproductCode']),
  mobilebanking: new Set(['phone', 'country', 'amount', 'provider', 'category', 'accountNumber']),
  esim: new Set(['country', 'productCode', 'accountNumber', 'email', 'amount', 'package', 'subproductCode', 'remarks']),
  iimmpact: new Set(['country', 'productCode', 'productName', 'accountNumber', 'amount', 'providerAmount', 'packageCostAmount', 'package', 'subproductCode', 'optionCode', 'processingTime', 'remarks']),
  remittance: new Set([
    'phone', 'senderName', 'senderPhone', 'senderCompany', 'senderPassportNo', 'senderPassportExpiry',
    'senderAddress', 'receiverFirstName', 'receiverLastName', 'receiverRelationship', 'receiverPhone',
    'receiverBankName', 'receiverAccountNumber', 'receiverBranch', 'receiverRoutingNumber',
    'receiverPickupNetwork', 'receiverIdType', 'receiverIdNumber', 'receiverPickupCity',
    'receiverWalletProvider', 'receiverWalletNumber', 'country', 'method', 'provider',
  ]),
};
function sanitizeTransactionRaw(raw, service) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const allowed = TRANSACTION_RAW_FIELDS[service] || new Set(['phone', 'country', 'amount', 'provider', 'category']);
  const out = {};
  for (const key of allowed) {
    const value = raw[key];
    if (typeof value === 'string') out[key] = value.slice(0, 500);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}
function requireSessionMatch(request,user){const sessionId=request.data?.sessionId,deviceId=request.data?.deviceId;if(typeof sessionId!=='string'||!SESSION_ID_RE.test(sessionId)||typeof deviceId!=='string'||!DEVICE_ID_RE.test(deviceId))throw new HttpsError('failed-precondition','Your secure session is missing. Please sign in again.');if(!sessionMatches(user, { sessionId, deviceId }))throw new HttpsError('permission-denied','This device session is no longer active. Please sign in again.');}
async function getPricing(db){const s=await db.collection('settings').doc('pricing').get();return{...DEFAULT_PRICING,...(s.exists?s.data():{})};}
async function getRates(db){const s=await db.collection('rates').doc('current').get();return{...DEFAULT_RATES,...(s.exists?s.data():{})};}
async function getProfile(db,uid){const s=await db.collection('users').doc(uid).get();return s.exists?{id:s.id,...s.data()}:null;}
function requireAuth(r){if(!r.auth)throw new HttpsError('unauthenticated','You must be signed in.');return r.auth.uid;}
function priceForRole(p,key,role){const v=role&&p.rolePricing&&p.rolePricing[role]&&p.rolePricing[role][key];return v!=null?v:p[key];}
function safePrice(p,key,role){const raw=priceForRole(p,key,role);if(raw==null||raw==='')return 1;const n=Number(raw);if(!Number.isFinite(n)||n<0)throw new HttpsError('failed-precondition','Pricing configuration is invalid.');return n===0?1:n;}
function amountToPoints(n,c,r){const x=Number(n)||0;const country=String(c||'').trim().toUpperCase();if(country==='MY')return{x,rate:1};const k=RECHARGE_RATE_KEYS[country];if(!k)throw new HttpsError('invalid-argument','Unsupported recharge country.');const rate=Number(r[k]);if(!Number.isFinite(rate)||rate<=0)throw new HttpsError('failed-precondition','The exchange rate for this country is unavailable.');return{x:Math.round(x/rate*100)/100,rate};}
function recompute(service,raw,rates){const r=raw||{};if(service==='recharge'||service==='internet'||service==='offerpacks'||service==='entertainment'){const country=String(r.country||'').trim().toUpperCase();if(!country)throw new HttpsError('invalid-argument','Recharge country is required.');const q=amountToPoints(r.amount,country,rates);return{amount:q.x,total:q.x,exchangeRate:country!=='MY'?q.rate:null,exchangeRateSource:country!=='MY'?RECHARGE_RATE_KEYS[country]:null};}if(service==='mobilebanking'){const a=Math.round((Number(r.myr)||0)*100)/100;return{amount:a,total:a,exchangeRate:Number(rates.mobileBanking)||110.5,exchangeRateSource:'mobileBanking'};}if(service==='billpayment'){const country=String(r.country||'').trim().toUpperCase();if(!['MY','BD'].includes(country))throw new HttpsError('invalid-argument','Unsupported bill payment country.');const raw=Math.round((Number(r.amount)||0)*100)/100;if(!Number.isFinite(raw)||raw<=0)throw new HttpsError('invalid-argument','Bill amount must be greater than zero.');const q=amountToPoints(raw,country,rates);return{amount:q.x,total:q.x,exchangeRate:q.rate,exchangeRateSource:country==='MY'?'MYR':RECHARGE_RATE_KEYS[country]};}if(service==='remittance'){const country=String(r.country||'').trim().toUpperCase();const allowed=['BD','NP','PK','PH','IN','ID','MM'];if(!allowed.includes(country))throw new HttpsError('invalid-argument','Unsupported remittance country.');const a=Math.round((Number(r.sendAmt)||0)*100)/100;const fee=0;const rate=country==='BD'?(r.method==='deposit'?Number(rates.BD_ACC):Number(rates.BD_CASH)):Number(rates[country]);if(!Number.isFinite(rate)||rate<=0)throw new HttpsError('failed-precondition','The exchange rate for this country is unavailable.');return{amount:a,total:Math.round((a+fee)*100)/100,exchangeRate:rate,exchangeRateSource:country==='BD'?(r.method==='deposit'?'BD_ACC':'BD_CASH'):country};}return{amount:Number(r.amount)||0,total:Number(r.total)||0,exchangeRate:null,exchangeRateSource:null};}
const PACKAGE_SERVICE_LABELS = { internet: 'Internet', offerpacks: 'Offer Packs', entertainment: 'Entertainment', iimmpact: 'IIMMPACT' };

/**
 * For a Bangladesh package order, replace the client's amount with the price
 * the server resolves, and record the catalogue cost separately for dispatch.
 *
 * Returns the payload unchanged for every other order. A package that no longer
 * exists, or that Superadmin has hidden, is refused rather than priced by guess.
 */
async function resolvePackagePricing(db, service, payload) {
  const requestedRole = String(payload?.role || payload?.raw?.role || '').trim().toLowerCase();
  const label = PACKAGE_SERVICE_LABELS[service];
  if (!label) return payload;
  const raw = (payload && payload.raw) || {};
  // packageCostAmount is what gets SENT to the provider as the amount, and it
  // is the server's to set. It is in the allowlist because it has to survive
  // onto the transaction, which also means a client can put one there - so
  // whatever arrived is dropped here, before anything can read it. Every
  // return below either sets it from a resolved catalogue or leaves it absent.
  const { packageCostAmount: _clientCost, ...clean } = raw;
  const base = { ...payload, raw: clean };
  const country = String(clean.country || '').trim().toUpperCase();
  const operatorName = String(clean.operator || '').trim();

  if (service === 'esim') {
    const found = await apiProviderService.resolveIimmpactEsimPackage(db, clean);
    if (found.error === 'provider-unconfigured') throw new HttpsError('failed-precondition', 'The eSIM provider is not configured.');
    if (found.error === 'product-not-found' || found.error === 'product-missing') throw new HttpsError('failed-precondition', 'That eSIM product is no longer available.');
    if (found.error === 'options-unavailable') throw new HttpsError('unavailable', 'eSIM packages could not be loaded just now. Please try again.');
    if (found.error === 'package-not-found') throw new HttpsError('failed-precondition', 'That eSIM package is no longer available. Please choose another.');
    if (found.error) throw new HttpsError('failed-precondition', 'That eSIM package could not be confirmed. Please choose another.');

    const submitted = Number(clean.amount);
    if (Number.isFinite(submitted) && Math.abs(submitted - found.sellAmount) > 0.01) {
      throw new HttpsError('failed-precondition', 'This eSIM price has changed - please review your order.');
    }
    return {
      ...base,
      amount: undefined,
      total: undefined,
      raw: {
        ...clean,
        amount: found.sellAmount,
        packageCostAmount: found.costAmount,
        productCode: found.productCode,
        package: found.package || clean.package || '',
        subproductCode: found.subproductCode || clean.subproductCode || '',
      },
    };
  }

  if (service === 'iimmpact') {
    const found = await apiProviderService.resolveIimmpactMarketplaceProduct(db, clean);
    if (found.error === 'provider-unconfigured') throw new HttpsError('failed-precondition', 'The IIMMPACT Marketplace provider is not configured for this country.');
    if (['product-missing', 'product-not-found', 'product-inactive'].includes(found.error)) {
      throw new HttpsError('failed-precondition', 'That IIMMPACT product is no longer available.');
    }
    if (['option-required', 'option-not-found', 'field-dependency-missing'].includes(found.error)) {
      throw new HttpsError('failed-precondition', 'That IIMMPACT option is no longer available. Please reload the product and choose it again.');
    }
    if (found.error === 'options-unavailable') throw new HttpsError('unavailable', 'IIMMPACT options could not be loaded just now. Please try again.');
    if (found.error) throw new HttpsError('failed-precondition', 'That IIMMPACT product could not be confirmed. Please review it and try again.');
    const submitted = Number(clean.amount);
    if (Number.isFinite(submitted) && Math.abs(submitted - found.sellAmount) > 0.01) {
      throw new HttpsError('failed-precondition', 'This IIMMPACT price has changed - please review your order.');
    }
    return {
      ...base,
      amount: undefined,
      total: undefined,
      raw: {
        ...clean,
        amount: found.sellAmount,
        providerAmount: found.providerAmount,
        packageCostAmount: found.providerAmount,
        productCode: found.productCode,
        productName: found.productName,
        accountNumber: found.accountNumber,
        package: found.productName,
        subproductCode: found.subproductCode || clean.subproductCode || '',
        optionCode: found.optionCode || clean.optionCode || '',
        extras: found.extras || {},
        processingTime: found.processingTime || '',
      },
    };
  }

  if (country !== 'BD') {
    // Outside Bangladesh a package order used to be priced entirely by the
    // client: recompute() takes raw.amount at face value for MY. That was only
    // ever safe because the provider rejects a nonsense denomination. A
    // per-number catalogue makes the price a server fact, so where one serves
    // this country and operator the order is re-resolved against it - against
    // the SAME number, because the list it came from was personalised to that
    // number and another one answers differently.
    const perAccount = await providerCatalog.perAccountCatalogFor(db, label, country, operatorName);
    if (!perAccount) return base;
    const packageId = String(clean.packageId || clean.package_id || '').trim();
    if (!packageId) throw new HttpsError('invalid-argument', 'Please select a package before placing this order.');
    const account = apiProviderService.nationalAccountNumber(clean.phone, country);
    if (!account) throw new HttpsError('invalid-argument', 'A mobile number is required for this package.');

    const found = await providerCatalog.resolveOrderPackage({
      db,
      service: label,
      operatorName,
      packageId,
      account,
      country,
      strictCountry: true,
      fetchCatalog: apiProviderService.fetchProviderCatalog,
      role: requestedRole,
    });
    if (found.error === 'catalog-unreachable') throw new HttpsError('unavailable', 'Package prices could not be confirmed just now. Please try again.');
    if (found.error === 'package-hidden') throw new HttpsError('failed-precondition', 'That package is no longer offered. Please choose another.');
    if (found.error) throw new HttpsError('failed-precondition', 'That package is no longer available on this number. Please choose another.');
    const submitted = Number(clean.amount);
    if (Number.isFinite(submitted) && Math.abs(submitted - found.sellAmount) > 0.01) {
      throw new HttpsError('failed-precondition', 'This package price has changed - please review your order.');
    }
    return {
      ...base,
      amount: undefined,
      total: undefined,
      raw: {
        ...clean,
        amount: found.sellAmount,
        packageCostAmount: found.costAmount,
        // The product the plan was actually found under, not the one the
        // client named: with CelcomDigi asking both CEL and DI, the client's
        // claim is a guess and this is the answer.
        operatorCode: found.productCode || '',
        package: found.package.name || clean.package || '',
      },
    };
  }

  const packageId = String(clean.packageId || clean.package_id || '').trim();
  if (!packageId) throw new HttpsError('invalid-argument', 'Please select a package before placing this order.');

  const resolved = await catalog.resolveOrderPackage({
    db,
    service: label,
    operatorName,
    operatorCode: String(clean.operatorCode || '').trim(),
    packageId,
    fetchCatalog: apiProviderService.fetchSuccessTopUpCatalog,
    role: requestedRole,
  });
  if (resolved.error === 'provider-unconfigured') throw new HttpsError('failed-precondition', `The ${label} provider is not configured.`);
  if (resolved.error === 'catalog-unreachable') throw new HttpsError('unavailable', 'Package prices could not be confirmed just now. Please try again.');
  if (resolved.error === 'package-hidden') throw new HttpsError('failed-precondition', 'That package is no longer offered. Please choose another.');
  if (resolved.error === 'drive-window-closed') throw new HttpsError('failed-precondition', resolved.message || 'Drive packages are closed right now.');
  if (resolved.error) throw new HttpsError('failed-precondition', 'That package is no longer available. Please choose another.');

  // The client's amount is only used to tell the customer the price moved. The
  // server's number is the one that gets charged either way.
  const submitted = Number(clean.amount);
  if (Number.isFinite(submitted) && Math.abs(submitted - resolved.sellAmount) > 0.01) {
    throw new HttpsError('failed-precondition', 'This package price has changed - please review your order.');
  }
  return {
    ...base,
    amount: undefined,
    total: undefined,
    raw: {
      ...clean,
      amount: resolved.sellAmount,
      packageCostAmount: resolved.costAmount,
      package: resolved.package.name || clean.package || '',
    },
  };
}

function active(account){return !!account&&account.suspended!==true&&account.inactive!==true&&account.disabled!==true&&account.active!==false&&account.mergedInto==null;}

// Exported so a test can hold it against apiProviderService's quote rate: the
// price quoted and the price charged must use the same number for a country.
exports._test = { amountToPoints, recompute, resolvePackagePricing };

exports.approveTopup=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>{const uid=requireAuth(r),db=admin.firestore(),caller=await getProfile(db,uid);if(!caller||!['admin','superadmin'].includes(caller.role))throw new HttpsError('permission-denied','Only an admin can approve top-ups.');const{id}=r.data||{};const topupId=id||r.data?.topupId;if(!topupId)throw new HttpsError('invalid-argument','topupId is required.');const ref=db.collection('topups').doc(topupId);try{const out=await db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists)throw new HttpsError('not-found','That top-up request does not exist.');const t=s.data();if(t.status!=='pending')throw new HttpsError('failed-precondition','That request has already been reviewed.');const uref=db.collection('users').doc(t.userId),u=await tx.get(uref);if(!u.exists)throw new HttpsError('not-found','That user account no longer exists.');const user=u.data();if(!active(user))throw new HttpsError('failed-precondition','The recipient account is not active.');const pts=Number(t.points||t.amount||0),bal=Number(user.walletBalance||0);if(!Number.isFinite(pts)||pts<=0||!Number.isFinite(bal)||bal<0)throw new HttpsError('invalid-argument','Invalid wallet amount.');const next=bal+pts;if(!Number.isSafeInteger(Math.round(next*100)))throw new HttpsError('failed-precondition','Wallet balance is invalid.');tx.update(uref,{walletBalance:next});tx.update(ref,{status:'approved',approvedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()});return{userId:t.userId,points:pts};});await logAudit({action:'topup_approved',targetUid:out.userId,performedBy:uid,performedByRole:caller.role,details:{topupId,points:out.points}});return{approved:true};}catch(e){if(e instanceof HttpsError)throw e;await logServerError('approveTopup',e,{userId:uid});throw new HttpsError('internal','Could not approve this top-up.');}});
exports.rejectTopup=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>{const uid=requireAuth(r),db=admin.firestore(),caller=await getProfile(db,uid);if(!caller||!['admin','superadmin'].includes(caller.role))throw new HttpsError('permission-denied','Only an admin can reject top-ups.');const{topupId,reason}=r.data||{};if(!topupId)throw new HttpsError('invalid-argument','topupId is required.');const ref=db.collection('topups').doc(topupId);const s=await ref.get();if(!s.exists)throw new HttpsError('not-found','That top-up request does not exist.');if(s.data().status!=='pending')throw new HttpsError('failed-precondition','That request has already been reviewed.');await ref.update({status:'rejected',rejectReason:typeof reason==='string'?reason.trim().slice(0,500):'',approvedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()});return{rejected:true};});
exports.createSelfTopup=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>{const uid=requireAuth(r),db=admin.firestore(),caller=await getProfile(db,uid);if(!active(caller)||!['admin','superadmin'].includes(caller.role))throw new HttpsError('permission-denied','Only admin/superadmin can self-top-up.');const{amount,method,bankName,refNo,receiptUrl}=r.data||{},amt=Number(amount);if(!Number.isFinite(amt)||amt<=0||amt>100000||!Number.isSafeInteger(Math.round(amt*100)))throw new HttpsError('invalid-argument','Enter a valid amount.');await checkVelocity(db,uid,'createSelfTopup',{ip:getClientIp(r)});const uref=db.collection('users').doc(uid),ref=db.collection('selfTopups').doc();await db.runTransaction(async tx=>{const u=await tx.get(uref);if(!u.exists||!active(u.data()))throw new HttpsError('failed-precondition','Account is not active.');const bal=Number(u.data().walletBalance||0),next=bal+amt;if(!Number.isFinite(bal)||bal<0||!Number.isSafeInteger(Math.round(next*100)))throw new HttpsError('failed-precondition','Wallet balance is invalid.');tx.update(uref,{walletBalance:next});tx.set(ref,{userId:uid,userPhone:caller.phone||'',userName:caller.name||'',userRole:caller.role,amount:amt,points:amt,method:typeof method==='string'?method.trim().slice(0,100):'transfer',bankName:typeof bankName==='string'?bankName.trim().slice(0,100):'',refNo:typeof refNo==='string'?refNo.trim().slice(0,200):'',receiptUrl:typeof receiptUrl==='string'?receiptUrl.trim().slice(0,2048):'',status:'approved',createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});});return{id:ref.id};});
function canTransferTo(role,caller,recipient){if(role==='dealer')return recipient.role==='customer'&&recipient.dealerId===caller.id;if(role==='admin')return recipient.role==='dealer';if(role==='superadmin')return['admin','dealer'].includes(recipient.role);return false;}
exports.transferPoints=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>{const uid=requireAuth(r),db=admin.firestore(),caller=await getProfile(db,uid);if(!active(caller)||!['dealer','admin','superadmin'].includes(caller.role))throw new HttpsError('permission-denied','Your account cannot transfer money.');const{toUid,amount,note}=r.data||{},amt=Number(amount);if(!toUid||toUid===uid||!Number.isFinite(amt)||amt<=0||amt>100000||!Number.isSafeInteger(Math.round(amt*100)))throw new HttpsError('invalid-argument','Invalid transfer.');const recipient=await getProfile(db,toUid);if(!active(recipient))throw new HttpsError('not-found','That account does not exist or is not active.');if(!canTransferTo(caller.role,caller,recipient))throw new HttpsError('permission-denied','You are not allowed to send money to that account.');const ip=getClientIp(r);await checkVelocity(db,uid,'transferPoints',{ip});const p=await getPricing(db),earn=caller.role==='dealer'&&recipient.role==='customer'?Math.round(amt*(Number(p.dealerEarningPercent)||0)/100*100)/100:0,from=db.collection('users').doc(uid),to=db.collection('users').doc(toUid),tr=db.collection('pointTransfers').doc();await db.runTransaction(async tx=>{const a=await tx.get(from),b=await tx.get(to);if(!a.exists||!b.exists||!active(a.data())||!active(b.data()))throw new HttpsError('failed-precondition','Both accounts must be active.');if(a.data().role!==caller.role||b.data().role!==recipient.role)throw new HttpsError('failed-precondition','Account status changed. Please retry.');const ab=Number(a.data().walletBalance||0),bb=Number(b.data().walletBalance||0),nextA=ab-amt+earn,nextB=bb+amt;if(!Number.isFinite(ab)||ab<0||!Number.isFinite(bb)||bb<0||ab<amt||!Number.isSafeInteger(Math.round(nextA*100))||!Number.isSafeInteger(Math.round(nextB*100)))throw new HttpsError('failed-precondition','Invalid wallet balance.');tx.update(from,{walletBalance:nextA});tx.update(to,{walletBalance:nextB});tx.set(tr,{fromUid:uid,fromName:caller.name||'',fromRole:caller.role,toUid,toName:recipient.name||'',toRole:recipient.role,amount:amt,note:typeof note==='string'?note.trim().slice(0,500):'',participants:[uid,toUid],dealerId:caller.role==='dealer'?uid:caller.dealerId||null,dealerEarning:earn||null,createdAt:admin.firestore.FieldValue.serverTimestamp()});});return{transferId:tr.id};});
// The per-unit price keys live with the arithmetic that uses them. Keeping a
// second copy here is how the price quoted and the price charged come to read
// different pricing fields.
const CHARGEABLE=walletPricing.PER_UNIT_PRICE_KEYS;
async function chargeProduct(request,service,payload,customer){const uid=requireAuth(request),db=admin.firestore();
// Remittance collects a sender's and a receiver's passport number and home
// address - the most sensitive data the app takes - so the acceptance is
// required here, before any of it is stored or sent. Other services collect
// a phone number the customer is already typing in order to top it up.
if(service==='remittance')await requireConsent(db,uid,request.data?.consent,'remittance',{source:'remittance',ip:getClientIp(request)});
const rates=await getRates(db);const callerProfile=await getProfile(db,uid);const serverRole=String(callerProfile?.role||'customer').toLowerCase();payload=await resolvePackagePricing(db,service,{...(payload||{}),role:serverRole});const calc=recompute(service,payload?.raw,rates),clientAmount=Number(payload?.amount),clientTotal=Number(payload?.total);const baseProviderAmount=service==='mobilebanking'||service==='remittance'?calc.total:calc.amount;const pricing=await getPricing(db);const rawCommission=resolveCommission(pricing,{service,amount:calc.amount,role:serverRole,payload});const commission=(service==='remittance'||service==='mobilebanking'||require('./commissionService').isTouchNGo(payload))?0:rawCommission;const remittanceFee=service==='remittance'?tierFee(pricing?.commissionRules?.remittanceTiers,calc.amount):0;const serviceFee=Math.round(((service==='recharge'||service==='billpayment'||service==='iimmpact'?touchNGoFee(pricing,payload,calc.amount):0)+remittanceFee)*100)/100;const customerCharge=Math.round((baseProviderAmount+serviceFee)*100)/100;if(!Number.isFinite(calc.amount)||calc.amount<=0||!Number.isFinite(customerCharge)||customerCharge<=0)throw new HttpsError('invalid-argument','Amount must be greater than zero.');if(Number.isFinite(clientAmount)&&Math.abs(clientAmount-calc.amount)>.01)throw new HttpsError('failed-precondition','Rate changed - please review your order.');/* The server owns all fees/commissions; clientTotal is display-only and is never trusted. */const p=pricing,settings=await progressionService.getProgressionSettings(),uref=db.collection('users').doc(uid),requestId=payload?.requestId;if(typeof requestId!=='string'||!REQUEST_ID_RE.test(requestId))throw new HttpsError('invalid-argument','A valid requestId is required.');const txId=crypto.createHash('sha256').update(`${uid}|${service}|${requestId}`).digest('hex').slice(0,40);const txref=db.collection('transactions').doc(txId);const collectionPin=String(crypto.randomInt(0,10000)).padStart(4,'0');const serviceLabel = { recharge: 'Recharge', internet: 'Internet', offerpacks: 'Offer Packs', entertainment: 'Entertainment', billpayment: 'Bill Payment', mobilebanking: 'Mobile Banking', remittance: 'Remittance', esim: 'eSIM', iimmpact: 'IIMMPACT' }[service];
const apiSettingsSnap = serviceLabel ? await db.collection('api_settings').doc('service_modes').get() : null;
const apiSettings = apiSettingsSnap?.exists ? (apiSettingsSnap.data() || {}) : {};
const transactionCountry = String(payload?.raw?.country || '').trim().toUpperCase();

// One rule, replacing six per-service country patches that had drifted apart:
// Internet and Bill Payment each carried a `country !== 'BD'` downgrade to the
// manual queue, and Recharge never got one. So once saving Success TopUp
// flipped Recharge to API service-wide, a Malaysian recharge was dispatched to
// a provider that does not serve Malaysia and came back uncertain.
//
// resolveExecutionMode decides from the superadmin's country matrix and then
// refuses API for any country with no active provider behind it, which is a
// property of the data rather than a list of countries to keep in step here.
let apiMode = 'legacy';
if (serviceLabel) {
  const serviceProviders = serviceLabel === 'IIMMPACT'
    ? [{ authType: 'iimmpactHmac', active: true }]
    : await apiProviderService.providersForService(db, serviceLabel);
  apiMode = serviceLabel === 'IIMMPACT'
    ? 'api'
    : apiProviderService.resolveExecutionMode({
      country: transactionCountry,
      service: serviceLabel,
      settings: apiSettings,
      providers: serviceProviders,
    });
}

// Bangladesh recharge, internet/data and bill payment are API-only. Fail closed rather than creating a manual order.
if (transactionCountry === 'BD' && ['Recharge', 'Internet', 'Bill Payment'].includes(serviceLabel) && apiMode !== 'api') {
  throw new HttpsError('failed-precondition', 'Bangladesh ' + serviceLabel + ' is API-only. Please configure an active Bangladesh API provider.');
}
const result=await db.runTransaction(async tx=>{const existingTx=await tx.get(txref);if(existingTx.exists){const existing=existingTx.data()||{};if(existing.customerId!==uid)throw new HttpsError('permission-denied','This request ID belongs to another account.');const existingStatus=String(existing.status||'pending');if(existingStatus==='failed')throw new HttpsError('failed-precondition',existing.apiError||'This order already failed.');if(existingStatus==='pending' && (existing.executionMode==='api' || apiMode==='api')){
  // A previously created API transaction must never be sent to the provider
  // again just because the original function instance disappeared mid-flight.
  // The external outcome may already exist. Only explicit provider-success
  // evidence is safe to recover; otherwise leave it for reconciliation.
  if(existing.apiExecution?.providerSucceeded === true && existing.apiRefunded !== true){
    tx.update(txref,{
      status:'completed',
      completedAt:admin.firestore.FieldValue.serverTimestamp(),
      apiExecution:{
        ...(existing.apiExecution || {}),
        status:'accepted',
        reconciliationRecovered:true,
        updatedAt:admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt:admin.firestore.FieldValue.serverTimestamp()
    });
    return{existing:true,cost:Number(existing.cost)||0,role:existing.customerRole||'',apiMode:existing.executionMode||'api',customerUid:uid,customerPhone:existing.customerPhone||'',apiAmount:Number(existing.amount)||0,apiTotal:Number(existing.total)||0,status:'completed',collectionPin:existing.pin||''};
  }
  const executionKey=crypto.createHash('sha256').update(service+'|'+uid+'|'+requestId).digest('hex');
  const executionRef=db.collection('apiExecutions').doc(executionKey);
  const executionSnap=await tx.get(executionRef);
  const execution=executionSnap.exists ? (executionSnap.data()||{}) : {};
  if(execution.status==='completed' && existing.apiRefunded !== true){
    tx.update(txref,{
      status:'completed',
      completedAt:admin.firestore.FieldValue.serverTimestamp(),
      apiExecution:{
        ...(existing.apiExecution || {}),
        status:'accepted',
        providerSucceeded:true,
        providerId:execution.result?.providerId || existing.apiExecution?.providerId || null,
        providerName:execution.result?.providerName || existing.apiExecution?.providerName || null,
        responseId:execution.result?.responseId || existing.apiExecution?.responseId || null,
        message:execution.result?.message || existing.apiExecution?.message || null,
        deliveryLink: execution.result?.deliveryLink || existing.apiExecution?.deliveryLink || null,
        deliveryNote: execution.result?.deliveryNote || existing.apiExecution?.deliveryNote || null,
        deliveryLink: execution.result?.deliveryLink || existing.apiExecution?.deliveryLink || null,
        deliveryNote: execution.result?.deliveryNote || existing.apiExecution?.deliveryNote || null,
        reconciliationRecovered:true,
        updatedAt:admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt:admin.firestore.FieldValue.serverTimestamp()
    });
    return{existing:true,cost:Number(existing.cost)||0,role:existing.customerRole||'',apiMode:existing.executionMode||'api',customerUid:uid,customerPhone:existing.customerPhone||'',apiAmount:Number(existing.amount)||0,apiTotal:Number(existing.total)||0,status:'completed',collectionPin:existing.pin||''};
  }
  throw new HttpsError('unavailable','This API request may already have reached the provider. Verify the provider outcome before retrying.');
}if(existingStatus==='unknown'){
  // If the provider already returned success and only the final transaction
  // persistence failed, the previous invocation records explicit provider
  // success. Recover the transaction instead of permanently trapping it in
  // UNKNOWN or charging the customer a second time.
  if(existing.apiExecution?.providerSucceeded === true && existing.apiRefunded !== true){
    tx.update(txref,{
      status:'completed',
      completedAt:admin.firestore.FieldValue.serverTimestamp(),
      apiExecution:{
        ...(existing.apiExecution || {}),
        status:'accepted',
        reconciliationRecovered:true,
        updatedAt:admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt:admin.firestore.FieldValue.serverTimestamp()
    });
    return{existing:true,cost:Number(existing.cost)||0,role:existing.customerRole||'',apiMode:existing.executionMode||'legacy',customerUid:uid,customerPhone:existing.customerPhone||'',apiAmount:Number(existing.amount)||0,apiTotal:Number(existing.total)||0,status:'completed',collectionPin:existing.pin||''};
  }
  throw new HttpsError('unavailable','The API request outcome is uncertain. Check the provider before retrying.');
}return{existing:true,cost:Number(existing.cost)||0,role:existing.customerRole||'',apiMode:existing.executionMode||'legacy',customerUid:uid,customerPhone:existing.customerPhone||'',apiAmount:Number(existing.amount)||0,apiTotal:Number(existing.total)||0,status:existingStatus,collectionPin:existing.pin||''};}const u=await tx.get(uref);if(!u.exists)throw new HttpsError('not-found','Account not found.');const d=u.data();requireSessionMatch(request,d);if(!active(d))throw new HttpsError('permission-denied','Your account is not active.');assertWalletUnfrozen(d,'Your wallet');const wallet=Number(d.walletBalance||0);if(!Number.isFinite(wallet)||wallet<0||!Number.isSafeInteger(Math.round(wallet*100)))throw new HttpsError('failed-precondition','Wallet balance is invalid.');let walletFx;try{walletFx=await getWalletCurrencyAndFx(db,d);}catch(fxErr){throw new HttpsError('failed-precondition',fxErr.message||'Wallet currency is not configured.');}const discount=progressionService.discountPercentFromSettings(settings,d.tier);let cost,walletCost;try{({baseCostMyr:cost,walletCost}=walletPricing.walletChargeFor({baseAmount:customerCharge,unitPrice:CHARGEABLE[service]?walletPricing.safePrice(p,CHARGEABLE[service],d.role):1,discountPercent:discount,fx:walletFx}));}catch(priceErr){throw new HttpsError('failed-precondition',priceErr.message==='Pricing configuration is invalid.'?priceErr.message:'Wallet charge is invalid.');}if(wallet<walletCost)throw new HttpsError('failed-precondition',`You need ${walletCost.toFixed(2)} ${walletFx.currency} in your wallet - top up your wallet first.`);const nextBalance=wallet-walletCost;if(!Number.isSafeInteger(Math.round(nextBalance*100)))throw new HttpsError('failed-precondition','The resulting wallet balance is invalid.');tx.update(uref,{walletBalance:nextBalance,walletCurrency:walletFx.currency});
addWalletLedgerEntry(tx,db,{uid,direction:'debit',type:'service_charge',currency:walletFx.currency,amount:walletCost,balanceBefore:wallet,balanceAfter:nextBalance,relatedTransactionId:txref.id,idempotencyKey:requestId,source:'service_charge',createdAt:admin.firestore.FieldValue.serverTimestamp()});
tx.set(txref,{service:serviceLabel || service,customerRole:d.role,commissionAmount:commission,remittanceFee,serviceFee,commissionStatus:commission>0?'pending':'none',details:typeof payload?.details==='string'?payload.details.slice(0,2000):'',amount:calc.amount,total:customerCharge,providerTotal:baseProviderAmount,cost:walletCost,baseCostMyr:cost,walletCost,currency:walletFx.currency,fxRate:walletFx.sellRate,fxRateType:'sell',fxRateSource:walletFx.rateSource,profit:null,tierDiscountPercent:discount,chargedServiceKind:service,exchangeRate:calc.exchangeRate,exchangeRateSource:calc.exchangeRateSource,executionMode:apiMode,apiDispatchStatus:apiMode==='api'?'ready':'legacy',status:'pending',customerId:uid,customerPhone:d.phone||'',resellerId:d.resellerId||null,dealerId:d.resellerId?null:d.dealerId||null,rejected:false,rejectReason:'',pin:collectionPin,raw:{...sanitizeTransactionRaw(payload?.raw,service),...(requestId?{requestId}: {})},createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});return{cost:walletCost,baseCostMyr:cost,currency:walletFx.currency,fxRate:walletFx.sellRate,role:d.role,apiMode,customerUid:uid,customerPhone:d.phone||'',apiAmount:calc.amount,apiTotal:baseProviderAmount,customerTotal:customerCharge,serviceFee,commission};});if (result.apiMode === 'api' && result.status !== 'completed') {
    // Atomically claim the right to dispatch the external side effect. Staff
    // rejection is allowed only while this state is "ready"; once claimed,
    // rejection cannot race with the provider call.
    const dispatch = await db.runTransaction(async tx => {
      const s = await tx.get(txref);
      if (!s.exists || s.data()?.customerId !== result.customerUid) throw new HttpsError('not-found', 'Transaction not found.');
      const d = s.data() || {};
      if (d.status !== 'pending') return { dispatchable: false, status: d.status };
      if (d.apiDispatchStatus !== 'ready') return { dispatchable: false, status: d.status };
      tx.update(txref, { apiDispatchStatus: 'dispatching', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { dispatchable: true, status: 'pending' };
    });
    if (!dispatch.dispatchable) {
      if (dispatch.status === 'rejected') return {id:txref.id,cost:result.cost,collectionPin:collectionPin};
      throw new HttpsError('aborted', 'This API transaction is already being handled.');
    }
    let providerSucceeded = false;
    try {
      const serverCustomer = { uid: result.customerUid, phone: result.customerPhone };
      const apiPayload = { ...payload, amount: result.apiAmount, total: result.apiTotal, customerTotal: result.customerTotal, serviceFee: result.serviceFee };
      const api = await executeConfiguredApi(serviceLabel, apiPayload, serverCustomer, requestId);
      // Once the configured provider has positively accepted the order, the
      // external side effect exists. Never refund it because a subsequent
      // Firestore write fails.
      providerSucceeded = true;
      if (api?.status !== 'processing' && Number(result.commission) > 0) {
        await db.runTransaction(async tx => {
          const [uSnap, tSnap] = await Promise.all([tx.get(uref), tx.get(txref)]);
          if (!uSnap.exists || !tSnap.exists || tSnap.data()?.commissionStatus === 'earned') return;
          const user = uSnap.data() || {};
          const before = Number(user.walletBalance || 0);
          const earned = Number(result.commission || 0);
          const after = Math.round((before + earned) * 100) / 100;
          tx.update(uref, { walletBalance: after });
          addWalletLedgerEntry(tx, db, { uid: result.customerUid, direction:'credit', type:'service_commission', currency:tSnap.data()?.currency || 'MYR', amount:earned, balanceBefore:before, balanceAfter:after, relatedTransactionId:txref.id, idempotencyKey:requestId + ':commission', source:'service_commission', createdAt:admin.firestore.FieldValue.serverTimestamp() });
          addCommissionLedgerEntry(tx, db, { uid: result.customerUid, role: result.role, service: serviceLabel || service, amount: earned, currency:tSnap.data()?.currency || 'MYR', transactionId:txref.id, balanceBefore:before, balanceAfter:after });
          tx.update(txref, { commissionStatus:'earned', commissionEarnedAt:admin.firestore.FieldValue.serverTimestamp() });
                logAudit({ action:'service_commission_earned', targetUid:result.customerUid, performedBy:'system', performedByRole:result.role, details:{ transactionId:txref.id, service:serviceLabel || service, amount:earned, currency:tSnap.data()?.currency || 'MYR' } });
        });
      }
      await txref.update({
        status: api?.status === 'processing' ? 'processing' : 'completed',
        completedAt: api?.status === 'processing' ? null : admin.firestore.FieldValue.serverTimestamp(),
        apiExecution: {
          status: api?.status === 'processing' ? 'processing' : 'accepted',
          providerId: api.providerId,
          providerName: api.providerName,
          responseId: api.responseId || null,
          message: api.message || null,
          ...(api.requestCheck ? { requestCheck: api.requestCheck } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      const errorCode = String(e?.code || '');
      const ambiguousProviderOutcome = providerSucceeded || errorCode === 'unavailable';

      // An unavailable/unknown provider result may mean the external API
      // accepted the transaction but the response was lost. Never refund
      // automatically: doing so could let a retry create a duplicate real
      // transaction. Unknown transactions are also removed from the dealer/
      // reseller queue by transactionQueueService.
      if (ambiguousProviderOutcome) {
        await txref.update({
          status: 'unknown',
          apiExecution: {
            status: 'unknown',
            providerSucceeded,
            error: String(e?.message || 'Provider outcome is uncertain').slice(0, 500),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw e;
      }

      // Definitive failures refund this invocation's charge exactly once.
      await db.runTransaction(async tx => {
        const [u, t] = await Promise.all([tx.get(uref), tx.get(txref)]);
        if (!t.exists || t.data().status !== 'pending' || t.data().apiRefunded === true) return;
        const balance = Number(u.data()?.walletBalance || 0), refund = Number(result.cost || 0);
        if (!Number.isFinite(balance) || !Number.isFinite(refund) || refund < 0 || !Number.isSafeInteger(Math.round((balance + refund) * 100))) throw new HttpsError('failed-precondition', 'Could not safely refund the failed API charge.');
        tx.update(uref, { walletBalance: balance + refund });
        addWalletLedgerEntry(tx, db, {
          uid,
          direction: 'credit',
          type: 'service_refund',
          currency: t.data()?.currency || 'MYR',
          amount: refund,
          balanceBefore: balance,
          balanceAfter: balance + refund,
          relatedTransactionId: txref.id,
          idempotencyKey: requestId,
          source: 'service_refund',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.update(txref, { status: 'failed', apiRefunded: true, apiError: String(e?.message || 'Provider execution failed').slice(0, 500), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      throw e;

    }
  }
  return{id:txref.id,cost:result.cost,collectionPin:result.existing?result.collectionPin:collectionPin};}
async function runChargeProduct(request, service) {
  const data = request?.data || {};
  return chargeProduct(request, service, data.payload, data.customer);
}
exports.runChargeProduct = runChargeProduct;
exports.chargeRecharge=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>chargeProduct(r,'recharge',r.data?.payload,r.data?.customer));
exports.chargeInternetPackage=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>chargeProduct(r,'internet',r.data?.payload,r.data?.customer));
exports.chargeOfferPacks=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>chargeProduct(r,'offerpacks',r.data?.payload,r.data?.customer));
exports.chargeEntertainment=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>chargeProduct(r,'entertainment',r.data?.payload,r.data?.customer));
exports.chargeEsim=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>chargeProduct(r,'esim',r.data?.payload,r.data?.customer));
exports.chargeIimmpactProduct=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>chargeProduct(r,'iimmpact',r.data?.payload,r.data?.customer));
exports.chargeBillPayment=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>chargeProduct(r,'billpayment',r.data?.payload,r.data?.customer));
exports.chargeMobileBanking=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>chargeProduct(r,'mobilebanking',r.data?.payload,r.data?.customer));
exports.chargeRemittance=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>chargeProduct(r,'remittance',r.data?.payload,r.data?.customer));

exports.chargeWallet=onCall({ enforceAppCheck: ENFORCE_APP_CHECK },async r=>{const uid=requireAuth(r),db=admin.firestore(),{kind,key}=r.data||{};if(!key||!['webview_access','webview_submit','payment_success','module_subscription'].includes(kind))throw new HttpsError('invalid-argument','Invalid charge.');await checkVelocity(db,uid,'chargeWallet',{ip:getClientIp(r)});const p=await getPricing(db),ref=db.collection('users').doc(uid);return db.runTransaction(async tx=>{const s=await tx.get(ref);if(!s.exists)throw new HttpsError('not-found','Account not found.');const d=s.data();if(!active(d))throw new HttpsError('permission-denied','Your account is not active.');assertWalletUnfrozen(d,'Your wallet');const bal=Number(d.walletBalance||0);if(!Number.isFinite(bal)||bal<0||!Number.isSafeInteger(Math.round(bal*100)))throw new HttpsError('failed-precondition','Wallet balance is invalid.');const now=Date.now();if(kind==='webview_access'){const cost=safePrice(p,'webviewAccessCost',d.role),win=(Number(p.webviewAccessWindowHours)||0)*3600000,last=d.lastAccessCharge?.[key];if(last&&win>0&&now-last<win)return{charged:false,freeUntil:last+win};if(bal<cost)throw new HttpsError('failed-precondition',`You need ${cost} pts.`);tx.update(ref,{walletBalance:bal-cost,[`lastAccessCharge.${key}`]:now});return{charged:true,cost,freeUntil:now+win};}if(kind==='webview_submit'){const cost=safePrice(p,'webviewSubmitCost',d.role),last=d.webviewSubmitted?.[key];if(last)return{charged:false,submittedAt:last};if(bal<cost)throw new HttpsError('failed-precondition',`You need ${cost} pts.`);tx.update(ref,{walletBalance:bal-cost,[`webviewSubmitted.${key}`]:now});return{charged:true,cost,submittedAt:now};}if(kind==='payment_success'){const cost=safePrice(p,'paymentSuccessCost',d.role),last=d.lastPaymentCharge?.[key];if(last)return{charged:false,chargedAt:last};if(bal<cost)throw new HttpsError('failed-precondition',`You need ${cost} pts.`);tx.update(ref,{walletBalance:bal-cost,[`lastPaymentCharge.${key}`]:now});return{charged:true,cost,chargedAt:now};}const keys={notepad:'notepadCost',myDocuments:'myDocumentsCost',salaryOt:'salaryOtCost'},ck=keys[key];if(!ck)throw new HttpsError('invalid-argument','Unknown module.');const cost=safePrice(p,ck,d.role),win=(Number(p.moduleSubscriptionDays)||30)*86400000,last=d.moduleSubscription?.[key];if(last&&now-last<win)return{charged:false,subscribedUntil:last+win};if(bal<cost)throw new HttpsError('failed-precondition',`You need ${cost} pts.`);tx.update(ref,{walletBalance:bal-cost,[`moduleSubscription.${key}`]:now});return{charged:cost>0,cost,subscribedUntil:now+win};});});