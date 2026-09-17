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

// Hardened wallet/top-up/transaction handlers. These modules were already
// present in the repository but were not active because index.js exported the
// older walletService implementations directly.
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