// MySheba push notifications - the SERVER half.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const progressionService = require('./progressionService');
const growthRewardsService = require('./growthRewardsService');
const financialLedgerService = require('./financialLedgerService');
const TIER_QUALIFYING_SERVICES = ['Recharge', 'Internet', 'Bill Payment', 'Mobile Banking', 'Remittance'];
function walletLabel(tx, amountField = 'total') { const currency = String(tx?.currency || tx?.walletCurrency || 'MYR').toUpperCase(); const digits = ['IDR','KHR','MMK'].includes(currency) ? 0 : 2; const amount = Number(tx?.[amountField] ?? 0); return `${currency} ${Number.isFinite(amount) ? amount.toFixed(digits) : '0'.padEnd(digits ? digits + 2 : 1, '0')}`; }
const userManagement = require('./userManagement');
const walletTransferService = require('./walletTransferService');
const secureWalletMutations = require('./secureWalletMutations');
const secureTransfer = require('./secureTransfer');
const secureWalletCharge = require('./secureWalletCharge');
const secureTopupReview = require('./secureTopupReview');
const chargeGuards = require('./chargeGuards');
const supportTicketService = require('./supportTicketService');
const transactionQueue = require('./transactionQueueService');
exports.manageUser = userManagement.manageUser;
// Compatibility/production callable exports that are consumed by the mobile
// client. Keep every client-facing callable reachable from the actual
// functions entrypoint (secureIndexV2 -> index.js).
exports.refreshWalletExchangeRates = require('./walletExchangeRateService').refreshWalletExchangeRates;
exports.setRemittanceRateMode = require('./walletExchangeRateService').setRemittanceRateMode;
exports.refreshRemittanceRatesAutomatically = require('./remittanceRateScheduler').refreshRemittanceRatesAutomatically;
exports.setRoleDefaults = require('./accessControl').setRoleDefaults;
exports.setUserAccessOverride = require('./accessControl').setUserAccessOverride;
exports.respondToWebSignIn = require('./deviceSessionService').respondToWebSignIn;
exports.createInvoice = require('./invoiceService').createInvoice;
exports.approveInvoice = require('./invoiceService').approveInvoice;
exports.rejectInvoice = require('./invoiceService').rejectInvoice;
exports.listInvoices = require('./invoiceService').listInvoices;
exports.getInvoiceDocument = require('./invoiceService').getInvoiceDocument;
exports.archiveFinancialRecord = require('./financialRecordService').archiveFinancialRecord;
// The handler was renamed to registerWithDealerCode; this line still asked
// for the old name and so exported undefined. The app calls
// 'registerCustomer' from three places (sign-up and both email-OTP
// steps), and sign-up only kept working because a copy deployed under
// that name survived in the project. A deploy with --force would have
// deleted it and taken registration with it.
exports.registerCustomer = require('./customerRegistration').registerWithDealerCode;
exports.createInquiry = require('./inquiryService').createInquiry;
exports.registerPushToken = require('./pushTokenService').registerPushToken;
exports.validateActiveSession = require('./validateActiveSessionService').validateActiveSession;
exports.sendPasswordResetEmailVerification = require('./passwordResetEmail').sendPasswordResetEmailVerification;
exports.verifyPasswordResetEmailOtp = require('./passwordResetEmail').verifyPasswordResetEmailOtp;
exports.recordAdEvent = require('./adTrackingCallable').recordAdEvent;
exports.listManagedUsers = require('./managedUserListService').listManagedUsers;
exports.listUserDirectory = require('./userDirectoryService').listUserDirectory;
exports.searchUsers = require('./userSearch').searchUsers;
exports.searchInvestigationUsers = require('./userSearch').searchInvestigationUsers;
exports.getReferralInfo = require('./growthService').getReferralInfo;
exports.getGrowthConfig = require('./growthService').getGrowthConfig;
exports.saveGrowthConfig = require('./growthService').saveGrowthConfig;
exports.listGrowthCampaigns = require('./growthService').listGrowthCampaigns;
exports.saveGrowthCampaign = require('./growthService').saveGrowthCampaign;
exports.deleteGrowthCampaign = require('./growthService').deleteGrowthCampaign;
exports.getGrowthDashboard = require('./growthService').getGrowthDashboard;
exports.getUserByUid = require('./userSearch').getUserByUid;
exports.matchContactsByPhone = require('./matchContactsByPhone').matchContactsByPhone;
exports.registerWithDealerCode = require('./customerRegistration').registerWithDealerCode;
exports.resetPassword = require('./passwordReset').resetPassword;
exports.ensureUserId = require('./ensureUserId').ensureUserId;
exports.checkDeviceSession = require('./deviceSessionService').checkDeviceSession;
exports.confirmDeviceSwitch = require('./deviceSessionService').confirmDeviceSwitch;
exports.clearActiveSession = require('./deviceSessionService').clearActiveSession;
exports.adminForceLogout = require('./deviceSessionService').adminForceLogout;
exports.listTrustedDevices = require('./deviceSessionService').listTrustedDevices;
exports.revokeTrustedDevice = require('./deviceSessionService').revokeTrustedDevice;
exports.sendDeviceVerification = require('./deviceVerificationService').sendDeviceVerification;
exports.confirmDeviceEmailOtp = require('./deviceVerificationService').confirmDeviceEmailOtp;
exports.saveWorkLogEntry = require('./workLogService').saveWorkLogEntry;
exports.deleteWorkLogEntry = require('./workLogService').deleteWorkLogEntry;
exports.clockInNow = require('./workLogService').clockInNow;
exports.clockOutNow = require('./workLogService').clockOutNow;
exports.saveSalarySettings = require('./salaryMutationService').saveSalarySettings;
exports.addAllowance = require('./salaryMutationService').addAllowance;
exports.updateAllowance = require('./salaryMutationService').updateAllowance;
exports.deleteAllowance = require('./salaryMutationService').deleteAllowance;
exports.addDeduction = require('./salaryMutationService').addDeduction;
exports.updateDeduction = require('./salaryMutationService').updateDeduction;
exports.deleteDeduction = require('./salaryMutationService').deleteDeduction;
exports.saveSalaryEstimate = require('./salaryMutationService').saveSalaryEstimate;
exports.recordActualSalary = require('./salaryMutationService').recordActualSalary;
exports.attachSalaryPayslip = require('./salaryMutationService').attachSalaryPayslip;
exports.deleteSalaryRecord = require('./salaryMutationService').deleteSalaryRecord;
exports.sendAnnouncement = require('./announcements').sendAnnouncement;
exports.approveTopup = secureTopupReview.approveTopup;
exports.verifyTopup = secureTopupReview.verifyTopup;
exports.completeTopup = secureTopupReview.completeTopup;
exports.rejectTopup = secureTopupReview.rejectTopup;
exports.createSelfTopup = secureWalletMutations.createSelfTopup;
exports.submitTopupRequest = require('./topupSubmissionService').submitTopupRequest;
exports.adminTopUpPoints = require('./adminTopUpService').adminTopUpPoints;
exports.setWalletFrozen = require('./walletFreeze').setWalletFrozen;
exports.requestWalletFunding = require('./walletFundingService').requestWalletFunding;
exports.listWalletFundingRequests = require('./walletFundingService').listWalletFundingRequests;
exports.decideWalletFunding = require('./walletFundingService').decideWalletFunding;
exports.getLedgerReport = require('./ledgerReport').getLedgerReport;
exports.transferPoints = secureTransfer.transferPoints;
exports.findWalletRecipient = walletTransferService.findWalletRecipient;
exports.listWalletTransfers = walletTransferService.listWalletTransfers;
exports.createDiditKycSession = require('./diditKycService').createDiditKycSession;
exports.chargeWallet = secureWalletCharge.chargeWallet;
exports.chargeRecharge = chargeGuards.chargeRecharge;
exports.chargeInternetPackage = chargeGuards.chargeInternetPackage;
exports.chargeOfferPacks = chargeGuards.chargeOfferPacks;
exports.chargeEntertainment = chargeGuards.chargeEntertainment;
exports.chargeBillPayment = chargeGuards.chargeBillPayment;
exports.chargeMobileBanking = chargeGuards.chargeMobileBanking;
exports.chargeRemittance = chargeGuards.chargeRemittance;
exports.chargeEsim = chargeGuards.chargeEsim;
exports.approveVerification = require('./verificationService').approveVerification;
exports.rejectVerification = require('./verificationService').rejectVerification;
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
exports.migrateApiProviderSecrets = require('./apiProviderService').migrateApiProviderSecrets;
exports.saveApiProvider = require('./apiProviderService').saveApiProvider;
exports.deleteApiProvider = require('./apiProviderService').deleteApiProvider;
exports.getServiceApiSettings = require('./apiProviderService').getServiceApiSettings;
exports.saveServiceApiSettings = require('./apiProviderService').saveServiceApiSettings;
// Both of these are defined in apiProviderService.js but were never exported
// here, so every call reached the client as functions/not-found: the Test API
// button and the Bangladesh internet package list.
exports.testApiProvider = require('./apiProviderService').testApiProvider;
exports.listSuccessTopUpDrives = require('./apiProviderService').listSuccessTopUpDrives;
exports.listProviderDataPlans = require('./apiProviderService').listProviderDataPlans;
exports.getBillPresentment = require('./apiProviderService').getBillPresentment;
exports.getNetworkStatus = require('./apiProviderService').getNetworkStatus;
exports.listProviderProductCodes = require('./apiProviderService').listProviderProductCodes;
exports.getIimmpactCatalog = require('./apiProviderService').getIimmpactCatalog;
exports.getIimmpactCatalogForUser = require('./apiProviderService').getIimmpactCatalogForUser;
exports.getIimmpactFullCatalogForUser = require('./apiProviderService').getIimmpactFullCatalogForUser;
exports.getIimmpactOptions = require('./apiProviderService').getIimmpactOptions;
exports.listSuccessTopUpCatalogForAdmin = require('./apiProviderService').listSuccessTopUpCatalogForAdmin;
exports.getSuccessTopUpBalance = require('./apiProviderService').getSuccessTopUpBalance;
exports.listApiWebhooks = require('./apiWebhookService').listApiWebhooks;
exports.saveApiWebhook = require('./apiWebhookService').saveApiWebhook;
exports.deleteApiWebhook = require('./apiWebhookService').deleteApiWebhook;
exports.apiWebhook = require('./apiWebhookService').apiWebhook;
exports.revealApiWebhookToken = require('./apiWebhookService').revealApiWebhookToken;
exports.rotateApiWebhookToken = require('./apiWebhookService').rotateApiWebhookToken;
exports.listApiWebhookUnmatched = require('./apiWebhookService').listApiWebhookUnmatched;
exports.pollSuccessTopUpStatus = require('./successTopupPoller').pollSuccessTopUpStatus;
// Added in d152997, then lost in the conflict resolution of 4eccc79 on
// 23 Sep. The job stayed deployed and kept running, so nothing broke and
// nobody noticed - but it could no longer be updated from this repo, and the
// next deploy would have offered to delete it as a function with no source.
exports.cleanupExpiredVerificationArtifacts = require('./verificationCleanup').cleanupExpiredVerificationArtifacts;
// Superadmin platform control plane: dynamic feature/country/operator catalog,
// targeted WebViews and Google Ads controls. Existing business callables remain
// unchanged; these are the server-owned configuration mutations/resolvers.
const platformControl = require('./platformControlService');
exports.getPlatformCatalog = platformControl.getPlatformCatalog;
exports.listPlatformCatalogAdmin = platformControl.listPlatformCatalogAdmin;
exports.savePlatformFeature = platformControl.savePlatformFeature;
exports.deletePlatformFeature = platformControl.deletePlatformFeature;
exports.saveCountryCatalog = platformControl.saveCountryCatalog;
exports.deleteCountryCatalog = platformControl.deleteCountryCatalog;
exports.saveOperatorCatalog = platformControl.saveOperatorCatalog;
exports.deleteOperatorCatalog = platformControl.deleteOperatorCatalog;
exports.updateWebviewTargeting = platformControl.updateWebviewTargeting;
exports.saveWebviewPage = platformControl.saveWebviewPage;
exports.deleteWebviewPage = platformControl.deleteWebviewPage;
exports.updateGoogleAdsControls = platformControl.updateGoogleAdsControls;
exports.updateAdPlacementControls = platformControl.updateAdPlacementControls;
exports.purgeFlaggedTestTransactions = platformControl.purgeFlaggedTestTransactions;
exports.getGridManagementAdmin = platformControl.getGridManagementAdmin;
exports.updateGridManagement = platformControl.updateGridManagement;

