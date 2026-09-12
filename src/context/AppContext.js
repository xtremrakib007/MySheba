import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Platform, BackHandler, ToastAndroid, AppState } from 'react-native';
import { showAlert } from '../utils/appAlert';

import * as authService from '../firebase/authService';
import * as securityPinService from '../firebase/securityPinService';
import { getAppLockEnabled, setAppLockEnabledPref, getBiometricEnabledPref, setBiometricEnabledPref, clearBiometricEnabledPref } from '../firebase/appLockPrefs';
import { isBiometricAvailable } from '../firebase/biometricAuth';
import * as deviceSessionService from '../firebase/deviceSessionService';
import * as inquiryService from '../firebase/inquiryService';
import * as transactionService from '../firebase/transactionService';
import * as ratesService from '../firebase/ratesService';
import * as settingsService from '../firebase/settingsService';
import * as featureAccessService from '../firebase/featureAccessService';
import * as adControlsService from '../firebase/adControlsService';
import * as homepageConfigService from '../firebase/homepageConfigService';
import * as adService from '../firebase/adService';
import * as supportContactService from '../firebase/supportContactService';
import * as socialLinksService from '../firebase/socialLinksService';
import * as paymentSettingsService from '../firebase/paymentSettingsService';
import * as internetPricingService from '../firebase/internetPricingService';
import * as categoryService from '../firebase/categoryService';
import * as bannerService from '../firebase/bannerService';
import * as announcementService from '../firebase/announcementService';
import * as topupService from '../firebase/topupService';
import * as chatService from '../firebase/chatService';
import * as directChatService from '../firebase/directChatService';
import * as groupChatService from '../firebase/groupChatService';
import * as roomChatService from '../firebase/roomChatService';
import * as chatLockService from '../firebase/chatLockService';
import * as callService from '../firebase/callService';
import {
  registerForPushNotificationsAsync,
  addNotificationResponseListener,
  getLastNotificationResponseAsync,
  getFcmToken,
} from '../notifications/pushService';
import { maybeSaveReceiver } from '../firebase/receiverService';
import { ensureWebviewAccess, chargeWebviewSubmission } from '../firebase/webviewAccessService';
import { ensureModuleSubscription } from '../firebase/moduleSubscriptionService';
import { checkPaymentEntryAccess, chargePaymentSuccess } from '../firebase/paymentWebviewService';
import { withCallSettingsDefaults } from '../data/callSettingsConstants';
import { cacheCallSettings, cacheCallerRingtones } from '../notifications/callSettingsCache';
import { setCallerRingtone as saveCallerRingtone, removeCallerRingtone as deleteCallerRingtone, subscribeCallerRingtones } from '../firebase/callerRingtoneService';
import {
  WEBVIEW_ACCESS_COST, WEBVIEW_SUBMIT_COST, PAYMENT_SUCCESS_COST, WEBVIEW_ACCESS_WINDOW_HOURS,
  ACCESS_CLICK_WEBVIEWS, SUBMIT_CHARGED_WEBVIEWS, PAYMENT_CHARGED_WEBVIEWS,
  amountToPoints,
} from '../data/countries';

const AppContext = createContext(null);

// TEMPORARY DEBUG HELPER — every onSnapshot listener below passes its own
// label into this instead of a silent `() => {}`, so the next time a
// "Missing or insufficient permissions" error shows up in Logbox, the log
// line right before it names exactly which listener/collection threw it.
// Safe to remove once the source is identified.
function logListenerError(label) {
  return (err) => {
    console.log(`[listener:${label}] error:`, err?.code || err?.message || err);
  };
}

const SERVICE_STEPS = {
  recharge: 4,
  mobilebanking: 3,
  internet: 4,
  remittance: 7,
  bus: 3,
  train: 3,
  flight: 3,
};

// Flight/Bus/Train are "contact-me" inquiries sent straight to Admin.
// Everything else goes through the Dealer processing queue.
const TRAVEL_SERVICES = ['flight', 'bus', 'train'];
const TRAVEL_LABELS = { flight: 'Flight', bus: 'Bus', train: 'Train' };
const DEALER_LABELS = {
  recharge: 'Recharge',
  mobilebanking: 'Mobile Banking',
  internet: 'Internet',
  remittance: 'Remittance',
};

/** Builds the {service, details, amount, total} payload the dealer queue needs, from the wizard's serviceData. */
function buildTransactionPayload(service, serviceData, pricing, rates) {
  if (service === 'recharge') {
    const rawAmount = serviceData.amount || 0;
    // Non-Malaysia orders are entered in the destination country's local
    // currency (e.g. BDT) - convert to points (MYR) with the admin-set
    // Recharge/Internet rate (separate from Mobile Banking's rate) before
    // this becomes the amount shown/charged everywhere else in the app.
    // Malaysia orders are already in MYR, so this is a no-op for them.
    const amount = amountToPoints(rawAmount, serviceData.country, rates);
    // Cost/profit split is for admin/dealer reporting only (see
    // TransactionDetailModal's cost/profit rows, Admin > Pricing for the
    // editable %) - it never changes what the customer pays, which stays
    // the face value they picked.
    const costPercent = pricing ? Number(pricing.rechargeCostPercent) || 0 : 0;
    const profitPercent = pricing ? Number(pricing.rechargeProfitPercent) || 0 : 0;
    const cost = Math.round(amount * (costPercent / 100) * 100) / 100;
    const profit = Math.round(amount * (profitPercent / 100) * 100) / 100;
    return {
      service: DEALER_LABELS.recharge,
      details: `${serviceData.operator || ''} - ${serviceData.currency || 'MYR'} ${rawAmount}`,
      amount,
      total: amount,
      cost,
      profit,
    };
  }
  if (service === 'mobilebanking') {
    const myr = serviceData.myr || 0;
    return {
      service: DEALER_LABELS.mobilebanking,
      details: `${serviceData.provider || ''} - MYR ${myr.toFixed(2)} (Receiver: ${serviceData.phone || ''})`,
      amount: myr,
      total: myr + 5,
    };
  }
  if (service === 'internet') {
    const rawAmount = serviceData.amount || 0;
    // Same conversion as recharge above - the package's face price is in
    // the destination country's local currency, points shown/charged are
    // its MYR equivalent at the admin-set Recharge/Internet rate.
    const amount = amountToPoints(rawAmount, serviceData.country, rates);
    return {
      service: DEALER_LABELS.internet,
      details: `${serviceData.operator || ''} - ${serviceData.package || ''} (${serviceData.currency || 'MYR'} ${rawAmount})`,
      amount,
      total: amount,
    };
  }
  if (service === 'remittance') {
    const sendAmt = serviceData.sendAmt || 0;
    const fee = serviceData.transferFee || 0;
    const METHOD_LABELS = { deposit: 'Bank Account', cash: 'Cash Pickup', ewallet: 'eWallet' };
    const methodLabel = METHOD_LABELS[serviceData.method] || '';
    const receiverName = `${serviceData.receiverFirstName || ''} ${serviceData.receiverLastName || ''}`.trim();
    const senderPart = serviceData.senderName ? ` · Sender: ${serviceData.senderName}` : '';
    return {
      service: DEALER_LABELS.remittance,
      details: `${methodLabel} to ${receiverName} (${serviceData.country || ''}) via ${serviceData.paymentMethod || ''}${senderPart}`,
      amount: sendAmt,
      total: sendAmt + fee,
    };
  }
  return { service, details: '', amount: 0, total: 0 };
}

