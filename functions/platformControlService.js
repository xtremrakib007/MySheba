// Superadmin platform control plane.
// Server-owned catalogue for dynamic tiles/features, countries/operators and
// targeted WebViews. Existing hard-coded services remain valid; this layer
// adds dynamic entries without moving business logic into the client.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { logAudit, logServerError } = require('./logService');

const db = () => admin.firestore();
const COLLECTIONS = Object.freeze({
  features: 'platformFeatures',
  countries: 'countryCatalog',
  operators: 'operatorCatalog',
});

const ROLES = ['customer','dealer','reseller','support','finance','admin','superadmin'];
const FEATURE_KINDS = ['webview','service','screen'];
const SERVICE_KEYS = ['recharge','rechargePin','mobilebanking','internet','offerpacks','entertainment','billpayment','remittance','bus','train','flight','topup','history','support','myAccount','profile','walletTransfer','myDocuments','salary','kyc'];
const SCREEN_KEYS = ['moreFeatures','history','topup','profile','myAccount','transferPoints','verifyIdentity','support'];
const ISO = /^[A-Z]{2}$/;
const KEY = /^[a-z][a-z0-9_-]{1,47}$/;

function activeProfile(p) {
  return p && p.suspended !== true && p.inactive !== true && p.disabled !== true && p.active !== false && !p.mergedInto;
}
async function requireSuperadmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated','Sign in required.');
  const snap = await db().collection('users').doc(request.auth.uid).get();
  const profile = snap.exists ? snap.data() : null;
  if (!activeProfile(profile) || profile.role !== 'superadmin') throw new HttpsError('permission-denied','Only a superadmin can manage the platform catalogue.');
  return { uid: request.auth.uid, profile };
}
function str(v,max) { const s=String(v ?? '').trim(); return s.length <= max ? s : s.slice(0,max); }
function list(v,maxItems,maxLen) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(x=>String(x||'').trim()).filter(Boolean).slice(0,maxItems))].map(x=>x.slice(0,maxLen));
}
function cleanFeature(data) {
  const key=str(data.key,48).toLowerCase();
  const name=str(data.name,60);
  const kind=str(data.kind,16);
  if (!KEY.test(key)) throw new HttpsError('invalid-argument','Feature key must be 2-48 characters and use lowercase letters, numbers, _ or -.');
  if (!name) throw new HttpsError('invalid-argument','Feature name is required.');
  if (!FEATURE_KINDS.includes(kind)) throw new HttpsError('invalid-argument','Unsupported feature type.');
  if (kind === 'service' && !SERVICE_KEYS.includes(String(data.serviceKey||''))) throw new HttpsError('invalid-argument','Unsupported service target.');
  if (kind === 'screen' && !SCREEN_KEYS.includes(String(data.screenKey||''))) throw new HttpsError('invalid-argument','Unsupported screen target.');
  if (kind === 'webview' && !KEY.test(String(data.webviewKey||''))) throw new HttpsError('invalid-argument','A valid WebView key is required.');
  return {
    key,name,description:str(data.description,160),icon:str(data.icon||'✨',16),
    kind, serviceKey: kind==='service' ? String(data.serviceKey) : null,
    screenKey: kind==='screen' ? String(data.screenKey) : null,
    webviewKey: kind==='webview' ? String(data.webviewKey) : null,
    enabled:data.enabled !== false, home:data.home !== false,
    roles:list(data.roles,ROLES.length,24), countries:list(data.countries,100,2),
    sortOrder:Number.isFinite(Number(data.sortOrder)) ? Math.max(0,Math.min(9999,Number(data.sortOrder))) : 999,
    archived:data.archived === true,
  };
}
function cleanCountry(data) {
  const code=str(data.code,2).toUpperCase();
  const name=str(data.name,80);
  if (!ISO.test(code) || !name) throw new HttpsError('invalid-argument','Country code/name is invalid.');
  return { code,name,flag:str(data.flag||'🌍',8),dial:str(data.dial,12),currency:str(data.currency||data.curr,8).toUpperCase(),enabled:data.enabled!==false,archived:data.archived===true,sortOrder:Number(data.sortOrder)||999 };
}
function cleanOperator(data) {
  const id=str(data.id||data.key,64).toLowerCase();
  const name=str(data.name,80), country=str(data.country,2).toUpperCase();
  if (!KEY.test(id) || !name || !ISO.test(country)) throw new HttpsError('invalid-argument','Operator id/name/country is invalid.');
  return { id,name,country,logo:str(data.logo,300),enabled:data.enabled!==false,archived:data.archived===true,
    recharge:data.recharge!==false,internet:data.internet!==false,offerPacks:data.offerPacks!==false,entertainment:data.entertainment!==false,
    sortOrder:Number(data.sortOrder)||999 };
}
function viewerFrom(profile, uid) {
  return { uid, role:String(profile.role||''), country:String(profile.countryCode||profile.country||'').toUpperCase() };
}
function allowed(item, viewer) {
  if (!item || item.enabled === false || item.archived === true) return false;
  if (Array.isArray(item.roles) && item.roles.length && !item.roles.includes(viewer.role)) return false;
  if (Array.isArray(item.countries) && item.countries.length && !item.countries.includes(viewer.country)) return false;
  if (Array.isArray(item.users) && item.users.length && !item.users.includes(viewer.uid)) return false;
  return true;
}
async function getProfile(uid) {
  const s=await db().collection('users').doc(uid).get();
  return s.exists ? s.data() : null;
}

