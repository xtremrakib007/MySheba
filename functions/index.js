// MySheba push notifications - the SERVER half.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const progressionService = require('./progressionService');
const TIER_QUALIFYING_SERVICES = ['Recharge', 'Internet', 'Mobile Banking', 'Remittance'];

exports.manageUser = require('./userManagement').manageUser;
exports.searchUsers = require('./userSearch').searchUsers;
exports.getUserByUid = require('./userSearch').getUserByUid;
exports.matchContactsByPhone = require('./matchContactsByPhone').matchContactsByPhone;
exports.registerWithDealerCode = require('./customerRegistration').registerWithDealerCode;
exports.registerCustomer = require('./customerRegistration').registerCustomer;
exports.resetPassword = require('./passwordReset').resetPassword;
exports.sendPasswordResetEmailVerification = require('./passwordResetEmail').sendPasswordResetEmailVerification;
exports.verifyPasswordResetEmailOtp = require('./passwordResetEmail').verifyPasswordResetEmailOtp;
exports.ensureGoogleProfile = require('./googleAuth').ensureGoogleProfile;
exports.signInExistingGoogleAccount = require('./googleAuth').signInExistingGoogleAccount;
exports.startAccountMerge = require('./accountMergeService').startAccountMerge;
exports.confirmAccountMerge = require('./accountMergeService').confirmAccountMerge;
exports.ensureUserId = require('./ensureUserId').ensureUserId;
exports.checkDeviceSession = require('./deviceSessionService').checkDeviceSession;
exports.confirmDeviceSwitch = require('./deviceSessionService').confirmDeviceSwitch;
exports.clearActiveSession = require('./deviceSessionService').clearActiveSession;
exports.listTrustedDevices = require('./deviceSessionService').listTrustedDevices;
exports.revokeTrustedDevice = require('./deviceSessionService').revokeTrustedDevice;
exports.validateActiveSession = require('./validateActiveSessionService').validateActiveSession;
exports.registerPushToken = require('./pushTokenService').registerPushToken;
exports.sendDeviceVerification = require('./deviceVerificationService').sendDeviceVerification;
exports.confirmDeviceEmailOtp = require('./deviceVerificationService').confirmDeviceEmailOtp;
exports.cleanupExpiredVerificationArtifacts = require('./verificationCleanup').cleanupExpiredVerificationArtifacts;
exports.sendAnnouncement = require('./announcements').sendAnnouncement;
exports.createSupportTicket = require('./supportTicketService').createSupportTicket;
exports.createInquiry = require('./inquiryService').createInquiry;

// Dealer/reseller/admin transaction workflow. transactionService.js was
// never wired in here, so acceptTransaction and completeTransaction have
// never been deployed even though DealerHomeScreen, ResellerHomeScreen and
// AdminHomeScreen all call them - every accept/complete returned
// not-found. approveTransaction is exported alongside them for
// completeness; no screen calls it yet.
exports.approveTransaction = require('./transactionService').approveTransaction;
exports.acceptTransaction = require('./transactionService').acceptTransaction;
exports.completeTransaction = require('./transactionService').completeTransaction;