export function AppProvider({ children }) {
  // ---- auth / profile ----
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  // { uid, email } while a login is waiting on single-device-login
  // verification (functions/deviceSessionService.js) - see doLogin/
  // doGoogleLogin/confirmDeviceVerification below and DeviceVerifyScreen.js.
  const [pendingDeviceVerification, setPendingDeviceVerification] = useState(null);
  const [pendingGooglePhone, setPendingGooglePhone] = useState(false);

  // ---- navigation state ----
  // No more manual role picker - `screen` starts on 'login' and, once
  // signed in, the account's Firestore `role` field (in `profile.role`)
  // decides which home screen to land on. See the bootstrap effect below.
  const [screen, setScreen] = useState('login'); // login | register | forgotPassword | customerHome | service | dealerHome | resellerHome | adminHome | webview | buspicker | support | history | topup | chat | chatList | chatHub | directChatList | addContact | qrScan | myQrCode | groupList | newGroup | createRoom | roomSettings | settings | profile | myAccount | reports | notifications | marketplaceHome | marketplaceCreateListing | marketplaceMyListings | marketplaceMyReviews | marketplaceListingDetail | marketplaceModeration | verifyIdentity | verificationManagement | adminAnalytics | myDocuments | documentType | addDocument | documentDetails | documentViewer | moreFeatures | adminFeatures | apiProviderManagement | dealerFeatures | resellerFeatures | featureAccess | tierPromotions | adFeatureControls | bannerManagement | salaryReports | notepad | addNote | noteDetail | help | investigateChat | friendsList | callSettings | ringtonePicker

  // ---- back-button navigation history ----
  // Tracks prior screens so the Android hardware back button can step
  // backward through the app instead of the OS just killing it. We don't
  // route every setScreen() call through a wrapper - instead we diff the
  // screen value itself in an effect, and skip pushing when the change
  // came from goBack() (isPoppingRef) so back doesn't create forward loops.
  const screenHistoryRef = useRef([]);
  const isPoppingRef = useRef(false);
  const prevScreenRef = useRef(screen);
  const exitArmedRef = useRef(false);

  // Lets a home screen (Customer/Dealer/Admin) register a callback that
  // intercepts the hardware back button while it's showing a local
  // sub-section (e.g. "Rates", "Banners") instead of its main dashboard.
  // The callback should return true if it handled the press (closed the
  // sub-section) and false/undefined to let normal back-navigation proceed.
  const homeBackInterceptorRef = useRef(null);
  const setHomeBackInterceptor = useCallback((fn) => {
    homeBackInterceptorRef.current = fn || null;
  }, []);

  // Lets WebViewScreen register a callback that steps the *in-page*
  // WebView history backward while the hardware back button is pressed,
  // instead of immediately leaving the screen. Should return true if it
  // handled the press (webview had internal history to go back through)
  // and false/undefined to let normal back-navigation proceed (leaving
  // the webview screen entirely). Only ever consulted while screen ===
  // 'webview' (see onBackPress below), so a stale registration left over
  // after navigating away can never hijack back-presses on other screens.
  const webViewBackInterceptorRef = useRef(null);
  const setWebViewBackInterceptor = useCallback((fn) => {
    webViewBackInterceptorRef.current = fn || null;
  }, []);

  // Screens that exist only before/during authentication - once left behind,
  // hardware back should never be able to land here again (there's no valid
  // "go back to login" while signed in), so they're never pushed onto the
  // back-history stack below.
  const PRE_AUTH_SCREENS = ['login', 'register', 'deviceVerify', 'googlePhone'];

  useEffect(() => {
    const prev = prevScreenRef.current;
    if (prev !== screen) {
      if (!isPoppingRef.current && !PRE_AUTH_SCREENS.includes(prev)) {
        screenHistoryRef.current.push(prev);
      }
      isPoppingRef.current = false;
      prevScreenRef.current = screen;
    }
  }, [screen]);

  const goBack = useCallback(() => {
    const history = screenHistoryRef.current;
    if (history.length === 0) return false;
    const prevScreen = history.pop();
    isPoppingRef.current = true;
    setScreen(prevScreen);
    return true;
  }, []);

  // ---- sidebar drawer (Settings / Profile / My Account / Reports) ----
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // ---- support chat (customer <-> Support only - see SupportScreen.js) ----
  const [activeChatId, setActiveChatId] = useState(null); // the customer uid whose thread is open
  const [activeChatName, setActiveChatName] = useState('');
  const [chatUnreadCount, setChatUnreadCount] = useState(0); // badge count for the signed-in side
  // Which screen ChatScreen's back button should return to - staff can open
  // a support thread from either the Chats inbox (chatList) or the
  // "Messages" tab inside Support Tickets (adminSupport); defaults to
  // 'chatList' to match the existing behavior for every other entry point.
  const [activeChatReturnTo, setActiveChatReturnTo] = useState('chatList');

  // ---- direct chat (general-purpose 1:1 "Chat" tab, any two accounts) ----
  const [activeDirectChatId, setActiveDirectChatId] = useState(null);
  const [activeDirectChatName, setActiveDirectChatName] = useState('');
  const [activeDirectChatUid, setActiveDirectChatUid] = useState(null); // other participant's uid - needed to start a call
  const [directChatUnreadCount, setDirectChatUnreadCount] = useState(0);
  // Which contact RingtonePickerScreen is currently editing - same
  // "dedicated nav state alongside setScreen" pattern as activeDirectChatId
  // above, since `screen` itself is a bare string with no params (see the
  // useState('login') list). Set by openRingtonePicker below.
  const [activeRingtoneContactUid, setActiveRingtoneContactUid] = useState(null);
  const [activeRingtoneContactName, setActiveRingtoneContactName] = useState('');
  // Prefills the message box (without auto-sending) the next time a direct
  // chat opens - e.g. a dealer's "message customer about this order" button.
  const [chatDraftText, setChatDraftText] = useState('');

  // ---- direct chat investigation (superadmin-only, read-only view of a
  // reported conversation - see ChatReportsScreen's "Investigate" button
  // and InvestigateChatScreen.js). Deliberately separate state from
  // activeDirectChatId/openDirectChat above: this isn't "the signed-in
  // user's own thread" (no security-PIN vault check, no call button, no
  // message box), it's an admin tool gated by firestore.rules'
  // underInvestigation flag instead. ----
  const [activeInvestigateChatId, setActiveInvestigateChatId] = useState(null);
  const [activeInvestigateReport, setActiveInvestigateReport] = useState(null); // { id, reportedUid, reportedName, reporterName }

  /** Opens the read-only conversation viewer for a report a superadmin is
   * investigating - `report` is { id, reportedUid, reportedName, reporterName }. */
  const openInvestigateChat = useCallback((chatId, report) => {
    setActiveInvestigateChatId(chatId);
    setActiveInvestigateReport(report || null);
    setScreen('investigateChat');
  }, []);

  // ---- marketplace (Buy & Sell) ---- Screens call marketplaceService.js
  // directly (same pattern as ProfileScreen -> authService), so all that
  // lives here is the one piece of navigation state a listing's detail
  // screen needs: which listing to show. "Chat Seller" reuses
  // openDirectChat above - no separate marketplace chat state.
  const [activeListingId, setActiveListingId] = useState(null);
  const openMarketplace = useCallback(() => setScreen('marketplaceHome'), []);
  const openListingDetail = useCallback((listingId) => {
    setActiveListingId(listingId);
    setScreen('marketplaceListingDetail');
  }, []);

  // ---- PHASE 9 - MY SHEBA ADVERTISER AND CAMPAIGN MANAGEMENT ---- Same
  // "dedicated nav state alongside setScreen" pattern as activeListingId/
  // activePropertyId above: AdvertiserManagementScreen is the roster (no
  // id needed to open it), AdvertiserDetailScreen needs to know which
  // ad_advertisers doc to show.
  const [activeAdvertiserId, setActiveAdvertiserId] = useState(null);
  const openAdvertiserManagement = useCallback(() => setScreen('advertiserManagement'), []);
  const openAdvertiserDetail = useCallback((advertiserId) => {
    setActiveAdvertiserId(advertiserId);
    setScreen('advertiserDetail');
  }, []);

  // ---- inbound deep links ("Open in App" on the mysheba.top listing
  // preview page - see functions/listingPreview.js, and ShareListingSheet's
  // shared links). Handles both mysheba://listing/<id> (the app's own
  // scheme, works the moment the app is installed - no server files
  // needed) and, in case Android/iOS App Links get set up later without
  // any change to this parser, https://mysheba.top/listing/<id>.
  //
  // A link tapped while the app is already running is handled the instant
  // it arrives. A link that launched (or resumed) the app cold has to wait
  // - auth hasn't resolved yet, and the role-based post-login redirect
  // above would otherwise stomp straight over it - so it's parked in this
  // ref and the effect below applies it once auth/profile settle.
  const pendingDeepLinkListingIdRef = useRef(null);

  const parseListingIdFromUrl = useCallback((url) => {
    if (!url) return null;
    const match = String(url).match(/(?:mysheba:\/\/listing\/|mysheba\.top\/listing\/)([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }, []);

  const handleDeepLink = useCallback((url) => {
    const listingId = parseListingIdFromUrl(url);
    if (!listingId) return;
    if (authUser && profile && !authLoading) {
      openListingDetail(listingId);
    } else {
      pendingDeepLinkListingIdRef.current = listingId;
    }
  }, [authUser, profile, authLoading, openListingDetail, parseListingIdFromUrl]);

  useEffect(() => {
    if (authLoading || !authUser || !profile) return;
    const pendingId = pendingDeepLinkListingIdRef.current;
    if (!pendingId) return;
    pendingDeepLinkListingIdRef.current = null;
    openListingDetail(pendingId);
  }, [authLoading, authUser, profile, openListingDetail]);

  // ---- accommodation (Phase 2 of the Marketplace PRD) ---- Same pattern
  // as marketplace above: screens call accommodationService.js directly,
  // so all that lives here is which property to show. "Contact Owner"
  // reuses openDirectChat above - no separate accommodation chat state.
  const [activePropertyId, setActivePropertyId] = useState(null);
  const openAccommodation = useCallback(() => setScreen('accommodationHome'), []);
  const openPropertyDetail = useCallback((propertyId) => {
    setActivePropertyId(propertyId);
    setScreen('accommodationPropertyDetail');
  }, []);

  // ---- room sharing (Phase 2 of the Marketplace PRD) ---- Same pattern
  // as accommodation above: screens call roommateService.js directly, so
  // all that lives here is which request to show. "Chat" reuses
  // openDirectChat above - no separate room-sharing chat state.
  const [activeRoommateRequestId, setActiveRoommateRequestId] = useState(null);
  const openRoomSharing = useCallback(() => setScreen('roomSharingHome'), []);
  const openRoommateRequestDetail = useCallback((requestId) => {
    setActiveRoommateRequestId(requestId);
    setScreen('roomSharingRequestDetail');
  }, []);

  // ---- local services (Phase 2 of the Marketplace PRD, section 8) ----
  // Same pattern as accommodation/room sharing above: screens call
  // serviceProviderService.js / serviceReviewService.js /
  // serviceRequestService.js directly, so all that lives here is which
  // provider to show. "Message" reuses openDirectChat above - no separate
  // local-services chat state. ("Request Service" is a lead form, not a
  // chat - see serviceRequestService.js - so it needs no navigation state
  // of its own either.)
  const [activeProviderId, setActiveProviderId] = useState(null);
  const openServiceProvidersHome = useCallback(() => setScreen('servicesHome'), []);
  const openServiceProviderDetail = useCallback((providerId) => {
    setActiveProviderId(providerId);
    setScreen('servicesProviderDetail');
  }, []);

  // ---- community (PRD section 9 - Jobs/Events/Lost & Found/Emergency/
  // News) ---- Same pattern as accommodation/room sharing/local services
  // above: screens call communityService.js directly, so all that lives
  // here is which post to show. Likes/comments live entirely in
  // communityService too - no extra navigation state needed for those.
  const [activeCommunityPostId, setActiveCommunityPostId] = useState(null);
  const openCommunity = useCallback(() => setScreen('communityHome'), []);
  const openCommunityPostDetail = useCallback((postId) => {
    setActiveCommunityPostId(postId);
    setScreen('communityPostDetail');
  }, []);

  // ---- social feed (Next Update PRD §3 - general Facebook-style posts,
  // distinct from the typed Community module above) ---- Same pattern as
  // community above: screens call socialFeedService.js directly, so all
  // that lives here is which post is open. Likes/comments/shares/reports
  // live entirely in socialFeedService too - no extra navigation state.
  const [activeSocialPostId, setActiveSocialPostId] = useState(null);
  const openSocialFeed = useCallback(() => setScreen('socialFeed'), []);
  const openCreateSocialPost = useCallback(() => setScreen('createSocialPost'), []);
  const openSocialPostDetail = useCallback((postId) => {
    setActiveSocialPostId(postId);
    setScreen('socialPostDetail');
  }, []);

  // ---- unified marketplace search (PRD sitemap: Search Products/Rooms/
  // Services/Users) - a single screen, no navigation state of its own
  // needed beyond the screen switch itself; see MarketplaceSearchScreen.js.
  const openMarketplaceSearch = useCallback(() => setScreen('marketplaceSearch'), []);

  // ---- My Documents (private per-user document vault - passport, visa,
  // work permit, etc.) ---- Screens call documentService.js directly
  // (same pattern as marketplace/accommodation/etc. above); context only
  // tracks which document is being viewed/edited and which type is being
  // added. editDocumentId is null for "add new", set when opening the
  // Add screen from an existing document's "Edit Details" action.
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [activeDocumentType, setActiveDocumentType] = useState(null);
  const [editDocumentId, setEditDocumentId] = useState(null);
  // openMyDocuments itself is defined further below, alongside
  // ensureModuleAccess (needs pointCosts-adjacent pricing state) - see
  // "Notepad / My Documents / Salary & OT monthly subscription gate".
  const openDocumentTypePicker = useCallback(() => setScreen('documentType'), []);
  const openAddDocument = useCallback((documentType, existingDocumentId = null) => {
    setActiveDocumentType(documentType);
    setEditDocumentId(existingDocumentId);
    setScreen('addDocument');
  }, []);
  const openDocumentDetail = useCallback((documentId) => {
    setActiveDocumentId(documentId);
    setScreen('documentDetails');
  }, []);
  const openDocumentViewer = useCallback((documentId) => {
    setActiveDocumentId(documentId);
    setScreen('documentViewer');
  }, []);

  // ---- Notepad (private per-user notes, plus Credit/Debit/Loan "money
  // notes" for tracking who owes what) ---- Screens call notepadService.js
  // directly (same pattern as marketplace/documents/etc. above); context
  // only tracks which note is being viewed and which is being edited.
  // editNoteId is null for "add new", set when opening Add from
  // NoteDetailScreen's "Edit" action - same shape as
  // activeDocumentId/editDocumentId above.
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [editNoteId, setEditNoteId] = useState(null);
  // openNotepad itself is defined further below, next to openMyDocuments -
  // see "Notepad / My Documents / Salary & OT monthly subscription gate".
  const openAddNote = useCallback((existingNoteId = null) => {
    setEditNoteId(existingNoteId);
    setScreen('addNote');
  }, []);
  const openNoteDetail = useCallback((noteId) => {
    setActiveNoteId(noteId);
    setScreen('noteDetail');
  }, []);

  // ---- MySheba Help (a single "ask a question" entry point inside
  // Support, see src/screens/HelpScreen.js) ---- Most questions route
  // straight to an existing feature (My Documents, a webview, Community,
  // etc. - just a setScreen()/openX() call, no state of its own needed).
  // Questions with no direct feature (e.g. an employer pay dispute) fall
  // back to Support's own ticket form instead of a new mechanism -
  // helpPrefill carries the subject/message over, and SupportScreen
  // applies + clears it on mount so a later plain visit to Support never
  // sees stale prefill data.
  const [helpPrefill, setHelpPrefill] = useState(null); // { subject, message } | null
  const openHelp = useCallback(() => setScreen('help'), []);
  const openSupportWithPrefill = useCallback((subject, message) => {
    setHelpPrefill({ subject, message });
    setScreen('support');
  }, []);

  // ---- Business Profile (PRD section 15 Monetization Plan - "Business
  // profile") ---- Screens call businessProfileService.js directly, so all
  // that lives here is which uid's business page to show - same "just the
  // navigation state" pattern as activeListingId/activePropertyId/
  // activeProviderId above. Opened either from a listing/property/
  // service's seller/owner/provider row (view someone else's), or from My
  // Account (view/edit your own).
  const [activeBusinessProfileUid, setActiveBusinessProfileUid] = useState(null);
  const openBusinessProfile = useCallback((uid) => {
    setActiveBusinessProfileUid(uid);
    setScreen('businessProfile');
  }, []);

  // ---- Contact Profile ---- read-only view of the other person in a 1:1
  // direct chat - opened by tapping their name in ChatScreen's header (see
  // ChatScreen's headerTitleRow). Same "just the navigation state" pattern
  // as activeBusinessProfileUid above; ContactProfileScreen fetches the
  // actual profile doc itself once it has the uid.
  const [activeContactProfileUid, setActiveContactProfileUid] = useState(null);
  const openContactProfile = useCallback((uid) => {
    if (!uid) return;
    setActiveContactProfileUid(uid);
    setScreen('contactProfile');
  }, []);

  // openSalary / openSalaryReports are defined further below, next to
  // openMyDocuments/openNotepad - see "Notepad / My Documents / Salary &
  // OT monthly subscription gate". Every one of this module's screens
  // (salaryDashboard, salarySettings, salaryCalculator, salaryWorkLog,
  // salaryMonthlySummary, salaryHistory) reads/writes Firestore directly
  // using authUser.uid once inside, so only the two entry points below
  // need gating.

  // ---- Create Payslip (see src/firebase/payslipService.js,
  // src/screens/CreatePayslipScreen.js) ---- payslipSourceRecordId
  // pre-fills the create form from a Salary History record (PRD section
  // 19, "Use for Payslip"); editPayslipId switches the same screen into
  // edit mode for an already-saved payslip (PRD section 23). Both are
  // cleared on every fresh openCreatePayslip() call so leaving the flow
  // and starting over never leaks stale state into the next attempt.
  // activePayslipId is which payslip PayslipDetailsScreen is showing.
  const [payslipSourceRecordId, setPayslipSourceRecordId] = useState(null);
  const [editPayslipId, setEditPayslipId] = useState(null);
  const [activePayslipId, setActivePayslipId] = useState(null);
  const openCreatePayslip = useCallback((sourceRecordId = null) => {
    setPayslipSourceRecordId(sourceRecordId);
    setEditPayslipId(null);
    setScreen('createPayslip');
  }, []);
  const openEditPayslip = useCallback((payslipId) => {
    setEditPayslipId(payslipId);
    setPayslipSourceRecordId(null);
    setScreen('createPayslip');
  }, []);
  const openPayslipHistory = useCallback(() => setScreen('payslipHistory'), []);
  const openPayslipDetails = useCallback((payslipId) => {
    setActivePayslipId(payslipId);
    setScreen('payslipDetails');
  }, []);

  // ---- Security PIN gate (My Documents, Transfer Points, Notepad, Chat
  // Lock - each gated once on entry) ---- SecurityPinGate.js (rendered once
  // at the App.js root, same as RatePopup/ResultModal) reads pinGateRequest
  // and shows SecurityPinModal (setup if the profile has no PIN yet, verify
  // otherwise). A screen calls requireSecurityPin() and awaits it - resolves
  // once the person sets/enters their PIN (actual verification happens
  // server-side in functions/securityPinService.js), rejects if they cancel.
  // Only one gate can be open at a time; a second call while one is pending
  // auto-cancels the first rather than stacking modals. Moved above the
  // group/direct/room chat section (rather than staying down by
  // resetSecurityPin) so openDirectChat/openGroupChat/openRoomChat below can
  // close over it directly for Chat Lock's unlock-on-open check.
  const [pinGateRequest, setPinGateRequest] = useState(null); // { actionLabel } | null
  const pinGateResolverRef = useRef(null);
  const requireSecurityPin = useCallback((actionLabel) => {
    if (pinGateResolverRef.current) {
      pinGateResolverRef.current.reject(new Error('Cancelled'));
      pinGateResolverRef.current = null;
    }
    return new Promise((resolve, reject) => {
      pinGateResolverRef.current = { resolve, reject };
      setPinGateRequest({ actionLabel: actionLabel || '' });
    });
  }, []);
  const resolvePinGate = useCallback(() => {
    pinGateResolverRef.current?.resolve();
    pinGateResolverRef.current = null;
    setPinGateRequest(null);
  }, []);
  const cancelPinGate = useCallback(() => {
    pinGateResolverRef.current?.reject(new Error('Cancelled'));
    pinGateResolverRef.current = null;
    setPinGateRequest(null);
  }, []);

  // ---- group chat ----
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeGroupName, setActiveGroupName] = useState('');
  const [myGroups, setMyGroups] = useState([]); // every group the signed-in user belongs to

  // ---- room chat (community rooms with join rules + house rules) ----
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [activeRoomName, setActiveRoomName] = useState('');
  const [myRooms, setMyRooms] = useState([]); // every room the signed-in user belongs to
  const [discoverableRooms, setDiscoverableRooms] = useState([]); // public (open/approval) rooms the user hasn't joined yet - see Rooms tab's "Discover" section

  // ---- unified Chat hub (Direct / Groups / Rooms tabs, see ChatHubScreen) ----
  const [chatHubTab, setChatHubTab] = useState('direct'); // 'direct' | 'groups' | 'rooms'

  // ---- Chat Lock (WhatsApp-style per-thread lock, see chatLockService.js) ----
  // lockedChatIds holds "kind:id" keys (kind is 'direct' | 'group' | 'room')
  // for every thread the signed-in user has personally locked - it's a live
  // subscription so a lock/unlock made on another device shows up here too.
  // chatVaultUnlocked tracks whether they've already passed the security PIN
  // gate to view locked threads THIS session - like WhatsApp, it re-locks
  // (see the AppState listener below) whenever the app is backgrounded, so
  // leaving the app and coming back always re-prompts.
  const [lockedChatIds, setLockedChatIds] = useState([]);
  const [chatVaultUnlocked, setChatVaultUnlocked] = useState(false);

  // ---- Private vault unlock (Notepad + My Documents share this one flag;
  // Transfer Points intentionally does NOT - it always re-prompts) ----
  // Same shape as chatVaultUnlocked just above: passing the security PIN
  // gate for either screen sets this true, so opening the other one right
  // after doesn't ask again. Re-locks (see the same AppState listener
  // chatVaultUnlocked uses below) whenever the app leaves the foreground,
  // so background/switch-app/screen-off always re-prompts on return - it
  // never stays unlocked indefinitely just because it was entered once.
  const [privateVaultUnlocked, setPrivateVaultUnlocked] = useState(false);

  // ---- App Lock (whole-app PIN/biometric gate, separate from the vault
  // unlocks above) ---- appLockEnabled mirrors a per-device AsyncStorage
  // flag (src/firebase/appLockPrefs.js) - loaded once below and kept in
  // sync whenever setAppLockEnabled is called. appLocked is the live
  // "currently showing the lock screen" flag AppLockScreen.js reads; it's
  // set true both on cold launch (once the profile's securityPinSet is
  // known - see the effect below) and whenever the app leaves the
  // foreground (the AppState listener further below), same re-lock timing
  // as chatVaultUnlocked/privateVaultUnlocked. Turning App Lock on
  // requires a security PIN to already exist, since AppLockScreen checks
  // the PIN via the same verifySecurityPin call as Notepad/My Documents -
  // setAppLockEnabled runs the PIN setup gate first if one isn't set yet.
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [appLocked, setAppLocked] = useState(false);
  const appLockEnabledRef = useRef(false);
  useEffect(() => { appLockEnabledRef.current = appLockEnabled; }, [appLockEnabled]);
  // How long the app can sit backgrounded before the next foreground demands
  // PIN/biometric again. Below this, coming back (checking a notification,
  // switching to the camera for a QR scan, a quick app-switch) resumes
  // straight into the app - one biometric prompt should cover a whole
  // continuous session, not fire on every backgrounding. Session itself
  // (authUser) is untouched by any of this either way; only the lock
  // screen is gated - signing out still only happens via explicit logout.
  const APP_LOCK_GRACE_MS = 2 * 60 * 1000;
  const backgroundedAtRef = useRef(null);

  useEffect(() => {
    getAppLockEnabled().then(setAppLockEnabledState);
  }, []);

  const setAppLockEnabled = useCallback(async (value) => {
    if (value && !profile?.securityPinSet) {
      await requireSecurityPin('App Lock');
    }
    setAppLockEnabledState(value);
    await setAppLockEnabledPref(value);
  }, [requireSecurityPin, profile]);

  const unlockApp = useCallback(() => setAppLocked(false), []);

  // ---- Biometric opt-in (separate from App Lock's PIN, and from the
  // device's own biometric enrollment - see appLockPrefs.js's
  // BIOMETRIC_KEY comment for the three-state reasoning). null means
  // "never decided on this device" and is what triggers the one-time
  // BiometricOptInPrompt right after a fresh sign-in below.
  const [biometricEnabled, setBiometricEnabledState] = useState(null);
  const biometricPromptedRef = useRef(false);
  // Guards against a real race: on cold start with a persisted session,
  // authUser can resolve before this AsyncStorage read does, which would
  // otherwise show the prompt to someone who already decided (biometricEnabled
  // still null for one tick, not because it's genuinely undecided).
  const biometricPrefLoadedRef = useRef(false);

  useEffect(() => {
    getBiometricEnabledPref().then((v) => {
      biometricPrefLoadedRef.current = true;
      setBiometricEnabledState(v);
    });
  }, []);

  const setBiometricEnabled = useCallback(async (value) => {
    if (value && !profile?.securityPinSet) {
      await requireSecurityPin('Biometric Unlock');
    }
    if (value) {
      // Biometric unlock without App Lock being on doesn't mean anything -
      // opting in turns App Lock on too, same PIN-must-exist gate
      // setAppLockEnabled already runs.
      await setAppLockEnabled(true);
    }
    setBiometricEnabledState(value);
    await setBiometricEnabledPref(value);
  }, [profile, requireSecurityPin, setAppLockEnabled]);

  // Fires once per fresh sign-in (not on every render/re-auth of an
  // already-decided device): if this device has never been asked
  // (biometricEnabled === null, AND the pref load above has actually
  // finished - see biometricPrefLoadedRef) and the OS actually supports
  // biometrics, show the one-time opt-in prompt. Skipped entirely if the
  // device has no biometric hardware/enrollment - nothing to opt into.
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  useEffect(() => {
    if (!authUser || !biometricPrefLoadedRef.current || biometricEnabled !== null || biometricPromptedRef.current) return undefined;
    biometricPromptedRef.current = true;
    isBiometricAvailable().then((avail) => {
      if (avail) setShowBiometricPrompt(true);
    });
    return undefined;
  }, [authUser, biometricEnabled]);

  const dismissBiometricPrompt = useCallback(async (enable) => {
    setShowBiometricPrompt(false);
    if (enable) {
      await setBiometricEnabled(true);
    } else {
      // "Not Now" - remembered for the rest of this login, but NOT written
      // as a permanent "never ask" the way BIOMETRIC_KEY='0' would read if
      // set here too broadly; matches setBiometricEnabled(false) below so a
      // later logout still clears it back to null for the next sign-in.
      setBiometricEnabledState(false);
      await setBiometricEnabledPref(false);
    }
  }, [setBiometricEnabled]);


  // ---- voice / video calls (Agora) ----
  const [activeCall, setActiveCall] = useState(null); // the call doc currently on-screen (ringing/accepted)
  const [incomingCall, setIncomingCall] = useState(null); // a 1:1 call ringing FOR me
  const [incomingGroupCall, setIncomingGroupCall] = useState(null); // a group call ringing FOR me

  // ---- service wizard state (mirrors currentService/currentStep/totalSteps/serviceData) ----
  const [currentService, setCurrentService] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [serviceData, setServiceData] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // ---- dealer / admin data (live from Firestore) ----
  const [dealerTxs, setDealerTxs] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [topups, setTopups] = useState([]);
  const [dealerTab, setDealerTab] = useState('pending');
  const [adminTab, setAdminTab] = useState('all');
  // Whether Admin/Dealer Home is showing a Dashboard sub-section (e.g.
  // Pending, Rates, Banners) vs. its default landing view. Lifted out of
  // AdminHomeScreen/DealerHomeScreen local state so AdminFeaturesScreen /
  // DealerFeaturesScreen tiles - now the entry point for these sections,
  // see those files - can open a section directly by setting the tab +
  // this flag + navigating to adminHome/dealerHome, all in one tap.
  const [adminViewingSection, setAdminViewingSection] = useState(false);
  const [dealerViewingSection, setDealerViewingSection] = useState(false);

  // ---- reseller data (live from Firestore) - mirrors the dealer state
  // above, just scoped to resellerId instead of dealerId. 'pending' here
  // means "not yet forwarded to a dealer" (no dealerId set); 'sent' means
  // forwarded and now living in that dealer's own queue. ----
  const [resellerTxs, setResellerTxs] = useState([]);
  const [resellerTab, setResellerTab] = useState('pending');
  const [resellerViewingSection, setResellerViewingSection] = useState(false);

  // ---- rates ----
  const [rates, setRates] = useState(ratesService.DEFAULT_RATES);

  // ---- pricing settings: dealer point-transfer earning %, recharge
  // cost/profit % - admin-editable from Admin > Pricing (see
  // settingsService.js). ----
  const [pricing, setPricing] = useState(settingsService.DEFAULT_PRICING);

  // ---- feature access: which roles can open each admin/dealer/reseller
  // management tool - superadmin-editable from Superadmin > Feature Access
  // (see featureAccessService.js). Customer features (ServiceGrid) aren't
  // part of this - those stay identical for every role. ----
  const [featureAccess, setFeatureAccess] = useState(featureAccessService.DEFAULT_FEATURE_ACCESS);

  // PHASE 4 - Global/per-feature advertisement controls (ad_settings/general,
  // ad_feature_controls/{featureId}), subscribed once here rather than once
  // per SmartAd instance - a screen like Home mounts several SmartAd
  // placements at once, so a shared subscription avoids N redundant
  // Firestore listeners for the same two small config docs. Same
  // "merge with defaults, don't require a write just to read" shape as
  // featureAccess above - see adControlsService.js.
  const [adSettings, setAdSettings] = useState(adControlsService.DEFAULT_AD_SETTINGS);
  const [adFeatureControls, setAdFeatureControls] = useState(adControlsService.DEFAULT_AD_FEATURE_CONTROLS);
  // Next Update PRD §2 - Country/Region homepage config, read-only here
  // (writes are superadmin-only, direct from AdminHomeScreen's Homepage
  // tab - see homepageConfigService.updateCountryModules). Same
  // fail-quiet-on-listener-error shape as adSettings/adFeatureControls
  // above: a config hiccup just leaves the last-known/default layout in
  // place rather than surfacing as a broken home screen.
  const [homepageConfig, setHomepageConfig] = useState(homepageConfigService.DEFAULT_HOMEPAGE_CONFIG);
  // PHASE 9 - see the subscription below for why this is campaigns only
  // (not advertisers too) - keyed by doc id for adTargetingService's
  // getEligibleAds step 13 (campaignId -> AdCampaign).
  const [adCampaignsById, setAdCampaignsById] = useState({});

  // ---- Buy & Sell / Local Services category lists - admin-editable from
  // Admin > Categories (see categoryService.js). Every screen with a
  // category picker or filter chips reads these live instead of the
  // hardcoded arrays that used to live in marketplaceService.js /
  // serviceProviderService.js. ----
  const [marketplaceCategories, setMarketplaceCategories] = useState(categoryService.DEFAULT_CATEGORIES.marketplace);
  const [serviceCategories, setServiceCategories] = useState(categoryService.DEFAULT_CATEGORIES.services);

  // ---- live point cost per "point deduct" webview key, admin-editable
  // from Admin > Pricing > Point Feature Costs, with optional per-role
  // overrides from Admin > Pricing > Role-Based Pricing, superadmin-only
  // (see settingsService.priceForRole). Falls back to the matching
  // *_COST constant in data/countries.js only if the pricing doc somehow
  // has no value yet. This is the single source of truth openWebView
  // reads to lock a feature and show its price before letting anyone in -
  // see openWebView below. ----
  const pointCosts = useMemo(() => {
    const role = profile?.role;
    const access = settingsService.priceForRole(pricing, 'webviewAccessCost', role) ?? WEBVIEW_ACCESS_COST;
    const submit = settingsService.priceForRole(pricing, 'webviewSubmitCost', role) ?? WEBVIEW_SUBMIT_COST;
    const payment = settingsService.priceForRole(pricing, 'paymentSuccessCost', role) ?? PAYMENT_SUCCESS_COST;
    const map = {};
    ACCESS_CLICK_WEBVIEWS.forEach((key) => { map[key] = access; });
    SUBMIT_CHARGED_WEBVIEWS.forEach((key) => { map[key] = submit; });
    PAYMENT_CHARGED_WEBVIEWS.forEach((key) => { map[key] = payment; });
    return map;
  }, [pricing, profile?.role]);

  // How long a FOMEMA/Visa charge stays "unlocked" before the next search
  // charges again - admin-editable from Admin > Pricing > Access Window
  // (see settingsService.js). Falls back to WEBVIEW_ACCESS_WINDOW_HOURS
  // only if the pricing doc hasn't loaded yet.
  const accessWindowHours = pricing.webviewAccessWindowHours ?? WEBVIEW_ACCESS_WINDOW_HOURS;

  // ---- Notepad / My Documents / Salary & OT monthly subscription gate ----
  // Unlike the webview features above, these three are a recurring monthly
  // charge, not a per-click one: opening the module charges the admin-set
  // price once, then every further open is free until moduleSubscriptionDays
  // has passed since that charge (settings/pricing.moduleSubscription.{key}
  // on the user's own doc is the source of truth - see
  // moduleSubscriptionService.ensureModuleSubscription and chargeWallet's
  // 'module_subscription' kind, the real enforcement point). A cost of 0
  // (the default) skips the gate entirely, same as pointCosts above.
  const moduleSubscriptionCosts = useMemo(() => {
    const role = profile?.role;
    return {
      notepad: settingsService.priceForRole(pricing, 'notepadCost', role) ?? 0,
      myDocuments: settingsService.priceForRole(pricing, 'myDocumentsCost', role) ?? 0,
      salaryOt: settingsService.priceForRole(pricing, 'salaryOtCost', role) ?? 0,
    };
  }, [pricing, profile?.role]);
  const moduleSubscriptionDays = pricing.moduleSubscriptionDays ?? 30;

  const [moduleAccessBusy, setModuleAccessBusy] = useState(false);
  const ensureModuleAccess = useCallback(
    (key, enter) => {
      const cost = moduleSubscriptionCosts[key];
      if (!cost || !authUser?.uid) { enter(); return; }
      if (moduleAccessBusy) return;

      const windowMs = moduleSubscriptionDays * 24 * 60 * 60 * 1000;
      const lastCharge = profile?.moduleSubscription?.[key];
      const stillActive = !!lastCharge && Date.now() - lastCharge < windowMs;
      if (stillActive) { enter(); return; }

      const balance = typeof profile?.walletBalance === 'number' ? profile.walletBalance : 0;
      if (balance < cost) {
        showAlert(
          'MySheba',
          `This module needs a ${cost} pt/month subscription. Your current balance is ${balance} pts - top up your wallet first.`
        );
        return;
      }

      showAlert(
        'Monthly subscription',
        `This module costs ${cost} pts/month. Your current balance is ${balance} pts.\n\nSubscribe and continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Subscribe',
            onPress: async () => {
              setModuleAccessBusy(true);
              try {
                await ensureModuleSubscription(authUser.uid, key);
                enter();
              } catch (err) {
                showAlert('MySheba', err.message || `You need ${cost} pts for this - top up your wallet first.`);
              } finally {
                setModuleAccessBusy(false);
              }
            },
          },
        ]
      );
    },
    [authUser, moduleAccessBusy, profile, moduleSubscriptionCosts, moduleSubscriptionDays]
  );

  const openMyDocuments = useCallback(() => ensureModuleAccess('myDocuments', () => setScreen('myDocuments')), [ensureModuleAccess]);
  const openNotepad = useCallback(() => ensureModuleAccess('notepad', () => setScreen('notepad')), [ensureModuleAccess]);
  const openSalary = useCallback(() => ensureModuleAccess('salaryOt', () => setScreen('salaryDashboard')), [ensureModuleAccess]);
  // Date-range Work Log report (Start/End Work totals + PDF export/share) -
  // see src/screens/SalaryReportsScreen.js. Gated on the same 'salaryOt'
  // key as openSalary so a direct deep-link to Reports can't skip the
  // subscription charge.
  const openSalaryReports = useCallback(() => ensureModuleAccess('salaryOt', () => setScreen('salaryReports')), [ensureModuleAccess]);

  // ---- internet package price overrides, per operator - admin-editable
  // from Admin > Pricing (see internetPricingService.js). ----
  const [internetPricing, setInternetPricing] = useState({});

  // ---- Call/WhatsApp support numbers - admin-editable from Admin >
  // Support (see supportContactService.js). Blank until admin sets them. ----
  const [supportContact, setSupportContact] = useState(supportContactService.DEFAULT_SUPPORT_CONTACT);

  // ---- Official social media links (Facebook/Instagram/TikTok/LinkedIn/X)
  // + facebookAppId - admin-editable from Admin > Social (see
  // socialLinksService.js). Shown on the Support screen's "Follow us" row
  // and used by ShareListingSheet.js for Story-sharing attribution. ----
  const [socialLinks, setSocialLinks] = useState(socialLinksService.DEFAULT_SOCIAL_LINKS);

  // ---- JomPay biller ID/ref + DuitNow QR - superadmin-editable from
  // Admin > Payments (see paymentSettingsService.js). Blank until
  // superadmin sets them; Top-Up screens hide that method's details until
  // it has a value. ----
  const [paymentSettings, setPaymentSettings] = useState(paymentSettingsService.DEFAULT_PAYMENT_SETTINGS);

  // ---- home page banner slider (admin-managed) ----
  const [banners, setBanners] = useState([]);

  // ---- admin push announcement history ----
  const [announcements, setAnnouncements] = useState([]);

  // ---- notification bell: every signed-in user's own view of past
  // announcements addressed to 'all' or their role, plus whether there's
  // anything newer than their last visit to the Notifications screen. ----
  const [rawAnnouncements, setRawAnnouncements] = useState([]);

  // ---- webview ----
  const [webViewKey, setWebViewKey] = useState('fomema');
  const [webViewBusy, setWebViewBusy] = useState(false);

  // ---- rate popup / result modal (mirrors #ratePopup / #resultModal) ----
  const [ratePopupVisible, setRatePopupVisible] = useState(false);
  const [resultModal, setResultModal] = useState({ visible: false, kind: null, txId: '', service: '', details: '', amount: 0, total: 0, createdAt: null });

  const totalSteps = SERVICE_STEPS[currentService] || 3;

  // ---- bootstrap: watch Firebase auth state, then live-subscribe to the
  // signed-in user's profile doc so role/wallet changes made from the
  // Firebase console (or a future admin tool) show up immediately with no
  // re-login needed. Role is never chosen in the UI - it's whatever is on
  // file for this uid. ----
  useEffect(() => {
    let profileUnsub = null;
    let initialRouteDone = false;

    const unsub = authService.subscribeAuth((user) => {
      setAuthUser(user);
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (!user) {
        setProfile(null);
        setAppLocked(false);
        if (!initialRouteDone) { initialRouteDone = true; setAuthLoading(false); }
        return;
      }

      profileUnsub = authService.subscribeProfile(
        user.uid,
        (p) => {
          // Single-device-login enforcement (functions/deviceSessionService.js) -
          // runs on every live profile update, not just the first, so a
          // device that's been displaced by a newer login elsewhere signs
          // itself out the moment Firestore reflects that, not just on
          // its own next login attempt. Two things are checked, in order:
          //   1. This device is mid-verification (pendingDeviceApproval
          //      targets our own deviceId - e.g. the app was closed and
          //      reopened between sending the code and entering it) ->
          //      route to the verification screen instead of a dashboard.
          //   2. Some OTHER device has since become the active session
          //      (activeSessionId no longer matches what this device
          //      saved locally after its own last successful
          //      login/verification) -> sign out immediately.
          // Wrapped in try/catch and fails open into the normal routing
          // below on any error - a device-check hiccup shouldn't brick
          // login for everyone, it just skips this extra hardening once.
          (async () => {
            if (!p) {
              setProfile(null);
              if (!initialRouteDone) { initialRouteDone = true; setAuthLoading(false); }
              return;
            }

            try {
              const deviceId = await deviceSessionService.getDeviceId();

              if (p.pendingDeviceApproval && p.pendingDeviceApproval.deviceId === deviceId) {
                setPendingDeviceVerification({ uid: user.uid, email: p.email || '' });
                setProfile(p);
                setScreen('deviceVerify');
                if (!initialRouteDone) { initialRouteDone = true; setAuthLoading(false); }
                return;
              }

              const localSessionId = await deviceSessionService.getLocalSessionId();
              if (localSessionId && p.activeSessionId && p.activeSessionId !== localSessionId) {
                // Do not sign the user out merely because the app was closed,
                // backgrounded, or restored after a device-session refresh.
                // Firebase Auth persistence is the source of truth for app
                // restart. A deliberate logout still goes through authService.logout().
                // While the app is actively running, a changed active session
                // is handled on the next profile update rather than destroying
                // the persisted login during bootstrap.
                if (initialRouteDone) {
                  await authService.logout();
                  setProfile(null);
                  screenHistoryRef.current = [];
                  setScreen('login');
                  showAlert('Signed Out', 'Your account was signed in on another device, so you were signed out here.');
                  return;
                }
              }
            } catch (e) {
              // fall through to normal routing below
            }

            setProfile(p);
            if (!initialRouteDone) {
              initialRouteDone = true;
              // Restoring a persisted session on app launch - jump straight
              // to the right home screen for this account's role instead of
              // showing Login again.
              if (p && (p.role === 'dealer' || p.role === 'dealer')) setScreen('dealerHome');
              else if (p && p.role === 'reseller') setScreen('resellerHome');
              else if (p && (p.role === 'admin' || p.role === 'superadmin')) setScreen('adminHome');
              else setScreen('customerHome');
              setAuthLoading(false);
            }
          })();
        },
        () => {
          setProfile(null);
          if (!initialRouteDone) { initialRouteDone = true; setAuthLoading(false); }
        }
      );
    });

    return () => {
      unsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  // ---- push notifications: once signed in, ask for permission and save
  // this device's Expo push token onto the profile doc so Cloud Functions
  // can notify this user later (order status changes, etc). Runs once per
  // uid (guarded by the ref) rather than on every profile update, since the
  // token itself doesn't change on every render. ----
  const pushRegisteredForUid = useRef(null);
  useEffect(() => {
    if (!authUser || !profile) return;
    if (pushRegisteredForUid.current === authUser.uid) return;
    pushRegisteredForUid.current = authUser.uid;

    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token && token !== profile.pushToken) {
        try {
          await authService.updatePushToken(authUser.uid, token, Platform.OS);
        } catch (e) {
          // Non-fatal - notifications just won't reach this device until
          // the next successful registration (e.g. next app launch).
        }
      }

      // Separate raw FCM token, used only to route the full-screen incoming
      // call notification (see pushService.js getFcmToken for why this is
      // distinct from the Expo token above). Android only.
      const fcmToken = await getFcmToken();
      if (fcmToken && fcmToken !== profile.fcmToken) {
        try {
          await authService.updateFcmToken(authUser.uid, fcmToken);
        } catch (e) {
          // Non-fatal - calls just fall back to the quieter heads-up push
          // until the next successful registration.
        }
      }
    })();
  }, [authUser, profile]);


  useEffect(() => {
    if (!authUser) return undefined;
    ratesService.ensureRates().catch(() => {});
    const unsub = ratesService.subscribeRates(
      (r) => setRates(r),
      logListenerError('rates')
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    settingsService.ensurePricing().catch(() => {});
    const unsub = settingsService.subscribePricing(
      (p) => setPricing(p),
      logListenerError('pricing')
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    featureAccessService.ensureFeatureAccess().catch(() => {});
    const unsub = featureAccessService.subscribeFeatureAccess(
      (fa) => setFeatureAccess(fa),
      logListenerError('featureAccess')
    );
    return unsub;
  }, [authUser]);

  // PHASE 4 - see adSettings/adFeatureControls state above. Read-only here
  // (writes are superadmin-only Cloud Functions via AdFeatureControlsScreen)
  // - a listener error just leaves the last-known/default value in place,
  // same fail-quiet behavior SmartAd itself needs (an ad config hiccup must
  // never surface as an app error).
  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = adControlsService.subscribeAdSettings(
      (s) => setAdSettings(s),
      logListenerError('adSettings')
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = adControlsService.subscribeAdFeatureControls(
      (fc) => setAdFeatureControls(fc),
      logListenerError('adFeatureControls')
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = homepageConfigService.subscribeHomepageConfig(
      (c) => setHomepageConfig(c),
      logListenerError('homepageConfig')
    );
    return unsub;
  }, [authUser]);

  // PHASE 9 - powers adTargetingService.getEligibleAds's step 13 (a
  // banner attached to a paused/expired campaign stops showing). Only
  // ad_campaigns is subscribed here, not ad_advertisers - firestore.rules
  // scopes ad_advertisers read to isAdmin() (no customer-facing reason to
  // browse advertiser records - see that collection's own rules comment),
  // so a plain customer's session can't read it at all; wiring it in here
  // for every signed-in user would throw a permission-denied on every
  // non-admin login. getEligibleAds already fails open when
  // options.advertisersById is omitted (see its own doc comment), so
  // campaign-level eligibility (readable by any signedIn() user) is
  // enforced for everyone, while advertiser-level suspension only takes
  // effect inside admin-only screens that separately load ad_advertisers
  // themselves (AdvertiserManagementScreen, AdvertiserDetailScreen).
  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = adService.subscribeCampaigns(
      (list) => setAdCampaignsById(Object.fromEntries(list.map((c) => [c.id, c]))),
      logListenerError('adCampaigns')
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = categoryService.subscribeCategories('marketplace', setMarketplaceCategories, logListenerError('marketplaceCategories'));
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = categoryService.subscribeCategories('services', setServiceCategories, logListenerError('serviceCategories'));
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    supportContactService.ensureSupportContact().catch(() => {});
    const unsub = supportContactService.subscribeSupportContact(
      (c) => setSupportContact(c),
      logListenerError('supportContact')
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    socialLinksService.ensureSocialLinks().catch(() => {});
    const unsub = socialLinksService.subscribeSocialLinks(
      (s) => setSocialLinks(s),
      logListenerError('socialLinks')
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    paymentSettingsService.ensurePaymentSettings().catch(() => {});
    const unsub = paymentSettingsService.subscribePaymentSettings(
      (s) => setPaymentSettings(s),
      logListenerError('paymentSettings')
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = internetPricingService.subscribeInternetPricing(
      (map) => setInternetPricing(map),
      logListenerError('internetPricing')
    );
    return unsub;
  }, [authUser]);

  // ---- banners: fetched for every signed-in user (Admin needs the full
  // list including inactive ones to manage; BannerSlider.js filters down
  // to active-only for display, same "one subscription, filter at the
  // point of use" pattern as rates). ----
  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = bannerService.subscribeBanners(
      (list) => setBanners(list),
      logListenerError('banners')
    );
    return unsub;
  }, [authUser]);

  // ---- live broadcast transactions. Admin/superadmin see the same full
  // stream; Dealer and Reseller dashboards share the pending/processing/
  // completed broadcast pool. Customer history remains separate below.
  useEffect(() => {
    const needsTx = screen === 'dealerHome' || screen === 'adminHome' || screen === 'reports' || screen === 'resellerHome';
    const role = profile && profile.role;
    if (!needsTx || !role || !authUser) return undefined;

    const isStaffQueue = ['dealer', 'reseller', 'admin', 'superadmin'].includes(role);
    if (!isStaffQueue) return undefined;

    // Phase 10: Dealer and Reseller no longer share one undifferentiated
    // queue - each only ever sees the specific service(s) their tier owns
    // (enforced server-side too, see firestore.rules' canHandleTransaction()
    // - this filter is UX, that's the actual security boundary). Admin/
    // superadmin keep the full unfiltered stream, same as before.
    const unsub = transactionService.subscribeBroadcastTransactions(
      (txs) => {
        if (role === 'admin' || role === 'superadmin') {
          setDealerTxs(txs);
          setResellerTxs(txs);
        } else if (role === 'dealer') {
          setDealerTxs(txs.filter((t) => t.service === 'Mobile Banking'));
        } else if (role === 'reseller') {
          setResellerTxs(txs.filter((t) => ['Recharge', 'Internet', 'Remittance'].includes(t.service)));
        }
      },
      logListenerError('transactions:broadcast')
    );
    return unsub;
  }, [screen, profile, authUser]);

  // ---- admin push announcement history, only needed on the Admin
  // dashboard (Admin > Announcements), and only for admin/superadmin -
  // scoped to that screen just to avoid an always-on listener nobody but
  // admin looks at. (Every signed-in user - not just admin - can read this
  // collection per firestore.rules; see the separate listener below that
  // powers the customer-facing notification bell.) ----
  useEffect(() => {
    const role = profile && profile.role;
    const needsAnnouncements = screen === 'adminHome' && (role === 'admin' || role === 'superadmin');
    if (!needsAnnouncements) return undefined;
    const unsub = announcementService.subscribeAnnouncements(
      (list) => setAnnouncements(list),
      logListenerError('announcements')
    );
    return unsub;
  }, [screen, profile]);

  // ---- notification bell feed: any signed-in user (not just admin) reads
  // the same announcement log and filters it client-side to what's actually
  // addressed to them ('all' or their own role) - see firestore.rules,
  // which opens read access to any signed-in user for this reason. ----
  useEffect(() => {
    if (!authUser) { setRawAnnouncements([]); return undefined; }
    const unsub = announcementService.subscribeAnnouncements(
      (list) => setRawAnnouncements(list),
      logListenerError('myAnnouncements')
    );
    return unsub;
  }, [authUser]);

  const myNotifications = useMemo(() => {
    const role = profile && profile.role;
    if (!role) return [];
    return rawAnnouncements.filter((a) => a.audience === 'all' || a.audience === role);
  }, [rawAnnouncements, profile]);

  const hasUnreadNotifications = useMemo(() => {
    if (myNotifications.length === 0) return false;
    const lastSeen = profile && profile.lastSeenAnnouncementAt;
    if (!lastSeen) return true;
    const lastSeenMs = lastSeen.toMillis ? lastSeen.toMillis() : new Date(lastSeen).getTime();
    return myNotifications.some((a) => {
      const createdMs = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      return createdMs > lastSeenMs;
    });
  }, [myNotifications, profile]);

  const markNotificationsSeen = useCallback(() => {
    if (!authUser) return;
    authService.markAnnouncementsSeen(authUser.uid).catch(() => {});
  }, [authUser]);

  // ---- live inquiries: Admin dashboard sees every inquiry (Flight/Bus/
  // Train, legacy types included). Phase 10: Reseller now owns Flight
  // inquiries specifically (see firestore.rules' inquiries update rule),
  // so resellerHome also subscribes, filtered to type == 'flight' only -
  // Bus/Train are WebView bookings now and never reach a reseller. ----
  useEffect(() => {
    const role = profile && profile.role;
    const isAdminScreen = (screen === 'adminHome' || screen === 'reports') && ['admin', 'superadmin'].includes(role);
    const isResellerScreen = screen === 'resellerHome' && role === 'reseller';
    if (!isAdminScreen && !isResellerScreen) return undefined;
    const unsub = inquiryService.subscribeInquiries(
      (list) => setInquiries(isResellerScreen ? list.filter((i) => i.type === 'flight') : list),
      logListenerError('inquiries')
    );
    return unsub;
  }, [screen, profile]);

  // ---- live top-up requests, only needed on the Admin dashboard ----
  useEffect(() => {
    const isStaff = profile && ['admin', 'superadmin'].includes(profile.role);
    if ((screen !== 'adminHome' && screen !== 'reports') || !isStaff) return undefined;
    const unsub = topupService.subscribeTopups(
      (list) => setTopups(list),
      logListenerError('topups')
    );
    return unsub;
  }, [screen, profile]);

  // ---- live chat unread badge - customers watch their own thread; staff watch every thread's total. ----
  useEffect(() => {
    if (!authUser || !profile) { setChatUnreadCount(0); return undefined; }
    const isStaff = ['dealer', 'reseller', 'admin', 'superadmin'].includes(profile.role);
    if (isStaff) {
      const unsub = chatService.subscribeAllChats(
        (list) => setChatUnreadCount(list.reduce((sum, c) => sum + (c.unreadForStaff || 0), 0)),
        logListenerError('chats:staff')
      );
      return unsub;
    }
    const unsub = chatService.subscribeChatMeta(
      authUser.uid,
      (meta) => setChatUnreadCount(meta ? meta.unreadForCustomer || 0 : 0),
      logListenerError('chats:customer')
    );
    return unsub;
  }, [authUser, profile]);

  // ---- live direct-chat unread badge - same logic for every role, since
  // direct chats have no staff/customer asymmetry. ----
  useEffect(() => {
    if (!authUser) { setDirectChatUnreadCount(0); return undefined; }
    const unsub = directChatService.subscribeMyChats(
      authUser.uid,
      (list) => setDirectChatUnreadCount(list.reduce((sum, c) => sum + ((c.unreadCounts && c.unreadCounts[authUser.uid]) || 0), 0)),
      logListenerError('directChats')
    );
    return unsub;
  }, [authUser]);

  // ---- live list of groups the signed-in user belongs to ----
  useEffect(() => {
    if (!authUser) { setMyGroups([]); return undefined; }
    const unsub = groupChatService.subscribeMyGroups(authUser.uid, (list) => setMyGroups(list), logListenerError('groupChats'));
    return unsub;
  }, [authUser]);

  // ---- live list of rooms the signed-in user belongs to ----
  useEffect(() => {
    if (!authUser) { setMyRooms([]); return undefined; }
    const unsub = roomChatService.subscribeMyRooms(authUser.uid, (list) => setMyRooms(list), logListenerError('roomChats'));
    return unsub;
  }, [authUser]);

  // ---- live list of public (open/approval) rooms the user can discover and
  // join but isn't a member of yet - e.g. the seeded GameBot rooms. Without
  // this, a room only ever appeared once someone was already a member of it. ----
  useEffect(() => {
    if (!authUser) { setDiscoverableRooms([]); return undefined; }
    const unsub = roomChatService.subscribeDiscoverableRooms(authUser.uid, (list) => setDiscoverableRooms(list), logListenerError('roomChats'));
    return unsub;
  }, [authUser]);

  // ---- live list of "kind:id" keys the signed-in user has locked (Chat Lock) ----
  useEffect(() => {
    if (!authUser) { setLockedChatIds([]); setChatVaultUnlocked(false); setPrivateVaultUnlocked(false); return undefined; }
    const unsub = chatLockService.subscribeLockedChats(authUser.uid, (keys) => setLockedChatIds(keys), logListenerError('lockedChats'));
    return unsub;
  }, [authUser]);

  // Re-locks the Locked Chats vault AND the Notepad/My Documents private
  // vault whenever the app leaves the foreground - same behavior as
  // WhatsApp's chat lock, so background/switch-app/screen-off always
  // requires the security PIN again on return, rather than staying
  // unlocked indefinitely once entered once. (Transfer Points is
  // deliberately not included here - see requireSecurityPin call in
  // TransferPointsScreen, which never checks privateVaultUnlocked.)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { setChatVaultUnlocked(false); setPrivateVaultUnlocked(false); }
    });
    return () => sub.remove();
  }, []);

  // App Lock: separate effect from the vault re-lock above since it needs
  // to read appLockEnabled/authUser (which change rarely, so resubscribing
  // on their change is cheap - unlike chatVaultUnlocked/privateVaultUnlocked
  // above, which change constantly and would thrash a listener with those
  // as deps). Only re-locks on RETURNING to active, and only if the app
  // was actually away for at least APP_LOCK_GRACE_MS - records the
  // backgrounding timestamp when leaving, then checks the gap on return.
  // A quick background/foreground (notification peek, QR scanner, sharing
  // to another app) comes straight back in with no PIN/biometric prompt;
  // only a genuine gap re-locks. This trades away the old
  // lock-screen-already-covering-content-on-return behavior for not
  // nagging biometric every single backgrounding within one sitting.
  useEffect(() => {
    if (!appLockEnabled || !authUser) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        backgroundedAtRef.current = Date.now();
      } else if (backgroundedAtRef.current && Date.now() - backgroundedAtRef.current >= APP_LOCK_GRACE_MS) {
        setAppLocked(true);
        backgroundedAtRef.current = null;
      } else {
        backgroundedAtRef.current = null;
      }
    });
    return () => sub.remove();
  }, [appLockEnabled, authUser]);

  // Cold-launch lock: once the profile has loaded and confirms a security
  // PIN actually exists (appLockEnabled alone isn't enough - AppLockScreen
  // has nothing to check against without one), require unlock immediately
  // rather than only after the first backgrounding.
  useEffect(() => {
    if (appLockEnabled && authUser && profile?.securityPinSet) setAppLocked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLockEnabled, authUser?.uid, profile?.securityPinSet]);

  // Listens for a call ringing FOR me no matter what screen I'm on, so the
  // incoming-call prompt can show up over any screen (see IncomingCallModal).
  useEffect(() => {
    if (!authUser) { setIncomingCall(null); return undefined; }
    const unsub = callService.subscribeIncomingCalls(authUser.uid, (call) => {
      // Don't re-prompt for a call I'm already on.
      setIncomingCall(call && call.id !== activeCall?.id ? call : null);
    });
    return unsub;
  }, [authUser, activeCall]);

  // Same idea as the listener above, but for group calls (see
  // subscribeIncomingGroupCalls - keyed off ringingUids instead of a single
  // calleeUid, since several people can be rung at once).
  useEffect(() => {
    if (!authUser) { setIncomingGroupCall(null); return undefined; }
    const unsub = callService.subscribeIncomingGroupCalls(authUser.uid, (call) => {
      setIncomingGroupCall(call && call.id !== activeCall?.id ? call : null);
    });
    return unsub;
  }, [authUser, activeCall]);

  /** Starts a call with another user and switches to the call screen.
   * `caller` is supplied by the call site (e.g. ChatScreen) rather than
   * built here, so it always reflects the profile the screen has in hand. */
  const startCall = useCallback(async (caller, callee, type = 'video') => {
    if (!authUser) return;
    const { callId, channelName } = await callService.startCall(caller, callee, type);
    setActiveCall({ id: callId, channelName, type, callerUid: caller.uid, callerName: caller.name,
      calleeUid: callee.uid, calleeName: callee.name });
    setScreen('call');
  }, [authUser]);

  /** Accepts the currently-ringing incoming call and switches to the call screen. */
  const answerIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    await callService.acceptCall(incomingCall.id);
    setActiveCall(incomingCall);
    setIncomingCall(null);
    setScreen('call');
  }, [incomingCall]);

  /** Declines the currently-ringing incoming call without joining. */
  const rejectIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    await callService.declineCall(incomingCall.id);
    setIncomingCall(null);
  }, [incomingCall]);

  /** Starts a group call - rings every other member of `group` ({id, name,
   * memberUids, memberNames}, a groupChats doc) and switches to the call
   * screen for the caller right away, same as startCall. `caller` is
   * supplied by the call site, same reasoning as startCall above. */
  const startGroupCall = useCallback(async (caller, group, type = 'video') => {
    if (!authUser) return;
    const { callId, channelName } = await callService.startGroupCall(caller, group, type);
    const calleeUids = (group.memberUids || []).filter((uid) => uid !== caller.uid);
    setActiveCall({
      id: callId, channelName, type, isGroup: true,
      groupId: group.id, groupName: group.name || 'Group',
      callerUid: caller.uid, callerName: caller.name,
      participantUids: [caller.uid, ...calleeUids],
      participantNames: { ...(group.memberNames || {}), [caller.uid]: caller.name },
      ringingUids: calleeUids,
      activeUids: [caller.uid],
      status: 'ringing',
    });
    setScreen('call');
  }, [authUser]);

  /** Accepts the currently-ringing incoming group call and switches to the call screen. */
  const answerIncomingGroupCall = useCallback(async () => {
    if (!incomingGroupCall || !authUser) return;
    await callService.acceptGroupCall(incomingGroupCall.id, authUser.uid);
    setActiveCall(incomingGroupCall);
    setIncomingGroupCall(null);
    setScreen('call');
  }, [incomingGroupCall, authUser]);

  /** Declines the currently-ringing incoming group call without joining. */
  const rejectIncomingGroupCall = useCallback(async () => {
    if (!incomingGroupCall || !authUser) return;
    await callService.declineGroupCall(incomingGroupCall.id, authUser.uid);
    setIncomingGroupCall(null);
  }, [incomingGroupCall, authUser]);

  const groupUnreadCount = myGroups.reduce(
    (sum, g) => sum + ((g.unreadCounts && authUser && g.unreadCounts[authUser.uid]) || 0),
    0
  );

  const roomUnreadCount = myRooms.reduce(
    (sum, r) => sum + ((r.unreadCounts && authUser && r.unreadCounts[authUser.uid]) || 0),
    0
  );

  // Badge shown on the bottom-nav "Chat" tab - the sum across all three
  // thread kinds now that Direct/Groups/Rooms live behind one entry point.
  const chatHubUnreadCount = directChatUnreadCount + groupUnreadCount + roomUnreadCount;

  // ---- Chat Lock helpers (kind is 'direct' | 'group' | 'room') ----
  /** Whether the signed-in user has personally locked this thread. */
  const isChatLocked = useCallback((kind, id) => (
    !!kind && !!id && lockedChatIds.includes(chatLockService.lockKey(kind, id))
  ), [lockedChatIds]);

  /** If `kind`/`id` is a locked thread and the Locked Chats vault isn't
   * already unlocked this session, prompts the security PIN gate before
   * letting the caller proceed - resolves true once it's safe to open the
   * thread, false if the person cancelled. Unlocked/non-locked threads
   * resolve true immediately with no prompt. */
  const ensureChatUnlocked = useCallback(async (kind, id) => {
    if (!isChatLocked(kind, id) || chatVaultUnlocked) return true;
    try {
      await requireSecurityPin('this locked chat');
      setChatVaultUnlocked(true);
      return true;
    } catch (e) {
      return false;
    }
  }, [isChatLocked, chatVaultUnlocked, requireSecurityPin]);

  /** Locks a thread so it's hidden from the normal Chat hub list and only
   * reachable from Locked Chats behind the security PIN. */
  const lockChatThread = useCallback(async (kind, id) => {
    if (!authUser || !kind || !id) return;
    await chatLockService.lockChat(authUser.uid, kind, id);
  }, [authUser]);

  /** Reverses lockChatThread - the thread returns to the normal Chat hub list. */
  const unlockChatThread = useCallback(async (kind, id) => {
    if (!authUser || !kind || !id) return;
    await chatLockService.unlockChat(authUser.uid, kind, id);
  }, [authUser]);

  /** Enters the Locked Chats folder - prompts the security PIN if the vault
   * isn't already unlocked this session, then switches screens. */
  const openLockedChats = useCallback(async () => {
    if (!chatVaultUnlocked) {
      try {
        await requireSecurityPin('Locked Chats');
        setChatVaultUnlocked(true);
      } catch (e) {
        return;
      }
    }
    setScreen('lockedChats');
  }, [chatVaultUnlocked, requireSecurityPin]);

  /** Opens the Support thread - `chatId` is the customer's uid, `name` is
   * who to show in the header/inbox. `returnTo` (staff only) is which
   * screen the back button should land on - defaults to the Chats inbox
   * ('chatList') to match every existing caller; AdminSupportScreen's
   * "Messages" tab passes 'adminSupport' so back returns there instead. */
  const openChat = useCallback((chatId, name, returnTo) => {
    setActiveChatId(chatId);
    setActiveGroupId(null);
    setActiveDirectChatId(null);
    setActiveRoomId(null);
    setActiveChatName(name || '');
    setActiveChatReturnTo(returnTo || 'chatList');
    setScreen('chat');
  }, []);

  /** Opens a group chat thread. If it's locked and the Locked Chats vault
   * isn't already unlocked this session, prompts the security PIN first
   * (see ensureChatUnlocked) - stays on the current screen if cancelled. */
  const openGroupChat = useCallback(async (groupId, name) => {
    if (!(await ensureChatUnlocked('group', groupId))) return;
    setActiveGroupId(groupId);
    setActiveChatId(null);
    setActiveDirectChatId(null);
    setActiveRoomId(null);
    setActiveGroupName(name || '');
    setScreen('chat');
  }, [ensureChatUnlocked]);

  /** Opens a direct (1:1, any-role) chat thread - `chatId` is the directChats doc id, `name` is the other participant's name, `otherUid` is their uid (needed to start a call from the chat header). Optional `draftText` prefills (but doesn't send) the message box, e.g. for "message customer about this order". If it's locked and the Locked Chats vault isn't already unlocked this session, prompts the security PIN first (see ensureChatUnlocked) - stays on the current screen if cancelled. */
  const openDirectChat = useCallback(async (chatId, name, otherUid, draftText) => {
    if (!(await ensureChatUnlocked('direct', chatId))) return;
    setActiveDirectChatId(chatId);
    setActiveChatId(null);
    setActiveGroupId(null);
    setActiveRoomId(null);
    setActiveDirectChatName(name || '');
    setActiveDirectChatUid(otherUid || null);
    if (draftText) setChatDraftText(draftText);
    setScreen('chat');
  }, [ensureChatUnlocked]);

  /** Opens a room chat thread. If it's locked and the Locked Chats vault
   * isn't already unlocked this session, prompts the security PIN first
   * (see ensureChatUnlocked) - stays on the current screen if cancelled. */
  const openRoomChat = useCallback(async (roomId, name) => {
    if (!(await ensureChatUnlocked('room', roomId))) return;
    setActiveRoomId(roomId);
    setActiveChatId(null);
    setActiveGroupId(null);
    setActiveDirectChatId(null);
    setActiveRoomName(name || '');
    setScreen('chat');
  }, [ensureChatUnlocked]);

  /**
   * Joins a room surfaced in the Rooms tab's "Discover" section. 'open'
   * rooms join instantly and go straight into the thread; 'approval' rooms
   * file a join request and stay on the list (nothing to open yet - the
   * room only shows up under "My Rooms" once an admin approves it and it
   * starts appearing in subscribeMyRooms). Returns 'joined' | 'requested'
   * so the screen can show the right feedback.
   */
  const joinDiscoverableRoom = useCallback(async (room) => {
    if (!authUser || !room?.id) return null;
    if (room.type === 'approval') {
      await roomChatService.requestToJoinRoom(room.id, { uid: authUser.uid, name: profile?.name || '' });
      return 'requested';
    }
    await roomChatService.joinRoom(room.id, { uid: authUser.uid, name: profile?.name || '' });
    openRoomChat(room.id, room.name || 'Room Chat');
    return 'joined';
  }, [authUser, profile, openRoomChat]);

  /** Opens the unified Chat hub (Direct / Groups / Rooms tabs), optionally landing on a specific tab. */
  const openChatHub = useCallback((tab) => {
    if (tab) setChatHubTab(tab);
    setScreen('chatHub');
  }, []);

  // ---- push notification taps: jump to the right thread when the user
  // taps a notification, whether the app was foregrounded, backgrounded, or
  // fully closed. Re-subscribes whenever authUser changes (login/logout) so
  // the closure below never acts on a stale uid. addNotificationResponseListener
  // alone misses the tap that cold-launched the app, so that case is
  // covered separately via getLastNotificationResponseAsync. ----
  useEffect(() => {
    if (!authUser) return undefined;

    const handleResponse = async (response) => {
      const data = response?.notification?.request?.content?.data || {};
      try {
        if (data.type === 'chat' && data.chatId) {
          openChat(data.chatId, 'Support');
        } else if (data.type === 'directChat' && data.chatId) {
          const meta = await directChatService.getDirectChatMeta(data.chatId);
          const otherUid = meta?.participants?.find((uid) => uid !== authUser.uid);
          const name = (otherUid && meta?.participantNames?.[otherUid]) || 'Chat';
          openDirectChat(data.chatId, name, otherUid);
        } else if (data.type === 'groupChat' && data.groupId) {
          const meta = await groupChatService.getGroupMeta(data.groupId);
          openGroupChat(data.groupId, meta?.name || 'Group Chat');
        } else if (data.type === 'roomChat' && data.roomId) {
          const meta = await roomChatService.getRoomMeta(data.roomId);
          openRoomChat(data.roomId, meta?.name || 'Room Chat');
        } else if (data.type === 'topup') {
          // Admin/superadmin get notified of a new request to review; the
          // requester gets notified once it's approved/rejected. Route each
          // to wherever that status actually lives for them - staff never
          // see their own self-topups in this queue (see topupService).
          const isStaff = profile && (profile.role === 'admin' || profile.role === 'superadmin');
          if (isStaff) { setAdminTab('topups'); setScreen('adminHome'); }
          else setScreen('history');
        } else if (data.type === 'supportTicket') {
          // Every new ticket lands with superadmin first, who decides
          // whether to appoint an admin or dealer to solve it - so only
          // superadmin gets routed to the full queue here. The requester
          // (and any admin who gets appointed) sees status/assignment
          // updates on their own Support screen instead.
          const isSuperadmin = profile && profile.role === 'superadmin';
          setScreen(isSuperadmin ? 'adminSupport' : 'support');
        }
        // 'call' notifications need no explicit navigation here - the
        // system-wide incoming-call listener above already surfaces
        // IncomingCallModal over whatever screen is active as soon as the
        // app opens, as long as the call is still ringing.
      } catch (e) {
        // Non-fatal - worst case the user lands on their home screen
        // instead of the exact thread and can navigate there manually.
      }
    };

    getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });
    const sub = addNotificationResponseListener(handleResponse);
    return () => sub.remove();
  }, [authUser, profile, openChat, openDirectChat, openGroupChat, openRoomChat, setAdminTab, setScreen]);

  const openResult = useCallback((kind, txId, svc, extra) => {
    setResultModal({
      visible: true,
      kind,
      txId,
      service: svc,
      details: (extra && extra.details) || '',
      amount: (extra && extra.amount) || 0,
      total: (extra && extra.total) || 0,
      createdAt: Date.now(),
    });
  }, []);

  const closeResult = useCallback(() => {
    setResultModal({ visible: false, kind: null, txId: '', service: '', details: '', amount: 0, total: 0, createdAt: null });
  }, []);

  const openSidebar = useCallback(() => setSidebarVisible(true), []);
  const closeSidebar = useCallback(() => setSidebarVisible(false), []);

  // Home screens where there's nowhere further back to go - hitting back
  // here arms a "press again to exit" confirmation instead of leaving.
  const HOME_SCREENS = ['customerHome', 'dealerHome', 'resellerHome', 'adminHome'];

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const onBackPress = () => {
      if (sidebarVisible) {
        closeSidebar();
        return true;
      }
      // A home screen (Customer/Dealer/Admin) showing a local sub-section
      // gets first refusal - closes the sub-section instead of navigating
      // away from the dashboard or arming the exit-app confirmation.
      if (homeBackInterceptorRef.current && homeBackInterceptorRef.current()) {
        return true;
      }
      // On the webview screen: let the in-page site's own history (e.g.
      // the gov't status-check pages, FOMEMA's clinic finder, bus partner sites)
      // step backward first, so back only leaves the screen once the user
      // is already at that site's own entry page.
      if (screen === 'webview' && webViewBackInterceptorRef.current && webViewBackInterceptorRef.current()) {
        return true;
      }
      // Mid-wizard on the service screen: step back one field-group at a
      // time (same as the on-screen "← Back" button in the nav bar)
      // before ever touching the outer screen history - otherwise
      // hardware back would skip every step and jump straight to
      // whatever screen opened the wizard.
      if (screen === 'service' && currentStep > 0) {
        setCurrentStep((s) => Math.max(0, s - 1));
        return true;
      }
      // A home screen (Customer/Dealer/Reseller/Admin) is the app's
      // landing point once signed in - there's nowhere further "back" to
      // go inside the app from here, only out. Checked BEFORE goBack()
      // and regardless of whatever's left in screenHistoryRef, so back
      // from Home always arms/confirms the exit-app prompt - never steps
      // back into a feature screen or (impossible anyway, since login is
      // a PRE_AUTH_SCREEN - see above) the login page.
      if (HOME_SCREENS.includes(screen)) {
        if (exitArmedRef.current) {
          BackHandler.exitApp();
          return true;
        }
        exitArmedRef.current = true;
        if (Platform.OS === 'android') {
          ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        }
        setTimeout(() => { exitArmedRef.current = false; }, 2000);
        return true;
      }
      const wentBack = goBack();
      if (wentBack) return true;

      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [screen, sidebarVisible, goBack, closeSidebar, currentStep]);

  const goHome = useCallback(() => {
    const r = profile ? profile.role : '';
    // Closing a Dashboard sub-section (e.g. Rates, Banners) so tapping Home
    // while inside one actually returns to the grid landing view. Just
    // calling setScreen() below is a no-op when we're already on
    // adminHome/dealerHome, which is exactly the case here - the sub-section
    // is a flag on the same screen, not a different `screen` value - so
    // without this, the Home button would silently do nothing.
    setAdminViewingSection(false);
    setDealerViewingSection(false);
    setResellerViewingSection(false);
    // Home is the app's landing point once signed in - whatever screen
    // trail got you here shouldn't still be poppable afterward, or the
    // hardware back button below would step back INTO that trail instead
    // of arming the exit-app confirmation (see onBackPress's HOME_SCREENS
    // check, which now also skips goBack() outright as a second guard).
    screenHistoryRef.current = [];
    if (r === 'dealer' || r === 'dealer') setScreen('dealerHome');
    else if (r === 'reseller') setScreen('resellerHome');
    else if (r === 'admin' || r === 'superadmin') setScreen('adminHome');
    else setScreen('customerHome');
  }, [profile]);

  // Used by every screen's own "←" header button - prefers the real
  // previous screen from history so on-screen back navigation is one
  // step at a time (matching the hardware back button below), and only
  // falls back to Home when there's no history to pop (e.g. this screen
  // was opened straight from a notification/deep link).
  const goBackOrHome = useCallback(() => {
    if (!goBack()) goHome();
  }, [goBack, goHome]);

  /** Persists a single Settings-screen notification toggle to Firestore. Optimistic-safe: the live profile subscription will confirm/correct it. */
  const setNotifPref = useCallback(
    (key, value) => {
      if (!authUser) return;
      authService.updateNotifPrefs(authUser.uid, { [key]: value }).catch(() => {
        showAlert('MySheba', 'Could not save that preference. Please try again.');
      });
    },
    [authUser]
  );

  // Call Settings (ringtone/vibration/volume/notifications toggle) - see
  // CallSettingsScreen.js. `profile.callSettings` is whatever's been saved
  // so far (possibly nothing, for an existing user who hasn't opened this
  // screen yet), so this fills in defaults for anything missing.
  const callSettings = useMemo(
    () => withCallSettingsDefaults(profile?.callSettings),
    [profile?.callSettings]
  );

  // Mirror the resolved settings into AsyncStorage every time they change so
  // the headless background handler (index.js, killed-app case) can read
  // them without needing Firestore - see callSettingsCache.js.
  useEffect(() => {
    cacheCallSettings(callSettings);
  }, [callSettings]);

  /** Persists one or more Call Settings fields to Firestore (merged, same
   * dotted-path pattern as setNotifPref) and caches the merged result
   * optimistically so the background handler sees the new value on the
   * very next call rather than only after the Firestore round-trip + live
   * listener catch up (via the effect above). Unlike before this per-caller
   * feature shipped, saving a vibration change no longer needs to rebuild
   * any native channel: callPush.js now creates every (ringtone,
   * vibration) channel combination up front, so a settings change just
   * means the next call resolves to a different already-existing channel
   * id - see ensureCallChannels in callPush.js. */
  const updateCallSettings = useCallback(
    (patch) => {
      if (!authUser) return;
      const next = { ...callSettings, ...patch };
      authService.updateCallSettings(authUser.uid, patch).catch(() => {
        showAlert('MySheba', 'Could not save that preference. Please try again.');
      });
      cacheCallSettings(next);
    },
    [authUser, callSettings]
  );

  // Per-caller ringtone/vibration overrides (see callerRingtoneService.js /
  // RingtonePickerScreen.js) - a live { [callerUid]: patch } map, mirrored
  // to AsyncStorage the same way callSettings is above so the background
  // handler can resolve a specific caller's override without Firestore.
  const [callerRingtones, setCallerRingtones] = useState({});
  useEffect(() => {
    if (!authUser) {
      setCallerRingtones({});
      return undefined;
    }
    return subscribeCallerRingtones(authUser.uid, setCallerRingtones);
  }, [authUser]);
  useEffect(() => {
    cacheCallerRingtones(callerRingtones);
  }, [callerRingtones]);

  /** Opens RingtonePickerScreen for one contact - same dedicated-nav-state
   * pattern as openDirectChat (see activeDirectChatId etc above), since
   * `screen` itself carries no params. */
  const openRingtonePicker = useCallback((callerUid, callerName) => {
    setActiveRingtoneContactUid(callerUid);
    setActiveRingtoneContactName(callerName || '');
    setScreen('ringtonePicker');
  }, []);

  /** Saves a per-caller ringtone/vibration patch for the currently-open
   * RingtonePickerScreen contact. Optimistic-cache-first for the same
   * reason as updateCallSettings above - the very next call from this
   * caller should ring the new way even before the Firestore round-trip
   * completes. */
  const updateCallerRingtone = useCallback(
    (callerUid, patch) => {
      if (!authUser || !callerUid) return;
      const next = { ...callerRingtones, [callerUid]: { ...(callerRingtones[callerUid] || {}), ...patch } };
      setCallerRingtones(next);
      cacheCallerRingtones(next);
      saveCallerRingtone(authUser.uid, callerUid, patch, activeRingtoneContactName).catch(() => {
        showAlert('MySheba', 'Could not save that ringtone. Please try again.');
      });
    },
    [authUser, callerRingtones, activeRingtoneContactName]
  );

  /** Clears a caller's override entirely (RingtonePickerScreen's "Use
   * default" action) so they fall back to the global Call Settings again. */
  const clearCallerRingtone = useCallback(
    (callerUid) => {
      if (!authUser || !callerUid) return;
      const next = { ...callerRingtones };
      delete next[callerUid];
      setCallerRingtones(next);
      cacheCallerRingtones(next);
      deleteCallerRingtone(authUser.uid, callerUid).catch(() => {
        showAlert('MySheba', 'Could not reset that ringtone. Please try again.');
      });
    },
    [authUser, callerRingtones]
  );

  /** Settings screen's "Change Password" - re-authenticates with the
   * current password, then sets the new one. Throws on failure (caller
   * shows the message inline in the modal) so it can't silently no-op. */
  const changePassword = useCallback(async (currentPin, newPin) => {
    await authService.changePassword(currentPin, newPin);
  }, []);

  /** Settings screen's "Link Google Account" - see
   * authService.linkGoogleAccount for what actually happens
   * (linkWithCredential onto the currently-signed-in user, so it ends up
   * as the SAME account rather than a second one). Refreshes `profile`
   * from the local flag authService already wrote, rather than waiting
   * for the live subscribeProfile snapshot to come back, so Settings can
   * flip to "Linked" immediately. Throws on failure (caller shows the
   * message). */
  const linkGoogleAccount = useCallback(async () => {
    await authService.linkGoogleAccount();
    setProfile((p) => (p ? { ...p, googleLinked: true } : p));
  }, []);

  /** GoogleMergeModal step 1 - see authService.startGoogleAccountMerge.
   * Just forwards to the Cloud Function and returns its preview; nothing
   * local changes yet since nothing server-side has changed yet either. */
  const startGoogleAccountMerge = useCallback(async (email) => {
    return authService.startGoogleAccountMerge(email);
  }, []);

  /** GoogleMergeModal step 2 - see authService.confirmGoogleAccountMerge.
   * On success the other account's wallet/game points are already folded
   * into this one server-side - reflect the new wallet balance and linked
   * state locally right away, same as linkGoogleAccount above, rather than
   * waiting for the live profile subscription to catch up. */
  const confirmGoogleAccountMerge = useCallback(async (code) => {
    const result = await authService.confirmGoogleAccountMerge(code);
    setProfile((p) => (p ? { ...p, walletBalance: result.walletBalance, googleLinked: result.googleLinked } : p));
    return result;
  }, []);

  /** Settings screen's "Change/Reset PIN" - re-authenticates with the
   * account's login password (same "recent sign-in" requirement as
   * changePassword above), then sets the security PIN via
   * functions/securityPinService.js's resetSecurityPin, which creates one
   * if none exists yet or overwrites the existing one. Throws on failure
   * (caller shows the message inline in the modal). */
  const resetSecurityPin = useCallback(async (currentPassword, newPin) => {
    await authService.reauthenticate(currentPassword);
    await securityPinService.resetSecurityPin(newPin);
  }, []);

  const doLogin = useCallback(async (phone, pin, dialCode) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const p = await authService.login(phone, pin, dialCode);
      if (p.pendingDeviceApproval) {
        // A different device is already active on this account, OR (for
        // admin/superadmin) this login just needs its per-login MFA code -
        // reason distinguishes the two for DeviceVerifyScreen's copy and
        // for confirmDeviceVerification below. Don't land on a dashboard
        // yet either way.
        setPendingDeviceVerification({
          uid: p.uid,
          email: p.pendingDeviceApproval.email,
          phone: p.pendingDeviceApproval.phone,
          reason: p.pendingDeviceApproval.reason,
          availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods,
        });
        setScreen('deviceVerify');
        return true;
      }
      setProfile(p);
      if (p.role === 'dealer' || p.role === 'dealer') { setDealerTab('pending'); setScreen('dealerHome'); }
      else if (p.role === 'reseller') { setResellerTab('pending'); setScreen('resellerHome'); }
      else if (p.role === 'admin' || p.role === 'superadmin') { setAdminTab('all'); setScreen('adminHome'); }
      else setScreen('customerHome');
      return true;
    } catch (err) {
      setAuthError(err.message || 'Sign in failed.');
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  // Same shape as doLogin, but via Google - one function backs both the
  // Login and Register screens' "Continue with Google" buttons, since
  // Firebase/ensureGoogleProfile already handle sign-in-vs-sign-up
  // transparently (see authService.signInWithGoogle).
  const doGoogleLogin = useCallback(async () => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const p = await authService.signInWithGoogle();
      if (p.pendingDeviceApproval) {
        setPendingDeviceVerification({
          uid: p.uid,
          email: p.pendingDeviceApproval.email,
          phone: p.pendingDeviceApproval.phone,
          reason: p.pendingDeviceApproval.reason,
          availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods,
        });
        setScreen('deviceVerify');
        return true;
      }
      setProfile(p);
      if (p.role === 'dealer' || p.role === 'dealer') { setDealerTab('pending'); setScreen('dealerHome'); }
      else if (p.role === 'reseller') { setResellerTab('pending'); setScreen('resellerHome'); }
      else if (p.role === 'admin' || p.role === 'superadmin') { setAdminTab('all'); setScreen('adminHome'); }
      else setScreen('customerHome');
      return true;
    } catch (err) {
      // A user backing out of the Google account picker isn't an error -
      // don't show a scary red banner for it, just quietly reset.
      if (err && err.isCancelled) return false;
      // Brand-new Google account, no phone number yet - GooglePhoneScreen
      // collects one and calls completeGooglePhone below. Not an error:
      // the Google credential is still signed in, waiting on that.
      if (err && err.needsPhone) {
        setPendingGooglePhone(true);
        setScreen('googlePhone');
        return false;
      }
      setAuthError(err.message || 'Google sign-in failed.');
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  /** GooglePhoneScreen's submit - finishes the Google sign-up that
   * doGoogleLogin above paused on PHONE_REQUIRED, using the same
   * already-signed-in Google credential (see authService.completeGoogleSignup).
   * Same shape/outcomes as doGoogleLogin otherwise (device approval or
   * straight to a dashboard); a duplicate-phone error surfaces inline on
   * the phone form via authError instead of resetting the screen, so the
   * person can just try a different number without redoing the Google
   * picker. */
  const completeGooglePhone = useCallback(async (phone) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const p = await authService.completeGoogleSignup(phone);
      if (p.pendingDeviceApproval) {
        setPendingGooglePhone(false);
        setPendingDeviceVerification({
          uid: p.uid,
          email: p.pendingDeviceApproval.email,
          phone: p.pendingDeviceApproval.phone,
          reason: p.pendingDeviceApproval.reason,
          availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods,
        });
        setScreen('deviceVerify');
        return true;
      }
      setPendingGooglePhone(false);
      setProfile(p);
      if (p.role === 'dealer' || p.role === 'dealer') { setDealerTab('pending'); setScreen('dealerHome'); }
      else if (p.role === 'reseller') { setResellerTab('pending'); setScreen('resellerHome'); }
      else if (p.role === 'admin' || p.role === 'superadmin') { setAdminTab('all'); setScreen('adminHome'); }
      else setScreen('customerHome');
      return true;
    } catch (err) {
      setAuthError(err.message || 'Could not complete sign-up.');
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  /** GooglePhoneScreen's "Cancel and sign out" - abandons this Google
   * sign-up attempt entirely (same as cancelDeviceVerification below). */
  const cancelGooglePhone = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setPendingGooglePhone(false);
      setProfile(null);
      screenHistoryRef.current = [];
      setScreen('login');
    }
  }, []);

  /** DeviceVerifyScreen calls this once the challenge for
   * pendingDeviceVerification.reason has been confirmed. Branches on why
   * we're here:
   *   'new_device' - sendOtp/verifyOtp (otpService.js) have confirmed the
   *     challenged email; finalizes this device as active
   *     (functions/deviceSessionService.js's confirmDeviceSwitch), which
   *     also revokes the previously-active device's refresh tokens.
   *   'admin_mfa'  - src/firebase/phoneVerification.js's
   *     sendPhoneOtp/confirmPhoneOtp have confirmed the admin's phone via
   *     real Firebase Phone Auth; `phoneIdToken` is the ID token that
   *     proved it. This device was never switching from anywhere, so
   *     there's no other device's tokens to revoke; re-runs
   *     checkDeviceSession instead (authService.retryDeviceSession), which
   *     independently re-verifies that token and approves normally. If
   *     that comes back still requiring OTP (a 'new_device' conflict on
   *     top of the MFA check - an admin signing in somewhere genuinely
   *     new), we stay on this screen with the new reason instead of
   *     assuming success.
   * Either way, on final success this lands on the normal role-based
   * dashboard, same as a plain doLogin. */
  const confirmDeviceVerification = useCallback(async (phoneIdToken, emailIdToken, emailOtp) => {
    if (!pendingDeviceVerification) return false;
    setAuthBusy(true);
    setAuthError('');
    try {
      const p = pendingDeviceVerification.reason === 'admin_mfa'
        ? await authService.retryDeviceSession(pendingDeviceVerification.uid, phoneIdToken, emailIdToken, emailOtp)
        : await authService.confirmDeviceLogin(pendingDeviceVerification.uid, emailIdToken);

      if (p.pendingDeviceApproval) {
        setPendingDeviceVerification({
          uid: p.uid,
          email: p.pendingDeviceApproval.email,
          phone: p.pendingDeviceApproval.phone,
          reason: p.pendingDeviceApproval.reason,
          availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods,
        });
        return false;
      }

      setPendingDeviceVerification(null);
      setProfile(p);
      if (p.role === 'dealer' || p.role === 'dealer') { setDealerTab('pending'); setScreen('dealerHome'); }
      else if (p.role === 'reseller') { setResellerTab('pending'); setScreen('resellerHome'); }
      else if (p.role === 'admin' || p.role === 'superadmin') { setAdminTab('all'); setScreen('adminHome'); }
      else setScreen('customerHome');
      return true;
    } catch (err) {
      setAuthError(err.message || 'Verification failed.');
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, [pendingDeviceVerification]);

  /** DeviceVerifyScreen's "Cancel and sign out" - the OTHER device (the
   * one still actually active) is untouched by this, since
   * checkDeviceSession never wrote a new activeDeviceId/activeSessionId
   * for the requiresOtp path; this just abandons this device's attempt. */
  const cancelDeviceVerification = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setPendingDeviceVerification(null);
      setProfile(null);
      screenHistoryRef.current = [];
      setScreen('login');
    }
  }, []);

  const doRegister = useCallback(async ({ name, phone, phoneE164, dialCode, email, pin, dealerCode, resellerCode, phoneIdToken }) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const p = await authService.registerCustomer({ name, phone, phoneE164, dialCode, email, pin, phoneIdToken });
      setProfile(p);
      setScreen('customerHome');
      return true;
    } catch (err) {
      setAuthError(err.message || 'Registration failed.');
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      // Biometric opt-in resets on every logout - the person's own rule:
      // clicking logout clears it, so the next sign-in (same account or a
      // different one on this device) shows BiometricOptInPrompt again
      // rather than silently staying enabled/disabled from before.
      await clearBiometricEnabledPref();
      setBiometricEnabledState(null);
      biometricPromptedRef.current = false;
      setShowBiometricPrompt(false);
      setProfile(null);
      screenHistoryRef.current = [];
      setScreen('login');
    }
  }, []);

  const startService = useCallback((service) => {
    setCurrentService(service);
    setCurrentStep(0);
    setServiceData({});
    setScreen('service');
  }, []);

  // Every "point deduct" webview (FOMEMA/Visa, MY Digital/Passport, Bus
  // redBus/Bus Online Ticket/Easybook, MY e-SIM) is gated right here, at the door, before
  // anyone gets in - not just at the moment of the actual charge deeper
  // in the flow:
  //   1. LOCK - if the live wallet balance (profile.walletBalance) can't
  //      cover this key's live price (pointCosts[key]), the feature is
  //      blocked outright with an alert naming the price and the
  //      shortfall. No confirm dialog, no navigation.
  //   2. WARN - if they can afford it, a confirm dialog states the exact
  //      price before the WebView ever opens, so nobody is surprised by a
  //      deduction after the fact. Declining just closes the dialog.
  // Bus (redBus/Bus Online Ticket/Easybook) and MY e-SIM are real
  // purchases on the third-party site - see PAYMENT_CHARGED_WEBVIEWS in
  // data/countries.js. On top of the balance check above,
  // checkPaymentEntryAccess re-checks against the live server balance
  // right before navigating in (never deducts) - once someone is inside
  // the WebView they can complete a real payment on redbus.my/
  // busonlineticket.com/easybook.com/CelcomDigi with no further
  // involvement from this app, so this is the last point we can still
  // safely say no. The real
  // deduction happens later, only once payment success is detected (or
  // self-confirmed) - see webViewPaymentCharged + confirmPaymentSuccess
  // below, wired up from WebViewScreen.
  //
  // MY Digital/Passport don't charge again if there's already a prior
  // submission on file (profile.webviewSubmitted) - those go straight in
  // with no lock/warning, since re-opening them is free. FOMEMA/Visa are
  // always free to *open*, but every tap of the government page's own
  // "Carian"/"Search" button charges again (see confirmWebviewAccess
  // below) - there is no free re-search window, so the cost warning below
  // shows every time they're opened. See WEBVIEW_ACCESS_CLICK_TRIGGERS /
  // WEBVIEW_SUBMIT_TRIGGERS in data/countries.js for the exact trigger
  // words per key.
  const [webViewPaymentCharged, setWebViewPaymentCharged] = useState(false);
  const openWebView = useCallback(
    async (key) => {
      const cost = pointCosts[key];
      if (!cost || !authUser?.uid) {
        setWebViewKey(key);
        setWebViewPaymentCharged(false);
        setScreen('webview');
        return;
      }
      if (webViewBusy) return;

      const alreadyCovered = SUBMIT_CHARGED_WEBVIEWS.includes(key) && !!profile?.webviewSubmitted?.[key];

      const enterWebview = () => {
        setWebViewKey(key);
        setWebViewPaymentCharged(false);
        setScreen('webview');
      };

      if (alreadyCovered) {
        enterWebview();
        return;
      }

      const balance = typeof profile?.walletBalance === 'number' ? profile.walletBalance : 0;
      if (balance < cost) {
        showAlert(
          'MySheba',
          `You need ${cost} pts to use this feature. Your current balance is ${balance} pts - top up your wallet first.`
        );
        return;
      }

      showAlert(
        'Points will be deducted',
        `Using this feature costs ${cost} pts. Your current balance is ${balance} pts.\n\nContinue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              if (!PAYMENT_CHARGED_WEBVIEWS.includes(key)) {
                enterWebview();
                return;
              }
              setWebViewBusy(true);
              try {
                await checkPaymentEntryAccess(authUser.uid, cost);
                enterWebview();
              } catch (err) {
                showAlert('MySheba', err.message || `You need ${cost} pts to use this - top up your wallet first.`);
              } finally {
                setWebViewBusy(false);
              }
            },
          },
        ]
      );
    },
    [authUser, webViewBusy, profile, pointCosts]
  );

  // Shows the Bus screen's 3-option grid (redBus / Bus Online Ticket /
  // Easybook) instead of opening a WebView directly - each card then
  // calls openWebView with its own key ('bus-redbus' |
  // 'bus-busonlineticket' | 'bus-easybook'), which re-runs the same
  // insufficient-points gate above.
  const openBusPicker = useCallback(() => {
    setScreen('buspicker');
  }, []);

  // Called once payment success is detected (URL-match in WebViewScreen)
  // or self-confirmed via the "I've completed my payment" fallback
  // button. Deducts PAYMENT_SUCCESS_COST exactly once per WebView session
  // - webViewPaymentCharged is the source of truth for the UI, and
  // chargePaymentSuccess's own transaction is the source of truth for the
  // wallet, so a race between the two triggers still can't double-charge.
  const [webViewPaymentBusy, setWebViewPaymentBusy] = useState(false);
  const confirmPaymentSuccess = useCallback(
    async (key) => {
      if (!authUser?.uid || webViewPaymentBusy || webViewPaymentCharged) return;
      setWebViewPaymentBusy(true);
      try {
        const result = await chargePaymentSuccess(authUser.uid, key, pointCosts[key]);
        if (result.charged) {
          setWebViewPaymentCharged(true);
          showAlert('MySheba', `Payment confirmed - ${result.cost} pts deducted.`);
        }
        return result;
      } catch (err) {
        showAlert('MySheba', err.message || 'Could not confirm this payment right now.');
      } finally {
        setWebViewPaymentBusy(false);
      }
    },
    [authUser, webViewPaymentBusy, webViewPaymentCharged, pointCosts]
  );

  // Called from the injected click-listener (or its fallback button) in
  // WebViewScreen every time the user taps FOMEMA/Visa's own "Carian"/
  // "Search" button - charges once, then further searches on the same key
  // are free until the admin-set access window elapses (see
  // accessWindowHours / webviewAccessService.ensureWebviewAccess).
  const confirmWebviewAccess = useCallback(
    async (key) => {
      if (!authUser?.uid || webViewBusy) return;
      setWebViewBusy(true);
      try {
        const result = await ensureWebviewAccess(authUser.uid, key, pointCosts[key], accessWindowHours);
        if (result.charged) {
          showAlert('MySheba', `${result.cost} pts deducted for this search. Free for the next ${accessWindowHours} hour(s).`);
        }
        return result;
      } catch (err) {
        showAlert('MySheba', err.message || 'Could not confirm this check right now.');
      } finally {
        setWebViewBusy(false);
      }
    },
    [authUser, webViewBusy, pointCosts, accessWindowHours]
  );

  // Called from the "I've submitted my application" button in
  // WebViewScreen for MY Digital. Charges points once; tapping again after
  // a successful charge is a no-op (chargeWebviewSubmission handles that).
  const [webViewSubmitBusy, setWebViewSubmitBusy] = useState(false);
  const submitWebviewApplication = useCallback(
    async (key) => {
      if (!authUser?.uid || webViewSubmitBusy) return;
      setWebViewSubmitBusy(true);
      try {
        const result = await chargeWebviewSubmission(authUser.uid, key, pointCosts[key]);
        if (result.charged) {
          showAlert('MySheba', 'Thanks - your submission is confirmed and points have been deducted.');
        } else {
          showAlert('MySheba', 'This application was already confirmed.');
        }
        return result;
      } catch (err) {
        showAlert('MySheba', err.message || 'Could not confirm your submission right now.');
      } finally {
        setWebViewSubmitBusy(false);
      }
    },
    [authUser, webViewSubmitBusy, pointCosts]
  );

  const nextStep = useCallback(() => {
    setCurrentStep((s) => {
      if (s < totalSteps - 1) return s + 1;
      return s;
    });
  }, [totalSteps]);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const updateServiceData = useCallback((patch) => {
    setServiceData((d) => ({ ...d, ...patch }));
  }, []);

  /** Writes the wizard's current serviceData to Firestore (inquiry or transaction) and opens the result modal. */
  const submitService = useCallback(async () => {
    setSubmitting(true);
    try {
      if (TRAVEL_SERVICES.includes(currentService)) {
        const label = TRAVEL_LABELS[currentService];
        const id = await inquiryService.createInquiry(
          currentService,
          {
            from: serviceData.from,
            to: serviceData.to,
            date: serviceData.date,
            time: serviceData.time,
            passengers: serviceData.passengers,
            name: serviceData.pName,
            phone: serviceData.pPhone,
            email: serviceData.pEmail,
            notes: serviceData.pNotes,
          },
          authUser
        );
        openResult('travel', id, label);
      } else {
        const payload = buildTransactionPayload(currentService, serviceData, pricing, rates);
        const id = await transactionService.createTransaction(
          { ...payload, raw: serviceData },
          { uid: authUser ? authUser.uid : null, phone: profile ? profile.phone : '', dealerId: profile ? profile.dealerId : null, resellerId: profile ? profile.resellerId : null }
        );
        if (currentService === 'remittance' && authUser?.uid) {
          await maybeSaveReceiver(serviceData, authUser.uid);
        }
        openResult('dealer', id, payload.service, { details: payload.details, amount: payload.amount, total: payload.total });
      }
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not submit your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [currentService, serviceData, authUser, profile, openResult, pricing, rates]);

  const value = {
    // auth
    authUser, profile, authLoading, authError, authBusy,
    doLogin, doGoogleLogin, doRegister, logout,
    pendingDeviceVerification, confirmDeviceVerification, cancelDeviceVerification,
    pendingGooglePhone, completeGooglePhone, cancelGooglePhone,
    // nav
    screen, setScreen, goBack, goBackOrHome, setHomeBackInterceptor, setWebViewBackInterceptor,
    // sidebar drawer
    sidebarVisible, openSidebar, closeSidebar,
    // wizard
    currentService, currentStep, totalSteps, serviceData, submitting,
    setCurrentStep, updateServiceData, nextStep, prevStep,
    startService, submitService,
    // dealer / admin
    dealerTxs, dealerTab, setDealerTab,
    adminViewingSection, setAdminViewingSection,
    dealerViewingSection, setDealerViewingSection,
    // reseller
    resellerTxs, resellerTab, setResellerTab,
    resellerViewingSection, setResellerViewingSection,
    inquiries, adminTab, setAdminTab,
    topups,
    rates,
    pricing, internetPricing, pointCosts, accessWindowHours,
    featureAccess,
    marketplaceCategories, serviceCategories,
    supportContact,
    socialLinks,
    paymentSettings,
    banners,
    adSettings, adFeatureControls, adCampaignsById, homepageConfig,
    announcements,
    myNotifications, hasUnreadNotifications, markNotificationsSeen,
    // webview
    webViewKey, setWebViewKey, openWebView, webViewBusy,
    submitWebviewApplication, webViewSubmitBusy, confirmWebviewAccess,
    openBusPicker, confirmPaymentSuccess, webViewPaymentBusy, webViewPaymentCharged,
    // support chat
    activeChatId, activeChatName, chatUnreadCount, activeChatReturnTo, openChat,
    // direct chat
    activeDirectChatId, activeDirectChatName, activeDirectChatUid, directChatUnreadCount, openDirectChat,
    activeInvestigateChatId, activeInvestigateReport, openInvestigateChat,
    chatDraftText, setChatDraftText,
    // marketplace
    activeListingId, openMarketplace, openListingDetail, handleDeepLink,
    activeAdvertiserId, openAdvertiserManagement, openAdvertiserDetail,
    // accommodation
    activePropertyId, openAccommodation, openPropertyDetail,
    // room sharing
    activeRoommateRequestId, openRoomSharing, openRoommateRequestDetail,
    // local services
    activeProviderId, openServiceProvidersHome, openServiceProviderDetail,
    // community
    activeCommunityPostId, openCommunity, openCommunityPostDetail,
    activeSocialPostId, openSocialFeed, openCreateSocialPost, openSocialPostDetail,
    openMarketplaceSearch,
    // my documents
    activeDocumentId, activeDocumentType, editDocumentId,
    openMyDocuments, openDocumentTypePicker, openAddDocument, openDocumentDetail, openDocumentViewer,
    // notepad
    activeNoteId, editNoteId, openNotepad, openAddNote, openNoteDetail,
    // MySheba Help
    helpPrefill, setHelpPrefill, openHelp, openSupportWithPrefill,
    // business profile
    activeBusinessProfileUid, openBusinessProfile,
    activeContactProfileUid, openContactProfile,
    // salary & OT
    openSalary, openSalaryReports,
    // create payslip
    payslipSourceRecordId, editPayslipId, activePayslipId,
    openCreatePayslip, openEditPayslip, openPayslipHistory, openPayslipDetails,
    // group chat
    activeGroupId, activeGroupName, myGroups, groupUnreadCount, openGroupChat,
    // room chat
    activeRoomId, activeRoomName, myRooms, roomUnreadCount, openRoomChat,
    discoverableRooms, joinDiscoverableRoom,
    // chat hub (Direct / Groups / Rooms tabs)
    chatHubTab, setChatHubTab, chatHubUnreadCount, openChatHub,
    lockedChatIds, chatVaultUnlocked, isChatLocked, lockChatThread, unlockChatThread, openLockedChats,
    // private vault unlock (Notepad + My Documents; NOT Transfer Points)
    privateVaultUnlocked, setPrivateVaultUnlocked,
    // voice / video calls
    activeCall, setActiveCall, incomingCall, startCall, answerIncomingCall, rejectIncomingCall,
    incomingGroupCall, startGroupCall, answerIncomingGroupCall, rejectIncomingGroupCall,
    // overlays
    ratePopupVisible, setRatePopupVisible,
    resultModal, openResult, closeResult,
    goHome,
    setNotifPref,
    callSettings, updateCallSettings,
    callerRingtones, updateCallerRingtone, clearCallerRingtone, openRingtonePicker,
    activeRingtoneContactUid, activeRingtoneContactName,
    changePassword,
    linkGoogleAccount, startGoogleAccountMerge, confirmGoogleAccountMerge,
    // security PIN gate (My Documents view/share, Transfer Points send)
    pinGateRequest, requireSecurityPin, resolvePinGate, cancelPinGate, resetSecurityPin,
    appLocked, appLockEnabled, setAppLockEnabled, unlockApp,
    biometricEnabled, setBiometricEnabled, showBiometricPrompt, dismissBiometricPrompt,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