exports.purchaseRechargePin = require('./rechargePinService').purchaseRechargePin;
exports.rechargePinStock = require('./rechargePinService').rechargePinStock;
exports.uploadRechargePins = require('./rechargePinService').uploadRechargePins;
exports.getRechargePin = require('./rechargePinService').getRechargePin;
exports.createSupportTicket = supportTicketService.createSupportTicket;
exports.assignSupportTicket = supportTicketService.assignSupportTicket;
exports.unassignSupportTicket = supportTicketService.unassignSupportTicket;
exports.onTransactionQueueCreated = transactionQueue.onTransactionQueueCreated;
exports.onTransactionQueueUpdated = transactionQueue.onTransactionQueueUpdated;
exports.approveTransaction = require('./transactionService').approveTransaction;
exports.acceptTransaction = require('./transactionService').acceptTransaction;
exports.completeTransaction = require('./transactionService').completeTransaction;
exports.reconcileUnknownTransaction = require('./transactionService').reconcileUnknownTransaction;
exports.rejectTransaction = require('./rejectionService').rejectTransaction;
exports.assignDealer = require('./transactionService').assignDealer;
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ADMIN_ROLES = ['admin', 'superadmin'];
// Imported rather than defined here: this was the second copy, and it had the
// same blind spot - Expo answers HTTP 200 with per-message error tickets, so
// checking only res.ok reports a failed push as a sent one.
const { sendExpoPush } = require('./expoPush');
async function getUserPushTarget(uid) { if (!uid) return null; const snap = await db.collection('users').doc(uid).get(); if (!snap.exists) return null; const d = snap.data(); if (!d.pushToken || (d.notifPrefs && d.notifPrefs.pushEnabled === false)) return null; if (d.suspended === true || d.inactive === true || d.disabled === true || d.active === false || d.mergedInto) return null; return d.pushToken; }
async function notifyUser(uid, title, body, data, extra) { const token = await getUserPushTarget(uid); if (token) await sendExpoPush([{ to: token, title, body, data: data || {}, ...(extra || {}) }]); }
async function notifyRoles(roles, title, body, data) { const snap = await db.collection('users').where('role', 'in', roles).get(); const messages = []; snap.forEach(doc => { const u = doc.data(); if (u.suspended === true || u.inactive === true || u.disabled === true || u.active === false || u.mergedInto) return; if (u.pushToken && !(u.notifPrefs && u.notifPrefs.pushEnabled === false)) messages.push({ to: u.pushToken, title, body, data: data || {} }); }); await sendExpoPush(messages); }
exports.onTransactionCreated = onDocumentCreated('transactions/{id}', async event => { const tx = event.data.data(); const body = `${tx.service} - ${walletLabel(tx)}`; if (tx.resellerId) await notifyUser(tx.resellerId, '🆕 New order', body, { type: 'transaction', id: event.params.id }); else if (tx.dealerId) await notifyUser(tx.dealerId, '🆕 New order', body, { type: 'transaction', id: event.params.id }); else if (tx.service === 'Mobile Banking') await notifyRoles(['dealer'], '🆕 New order', body, { type: 'transaction', id: event.params.id }); else if (['Recharge', 'Internet', 'Bill Payment', 'Remittance'].includes(tx.service)) await notifyRoles(['reseller'], '🆕 New order', body, { type: 'transaction', id: event.params.id }); });
exports.onTransactionUpdated = onDocumentUpdated('transactions/{id}', async event => {
  const b = event.data.before.data();
  const a = event.data.after.data();

  if (!b.dealerId && a.dealerId) {
    await notifyUser(
      a.dealerId,
      '🆕 New order',
      `${a.service} - ${walletLabel(a)}`,
      { type: 'transaction', id: event.params.id }
    );
  }

  if (!b.resellerId && a.resellerId) {
    await notifyUser(
      a.resellerId,
      '🆕 New order',
      `${a.service} - ${walletLabel(a)}`,
      { type: 'transaction', id: event.params.id }
    );
  }

  if (
    b.status !== 'completed' &&
    a.status === 'completed' &&
    TIER_QUALIFYING_SERVICES.includes(a.service)
  ) {
    await progressionService.incrementTierPoints(
      a.customerId,
      `transaction:${event.id}`
    );
  }

  if (b.status !== 'completed' && a.status === 'completed') {
    await growthRewardsService.handleCompletedTransaction(
      event.params.id,
      a
    );
  }

  if (b.status !== 'completed' && a.status === 'completed') {
    await financialLedgerService.recordCompletedTransaction(event.params.id, a);
  }

  if (b.status === a.status && b.rejected === a.rejected) return;

  let title = 'Order update';
  let body = `${a.service} is now ${a.status}.`;

  if (a.rejected) {
    title = '❌ Order rejected';
    body = `${a.service}: ${a.rejectReason || 'Rejected by dealer.'}`;
  } else if (a.status === 'processing') {
    title = '🔄 Order accepted';
    body = `${a.service} is being processed.`;
  } else if (a.status === 'completed') {
    title = '✅ Order completed';
    body = `${a.service} has been completed.`;
  }

  await notifyUser(
    a.customerId,
    title,
    body,
    { type: 'transaction', id: event.params.id }
  );
});

