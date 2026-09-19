// PHASE 10 - MY SHEBA ADVERTISING PACKAGES AND PAYMENTS.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAdAudit, logServerError } = require('./logService');

const PAYMENT_STATUS_TRANSITIONS = { pending:['paid','failed'], paid:['refunded','failed'], failed:['pending','paid'], refunded:[] };
const VALID_PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_TRANSITIONS);
const MAX_AMOUNT = 100000000;
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
function requireAuth(request) { if (!request.auth?.uid) throw new HttpsError('unauthenticated','You must be signed in.'); return request.auth.uid; }
async function requireSuperadmin(db, uid) { const snap=await db.collection('users').doc(uid).get(); const caller=snap.exists?snap.data():null; if(!caller||caller.role!=='superadmin') throw new HttpsError('permission-denied','Only a Super Admin can manage advertisement payments.'); if(caller.suspended===true||caller.inactive===true||caller.disabled===true||caller.active===false||caller.mergedInto!=null) throw new HttpsError('permission-denied','Your account is not active.'); return caller; }
function validId(v,label) { if(typeof v!=='string'||!ID_RE.test(v)) throw new HttpsError('invalid-argument',`${label} is invalid.`); return v; }
function cleanText(v,max) { if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function validMoney(v) {
  if (typeof v === 'number') { if (!Number.isFinite(v) || v <= 0 || v > MAX_AMOUNT) throw new HttpsError('invalid-argument','amount must be a valid positive amount with at most 2 decimal places.'); const cents = Math.round(v * 100); if (!Number.isSafeInteger(cents) || Math.abs(v * 100 - cents) > Number.EPSILON * Math.max(1, Math.abs(v * 100))) throw new HttpsError('invalid-argument','amount must be a valid positive amount with at most 2 decimal places.'); return v; }
  if (typeof v !== 'string' || !MONEY_RE.test(v) || v === '0') throw new HttpsError('invalid-argument','amount must be a valid positive amount with at most 2 decimal places.');
  const n = Number(v); if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) throw new HttpsError('invalid-argument','amount is outside the allowed range.'); return n;
}

exports.createAdPayment = onCall({ enforceAppCheck:true }, async (request) => {
  const callerUid=requireAuth(request); const db=admin.firestore(); const caller=await requireSuperadmin(db,callerUid);
  const {advertiserId,campaignId,packageId,amount,currency,paymentMethod,transactionReference,paymentStatus}=request.data||{};
  const advId=validId(advertiserId,'advertiserId'); const numericAmount=validMoney(amount);
  const curr=cleanText(currency,12).toUpperCase(); const method=cleanText(paymentMethod,80);
  if(!/^[A-Z]{3}$/.test(curr)) throw new HttpsError('invalid-argument','currency must be a 3-letter code.');
  if(!method) throw new HttpsError('invalid-argument','paymentMethod is required.');
  const status=paymentStatus||'pending'; if(!VALID_PAYMENT_STATUSES.includes(status)) throw new HttpsError('invalid-argument','Invalid payment status.');

  const advertiserRef=db.collection('ad_advertisers').doc(advId);
  const campaignIdClean=campaignId ? validId(campaignId,'campaignId') : '';
  const packageIdClean=packageId ? validId(packageId,'packageId') : '';
  const campaignRef=campaignIdClean ? db.collection('ad_campaigns').doc(campaignIdClean) : null;
  const packageRef=packageIdClean ? db.collection('ad_packages').doc(packageIdClean) : null;
  const paymentRef=db.collection('ad_payments').doc();
  let paymentRole='';

  try {
    await db.runTransaction(async (tx) => {
      const callerSnap=await tx.get(db.collection('users').doc(callerUid));
      const currentCaller=callerSnap.exists?callerSnap.data():null;
      if(!currentCaller||currentCaller.role!=='superadmin'||currentCaller.suspended===true||currentCaller.inactive===true||currentCaller.disabled===true||currentCaller.active===false||currentCaller.mergedInto!=null) {
        throw new HttpsError('permission-denied','Your account can no longer manage advertisement payments.');
      }

      const advertiserSnap=await tx.get(advertiserRef);
      if(!advertiserSnap.exists) throw new HttpsError('not-found','That advertiser does not exist.');
      const advertiserData=advertiserSnap.data()||{};

      let campaignData=null;
      if(campaignRef){
        const campaignSnap=await tx.get(campaignRef);
        if(!campaignSnap.exists) throw new HttpsError('not-found','That campaign does not exist.');
        campaignData=campaignSnap.data()||{};
        if(campaignData.advertiserId!==advId) throw new HttpsError('invalid-argument','That campaign does not belong to this advertiser.');
      }

      let packageData=null;
      if(packageRef){
        const packageSnap=await tx.get(packageRef);
        if(!packageSnap.exists) throw new HttpsError('not-found','That package does not exist.');
        packageData=packageSnap.data()||{};
        if(packageData.active === false) throw new HttpsError('failed-precondition','That advertisement package is no longer active.');
        if(packageData.advertiserId&&packageData.advertiserId!==advId) throw new HttpsError('invalid-argument','That package does not belong to this advertiser.');
        if(packageData.campaignId&&packageData.campaignId!==campaignIdClean) throw new HttpsError('invalid-argument','That package does not belong to this campaign.');
      }

      const paymentData={
        advertiserId:advId,campaignId:campaignIdClean,packageId:packageIdClean,amount:numericAmount,currency:curr,
        paymentStatus:status,paymentMethod:method,transactionReference:cleanText(transactionReference,200),
        advertiserName:cleanText(advertiserData.companyName,200),
        campaignName:campaignData?cleanText(campaignData.name,200):'',
        packageName:packageData?cleanText(packageData.name,200):'',
        recordedBy:callerUid,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()
      };
      tx.create(paymentRef,paymentData);
      paymentRole=currentCaller.role;
    });
  } catch(err) {
    if(err instanceof HttpsError) throw err;
    await logServerError('createAdPayment',err,{userId:callerUid});
    throw new HttpsError('internal','Could not record this payment.');
  }

  await logAdAudit({action:'create',targetType:'ad_payment',targetId:paymentRef.id,performedBy:callerUid,details:{advertiserId:advId,campaignId:campaignIdClean||null,packageId:packageIdClean||null,amount:numericAmount,currency:curr,paymentStatus:status,performedByRole:paymentRole}});
  return {ok:true,paymentId:paymentRef.id};
});

