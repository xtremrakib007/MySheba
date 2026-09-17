// PHASE 3 - MySheba Advertisement System - Banner creative deletion.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');
function requireAuth(request) { if (!request.auth) throw new HttpsError('unauthenticated','You must be signed in.'); return request.auth.uid; }
async function requireSuperadmin(db, uid) { const snap=await db.collection('users').doc(uid).get(); const caller=snap.exists?snap.data():null; if(!caller||caller.role!=='superadmin') throw new HttpsError('permission-denied','Only a Super Admin can manage advertisement creatives.'); return caller; }
function validStoragePath(p) { return typeof p==='string' && p.length<=512 && /^ads\/(banners|native|interstitial|advertisers)\/[A-Za-z0-9._-]+$/.test(p); }
exports.deleteAdCreative = onCall({ enforceAppCheck:true }, async (request) => {
  const callerUid=requireAuth(request); const db=admin.firestore(); await requireSuperadmin(db,callerUid);
  const {storagePaths}=request.data||{};
  if(!Array.isArray(storagePaths)||storagePaths.length===0||storagePaths.length>50) throw new HttpsError('invalid-argument','storagePaths must contain 1 to 50 paths.');
  if(storagePaths.some((p)=>!validStoragePath(p))) throw new HttpsError('invalid-argument','Every storage path must be a valid advertisement asset path.');
  const bucket=admin.storage().bucket();
  try { await Promise.all(storagePaths.map((path)=>bucket.file(path).delete({ignoreNotFound:true}))); }
  catch(err) { await logServerError('deleteAdCreative',err,{userId:callerUid}); throw new HttpsError('internal','Could not delete one or more advertisement files.'); }
  return {ok:true,deleted:storagePaths.length};
});
