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

const ROLES = ['customer','retail','dealer','reseller','support','finance','admin','superadmin'];
const FEATURE_KINDS = ['webview','service','screen'];
const SERVICE_KEYS = ['recharge','rechargePin','mobilebanking','internet','esim','offerpacks','entertainment','billpayment','remittance','bus','train','flight','topup','history','support','myAccount','profile','walletTransfer','myDocuments','salary','kyc'];
const SCREEN_KEYS = ['moreFeatures','history','topup','profile','myAccount','transferPoints','verifyIdentity','support'];
const AD_CONTROL_SCREEN_KEYS = ['customerHome','dealerHome','resellerHome','adminHome','staffHome','service','webview','buspicker','support','help','adminSupport','history','topup','superAdminTopup','profile','settings','myAccount','reports','ledger','invoices','tileLabels','walletFunding','userManagement','transferPoints','notifications','referral','verifyIdentity','verificationManagement','adminAnalytics','myDocuments','notepad','addNote','noteDetail','moreFeatures','adminFeatures','tierPromotions','apiProviderManagement','reconcileTransactions','dealerFeatures','resellerFeatures','featureAccess','gridManagement','webviewManagement','adFeatureControls','adAnalytics','bannerManagement','advertiserManagement','advertiserDetail','adPackagesManagement','adPaymentsManagement','trustedDevices','documentType','addDocument','documentDetails','documentViewer','salaryDashboard','salarySettings','salaryCalculator','salaryWorkLog','salaryReports','salaryMonthlySummary','salaryHistory','createPayslip','payslipHistory','payslipDetails'];
const GRID_DEFS = [
  ['recharge','Recharge'],['rechargePin','Recharge PIN'],['mobilebanking','Mobile Banking'],['internet','Internet'],['billpayment','Bill Payment'],
  ['remittance','Remittance'],['bus','Bus'],['train','Train'],['flight','Flight'],['entertainment','Entertainment'],
  ['topup','Top-Up'],['history','Transactions'],['support','Support'],['myAccount','My Account'],['profile','Profile'],
  ['dealerFeatures','Dealer Features'],['resellerFeatures','Reseller Features'],['adminFeatures','Admin Features'],['moreFeaturesTile','More Services'],
  ['walletTransfer','Wallet Transfer'],['myDocuments','My Documents'],['salary','Salary & OT'],['kyc','Profile & KYC'],['fomema','FOMEMA'],['visa','Visa Malaysia'],
  ['mydigital','Malaysia Arrival Card'],['passport','Passport'],['adminAnalytics','Analytics'],['inquiries','Inquiries'],['pending','Pending'],['topups','Top-Ups'],
  ['rates','Rates'],['pricing','Pricing'],['payments','Payments'],['transferPoints','Transfers'],['apiManagement','API Management'],['userManagement','Users'],
  ['verificationManagement','KYC Verification'],['featureAccess','Feature Access'],['banners','Banners'],['announcements','Announcements']
].map(([key,name])=>({key,name}));
const GRID_KEYS = new Set(GRID_DEFS.map(x=>x.key));
const GRID_SCOPES = ['byRole','byCountry','byUser'];
const RESERVED_FEATURE_KEYS = new Set(['recharge','rechargePin','mobilebanking','internet','billpayment','remittance','bus','train','flight','offerpacks','entertainment','topup','history','support','myAccount','profile','dealerFeatures','resellerFeatures','adminFeatures','moreFeaturesTile','walletTransfer','myDocuments','salary','kyc','fomema','visa','mydigital','passport','adminAnalytics','inquiries','pending','topups','rates','pricing','payments','transferPoints','apiManagement','userManagement','verificationManagement','featureAccess','banners','announcements']);
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
  if (!KEY.test(key) || RESERVED_FEATURE_KEYS.has(key)) throw new HttpsError('invalid-argument','That key is reserved by a built-in MySheba feature. Use a new custom key.');
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
  return { features,countries,operators,webviews,ads:{adsEnabled:ads.adsEnabled!==false,bannerAdsEnabled:ads.bannerAdsEnabled!==false,nativeAdsEnabled:ads.nativeAdsEnabled!==false,interstitialAdsEnabled:ads.interstitialAdsEnabled!==false,admobEnabled:ads.admobEnabled!==false,admobBannerEnabled:ads.admobBannerEnabled!==false,directAdsEnabled:ads.directAdsEnabled!==false,placementControls:ads.placementControls||null} };
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

