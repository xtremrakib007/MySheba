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
exports.sendDeviceVerification = require('./deviceVerificationService').sendDeviceVerification;
exports.confirmDeviceEmailOtp = require('./deviceVerificationService').confirmDeviceEmailOtp;
exports.cleanupExpiredVerificationArtifacts = require('./verificationCleanup').cleanupExpiredVerificationArtifacts;
exports.sendAnnouncement = require('./announcements').sendAnnouncement;
exports.approveTopup = require('./walletService').approveTopup;
exports.rejectTopup = require('./walletService').rejectTopup;
exports.createSelfTopup = require('./walletService').createSelfTopup;
exports.submitTopupRequest = require('./topupSubmissionService').submitTopupRequest;
exports.adminTopUpPoints = require('./adminTopUpService').adminTopUpPoints;
exports.transferPoints = require('./walletService').transferPoints;
exports.findWalletRecipient = require('./walletTransferService').findWalletRecipient;
exports.createDiditKycSession = require('./diditKycService').createDiditKycSession;
exports.diditKycWebhook = require('./diditKycService').diditKycWebhook;
exports.chargeWallet = require('./walletService').chargeWallet;
// Product charges MUST use chargeGuards: it enforces per-user/request
// idempotency and prevents a committed charge being duplicated by a retry.
const chargeGuards = require('./chargeGuards');
exports.chargeRecharge = chargeGuards.chargeRecharge;
exports.chargeInternetPackage = chargeGuards.chargeInternetPackage;
exports.rejectRechargeTransaction = require('./walletService').rejectRechargeTransaction;
exports.rejectInternetPackageTransaction = require('./walletService').rejectInternetPackageTransaction;
exports.chargeMobileBanking = chargeGuards.chargeMobileBanking;
exports.chargeRemittance = chargeGuards.chargeRemittance;
exports.rejectMobileBankingTransaction = require('./walletService').rejectMobileBankingTransaction;
exports.rejectRemittanceTransaction = require('./walletService').rejectRemittanceTransaction;
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
async function sendExpoPush(messages) { const valid = messages.filter(m => m && m.to); for (const batch of chunk(valid, 100)) { try { const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(batch.map(m => ({ sound: 'default', ...m }))) }); if (!res.ok) console.error('Expo push HTTP error', res.status, await res.text()); } catch (e) { console.error('Expo push send failed', e); } } }
async function getUserPushTarget(uid) { if (!uid) return null; const snap = await db.collection('users').doc(uid).get(); if (!snap.exists) return null; const d = snap.data(); if (!d.pushToken || (d.notifPrefs && d.notifPrefs.pushEnabled === false)) return null; return d.pushToken; }
async function notifyUser(uid, title, body, data, extra) { const token = await getUserPushTarget(uid); if (token) await sendExpoPush([{ to: token, title, body, data: data || {}, ...(extra || {}) }]); }
async function notifyRoles(roles, title, body, data) { const snap = await db.collection('users').where('role', 'in', roles).get(); const messages = []; snap.forEach(doc => { const u = doc.data(); if (u.pushToken && !(u.notifPrefs && u.notifPrefs.pushEnabled === false)) messages.push({ to: u.pushToken, title, body, data: data || {} }); }); await sendExpoPush(messages); }
exports.onTransactionCreated = onDocumentCreated('transactions/{id}', async event => { const tx = event.data.data(); const body = `${tx.service} - MYR ${Number(tx.total || 0).toFixed(2)}`; if (tx.resellerId) await notifyUser(tx.resellerId, '🆕 New order', body, { type: 'transaction', id: event.params.id }); else await notifyRoles(['dealer'], '🆕 New order', body, { type: 'transaction', id: event.params.id }); });
exports.onTransactionUpdated = onDocumentUpdated('transactions/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (!b.dealerId && a.dealerId) await notifyUser(a.dealerId, '🆕 New order', `${a.service} - MYR ${Number(a.total || 0).toFixed(2)}`, { type: 'transaction', id: event.params.id }); if (b.status !== 'completed' && a.status === 'completed' && TIER_QUALIFYING_SERVICES.includes(a.service)) await progressionService.incrementTierPoints(a.customerId); if (b.status === a.status && b.rejected === a.rejected) return; let title = 'Order update', body = `${a.service} is now ${a.status}.`; if (a.rejected) { title = '❌ Order rejected'; body = `${a.service}: ${a.rejectReason || 'Rejected by dealer.'}`; } else if (a.status === 'processing') { title = '🔄 Order accepted'; body = `${a.service} is being processed.`; } else if (a.status === 'completed') { title = '✅ Order completed'; body = `${a.service} has been completed.`; } await notifyUser(a.customerId, title, body, { type: 'transaction', id: event.params.id }); });
exports.onTopupCreated = onDocumentCreated('topups/{id}', async event => { const t = event.data.data(); await notifyRoles(ADMIN_ROLES, '💰 New top-up request', `${t.userName || 'A user'} requested MYR ${Number(t.amount || 0).toFixed(2)}`, { type: 'topup', id: event.params.id }); });
exports.onTopupUpdated = onDocumentUpdated('topups/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (b.status === a.status) return; if (a.status === 'approved') await notifyUser(a.userId, '✅ Top-up approved', `MYR ${Number(a.amount || 0).toFixed(2)} (${Number(a.points || 0).toFixed(2)} pts) has been credited to your wallet.`, { type: 'topup', id: event.params.id }); else if (a.status === 'rejected') await notifyUser(a.userId, '❌ Top-up rejected', a.rejectReason || 'Your top-up request was rejected.', { type: 'topup', id: event.params.id }); });
exports.onSupportTicketCreated = onDocumentCreated('supportTickets/{id}', async event => { const t = event.data.data(); await notifyRoles(ADMIN_ROLES, '🎧 New support request', `${t.userName || 'A user'}: ${t.subject || 'Support request'}`, { type: 'supportTicket', id: event.params.id }); });
exports.onSupportTicketUpdated = onDocumentUpdated('supportTickets/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (b.status === a.status) return; if (a.status === 'in_progress') await notifyUser(a.userId, '🔄 Support request update', `We're looking into \"${a.subject || 'your request'}\".`, { type: 'supportTicket', id: event.params.id }); else if (a.status === 'resolved') await notifyUser(a.userId, '✅ Support request resolved', a.adminNote || `Your request \"${a.subject || ''}\" has been resolved.`, { type: 'supportTicket', id: event.params.id }); });
exports.onInquiryCreated = onDocumentCreated('inquiries/{id}', async event => { const i = event.data.data(); await notifyRoles(ADMIN_ROLES, '✈️ New travel inquiry', `${i.type}: ${i.from} → ${i.to} (${i.date})`, { type: 'inquiry', id: event.params.id }); });
exports.onInquiryUpdated = onDocumentUpdated('inquiries/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (b.status !== 'closed' && a.status === 'closed' && a.type === 'flight' && a.ticketUrl) await progressionService.incrementTierPoints(a.customerId); if (b.status === a.status) return; if (a.status === 'contacted') await notifyUser(a.customerId, '📞 We called about your inquiry', `An agent has reached out about your ${a.type} inquiry.`, { type: 'inquiry', id: event.params.id }); else if (a.status === 'closed') await notifyUser(a.customerId, '✅ Inquiry closed', `Your ${a.type} inquiry has been closed.`, { type: 'inquiry', id: event.params.id }); });
