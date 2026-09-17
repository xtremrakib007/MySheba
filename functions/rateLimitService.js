// Velocity / rate-limit guard for authenticated mutations and anonymous abuse-prone flows.
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit } = require('./logService');

const DEFAULT_LIMITS = {
  createSelfTopup:{max:5,windowMinutes:60}, transferPoints:{max:20,windowMinutes:10}, chargeWallet:{max:60,windowMinutes:60}, walletTransfer:{max:20,windowMinutes:10}, findWalletRecipient:{max:30,windowMinutes:10}, listWalletTransfers:{max:30,windowMinutes:10}, account_merge_start:{max:5,windowMinutes:60}, account_merge_confirm:{max:10,windowMinutes:60}, password_reset:{max:5,windowMinutes:60}, password_reset_email_send:{max:5,windowMinutes:60}, search_users:{max:30,windowMinutes:10}, get_user_by_uid:{max:60,windowMinutes:10}, match_contacts_by_phone:{max:10,windowMinutes:10}, support_ticket_create:{max:5,windowMinutes:60}, inquiry_create:{max:5,windowMinutes:60}, announcement_send:{max:10,windowMinutes:60}
};
const DEFAULT_OTP_LIMITS = { otp_send:{max:8,windowMinutes:60}, otp_verify:{max:20,windowMinutes:60} };
const DEFAULT_ANONYMOUS_LIMITS = { ad_impression:{max:120,windowMinutes:10}, ad_click:{max:30,windowMinutes:10} };

function validLimit(value) {
  const max = Number(value?.max), windowMinutes = Number(value?.windowMinutes);
  return Number.isSafeInteger(max) && max >= 1 && max <= 100000 && Number.isSafeInteger(windowMinutes) && windowMinutes >= 1 && windowMinutes <= 1440;
}
function mergeLimits(defaults, overrides) {
  const merged = {};
  for (const action of Object.keys(defaults)) {
    const candidate = { ...defaults[action], ...(overrides?.[action] || {}) };
    merged[action] = validLimit(candidate) ? candidate : defaults[action];
  }
  return merged;
}
async function getSecuritySettings(db){
  const snap=await db.collection('settings').doc('security').get();
  return mergeLimits(DEFAULT_LIMITS, snap.exists ? snap.data()?.walletVelocity : null);
}
async function getOtpSecuritySettings(db){
  const snap=await db.collection('settings').doc('security').get();
  return mergeLimits(DEFAULT_OTP_LIMITS, snap.exists ? snap.data()?.otpVelocity : null);
}
async function getAnonymousSecuritySettings(db){
  const snap=await db.collection('settings').doc('security').get();
  return mergeLimits(DEFAULT_ANONYMOUS_LIMITS, snap.exists ? snap.data()?.anonymousVelocity : null);
}
async function slidingWindowTripped(db,collectionName,docId,limit){
  const windowMs=Number(limit.windowMinutes)*60*1000, max=Number(limit.max);
  const ref=db.collection(collectionName).doc(docId),now=Date.now();
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const events=((snap.exists&&snap.data().events)||[]).filter(ts=>Number.isSafeInteger(ts)&&now-ts<windowMs);
    if(events.length>=max){tx.set(ref,{events,updatedAt:admin.firestore.FieldValue.serverTimestamp()});return true;}
    events.push(now);tx.set(ref,{events,updatedAt:admin.firestore.FieldValue.serverTimestamp()});return false;
  });
}
async function checkVelocity(db,uid,action,context={}){
  const limits=await getSecuritySettings(db),limit=limits[action];if(!limit)return;
  const tripped=await slidingWindowTripped(db,'walletVelocity',`${uid}_${action}`,limit);
  if(tripped){await logAudit({action:'wallet_velocity_blocked',targetUid:uid,performedBy:uid,performedByRole:null,details:{blockedAction:action,limit,ip:context.ip||null}});throw new HttpsError('resource-exhausted',"You're doing that too quickly. Please wait a bit and try again.");}
}
async function checkAnonymousVelocity(db,identifier,action){
  const limits=await getOtpSecuritySettings(db),limit=limits[action];if(!limit)return;
  const key=identifier||'unknown';
  const tripped=await slidingWindowTripped(db,'otpVelocity',`${key}_${action}`,limit);
  if(tripped){await logAudit({action:'otp_velocity_blocked',targetUid:null,performedBy:'anonymous',performedByRole:null,details:{blockedAction:action,limit,ip:identifier||null}});throw new HttpsError('resource-exhausted',"You're doing that too quickly. Please wait a bit and try again.");}
}
async function checkAnonymousAdVelocity(db,identifier,action){
  const limits=await getAnonymousSecuritySettings(db),limit=limits[action];if(!limit)return;
  const key=identifier||'unknown';
  const tripped=await slidingWindowTripped(db,'anonymousVelocity',`${key}_${action}`,limit);
  if(tripped){await logAudit({action:'anonymous_ad_velocity_blocked',targetUid:null,performedBy:'anonymous',performedByRole:null,details:{blockedAction:action,limit,ip:identifier||null}});throw new HttpsError('resource-exhausted',"Ad tracking is temporarily limited. Please try again later.");}
}
function getClientIp(request){try{return request.rawRequest?.ip||null;}catch{return null;}}
module.exports={checkVelocity,checkAnonymousVelocity,checkAnonymousAdVelocity,getClientIp,DEFAULT_LIMITS,DEFAULT_OTP_LIMITS,DEFAULT_ANONYMOUS_LIMITS};
