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
// decides it should be.
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
exports.sendDeviceVerification = require('./deviceVerificationService').sendDeviceVerification;
exports.confirmDeviceEmailOtp = require('./deviceVerificationService').confirmDeviceEmailOtp;