exports.onTopupCreated = onDocumentCreated('topups/{id}', async event => { const t = event.data.data(); await notifyRoles(ADMIN_ROLES, '💰 New top-up request', `${t.userName || 'A user'} requested ${walletLabel(t, 'amount')}`, { type: 'topup', id: event.params.id }); });
exports.onTopupUpdated = onDocumentUpdated('topups/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (b.status === a.status) return; if (a.status === 'approved') await notifyUser(a.userId, '✅ Top-up approved', `${walletLabel(a, 'amount')} has been credited to your wallet.`, { type: 'topup', id: event.params.id }); else if (a.status === 'rejected') await notifyUser(a.userId, '❌ Top-up rejected', a.rejectReason || 'Your top-up request was rejected.', { type: 'topup', id: event.params.id }); });
exports.onSupportTicketCreated = onDocumentCreated('supportTickets/{id}', async event => { const t = event.data.data(); await notifyRoles(ADMIN_ROLES, '🎧 New support request', `${t.userName || 'A user'}: ${t.subject || 'Support request'}`, { type: 'supportTicket', id: event.params.id }); });
exports.onSupportTicketUpdated = onDocumentUpdated('supportTickets/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (b.status === a.status) return; if (a.status === 'in_progress') await notifyUser(a.userId, '🔄 Support request update', `We're looking into \"${a.subject || 'your request'}\".`, { type: 'supportTicket', id: event.params.id }); else if (a.status === 'resolved') await notifyUser(a.userId, '✅ Support request resolved', a.adminNote || `Your request \"${a.subject || ''}\" has been resolved.`, { type: 'supportTicket', id: event.params.id }); });
exports.onInquiryCreated = onDocumentCreated('inquiries/{id}', async event => { const i = event.data.data(); await notifyRoles(ADMIN_ROLES, '✈️ New travel inquiry', `${i.type}: ${i.from} → ${i.to} (${i.date})`, { type: 'inquiry', id: event.params.id }); });
exports.onInquiryUpdated = onDocumentUpdated('inquiries/{id}', async event => { const b = event.data.before.data(), a = event.data.after.data(); if (b.status !== 'closed' && a.status === 'closed' && a.type === 'flight' && a.ticketUrl) await progressionService.incrementTierPoints(a.customerId, `inquiry:${event.id}`); if (b.status === a.status) return; if (a.status === 'contacted') await notifyUser(a.customerId, '📞 We called about your inquiry', `An agent has reached out about your ${a.type} inquiry.`, { type: 'inquiry', id: event.params.id }); else if (a.status === 'closed') await notifyUser(a.customerId, '✅ Inquiry closed', `Your ${a.type} inquiry has been closed.`, { type: 'inquiry', id: event.params.id }); });
