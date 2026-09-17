// Admin grant/revoke of the Business Profile premium feature.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
function requireAuth(request){if(!request.auth)throw new HttpsError('unauthenticated','You must be signed in.');return request.auth.uid;}
async function requireAdmin(db,uid){const snap=await db.collection('users').doc(uid).get();const caller=snap.exists?snap.data():null;if(!caller||!['admin','superadmin'].includes(caller.role)||caller.suspended===true||caller.inactive===true||caller.disabled===true||caller.active===false||caller.mergedInto)throw new HttpsError('permission-denied','Your account cannot manage Business Profiles.');return caller;}
exports.setBusinessProfileStatus=onCall({enforceAppCheck:true},async(request)=>{
 const callerUid=requireAuth(request),db=admin.firestore(),caller=await requireAdmin(db,callerUid); const {targetUid,granted}=request.data||{};
 if(typeof targetUid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid))throw new HttpsError('invalid-argument','targetUid is invalid.');
 if(typeof granted!=='boolean')throw new HttpsError('invalid-argument','granted must be true or false.');
 const targetRef=db.collection('users').doc(targetUid),bizRef=db.collection('businessProfiles').doc(targetUid);
 try{const targetSnap=await targetRef.get();if(!targetSnap.exists)throw new HttpsError('not-found','That user account no longer exists.');const target=targetSnap.data();const bizSnap=await bizRef.get();if(bizSnap.exists)await bizRef.update({isBusinessProfile:granted,...(granted?{grantedAt:admin.firestore.FieldValue.serverTimestamp(),grantedBy:callerUid}: {})});else await bizRef.set({uid:targetUid,isBusinessProfile:granted,businessName:typeof target.name==='string'?target.name.slice(0,200):'',businessLogoUrl:'',businessDescription:'',businessCategory:'',createdAt:admin.firestore.FieldValue.serverTimestamp(),grantedAt:granted?admin.firestore.FieldValue.serverTimestamp():null,grantedBy:callerUid});}
 catch(err){if(err instanceof HttpsError)throw err;await logServerError('setBusinessProfileStatus',err,{userId:callerUid,targetUid});throw new HttpsError('internal',"Could not update this user's Business Profile status.");}
 await logAudit({action:granted?'business_profile_granted':'business_profile_revoked',targetUid,performedBy:callerUid,performedByRole:caller.role}); return {ok:true};
});