exports.getPlatformCatalog = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated','Sign in required.');
  const profile=await getProfile(request.auth.uid);
  if (!activeProfile(profile)) throw new HttpsError('permission-denied','Your account is not active.');
  const viewer=viewerFrom(profile,request.auth.uid);
  const [featuresSnap,countriesSnap,operatorsSnap,webviewSnap,adsSnap]=await Promise.all([
    db().collection(COLLECTIONS.features).where('enabled','==',true).get(),
    db().collection(COLLECTIONS.countries).where('enabled','==',true).get(),
    db().collection(COLLECTIONS.operators).where('enabled','==',true).get(),
    db().collection('settings').doc('webviews').get(),
    db().collection('ad_settings').doc('general').get(),
  ]);
  const features=featuresSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>allowed(x,viewer)).filter(x=>x.archived!==true).sort((a,b)=>(a.sortOrder||999)-(b.sortOrder||999));
  const countries=countriesSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.archived!==true);
  const operators=operatorsSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.archived!==true && (!x.country || x.country===viewer.country || profile.role==='superadmin'));
  const raw=webviewSnap.exists ? (webviewSnap.data().pages||{}) : {};
  const webviews={};
  for (const [key,page] of Object.entries(raw)) {
    if (page && page.active !== false && allowed(page,viewer)) webviews[key]={key,...page};
  }
  const ads=adsSnap.exists ? adsSnap.data() : {};
  return { features,countries,operators,webviews,ads:{adsEnabled:ads.adsEnabled!==false,bannerAdsEnabled:ads.bannerAdsEnabled!==false,nativeAdsEnabled:ads.nativeAdsEnabled!==false,interstitialAdsEnabled:ads.interstitialAdsEnabled!==false} };
});

exports.listPlatformCatalogAdmin = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  await requireSuperadmin(request);
  const [f,c,o,w,a]=await Promise.all([
    db().collection(COLLECTIONS.features).orderBy('sortOrder').get(),
    db().collection(COLLECTIONS.countries).orderBy('sortOrder').get(),
    db().collection(COLLECTIONS.operators).orderBy('sortOrder').get(),
    db().collection('settings').doc('webviews').get(),
    db().collection('ad_settings').doc('general').get(),
  ]);
  const webviews=w.exists ? (w.data().pages||{}) : {};
  return {features:f.docs.map(d=>({id:d.id,...d.data()})),countries:c.docs.map(d=>({id:d.id,...d.data()})),operators:o.docs.map(d=>({id:d.id,...d.data()})),webviews:Object.entries(webviews).map(([key,v])=>({key,...v})),ads:a.exists?a.data():{}};
});

