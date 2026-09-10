// MySheba push notifications - the SERVER half.
//
// The app's client side (src/notifications/pushService.js) only registers a
// device for push and saves the resulting Expo push token onto
// users/{uid}.pushToken. Actually *sending* a notification happens here,
// triggered by the same Firestore writes the app already makes (creating a
// transaction, a dealer accepting an order, an admin approving a top-up,
// etc) - no changes needed anywhere else for this to work once deployed.
//
// Requires Node 18+ (for global fetch) - see package.json engines.
//
// Deploy with: firebase deploy --only functions
// (requires `firebase login` + `firebase use satulink-solutions` first -
// see functions/README.md)

const { onDocumentCreated, onDocumentUpdated, onDocumentWritten, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const progressionService = require('./progressionService');

// Service labels that count toward Tier progress when their transaction
// reaches 'completed' - see onTransactionUpdated below. Kept as an
// explicit allowlist (not "every service") so a future new chargeable
// service doesn't silently start granting Tier progress until someone
// decides it should.
const TIER_QUALIFYING_SERVICES = ['Recharge', 'Internet', 'Mobile Banking', 'Remittance'];

exports.generateAgoraToken = require('./agoraToken').generateAgoraToken;
exports.manageUser = require('./userManagement').manageUser;
exports.searchUsers = require('./userSearch').searchUsers;
exports.getUserByUid = require('./userSearch').getUserByUid;
exports.matchContactsByPhone = require('./matchContactsByPhone').matchContactsByPhone;
exports.registerWithDealerCode = require('./customerRegistration').registerWithDealerCode;
exports.resetPassword = require('./passwordReset').resetPassword;
exports.ensureGoogleProfile = require('./googleAuth').ensureGoogleProfile;
exports.startAccountMerge = require('./accountMergeService').startAccountMerge;
exports.confirmAccountMerge = require('./accountMergeService').confirmAccountMerge;
exports.ensureUserId = require('./ensureUserId').ensureUserId;
exports.checkDeviceSession = require('./deviceSessionService').checkDeviceSession;
exports.confirmDeviceSwitch = require('./deviceSessionService').confirmDeviceSwitch;
exports.clearActiveSession = require('./deviceSessionService').clearActiveSession;
exports.listTrustedDevices = require('./deviceSessionService').listTrustedDevices;
exports.revokeTrustedDevice = require('./deviceSessionService').revokeTrustedDevice;
exports.sendAnnouncement = require('./announcements').sendAnnouncement;
exports.approveTopup = require('./walletService').approveTopup;
exports.rejectTopup = require('./walletService').rejectTopup;
exports.createSelfTopup = require('./walletService').createSelfTopup;
exports.transferPoints = require('./walletService').transferPoints;
exports.chargeWallet = require('./walletService').chargeWallet;
exports.boostListing = require('./walletService').boostListing;
exports.chargeRecharge = require('./walletService').chargeRecharge;
exports.chargeInternetPackage = require('./walletService').chargeInternetPackage;
exports.rejectRechargeTransaction = require('./walletService').rejectRechargeTransaction;
exports.rejectInternetPackageTransaction = require('./walletService').rejectInternetPackageTransaction;
exports.chargeMobileBanking = require('./walletService').chargeMobileBanking;
exports.chargeRemittance = require('./walletService').chargeRemittance;
exports.rejectMobileBankingTransaction = require('./walletService').rejectMobileBankingTransaction;
exports.rejectRemittanceTransaction = require('./walletService').rejectRemittanceTransaction;
exports.chargeGamePoints = require('./walletService').chargeGamePoints;
exports.withdrawGamePoints = require('./walletService').withdrawGamePoints;
exports.transferGamePoints = require('./walletService').transferGamePoints;
exports.giftGamePoints = require('./walletService').giftGamePoints;
exports.approveVerification = require('./verificationService').approveVerification;
exports.rejectVerification = require('./verificationService').rejectVerification;
exports.setBusinessProfileStatus = require('./businessProfileService').setBusinessProfileStatus;
exports.setupSecurityPin = require('./securityPinService').setupSecurityPin;
exports.verifySecurityPin = require('./securityPinService').verifySecurityPin;
exports.resetSecurityPin = require('./securityPinService').resetSecurityPin;
exports.listingPreview = require('./listingPreview').listingPreview;
exports.updateAdSettings = require('./adControlsService').updateAdSettings;
exports.updateAdFeatureControl = require('./adControlsService').updateAdFeatureControl;
exports.bulkUpdateAdFeatureControls = require('./adControlsService').bulkUpdateAdFeatureControls;
exports.deleteAdCreative = require('./adCreativeService').deleteAdCreative;
// PHASE 7 - AD TRACKING: the only writer of advertisements/{adId}.
// totalImpressions/totalClicks - see functions/adTrackingService.js's
// own header comment for the trust model this enforces.
exports.onAdImpressionCreated = require('./adTrackingService').onAdImpressionCreated;
exports.onAdClickCreated = require('./adTrackingService').onAdClickCreated;

// PHASE 10 - Advertising Packages and Payments. The only write path to
// ad_payments/{paymentId} (firestore.rules: allow write: if false) -
// see functions/adPaymentService.js's own header comment.
exports.createAdPayment = require('./adPaymentService').createAdPayment;
exports.updateAdPaymentStatus = require('./adPaymentService').updateAdPaymentStatus;

exports.listApiProviders = require('./apiProviderService').listApiProviders;
exports.saveApiProvider = require('./apiProviderService').saveApiProvider;
exports.deleteApiProvider = require('./apiProviderService').deleteApiProvider;
exports.getServiceApiSettings = require('./apiProviderService').getServiceApiSettings;
exports.saveServiceApiSettings = require('./apiProviderService').saveServiceApiSettings;

admin.initializeApp();
const db = admin.firestore();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const STAFF_ROLES = ['dealer', 'reseller', 'admin', 'superadmin'];
const ADMIN_ROLES = ['admin', 'superadmin'];

// ---------------------------------------------------------------------------
// Expo push helpers
// ---------------------------------------------------------------------------

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Sends a batch of Expo push messages (each: {to, title, body, data}), chunked into groups of 100 per Expo's guidance. */
async function sendExpoPush(messages) {
  const valid = messages.filter((m) => m && m.to);
  if (valid.length === 0) return;

  for (const batch of chunk(valid, 100)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch.map((m) => ({ sound: 'default', ...m }))),
      });
      if (!res.ok) console.error('Expo push HTTP error', res.status, await res.text());
    } catch (e) { console.error('Expo push send failed', e); }
  }
}