function cleanWebview(data) {
  const key = str(data.key,64).toLowerCase();
  if (!key || (!/^wv_[a-z0-9]{4,24}$/.test(key) && !/^[a-z0-9_-]{2,48}$/.test(key))) throw new HttpsError('invalid-argument','Invalid WebView key.');
  const name = str(data.name,40), url = str(data.url,500), title = str(data.title || name,60), icon = str(data.icon || '🌐',16);
  if (!name) throw new HttpsError('invalid-argument','WebView name is required.');
  let parsed; try { parsed = new URL(url); } catch (_) { throw new HttpsError('invalid-argument','WebView URL must be a full https:// address.'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || !parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) throw new HttpsError('invalid-argument','Only valid https:// WebView URLs are allowed.');
  return { name,url,title,icon,active:data.active !== false,home:data.home !== false,mobile:data.mobile !== false,desktop:data.desktop !== false,roles:list(data.roles,ROLES.length,24),countries:list(data.countries,100,2).map(x=>x.toUpperCase()),users:list(data.users,1000,128),custom:/^wv_[a-z0-9]{4,24}$/.test(key) };
}
exports.saveWebviewPage = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request);
  const data=cleanWebview(request.data||{}); const key=String(request.data?.key||'').trim().toLowerCase();
  const ref=db().collection('settings').doc('webviews'); const snap=await ref.get(); const pages=snap.exists?(snap.data().pages||{}):{};
  await ref.set({pages:{[key]:data},updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'webview_page_saved',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{key,before:pages[key]||null,after:data}});
  return {ok:true,key,...data};
});
exports.deleteWebviewPage = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request); const key=str(request.data?.key,64).toLowerCase();
  if(!/^wv_[a-z0-9]{4,24}$/.test(key)) throw new HttpsError('failed-precondition','Built-in WebViews cannot be deleted. Turn them off instead.');
  const ref=db().collection('settings').doc('webviews'); const snap=await ref.get(); const pages=snap.exists?(snap.data().pages||{}):{};
  if(!pages[key]) return {ok:true};
  await ref.set({pages:{[key]:admin.firestore.FieldValue.delete()},updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'webview_page_archived',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{key,before:pages[key]}});
  return {ok:true};
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
  const allowedFields=['adsEnabled','bannerAdsEnabled','nativeAdsEnabled','interstitialAdsEnabled','directAdsEnabled','admobEnabled','admobBannerEnabled'];
  const changes=request.data?.changes||{}; const clean={};
  for(const [k,v] of Object.entries(changes)){ if(!allowedFields.includes(k)) throw new HttpsError('invalid-argument',`Unknown ads control: ${k}`); if(typeof v!=='boolean') throw new HttpsError('invalid-argument',`${k} must be boolean.`); clean[k]=v; }
  if(!Object.keys(clean).length) throw new HttpsError('invalid-argument','No ad controls supplied.');
  await db().collection('ad_settings').doc('general').set({...clean,updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'google_ads_controls_changed',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{changes:clean}});
  return {ok:true};
});
function cleanAdPlacementControls(data) {
  const raw = data && typeof data === 'object' ? data : {};
  const clean = {};
  if (typeof raw.webviewBannerEnabled === 'boolean') clean.webviewBannerEnabled = raw.webviewBannerEnabled;
  if (raw.admobInterstitialUnitId !== undefined) {
    const unit = String(raw.admobInterstitialUnitId || '').trim();
    if (unit && !/^ca-app-pub-\d{16}\/\d{10}$/.test(unit)) throw new HttpsError('invalid-argument','Invalid AdMob interstitial unit id.');
    clean.admobInterstitialUnitId = unit;
  }
  if (typeof raw.webviewInterstitialEnabled === 'boolean') clean.webviewInterstitialEnabled = raw.webviewInterstitialEnabled;
  if (raw.webviewBannerPosition === 'top' || raw.webviewBannerPosition === 'bottom') clean.webviewBannerPosition = raw.webviewBannerPosition;
  if (Number.isFinite(Number(raw.interstitialCooldownSeconds))) clean.interstitialCooldownSeconds = Math.max(0, Math.min(86400, Math.floor(Number(raw.interstitialCooldownSeconds))));
  for (const field of ['screenBanners','webviewBanners']) {
    if (raw[field] == null) continue;
    if (typeof raw[field] !== 'object' || Array.isArray(raw[field])) throw new HttpsError('invalid-argument', field + ' must be an object.');
    const out = {};
    for (const [key, value] of Object.entries(raw[field]).slice(0, 500)) {
      if (field === 'screenBanners' && !AD_CONTROL_SCREEN_KEYS.includes(key)) continue;
      if (field === 'webviewBanners' && (!key || String(key).length > 64)) continue;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      if (typeof value.enabled !== 'boolean') throw new HttpsError('invalid-argument', field + '.' + key + '.enabled must be boolean.');
      if (value.position !== 'top' && value.position !== 'bottom') throw new HttpsError('invalid-argument', field + '.' + key + '.position must be top or bottom.');
      out[key] = {enabled:value.enabled,position:value.position};
    }
    clean[field] = out;
  }
  if (raw.webviewInterstitials != null) {
    if (typeof raw.webviewInterstitials !== 'object' || Array.isArray(raw.webviewInterstitials)) throw new HttpsError('invalid-argument','webviewInterstitials must be an object.');
    const out = {};
    for (const [key,value] of Object.entries(raw.webviewInterstitials).slice(0,500)) {
      if (!key || String(key).length > 64) continue;
      if (typeof value !== 'boolean') throw new HttpsError('invalid-argument','webviewInterstitials.' + key + ' must be boolean.');
      out[key]=value;
    }
    clean.webviewInterstitials=out;
  }
  if (!Object.keys(clean).length) throw new HttpsError('invalid-argument','No placement controls supplied.');
  return clean;
}