async function writeDoc(collection,id,data,uid,action,before) {
  await db().collection(collection).doc(id).set({...data,updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action,targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{collection,id,before:before||null,after:data}});
}
exports.savePlatformFeature = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request); const data=cleanFeature(request.data||{});
  const ref=db().collection(COLLECTIONS.features).doc(data.key); const old=await ref.get();
  await writeDoc(COLLECTIONS.features,data.key,data,uid,'platform_feature_saved',old.exists?old.data():null);
  return {ok:true,id:data.key};
});
exports.deletePlatformFeature = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request); const id=str(request.data?.id,48).toLowerCase();
  if (!KEY.test(id)) throw new HttpsError('invalid-argument','Invalid feature id.');
  const ref=db().collection(COLLECTIONS.features).doc(id); const old=await ref.get();
  if (!old.exists) return {ok:true};
  await ref.set({enabled:false,archived:true,updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'platform_feature_archived',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{id,before:old.data()}});
  return {ok:true};
});
exports.saveCountryCatalog = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request); const data=cleanCountry(request.data||{});
  const old=await db().collection(COLLECTIONS.countries).doc(data.code).get();
  await writeDoc(COLLECTIONS.countries,data.code,data,uid,'country_catalog_saved',old.exists?old.data():null); return {ok:true,id:data.code};
});
exports.deleteCountryCatalog = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request); const id=str(request.data?.id,2).toUpperCase();
  if (!ISO.test(id)) throw new HttpsError('invalid-argument','Invalid country code.');
  const ref=db().collection(COLLECTIONS.countries).doc(id); const old=await ref.get(); if(!old.exists) return {ok:true};
  await ref.set({enabled:false,archived:true,updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'country_catalog_archived',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{id,before:old.data()}}); return {ok:true};
});
exports.saveOperatorCatalog = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request); const data=cleanOperator(request.data||{});
  const old=await db().collection(COLLECTIONS.operators).doc(data.id).get();
  await writeDoc(COLLECTIONS.operators,data.id,data,uid,'operator_catalog_saved',old.exists?old.data():null); return {ok:true,id:data.id};
});
exports.deleteOperatorCatalog = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request); const id=str(request.data?.id,64).toLowerCase(); if(!KEY.test(id)) throw new HttpsError('invalid-argument','Invalid operator id.');
  const ref=db().collection(COLLECTIONS.operators).doc(id); const old=await ref.get(); if(!old.exists) return {ok:true};
  await ref.set({enabled:false,archived:true,updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'operator_catalog_archived',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{id,before:old.data()}}); return {ok:true};
});

exports.updateWebviewTargeting = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request); const key=str(request.data?.key,64);
  if (!key || (!/^wv_[a-z0-9]{4,24}$/.test(key) && !/^[a-z0-9_-]{2,48}$/.test(key))) throw new HttpsError('invalid-argument','Invalid WebView key.');
  const ref=db().collection('settings').doc('webviews'); const snap=await ref.get(); const pages=snap.exists?(snap.data().pages||{}):{};
  if(!pages[key]) throw new HttpsError('not-found','WebView page not found.');
  const roles=list(request.data?.roles,ROLES.length,24), countries=list(request.data?.countries,100,2).map(x=>x.toUpperCase()), users=list(request.data?.users,1000,128);
  const next={...pages[key],roles,countries,users};
  await ref.set({pages:{[key]:next},updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'webview_targeting_changed',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{key,roles,countries,userCount:users.length}});
  return {ok:true,key,roles,countries,users};
});

exports.updateGoogleAdsControls = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request);
  const allowedFields=['adsEnabled','bannerAdsEnabled','nativeAdsEnabled','interstitialAdsEnabled','directAdsEnabled'];
  const changes=request.data?.changes||{}; const clean={};
  for(const [k,v] of Object.entries(changes)){ if(!allowedFields.includes(k)) throw new HttpsError('invalid-argument',`Unknown ads control: ${k}`); if(typeof v!=='boolean') throw new HttpsError('invalid-argument',`${k} must be boolean.`); clean[k]=v; }
  if(!Object.keys(clean).length) throw new HttpsError('invalid-argument','No ad controls supplied.');
  await db().collection('ad_settings').doc('general').set({...clean,updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'google_ads_controls_changed',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{changes:clean}});
  return {ok:true};
});

module.exports.allowed = allowed;