async function sendCallDataMessage(uid, data) {
  if (!uid) return;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return;
  const { fcmToken, notifPrefs, callSettings } = snap.data();
  if (!fcmToken || (notifPrefs && notifPrefs.pushEnabled === false) || (callSettings && callSettings.notificationsEnabled === false)) return;
  try { await admin.messaging().send({ token: fcmToken, data, android: { priority: 'high' } }); }
  catch (e) { console.error('Call data message send failed', e); }
}

async function getUserPushTarget(uid) {
  if (!uid) return null;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data.pushToken || (data.notifPrefs && data.notifPrefs.pushEnabled === false)) return null;
  return data.pushToken;
}
async function notifyUser(uid, title, body, data, extra) {
  const token = await getUserPushTarget(uid);
  if (!token) return;
  await sendExpoPush([{ to: token, title, body, data: data || {}, ...(extra || {}) }]);
}
async function notifyRoles(roles, title, body, data) {
  const snap = await db.collection('users').where('role', 'in', roles).get();
  const messages = [];
  snap.forEach((doc) => {
    const u = doc.data();
    if (!u.pushToken || (u.notifPrefs && u.notifPrefs.pushEnabled === false)) return;
    messages.push({ to: u.pushToken, title, body, data: data || {} });
  });
  await sendExpoPush(messages);
}

