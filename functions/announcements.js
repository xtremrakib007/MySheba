// Admin-triggered push broadcast.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const admin = require('firebase-admin');
const { hasCapability } = require('./accessControl');
const { logAudit, logServerError } = require('./logService');
// One sender for every push path, and the only one that reads Expo's per-message
// tickets. The copy that used to live here reported the number of messages it
// composed as if that were the number delivered.
const { sendExpoPush, describePush } = require('./expoPush');
// Staff who may hold the 'support' capability (functions/accessControl.js).
const ADMIN_ROLES=['admin','superadmin','support','finance'];
const AUDIENCES=['all','customer','dealer','reseller','support','finance','admin','superadmin'];
function clean(v,max){return typeof v==='string'?v.trim().slice(0,max):'';}

exports.sendAnnouncement=onCall({enforceAppCheck: ENFORCE_APP_CHECK},async(request)=>{
 if(!request.auth)throw new HttpsError('unauthenticated','You must be signed in.');
 const db=admin.firestore(),callerUid=request.auth.uid,callerSnap=await db.collection('users').doc(callerUid).get(),callerProfile=callerSnap.exists?callerSnap.data():null;
 if(!callerProfile||!ADMIN_ROLES.includes(callerProfile.role))throw new HttpsError('permission-denied','Your account cannot send announcements.');
 if(callerProfile.suspended===true||callerProfile.inactive===true||callerProfile.disabled===true||callerProfile.active===false||callerProfile.mergedInto)throw new HttpsError('permission-denied','Your account is not active.');
 if(!(await hasCapability(db,callerUid,callerProfile,'support')))throw new HttpsError('permission-denied','Your account cannot send announcements.');
 const freshCallerSnap=await db.collection('users').doc(callerUid).get();const freshCaller=freshCallerSnap.exists?freshCallerSnap.data():null;
 if(!freshCaller||!ADMIN_ROLES.includes(freshCaller.role)||freshCaller.suspended===true||freshCaller.inactive===true||freshCaller.disabled===true||freshCaller.active===false||freshCaller.mergedInto)throw new HttpsError('permission-denied','Your account is no longer authorized to send announcements.');
 const {title,body,audience}=request.data||{};const safeTitle=clean(title,120),safeBody=clean(body,2000);
 if(!safeTitle)throw new HttpsError('invalid-argument','A title is required.');if(!safeBody)throw new HttpsError('invalid-argument','A message is required.');if(!AUDIENCES.includes(audience))throw new HttpsError('invalid-argument','Choose a valid audience.');
 try{const usersQuery=audience==='all'?db.collection('users'):db.collection('users').where('role','==',audience);const usersSnap=await usersQuery.get();const messages=[];let matched=0;usersSnap.forEach(doc=>{matched++;const u=doc.data();if(u.suspended===true||u.inactive===true||u.disabled===true||u.active===false||u.mergedInto)return;if(!u.pushToken||u.notifPrefs?.pushEnabled===false)return;messages.push({to:u.pushToken,title:safeTitle,body:safeBody,data:{type:'announcement'}});});const finalCallerSnap=await db.collection('users').doc(callerUid).get();const finalCaller=finalCallerSnap.exists?finalCallerSnap.data():null;
 if(!finalCaller||!ADMIN_ROLES.includes(finalCaller.role)||finalCaller.suspended===true||finalCaller.inactive===true||finalCaller.disabled===true||finalCaller.active===false||finalCaller.mergedInto)throw new HttpsError('permission-denied','Your account is no longer authorized to send announcements.');
 const push=await sendExpoPush(messages);
 // Stop sending to installs Expo says are gone. Without this the same dead
 // tokens fail on every future broadcast and the failure count never drops.
 if(push.unregistered.length){const stale=push.unregistered.slice(0,400);await Promise.all(stale.map(async(token)=>{try{const owners=await db.collection('users').where('pushToken','==',token).limit(5).get();await Promise.all(owners.docs.map(d=>d.ref.update({pushToken:admin.firestore.FieldValue.delete(),pushTokenClearedAt:admin.firestore.FieldValue.serverTimestamp(),pushTokenClearedReason:'DeviceNotRegistered'})));}catch(e){console.error('Could not clear a dead push token',e);}}));}
 const logRef=await db.collection('announcements').add({title:safeTitle,body:safeBody,audience,matchedCount:matched,sentCount:messages.length,deliveredCount:push.accepted,failedCount:push.failed,pushErrors:push.errors,sentBy:callerUid,sentByName:clean(finalCaller.name,200),createdAt:admin.firestore.FieldValue.serverTimestamp()});await logAudit({action:'announcement_sent',targetUid:null,performedBy:callerUid,performedByRole:finalCaller.role,details:{audience,matchedCount:matched,sentCount:messages.length}});return{id:logRef.id,audience,matchedCount:matched,sentCount:messages.length,deliveredCount:push.accepted,failedCount:push.failed,pushErrors:push.errors,delivery:describePush(push)};}
 catch(err){if(err instanceof HttpsError)throw err;await logServerError('sendAnnouncement',err,{userId:callerUid});throw new HttpsError('internal','Could not send the announcement.');}
});