exports.updateAdPaymentStatus = onCall({ enforceAppCheck:true }, async (request) => {
  const callerUid=requireAuth(request); const db=admin.firestore(); const caller=await requireSuperadmin(db,callerUid);
  const {paymentId,paymentStatus,note}=request.data||{}; const id=validId(paymentId,'paymentId');
  if(!VALID_PAYMENT_STATUSES.includes(paymentStatus)) throw new HttpsError('invalid-argument','Invalid payment status.');
  const paymentRef=db.collection('ad_payments').doc(id); const paymentSnap=await paymentRef.get(); if(!paymentSnap.exists) throw new HttpsError('not-found','That payment record does not exist.');
  const current=paymentSnap.data()||{}; if(!VALID_PAYMENT_STATUSES.includes(current.paymentStatus)||!PAYMENT_STATUS_TRANSITIONS[current.paymentStatus].includes(paymentStatus)) throw new HttpsError('failed-precondition',`Cannot move a payment from "${current.paymentStatus}" to "${paymentStatus}".`);
  try {
    await db.runTransaction(async (tx) => {
      const callerSnap = await tx.get(db.collection('users').doc(callerUid));
      const currentCaller = callerSnap.exists ? callerSnap.data() : null;
      if (!currentCaller || currentCaller.role !== 'superadmin' || currentCaller.suspended === true || currentCaller.inactive === true || currentCaller.disabled === true || currentCaller.active === false || currentCaller.mergedInto != null) {
        throw new HttpsError('permission-denied', 'Your account can no longer manage advertisement payments.');
      }
      const freshPayment = await tx.get(paymentRef);
      if (!freshPayment.exists) throw new HttpsError('not-found','That payment record does not exist.');
      const fresh = freshPayment.data() || {};
      if (!VALID_PAYMENT_STATUSES.includes(fresh.paymentStatus) || !PAYMENT_STATUS_TRANSITIONS[fresh.paymentStatus].includes(paymentStatus)) {
        throw new HttpsError('failed-precondition', `Cannot move a payment from "${fresh.paymentStatus}" to "${paymentStatus}".`);
      }
      tx.update(paymentRef,{paymentStatus,recordedBy:callerUid,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    });
  } catch(err) { if (err instanceof HttpsError) throw err; await logServerError('updateAdPaymentStatus',err,{userId:callerUid}); throw new HttpsError('internal','Could not update this payment status.'); }
  await logAdAudit({action:'edit',targetType:'ad_payment',targetId:id,performedBy:callerUid,details:{from:current.paymentStatus,to:paymentStatus,note:cleanText(note,1000),performedByRole:caller.role}});
  return {ok:true};
});