exports.onTransactionCreated = onDocumentCreated('transactions/{id}', async (event) => {
  const tx = event.data.data();
  const body = `${tx.service} - MYR ${Number(tx.total || 0).toFixed(2)}`;
  if (tx.resellerId) await notifyUser(tx.resellerId, '🆕 New order', body, { type: 'transaction', id: event.params.id });
  else await notifyRoles(['dealer'], '🆕 New order', body, { type: 'transaction', id: event.params.id });
});
exports.onTransactionUpdated = onDocumentUpdated('transactions/{id}', async (event) => {
  const before = event.data.before.data(), after = event.data.after.data();
  if (!before.dealerId && after.dealerId) await notifyUser(after.dealerId, '🆕 New order', `${after.service} - MYR ${Number(after.total || 0).toFixed(2)}`, { type: 'transaction', id: event.params.id });
  if (before.status !== 'completed' && after.status === 'completed' && TIER_QUALIFYING_SERVICES.includes(after.service)) await progressionService.incrementTierPoints(after.customerId);
  if (before.status === after.status && before.rejected === after.rejected) return;
  let title = 'Order update', body = `${after.service} is now ${after.status}.`;
  if (after.rejected) { title='❌ Order rejected'; body=`${after.service}: ${after.rejectReason || 'Rejected by dealer.'}`; }
  else if (after.status === 'processing') { title='🔄 Order accepted'; body=`${after.service} is being processed.`; }
  else if (after.status === 'completed') { title='✅ Order completed'; body=after.pin ? `${after.service} is ready. Collection PIN: ${after.pin}` : `${after.service} has been completed.`; }
  await notifyUser(after.customerId, title, body, { type:'transaction', id:event.params.id });
});
exports.onGamePointsLedgerCreated = onDocumentCreated('gamePointsLedger/{id}', async (event) => { const entry=event.data.data(); if(entry.reason==='entry_fee') await progressionService.incrementLevelPoints(entry.uid); });
exports.onTopupCreated = onDocumentCreated('topups/{id}', async (event) => { const tp=event.data.data(); await notifyRoles(ADMIN_ROLES,'💰 New top-up request',`${tp.userName || 'A user'} requested MYR ${Number(tp.amount||0).toFixed(2)}`,{type:'topup',id:event.params.id}); });
exports.onTopupUpdated = onDocumentUpdated('topups/{id}', async (event) => { const before=event.data.before.data(),after=event.data.after.data(); if(before.status===after.status)return; if(after.status==='approved') await notifyUser(after.userId,'✅ Top-up approved',`MYR ${Number(after.amount||0).toFixed(2)} (${Number(after.points||0).toFixed(2)} pts) has been credited to your wallet.`,{type:'topup',id:event.params.id}); else if(after.status==='rejected') await notifyUser(after.userId,'❌ Top-up rejected',after.rejectReason||'Your top-up request was rejected.',{type:'topup',id:event.params.id}); });
exports.onSupportTicketCreated = onDocumentCreated('supportTickets/{id}', async (event) => { const t=event.data.data(); await notifyRoles(ADMIN_ROLES,'🎧 New support request',`${t.userName||'A user'}: ${t.subject||'Support request'}`,{type:'supportTicket',id:event.params.id}); });
exports.onSupportTicketUpdated = onDocumentUpdated('supportTickets/{id}', async (event) => { const before=event.data.before.data(),after=event.data.after.data(); if(before.status===after.status)return; if(after.status==='in_progress') await notifyUser(after.userId,'🔄 Support request update',`We're looking into "${after.subject||'your request'}".`,{type:'supportTicket',id:event.params.id}); else if(after.status==='resolved') await notifyUser(after.userId,'✅ Support request resolved',after.adminNote||`Your request "${after.subject||''}" has been resolved.`,{type:'supportTicket',id:event.params.id}); });
exports.onInquiryCreated = onDocumentCreated('inquiries/{id}', async (event) => { const i=event.data.data(); await notifyRoles(ADMIN_ROLES,'✈️ New travel inquiry',`${i.type}: ${i.from} → ${i.to} (${i.date})`,{type:'inquiry',id:event.params.id}); });
exports.onInquiryUpdated = onDocumentUpdated('inquiries/{id}', async (event) => { const before=event.data.before.data(),after=event.data.after.data(); if(before.status!=='closed'&&after.status==='closed'&&after.type==='flight'&&after.ticketUrl) await progressionService.incrementTierPoints(after.customerId); if(before.status===after.status)return; if(after.status==='contacted') await notifyUser(after.customerId,'📞 We called about your inquiry',`An agent has reached out about your ${after.type} inquiry.`,{type:'inquiry',id:event.params.id}); else if(after.status==='closed') await notifyUser(after.customerId,'✅ Inquiry closed',`Your ${after.type} inquiry has been closed.`,{type:'inquiry',id:event.params.id}); });
exports.onChatMessageCreated = onDocumentCreated('chats/{chatId}/messages/{messageId}', async (event) => { const msg=event.data.data(),chatId=event.params.chatId,preview=msg.text&&msg.text.length>80?`${msg.text.slice(0,77)}...`:msg.text; await progressionService.incrementLevelPoints(msg.senderId); if(msg.senderRole==='customer') await notifyRoles(STAFF_ROLES,`💬 ${msg.senderName||'Customer'}`,preview||'New message',{type:'chat',chatId}); else await notifyUser(chatId,`💬 ${msg.senderName||'MySheba Support'}`,preview||'New message',{type:'chat',chatId}); });
exports.onDirectChatMessageCreated = onDocumentCreated('directChats/{chatId}/messages/{messageId}', async (event) => { const msg=event.data.data(),chatId=event.params.chatId; const snap=await db.collection('directChats').doc(chatId).get(); if(!snap.exists)return; const p=snap.data().participants||[],recipient=p.find(uid=>uid!==msg.senderId); if(recipient) await notifyUser(recipient,`💬 ${msg.senderName||'New message'}`,msg.text||'New message',{type:'directChat',chatId}); });
exports.onDirectChatReportCreated = onDocumentCreated('directChatReports/{reportId}', async (event) => { const r=event.data.data(); if(r.chatId) await db.collection('directChats').doc(r.chatId).set({underInvestigation:true},{merge:true}); await notifyRoles(ADMIN_ROLES,'🚩 New conversation report',r.reason?`Reported: ${r.reason}`:'A direct chat conversation was reported.',{type:'directChatReport',id:event.params.reportId}); });
exports.onDirectChatReportUpdated = onDocumentUpdated('directChatReports/{reportId}', async (event) => { const before=event.data.before.data(),after=event.data.after.data(); if(before.status===after.status||!after.chatId)return; if(after.status==='open'){await db.collection('directChats').doc(after.chatId).set({underInvestigation:true},{merge:true});return;} if(after.status==='resolved'){const open=await db.collection('directChatReports').where('chatId','==',after.chatId).where('status','==','open').limit(1).get(); if(open.empty) await db.collection('directChats').doc(after.chatId).set({underInvestigation:false},{merge:true});} });
exports.onGroupChatMessageCreated = onDocumentCreated('groupChats/{groupId}/messages/{messageId}', async (event) => { const msg=event.data.data(),groupId=event.params.groupId,snap=await db.collection('groupChats').doc(groupId).get(); if(!snap.exists)return; const g=snap.data(),recipients=(g.memberUids||[]).filter(uid=>uid!==msg.senderId),tokens=[]; for(const uid of recipients){const t=await getUserPushTarget(uid);if(t)tokens.push(t);} await sendExpoPush(tokens.map(to=>({to,title:`💬 ${g.name||'Group Chat'}`,body:`${msg.senderName||'Someone'}: ${msg.text||'New message'}`,data:{type:'groupChat',groupId}}))); });
exports.onRoomChatDeleted = onDocumentDeleted('roomChats/{roomId}', async (event) => { await admin.firestore().recursiveDelete(db.collection('roomChats').doc(event.params.roomId).collection('messages')); });
exports.onGroupChatDeleted = onDocumentDeleted('groupChats/{groupId}', async (event) => { await admin.firestore().recursiveDelete(db.collection('groupChats').doc(event.params.groupId).collection('messages')); });
exports.onCallCreated = onDocumentCreated('calls/{callId}', async (event) => { const call=event.data.data(); if(call.status!=='ringing')return; const kind=call.type==='video'?'📹 Video call':'📞 Voice call',callType=call.type==='video'?'video':'audio'; async function ringOne(uid,name,callerUid,groupId){const snap=await db.collection('users').doc(uid).get(),d=snap.exists?snap.data():{};if(d.callSettings&&d.callSettings.notificationsEnabled===false)return;await Promise.all([notifyUser(uid,kind,`${name||'Someone'} is calling you`,{type:'call',callId:event.params.callId},{priority:'high',channelId:'calls'}),sendCallDataMessage(uid,{type:'call',callId:event.params.callId,callerName:name||'Someone',callType,...(callerUid?{callerUid}:{}),...(groupId?{groupId}:{})})]);} if(call.isGroup) await Promise.all((call.ringingUids||[]).map(uid=>ringOne(uid,call.callerName,null,call.groupId))); else await ringOne(call.calleeUid,call.callerName,call.callerUid,null); });
exports.onCallUpdated = onDocumentUpdated('calls/{callId}', async (event) => { const before=event.data.before.data(),after=event.data.after.data(); if(!after.isGroup||after.status==='ended')return; if((after.ringingUids||[]).length||(after.activeUids||[]).length)return; if(!(before.ringingUids||[]).length&&!(before.activeUids||[]).length)return; await event.data.after.ref.update({status:'ended',updatedAt:admin.firestore.FieldValue.serverTimestamp()}); });
const MARKETPLACE_REPORT_HIDE_THRESHOLD=5;
exports.onMarketplaceReportCreated=onDocumentCreated('marketplaceReports/{reportId}',async(event)=>{const r=event.data.data();if(!r.listingId)return;const ref=db.collection('marketplaceListings').doc(r.listingId),snap=await ref.get();if(!snap.exists)return;const d=snap.data(),count=(d.reportCount||0)+1,patch={reportCount:admin.firestore.FieldValue.increment(1)};if(count>=MARKETPLACE_REPORT_HIDE_THRESHOLD&&d.status!=='hidden')patch.status='hidden';await ref.update(patch);await notifyRoles(ADMIN_ROLES,'🚩 New marketplace report',`${r.reason||'Reported'}: "${d.title||'A listing'}"`,{type:'marketplaceReport',listingId:r.listingId});});
const ACCOMMODATION_REPORT_HIDE_THRESHOLD=5;
exports.onAccommodationReportCreated=onDocumentCreated('propertyReports/{reportId}',async(event)=>{const r=event.data.data();if(!r.propertyId)return;const ref=db.collection('properties').doc(r.propertyId),snap=await ref.get();if(!snap.exists)return;const d=snap.data(),count=(d.reportCount||0)+1,patch={reportCount:admin.firestore.FieldValue.increment(1)};if(count>=ACCOMMODATION_REPORT_HIDE_THRESHOLD&&d.status!=='hidden')patch.status='hidden';await ref.update(patch);await notifyRoles(ADMIN_ROLES,'🚩 New property report',`${r.reason||'Reported'}: "${d.title||'A property'}"`,{type:'propertyReport',propertyId:r.propertyId});});
const ROOMMATE_REPORT_HIDE_THRESHOLD=5;
exports.onRoommateReportCreated=onDocumentCreated('roommateReports/{reportId}',async(event)=>{const r=event.data.data();if(!r.requestId)return;const ref=db.collection('roommateRequests').doc(r.requestId),snap=await ref.get();if(!snap.exists)return;const d=snap.data(),count=(d.reportCount||0)+1,patch={reportCount:admin.firestore.FieldValue.increment(1)};if(count>=ROOMMATE_REPORT_HIDE_THRESHOLD&&d.status!=='hidden')patch.status='hidden';await ref.update(patch);await notifyRoles(ADMIN_ROLES,'🚩 New roommate request report',`${r.reason||'Reported'}: request by "${d.posterName||'a user'}"`,{type:'roommateReport',requestId:r.requestId});});
exports.onServiceRequestCreated=onDocumentCreated('serviceRequests/{id}',async(event)=>{const r=event.data.data();await notifyUser(r.providerOwnerId,'🧰 New service inquiry',`${r.customerName||'A customer'} is interested in "${r.providerName||'your service'}"`,{type:'serviceRequest',id:event.params.id});});
exports.onServiceRequestUpdated=onDocumentUpdated('serviceRequests/{id}',async(event)=>{const before=event.data.before.data(),after=event.data.after.data();if(before.status===after.status)return;if(after.status==='contacted')await notifyUser(after.customerId,'📞 The provider reached out',`${after.providerName||'The provider'} responded to your service request.`,{type:'serviceRequest',id:event.params.id});else if(after.status==='closed')await notifyUser(after.customerId,'✅ Service request closed',`Your request to "${after.providerName||'the provider'}" has been closed.`,{type:'serviceRequest',id:event.params.id});});
const SERVICE_PROVIDER_REPORT_HIDE_THRESHOLD=5;
exports.onServiceProviderReportCreated=onDocumentCreated('serviceProviderReports/{reportId}',async(event)=>{const r=event.data.data();if(!r.providerId)return;const ref=db.collection('serviceProviders').doc(r.providerId),snap=await ref.get();if(!snap.exists)return;const d=snap.data(),count=(d.reportCount||0)+1,patch={reportCount:admin.firestore.FieldValue.increment(1)};if(count>=SERVICE_PROVIDER_REPORT_HIDE_THRESHOLD&&d.status!=='hidden')patch.status='hidden';await ref.update(patch);await notifyRoles(ADMIN_ROLES,'🚩 New service listing report',`${r.reason||'Reported'}: "${d.name||'A service'}"`,{type:'serviceProviderReport',providerId:r.providerId});});
const COMMUNITY_REPORT_HIDE_THRESHOLD=5;
exports.onCommunityReportCreated=onDocumentCreated('communityReports/{reportId}',async(event)=>{const r=event.data.data();if(!r.postId)return;const ref=db.collection('communityPosts').doc(r.postId),snap=await ref.get();if(!snap.exists)return;const d=snap.data(),count=(d.reportCount||0)+1,patch={reportCount:admin.firestore.FieldValue.increment(1)},emergency=d.type==='emergency';if(count>=COMMUNITY_REPORT_HIDE_THRESHOLD&&!emergency&&d.status!=='hidden')patch.status='hidden';await ref.update(patch);await notifyRoles(ADMIN_ROLES,emergency?'🚨 Emergency post report':'🚩 New community post report',`${r.reason||'Reported'}: "${d.title||'A post'}"`,{type:'communityReport',postId:r.postId});});
const SOCIAL_REPORT_HIDE_THRESHOLD=5;
exports.onSocialReportCreated=onDocumentCreated('socialReports/{reportId}',async(event)=>{const r=event.data.data();if(!r.postId)return;const ref=db.collection('socialPosts').doc(r.postId),snap=await ref.get();if(!snap.exists)return;const d=snap.data(),count=(d.reportCount||0)+1,patch={reportCount:admin.firestore.FieldValue.increment(1)};if(count>=SOCIAL_REPORT_HIDE_THRESHOLD&&d.status!=='hidden')patch.status='hidden';await ref.update(patch);await notifyRoles(ADMIN_ROLES,'🚩 New social post report',`${r.reason||'Reported'}: a social post`,{type:'socialReport',postId:r.postId});});
exports.onBusinessProfileWritten=onDocumentWritten('businessProfiles/{uid}',async(event)=>{const before=event.data.before.exists?event.data.before.data():null,after=event.data.after.exists?event.data.after.data():null;if(!after)return;const was=!!(before&&before.isBusinessProfile);if(!after.isBusinessProfile||was)return;await notifyUser(event.params.uid,'🏢 You’ve been upgraded to a Business Profile!','Add your business name, logo, and description from your Profile to start standing out across the Marketplace.',{type:'businessProfile'});});
