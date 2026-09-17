// Admin-triggered push broadcast.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
const ADMIN_ROLES=['admin','superadmin'];
const AUDIENCES=['all','customer','dealer','reseller','admin','superadmin'];
const EXPO_PUSH_URL='https://exp.host/--/api/v2/push/send';
function chunk(arr,size){const out=[];for(let i=0;i<arr.length;i+=size)out.push(arr.slice(i,i+size));return out;}
function clean(v,max){return typeof v==='string'?v.trim().slice(0,max):'';}
async function sendExpoPush(messages){const valid=messages.filter(m=>m&&m.to);for(const batch of chunk(valid,100)){try{const res=await fetch(EXPO_PUSH_URL,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(batch.map(m=>({sound:'default',...m})))});if(!res.ok)console.error('Expo push HTTP error',res.status,await res.text());}catch(e){console.error('Expo push send failed',e);}}}
exports.sendAnnouncement=onCall({enforceAppCheck:true},async(request)=>{
 if(!request.auth)throw new HttpsError('unauthenticated','You must be signed in.');
 const db=admin.firestore(),callerUid=request.auth.uid,callerSnap=await db.collection('users').doc(callerUid).get(),callerProfile=callerSnap.exists?callerSnap.data():null;
 if(!callerProfile||!ADMIN_ROLES.includes(callerProfile.role))throw new HttpsError('permission-denied','Only an admin can send announcements.');
 if(callerProfile.suspended===true||callerProfile.inactive===true||callerProfile.disabled===true||callerProfile.mergedInto)throw new HttpsError('permission-denied','Your account is not active.');
 const {title,body,audience}=request.data||{};const safeTitle=clean(title,120),safeBody=clean(body,2000);
 if(!safeTitle)throw new HttpsError('invalid-argument','A title is required.');if(!safeBody)throw new HttpsError('invalid-argument','A message is required.');if(!AUDIENCES.includes(audience))throw new HttpsError('invalid-argument','Choose a valid audience.');
 try{const usersQuery=audience==='all'?db.collection('users'):db.collection('users').where('role','==',audience);const usersSnap=await usersQuery.get();const messages=[];let matched=0;usersSnap.forEach(doc=>{matched++;const u=doc.data();if(!u.pushToken||u.notifPrefs?.pushEnabled===false)return;messages.push({to:u.pushToken,title:safeTitle,body:safeBody,data:{type:'announcement'}});});await sendExpoPush(messages);const logRef=await db.collection('announcements').add({title:safeTitle,body:safeBody,audience,matchedCount:matched,sentCount:messages.length,sentBy:callerUid,sentByName:clean(callerProfile.name,200),createdAt:admin.firestore.FieldValue.serverTimestamp()});await logAudit({action:'announcement_sent',targetUid:null,performedBy:callerUid,performedByRole:callerProfile.role,details:{audience,matchedCount:matched,sentCount:messages.length}});return{id:logRef.id,audience,matchedCount:matched,sentCount:messages.length};}
 catch(err){if(err instanceof HttpsError)throw err;await logServerError('sendAnnouncement',err,{userId:callerUid});throw new HttpsError('internal','Could not send the announcement.');}
});