exports.updateAdPlacementControls = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request);
  const changes=cleanAdPlacementControls(request.data && request.data.changes);
  const ref=db().collection('ad_settings').doc('general');
  const snap=await ref.get();
  const before=snap.exists ? (snap.data().placementControls || {}) : {};
  const next={...before,...changes};
  if (changes.screenBanners) next.screenBanners={...(before.screenBanners||{}),...changes.screenBanners};
  if (changes.webviewBanners) next.webviewBanners={...(before.webviewBanners||{}),...changes.webviewBanners};
  if (changes.webviewInterstitials) next.webviewInterstitials={...(before.webviewInterstitials||{}),...changes.webviewInterstitials};
  await ref.set({placementControls:next,updatedBy:uid,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await logAudit({action:'ad_placement_controls_changed',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{changes}});
  return {ok:true,placementControls:next};
});



function cleanGridMap(value, allowedIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [who, tiles] of Object.entries(value).slice(0, 1000)) {
    if (allowedIds && !allowedIds.has(who)) continue;
    if (!tiles || typeof tiles !== 'object' || Array.isArray(tiles)) continue;
    const clean = {};
    for (const key of GRID_KEYS) if (typeof tiles[key] === 'boolean') clean[key] = tiles[key];
    if (Object.keys(clean).length) out[String(who)] = clean;
  }
  return out;
}
function cleanGridPayload(data) {
  const global = {};
  for (const key of GRID_KEYS) if (typeof data?.global?.[key] === 'boolean') global[key] = data.global[key];
  const roleIds = new Set(ROLES);
  const countryIds = new Set(list(data?.countries, 100, 2).map(x => x.toUpperCase()));
  const userIds = new Set(list(data?.users, 1000, 128));
  return {
    global,
    byRole: cleanGridMap(data?.byRole, roleIds),
    byCountry: cleanGridMap(data?.byCountry, countryIds.size ? countryIds : null),
    byUser: cleanGridMap(data?.byUser, userIds.size ? userIds : null),
  };
}
exports.purgeFlaggedTestTransactions = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid}=await requireSuperadmin(request);
  if (String(request.data?.confirmation||'') !== 'DELETE TEST TRANSACTIONS') throw new HttpsError('failed-precondition','Type DELETE TEST TRANSACTIONS to confirm.');
  const dbRef=db(); let deleted=0;
  for (const field of ['isTest','testMode']) {
    while (true) {
      const snap=await dbRef.collection('transactions').where(field,'==',true).limit(400).get();
      if (snap.empty) break;
      const batch=dbRef.batch(); snap.docs.forEach(doc=>batch.delete(doc.ref)); await batch.commit(); deleted += snap.size;
      if (snap.size < 400) break;
    }
  }
  await logAudit({action:'purge_flagged_test_transactions',targetUid:null,performedBy:uid,performedByRole:'superadmin',details:{deleted,matchFields:['isTest','testMode']}});
  return {ok:true,deleted};
});

exports.getGridManagementAdmin = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  await requireSuperadmin(request);
  const snap = await db().collection('settings').doc('gridManagement').get();
  const raw = snap.exists ? snap.data() || {} : {};
  const global = {};
  for (const item of GRID_DEFS) global[item.key] = typeof raw[item.key] === 'boolean' ? raw[item.key] : item.key !== 'rechargePin';
  return { defs: GRID_DEFS, global, byRole: raw.byRole || {}, byCountry: raw.byCountry || {}, byUser: raw.byUser || {} };
});
exports.updateGridManagement = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const {uid} = await requireSuperadmin(request);
  const payload = request.data || {};
  const clean = cleanGridPayload(payload);
  const docData = { ...clean.global, byRole: clean.byRole, byCountry: clean.byCountry, byUser: clean.byUser, updatedBy: uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  const ref = db().collection('settings').doc('gridManagement');
  const old = await ref.get();
  await ref.set(docData, { merge: true });
  await logAudit({ action:'grid_management_changed', targetUid:null, performedBy:uid, performedByRole:'superadmin', details:{ before:old.exists ? old.data() : null, after:clean } });
  return { ok:true, ...clean };
});

module.exports.allowed = allowed;