const secureTransfer = require('./secureTransfer');
const secureWalletTransfer = require('./secureWalletTransfer');
const secureWalletMutations = require('./secureWalletMutations');
const secureWalletCharge = require('./secureWalletCharge');
const secureTopupReview = require('./secureTopupReview');
const secureTransactionReview = require('./secureTransactionReview');
const chargeGuards = require('./chargeGuards');
exports.approveTopup = secureTopupReview.approveTopup;
exports.rejectTopup = secureTopupReview.rejectTopup;
exports.createSelfTopup = secureWalletMutations.createSelfTopup;
exports.submitTopupRequest = require('./topupSubmissionService').submitTopupRequest;
exports.adminTopUpPoints = require('./adminTopUpService').adminTopUpPoints;
exports.transferPoints = secureTransfer.transferPoints;
exports.findWalletRecipient = require('./walletTransferService').findWalletRecipient;
exports.walletTransfer = secureWalletTransfer.walletTransfer;
exports.listWalletTransfers = secureWalletTransfer.listWalletTransfers;
exports.createDiditKycSession = require('./diditKycService').createDiditKycSession;
exports.diditKycWebhook = require('./diditKycService').diditKycWebhook;
exports.chargeWallet = secureWalletCharge.chargeWallet;
exports.chargeRecharge = chargeGuards.chargeRecharge;
exports.chargeInternetPackage = chargeGuards.chargeInternetPackage;
exports.chargeMobileBanking = chargeGuards.chargeMobileBanking;
exports.chargeRemittance = chargeGuards.chargeRemittance;
exports.rejectRechargeTransaction = secureTransactionReview.rejectRechargeTransaction;
exports.rejectInternetPackageTransaction = secureTransactionReview.rejectInternetPackageTransaction;
exports.rejectMobileBankingTransaction = secureTransactionReview.rejectMobileBankingTransaction;
exports.rejectRemittanceTransaction = secureTransactionReview.rejectRemittanceTransaction;
exports.approveVerification = require('./verificationService').approveVerification;
exports.rejectVerification = require('./verificationService').rejectVerification;
exports.setBusinessProfileStatus = require('./businessProfileService').setBusinessProfileStatus;
exports.setupSecurityPin = require('./securityPinService').setupSecurityPin;
exports.verifySecurityPin = require('./securityPinService').verifySecurityPin;
exports.resetSecurityPin = require('./securityPinService').resetSecurityPin;
exports.updateAdSettings = require('./adControlsService').updateAdSettings;
exports.updateAdFeatureControl = require('./adControlsService').updateAdFeatureControl;
exports.bulkUpdateAdFeatureControls = require('./adControlsService').bulkUpdateAdFeatureControls;
exports.deleteAdCreative = require('./adCreativeService').deleteAdCreative;
exports.onAdImpressionCreated = require('./adTrackingService').onAdImpressionCreated;
exports.onAdClickCreated = require('./adTrackingService').onAdClickCreated;
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
const ADMIN_ROLES = ['admin', 'superadmin'];
function chunk(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
function isActiveProfile(profile) { return !!profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto; }
function isValidExpoToken(token) { return typeof token === 'string' && token.length <= 256 && /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token); }
async function sendExpoPush(messages) { const valid = messages.filter(m => m && isValidExpoToken(m.to)); for (const batch of chunk(valid, 100)) { try { const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(batch.map(m => ({ sound: 'default', ...m }))) }); if (!res.ok) console.error('Expo push HTTP error', res.status, await res.text()); } catch (e) { console.error('Expo push send failed', e); } } }
async function getUserPushTarget(uid) { if (!uid) return null; const snap = await db.collection('users').doc(uid).get(); if (!snap.exists) return null; const d = snap.data(); if (!isActiveProfile(d) || !isValidExpoToken(d.pushToken) || (d.notifPrefs && d.notifPrefs.pushEnabled === false)) return null; return d.pushToken; }
async function notifyUser(uid, title, body, data, extra) { const token = await getUserPushTarget(uid); if (token) await sendExpoPush([{ to: token, title, body, data: data || {}, ...(extra || {}) }]); }
async function notifyRoles(roles, title, body, data) { const snap = await db.collection('users').where('role', 'in', roles).get(); const messages = []; snap.forEach(doc => { const u = doc.data(); if (isActiveProfile(u) && isValidExpoToken(u.pushToken) && !(u.notifPrefs && u.notifPrefs.pushEnabled === false)) messages.push({ to: u.pushToken, title, body, data: data || {} }); }); await sendExpoPush(messages); }
exports.onTransactionCreated = onDocumentCreated('transactions/{id}', async event => { const tx = event.data.data(); if (tx.resellerId) await notifyUser(tx.resellerId, '🆕 New order', 'A new order is waiting for processing.', { type: 'transaction', id: event.params.id }); else await notifyRoles(['dealer'], '🆕 New order', 'A new order is waiting for processing.', { type: 'transaction', id: event.params.id }); });
exports.onTransactionUpdated = onDocumentUpdated('transactions/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (!b.dealerId && a.dealerId) await notifyUser(a.dealerId, '🆕 New order', 'A new order is waiting for processing.', { type: 'transaction', id: event.params.id }); if (b.status !== 'completed' && a.status === 'completed' && TIER_QUALIFYING_SERVICES.includes(a.service)) await progressionService.incrementTierPoints(a.customerId); if (b.status === a.status && b.rejected === a.rejected) return; let title = 'Order update', body = 'Your order status has changed.'; if (a.rejected) { title = '❌ Order rejected'; body = 'Your order was rejected. Open MySheba to view the details.'; } else if (a.status === 'processing') { title = '🔄 Order accepted'; body = 'Your order is being processed.'; } else if (a.status === 'completed') { title = '✅ Order completed'; body = 'Your order has been completed.'; } await notifyUser(a.customerId, title, body, { type: 'transaction', id: event.params.id }); });
exports.onTopupCreated = onDocumentCreated('topups/{id}', async event => { await notifyRoles(ADMIN_ROLES, '💰 New top-up request', 'A new wallet top-up request is waiting for review.', { type: 'topup', id: event.params.id }); });
exports.onTopupUpdated = onDocumentUpdated('topups/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (b.status === a.status) return; if (a.status === 'approved') await notifyUser(a.userId, '✅ Top-up approved', 'Your wallet top-up has been approved and credited.', { type: 'topup', id: event.params.id }); else if (a.status === 'rejected') await notifyUser(a.userId, '❌ Top-up rejected', 'Your wallet top-up request was rejected. Open MySheba to view the details.', { type: 'topup', id: event.params.id }); });
exports.onSupportTicketCreated = onDocumentCreated('supportTickets/{id}', async event => { await notifyRoles(ADMIN_ROLES, '🎧 New support request', 'A new support request is waiting for review.', { type: 'supportTicket', id: event.params.id }); });
exports.onSupportTicketUpdated = onDocumentUpdated('supportTickets/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (b.status === a.status) return; if (a.status === 'in_progress') await notifyUser(a.userId, '🔄 Support request update', 'Your support request is being reviewed.', { type: 'supportTicket', id: event.params.id }); else if (a.status === 'resolved') await notifyUser(a.userId, '✅ Support request resolved', 'Your support request has been resolved. Open MySheba to view the details.', { type: 'supportTicket', id: event.params.id }); });
exports.onInquiryCreated = onDocumentCreated('inquiries/{id}', async event => { await notifyRoles(ADMIN_ROLES, '✈️ New travel inquiry', 'A new travel inquiry is waiting for review.', { type: 'inquiry', id: event.params.id }); });
exports.onInquiryUpdated = onDocumentUpdated('inquiries/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (b.status !== 'closed' && a.status === 'closed' && a.type === 'flight' && a.ticketUrl) await progressionService.incrementTierPoints(a.customerId); if (b.status === a.status) return; if (a.status === 'contacted') await notifyUser(a.customerId, '📞 We called about your inquiry', 'An agent has reached out about your inquiry.', { type: 'inquiry', id: event.params.id }); else if (a.status === 'closed') await notifyUser(a.customerId, '✅ Inquiry closed', 'Your inquiry has been closed.', { type: 'inquiry', id: event.params.id }); });
