import { homeScreenForRole, STAFF_HOME_ROLES } from '../utils/homeScreen';
import { PRE_AUTH_SCREENS } from '../utils/preAuthScreens';
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { Platform, BackHandler, ToastAndroid, AppState } from "react-native";
import { showAlert } from "../utils/appAlert";
import { crossesFeature } from "../utils/featureGroups";
import {
  classifyProfileError,
  classifyProfileSnapshot,
  shouldEndSessionForDevice,
} from "../utils/profileGate";
import { noteSignOut, flushSignOutTrace } from "../utils/authTrace";
import { logError } from "../firebase/logService";

import * as authService from "../firebase/authService";
import {
  readCachedProfile,
  writeCachedProfile,
  clearCachedProfile,
} from "../firebase/profileCache";
import * as securityPinService from "../firebase/securityPinService";
import {
  getAppLockEnabled,
  setAppLockEnabledPref,
  getBiometricEnabledPref,
  setBiometricEnabledPref,
  clearBiometricEnabledPref,
} from "../firebase/appLockPrefs";
import { isBiometricAvailable } from "../firebase/biometricAuth";
import * as pinVault from "../firebase/pinVault";
import * as deviceSessionService from "../firebase/deviceSessionService";
import * as inquiryService from "../firebase/inquiryService";
import * as transactionService from "../firebase/transactionService";
import * as ratesService from "../firebase/ratesService";
import * as settingsService from "../firebase/settingsService";
import * as featureAccessService from "../firebase/featureAccessService";
import * as webviewConfigService from '../firebase/webviewConfigService';
import * as tileLabelService from '../firebase/tileLabelService';
import * as gridManagementService from "../firebase/gridManagementService";
import * as platformControlService from "../firebase/platformControlService";
import * as accessControlService from "../firebase/accessControlService";
import * as adControlsService from "../firebase/adControlsService";
import * as homepageConfigService from "../firebase/homepageConfigService";
import * as adService from "../firebase/adService";
import * as supportContactService from "../firebase/supportContactService";
import * as paymentSettingsService from "../firebase/paymentSettingsService";
import * as internetPricingService from "../firebase/internetPricingService";
import * as bannerService from "../firebase/bannerService";
import * as announcementService from "../firebase/announcementService";
import * as topupService from "../firebase/topupService";
import {
  registerForPushNotificationsAsync,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  getLastNotificationResponseAsync,
  getFcmToken,
} from "../notifications/pushService";
import { maybeSaveReceiver } from "../firebase/receiverService";
import {
  ensureWebviewAccess,
  chargeWebviewSubmission,
} from "../firebase/webviewAccessService";
import { ensureModuleSubscription } from "../firebase/moduleSubscriptionService";
import {
  checkPaymentEntryAccess,
  chargePaymentSuccess,
} from "../firebase/paymentWebviewService";
import {
  WEBVIEW_ACCESS_COST,
  WEBVIEW_SUBMIT_COST,
  PAYMENT_SUCCESS_COST,
  WEBVIEW_ACCESS_WINDOW_HOURS,
  ACCESS_CLICK_WEBVIEWS,
  SUBMIT_CHARGED_WEBVIEWS,
  PAYMENT_CHARGED_WEBVIEWS,
  amountToPoints,
} from "../data/countries";

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
  offerpacks: 4,
  entertainment: 3,
  billpayment: 5,
  remittance: 7,
  bus: 3,
  train: 3,
  flight: 3,
};

// Flight/Bus/Train are "contact-me" inquiries sent straight to Admin.
// Everything else goes through the Dealer processing queue.
const TRAVEL_SERVICES = ["flight", "bus", "train"];
const TRAVEL_LABELS = { flight: "Flight", bus: "Bus", train: "Train" };
const DEALER_LABELS = {
  recharge: "Recharge",
  mobilebanking: "Mobile Banking",
  internet: "Internet",
  offerpacks: "Offer Packs",
  entertainment: "Entertainment",
  billpayment: "Bill Payment",
  remittance: "Remittance",
};

/** Builds the {service, details, amount, total} payload the dealer queue needs, from the wizard's serviceData. */
function buildTransactionPayload(service, serviceData, pricing, rates) {
  if (service === "recharge") {
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
    const profitPercent = pricing
      ? Number(pricing.rechargeProfitPercent) || 0
      : 0;
    const cost = Math.round(amount * (costPercent / 100) * 100) / 100;
    const profit = Math.round(amount * (profitPercent / 100) * 100) / 100;
    return {
      service: DEALER_LABELS.recharge,
      details: `${serviceData.operator || ""} - ${serviceData.currency || "MYR"} ${rawAmount}`,
      amount,
      total: amount,
      cost,
      profit,
    };
  }
  if (service === "mobilebanking") {
    const myr = serviceData.myr || 0;
    return {
      service: DEALER_LABELS.mobilebanking,
      details: `${serviceData.provider || ""} - MYR ${myr.toFixed(2)} (Receiver: ${serviceData.phone || ""})`,
      amount: myr,
      total: myr + 5,
    };
  }
  if (service === "internet") {
    const rawAmount = serviceData.amount || 0;
    // Same conversion as recharge above - the package's face price is in
    // the destination country's local currency, points shown/charged are
    // its MYR equivalent at the admin-set Recharge/Internet rate.
    const amount = amountToPoints(rawAmount, serviceData.country, rates);
    return {
      service: DEALER_LABELS.internet,
      details: `${serviceData.operator || ""} - ${serviceData.package || ""} (${serviceData.currency || "MYR"} ${rawAmount})`,
      amount,
      total: amount,
      raw: { country: serviceData.country, operator: serviceData.operator, phone: serviceData.phone, amount: rawAmount, packageId: serviceData.packageId, package: serviceData.package },
    };
  }
  if (service === "offerpacks") {
    const rawAmount = serviceData.amount || 0;
    const amount = amountToPoints(rawAmount, serviceData.country, rates);
    return {
      service: DEALER_LABELS.offerpacks,
      details: `${serviceData.operator || ""} - ${serviceData.package || ""} (${serviceData.currency || "MYR"} ${rawAmount})`,
      amount,
      total: amount,
    };
  }
  if (service === "entertainment") {
    const rawAmount = serviceData.amount || 0;
    const amount = amountToPoints(rawAmount, serviceData.country, rates);
    return {
      service: DEALER_LABELS.entertainment,
      details: `${serviceData.operator || ""} - ${serviceData.package || ""} (${serviceData.currency || "MYR"} ${rawAmount})`,
      amount,
      total: amount,
    };
  }
  if (service === "billpayment") {
    const rawAmount = Number(serviceData.amount) || 0;
    // Convert the selected country's bill amount to MySheba points before
    // sending it. The server independently recomputes this value.
    const amount = amountToPoints(rawAmount, serviceData.country, rates);
    return {
      service: DEALER_LABELS.billpayment,
      details: `${serviceData.provider || ""} - ${serviceData.category || ""} (${serviceData.accountNumber || ""})`,
      amount,
      total: amount,
      raw: { country: serviceData.country, provider: serviceData.provider, category: serviceData.category, accountNumber: serviceData.accountNumber, mobileNumber: serviceData.mobileNumber },
    };
  }
  if (service === "remittance") {
    const sendAmt = serviceData.sendAmt || 0;
    const fee = serviceData.transferFee || 0;
    const METHOD_LABELS = {
      deposit: "Bank Account",
      cash: "Cash Pickup",
      ewallet: "eWallet",
    };
    const methodLabel = METHOD_LABELS[serviceData.method] || "";
    const receiverName =
      `${serviceData.receiverFirstName || ""} ${serviceData.receiverLastName || ""}`.trim();
    const senderPart = serviceData.senderName
      ? ` · Sender: ${serviceData.senderName}`
      : "";
    return {
      service: DEALER_LABELS.remittance,
      details: `${methodLabel} to ${receiverName} (${serviceData.country || ""}) via ${serviceData.paymentMethod || ""}${senderPart}`,
      amount: sendAmt,
      total: sendAmt + fee,
    };
  }
  return { service, details: "", amount: 0, total: 0 };
}

export function AppProvider({ children }) {
  // ---- auth / profile ----
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // Effective staff capabilities (role defaults + this person's overrides),
  // kept live so a superadmin's change applies without signing out.
  const [capabilities, setCapabilities] = useState([]);
  const capabilityUid = profile?.uid || authUser?.uid || null;
  const capabilityRole = profile?.role || null;
  // Who grid tiles are resolved against. A tile can now be turned off for one
  // role, country or person (see firebase/gridManagementService), so every gate
  // below has to ask the same question the grid asked when it drew the tile -
  // otherwise a hidden feature stays reachable by another route.
  const gridViewer = useMemo(
    () => gridManagementService.viewerFor(profile),
    [profile?.uid, profile?.role, profile?.phoneCountryCode],
  );
  useEffect(
    () => accessControlService.subscribeMyCapabilities(capabilityUid, capabilityRole, setCapabilities),
    [capabilityUid, capabilityRole],
  );
  const can = useCallback((capability) => capabilities.includes(capability), [capabilities]);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [profileFatal, setProfileFatal] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  // { uid, email } while a login is waiting on single-device-login
  // verification (functions/deviceSessionService.js) - see doLogin/
  // doGoogleLogin/confirmDeviceVerification below and DeviceVerifyScreen.js.
  const [pendingDeviceVerification, setPendingDeviceVerification] =
    useState(null);
  const [pendingGooglePhone, setPendingGooglePhone] = useState(false);

  // ---- navigation state ----
  // No more manual role picker - `screen` starts on 'login' and, once
  // signed in, the account's Firestore `role` field (in `profile.role`)
  // decides which home screen to land on. See the bootstrap effect below.
  const [screen, setScreenState] = useState("login"); // login | register | forgotPassword | customerHome | service | dealerHome | resellerHome | adminHome | webview | buspicker | support | history | topup | chat | chatList | settings | profile | myAccount | reports | notifications | verifyIdentity | verificationManagement | adminAnalytics | myDocuments | documentType | addDocument | documentDetails | documentViewer | moreFeatures | adminFeatures | apiProviderManagement | dealerFeatures | resellerFeatures | featureAccess | tierPromotions | adFeatureControls | bannerManagement | salaryReports | notepad | addNote | noteDetail | help | friendsList

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
  // goHome is defined below this effect, so it cannot go in its dependency
  // array without a TDZ error. The ref is read at press time, by which point
  // it is assigned.
  const goHomeRef = useRef(null);

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
  // src/utils/preAuthScreens.js - shared, because a second copy of this list
  // in BiometricOptInPrompt had forgotPassword while this one did not.

  useEffect(() => {
    const prev = prevScreenRef.current;
    if (prev !== screen) {
      // Nothing is pushed when the DESTINATION is a pre-auth screen either.
      //
      // Every sign-out path empties screenHistoryRef and then calls
      // setScreen("login") - but this effect runs after that state change, saw
      // prev = "adminHome", and pushed it straight back onto the array that had
      // just been emptied. Clearing before navigating was therefore a no-op,
      // and hardware back from the login screen popped the home screen and
      // showed it to somebody who had just been signed out.
      if (!isPoppingRef.current
          && !PRE_AUTH_SCREENS.includes(prev)
          && !PRE_AUTH_SCREENS.includes(screen)) {
        // Leaving one feature for another drops the trail instead of adding
        // to it. Without this the stack accumulated across features and back
        // stepped sideways - out of Salary and into Documents, because
        // Documents happened to be open earlier.
        if (crossesFeature(prev, screen)) {
          screenHistoryRef.current = [];
        } else {
          screenHistoryRef.current.push(prev);
        }
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
  const [activeChatName, setActiveChatName] = useState("");
  // Which screen ChatScreen's back button should return to - staff can open
  // a support thread from either the Chats inbox (chatList) or the
  // "Messages" tab inside Support Tickets (adminSupport); defaults to
  // 'chatList' to match the existing behavior for every other entry point.
  const [activeChatReturnTo, setActiveChatReturnTo] = useState("chatList");

  // Opens the shared customer/support chat screen. The third argument records
  // which screen the chat was launched from so future back-navigation can
  // return to the correct inbox (Chat List or Admin Support > Messages).
  const openChat = useCallback((chatId, chatName = "", returnTo = "chatList") => {
    if (!chatId) return;
    setActiveChatId(chatId);
    setActiveChatName(chatName || "");
    setActiveChatReturnTo(returnTo || "chatList");
    setScreen("chat");
  }, []);

  // ---- Advertiser management ----
  // These screens remain in App.js and need only their selected advertiser id.
  const [activeAdvertiserId, setActiveAdvertiserId] = useState(null);
  const openAdvertiserManagement = useCallback(() => setScreen("advertiserManagement"), []);
  const openAdvertiserDetail = useCallback((advertiserId) => {
    if (!advertiserId) return;
    setActiveAdvertiserId(advertiserId);
    setScreen("advertiserDetail");
  }, []);

  // Deep-link handling is intentionally inert; retired listing routes are no longer exposed.
  const handleDeepLink = useCallback(() => {}, []);

  // ---- Profile navigation state ----
  // These ids are navigation-only; the destination screens load the actual
  // profile documents themselves.
  const [activeContactProfileUid, setActiveContactProfileUid] = useState(null);
  const openContactProfile = useCallback((uid) => {
    if (!uid) return;
    setActiveContactProfileUid(uid);
    setScreen("contactProfile");
  }, []);

  // ---- My Documents (private per-user document vault - passport, visa,
  // work permit, etc.) ---- Screens call documentService.js directly
  // (same pattern as other direct Firestore modules); context only
  // tracks which document is being viewed/edited and which type is being
  // added. editDocumentId is null for "add new", set when opening the
  // Add screen from an existing document's "Edit Details" action.
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [activeDocumentType, setActiveDocumentType] = useState(null);
  const [editDocumentId, setEditDocumentId] = useState(null);
  // openMyDocuments itself is defined further below, alongside
  // ensureModuleAccess (needs pointCosts-adjacent pricing state) - see
  // "Notepad / My Documents / Salary & OT monthly subscription gate".
  const openDocumentTypePicker = useCallback(
    () => setScreen("documentType"),
    [],
  );
  const openAddDocument = useCallback(
    (documentType, existingDocumentId = null) => {
      setActiveDocumentType(documentType);
      setEditDocumentId(existingDocumentId);
      setScreen("addDocument");
    },
    [],
  );
  const openDocumentDetail = useCallback((documentId) => {
    setActiveDocumentId(documentId);
    setScreen("documentDetails");
  }, []);
  const openDocumentViewer = useCallback((documentId) => {
    setActiveDocumentId(documentId);
    setScreen("documentViewer");  }, []);

  // ---- Notepad (private per-user notes, plus Credit/Debit/Loan "money
  // notes" for tracking who owes what) ---- Screens call notepadService.js
  // directly; context
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
    setScreen("addNote");
  }, []);
  const openNoteDetail = useCallback((noteId) => {
    setActiveNoteId(noteId);
    setScreen("noteDetail");
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
  const openHelp = useCallback(() => setScreen("help"), []);
  const openSupportWithPrefill = useCallback((subject, message) => {
    setHelpPrefill({ subject, message });
    setScreen("support");
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
    setScreen("createPayslip");
  }, []);
  const openEditPayslip = useCallback((payslipId) => {
    setEditPayslipId(payslipId);
    setPayslipSourceRecordId(null);
    setScreen("createPayslip");
  }, []);
  const openPayslipHistory = useCallback(() => setScreen("payslipHistory"), []);
  const openPayslipDetails = useCallback((payslipId) => {
    setActivePayslipId(payslipId);
    setScreen("payslipDetails");
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
  // close over it directly for Chat Lock's unlock-on-open check.
  const [pinGateRequest, setPinGateRequest] = useState(null); // { actionLabel } | null
  const pinGateResolverRef = useRef(null);
  const requireSecurityPin = useCallback((actionLabel) => {
    if (pinGateResolverRef.current) {
      pinGateResolverRef.current.reject(new Error("Cancelled"));
      pinGateResolverRef.current = null;
    }
    return new Promise((resolve, reject) => {
      pinGateResolverRef.current = { resolve, reject };
      setPinGateRequest({ actionLabel: actionLabel || "" });
    });
  }, []);
  const resolvePinGate = useCallback(() => {
    pinGateResolverRef.current?.resolve();
    pinGateResolverRef.current = null;
    setPinGateRequest(null);
  }, []);
  const cancelPinGate = useCallback(() => {
    pinGateResolverRef.current?.reject(new Error("Cancelled"));
    pinGateResolverRef.current = null;
    setPinGateRequest(null);
  }, []);

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
  useEffect(() => {
    appLockEnabledRef.current = appLockEnabled;
  }, [appLockEnabled]);
  // How long the app can sit backgrounded before the next foreground demands
  // PIN/biometric again. Below this, coming back (checking a notification,
  // switching to the camera for a QR scan, a quick app-switch) resumes
  // straight into the app - one biometric prompt should cover a whole
  // continuous session, not fire on every backgrounding. Session itself
  // (authUser) is untouched by any of this either way; only the lock
  // screen is gated - signing out still only happens via explicit logout.
  const APP_LOCK_GRACE_MS = 2 * 60 * 1000;
  const backgroundedAtRef = useRef(null);

  // Both of these take a uid - the pref is per account, not per device -
  // and both were being called without one. getAppLockEnabled returned
  // false every time and setAppLockEnabledPref saved nothing, so App Lock
  // read as off on every launch no matter what the Settings toggle said.
  // Re-read on the account rather than once on mount, for the same reason.
  useEffect(() => {
    const uid = authUser?.uid;
    if (!uid) { setAppLockEnabledState(false); return; }
    getAppLockEnabled(uid).then(setAppLockEnabledState);
  }, [authUser?.uid]);

  const setAppLockEnabled = useCallback(
    async (value) => {
      if (value && !profile?.securityPinSet) {
        await requireSecurityPin("App Lock");
      }
      setAppLockEnabledState(value);
      await setAppLockEnabledPref(authUser?.uid, value);
    },
    [requireSecurityPin, profile, authUser],
  );

  const unlockApp = useCallback(() => setAppLocked(false), []);

  // App Lock never actually locked anything.
  //
  // appLocked was declared, read by AppLockScreen, and set to false in two
  // places - but setAppLocked(true) did not exist anywhere in the app. Nor
  // did the AppState listener the comments above describe: there was no
  // AppState listener in this file at all, so the private vault never
  // re-locked on backgrounding either. Turning App Lock on in Settings did
  // nothing at all, which is why closing and reopening the app went
  // straight to a screen instead of asking for a PIN or biometric.
  const authUserRef = useRef(null);
  authUserRef.current = authUser;
  const canUnlockRef = useRef(false);
  // The profile listener outlives any one render, so it reads the current
  // screen through a ref rather than closing over a stale value.
  const screenRef = useRef(null);
  screenRef.current = screen;
  // A cold launch locks a *restored* session. Someone who just typed their
  // password does not want to be asked for a PIN two seconds later, so a
  // sign-in performed in this process sets this and skips the launch lock.
  const signedInThisSessionRef = useRef(false);
  const launchLockDoneRef = useRef(false);

  // A lock nobody can open is worse than no lock. The PIN this gate checks
  // is the account's security PIN, and biometric unlock cannot be enabled
  // without one either, so an account with no PIN set is never locked - it
  // would have nothing to unlock with but "Forgot PIN? Log out".
  const canUnlock = !!profile?.securityPinSet;
  canUnlockRef.current = canUnlock;

  useEffect(() => {
    if (!authUser || !appLockEnabled || !canUnlock) return;
    if (launchLockDoneRef.current || signedInThisSessionRef.current) return;
    launchLockDoneRef.current = true;
    setAppLocked(true);
  }, [authUser, appLockEnabled, canUnlock]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        // Only the first transition counts - Android fires 'inactive' then
        // 'background', and overwriting would reset the clock each time.
        if (backgroundedAtRef.current == null) {
          backgroundedAtRef.current = Date.now();
        }
        return;
      }
      if (state !== "active") return;

      const since = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (since == null) return;
      if (Date.now() - since < APP_LOCK_GRACE_MS) return;

      // Away long enough to count as leaving the app: the vault always
      // re-locks, and the whole app does too when App Lock is on. Neither
      // touches the session - this is a lock screen, never a sign-out.
      setPrivateVaultUnlocked(false);
      if (appLockEnabledRef.current && authUserRef.current && canUnlockRef.current) setAppLocked(true);
    });
    return () => sub.remove();
    // APP_LOCK_GRACE_MS is a module-level constant in all but name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const setBiometricEnabled = useCallback(
    async (value) => {
      if (value && !profile?.securityPinSet) {
        await requireSecurityPin("Biometric Unlock");
      }
      if (value) {
        // Biometric unlock without App Lock being on doesn't mean anything -
        // opting in turns App Lock on too, same PIN-must-exist gate
        // setAppLockEnabled already runs.
        await setAppLockEnabled(true);
      }
      setBiometricEnabledState(value);
      await setBiometricEnabledPref(value);
      // Opting out drops the stored PIN with it. The PIN is only on this
      // device so a fingerprint can stand in for it; saying "no fingerprint"
      // and leaving the PIN behind would keep the risk and lose the benefit.
      if (!value) await pinVault.forgetPin(authUserRef.current?.uid);
    },
    [profile, requireSecurityPin, setAppLockEnabled],
  );

  // Fires once per fresh sign-in (not on every render/re-auth of an
  // already-decided device): if this device has never been asked
  // (biometricEnabled === null, AND the pref load above has actually
  // finished - see biometricPrefLoadedRef) and the OS actually supports
  // biometrics, show the one-time opt-in prompt. Skipped entirely if the
  // device has no biometric hardware/enrollment - nothing to opt into.
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  useEffect(() => {
    if (
      !authUser ||
      !biometricPrefLoadedRef.current ||
      biometricEnabled !== null ||
      biometricPromptedRef.current
    )
      return undefined;
    biometricPromptedRef.current = true;
    isBiometricAvailable().then((avail) => {
      if (avail) setShowBiometricPrompt(true);
    });
    return undefined;
  }, [authUser, biometricEnabled]);

  const dismissBiometricPrompt = useCallback(
    async (enable) => {
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
    },
    [setBiometricEnabled],
  );

  // ---- service wizard state (mirrors currentService/currentStep/totalSteps/serviceData) ----
  const [currentService, setCurrentService] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [serviceData, setServiceData] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // ---- dealer / admin data (live from Firestore) ----
  const [dealerTxs, setDealerTxs] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [topups, setTopups] = useState([]);
  const [dealerTab, setDealerTab] = useState("pending");
  const [adminTab, setAdminTab] = useState("all");
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
  const [resellerTab, setResellerTab] = useState("pending");
  const [resellerViewingSection, setResellerViewingSection] = useState(false);

  // ---- rates ----
  const [rates, setRates] = useState(ratesService.DEFAULT_RATES);

  // ---- pricing settings: dealer point-transfer earning %, recharge
  // cost/profit % - admin-editable from Admin > Pricing (see
  // settingsService.js). ----
  const [pricing, setPricing] = useState(settingsService.DEFAULT_PRICING);
  useEffect(() => {
    if (!authUser || !profile) return undefined;
    return gridManagementService.subscribeGridManagement(
      setGridManagement,
      logListenerError('gridManagement')
    );
  }, [authUser, profile]);

  // management tool - superadmin-editable from Superadmin > Feature Access
  // (see featureAccessService.js). Customer features (ServiceGrid) aren't
  // part of this - those stay identical for every role. ----
  const [featureAccess, setFeatureAccess] = useState(
    featureAccessService.DEFAULT_FEATURE_ACCESS,
  );
  const [gridManagement, setGridManagement] = useState(gridManagementService.DEFAULT_GRID_MANAGEMENT);
  const [dynamicPlatformFeatures, setDynamicPlatformFeatures] = useState([]);
  useEffect(() => {
    if (!authUser || !profile) return undefined;
    let cancelled = false;
    platformControlService.getPlatformCatalog().then((catalog) => {
      if (!cancelled) setDynamicPlatformFeatures(Array.isArray(catalog?.features) ? catalog.features : []);
    }).catch((err) => {
      if (!cancelled) console.log('[platformCatalog] load skipped:', err?.code || err?.message || err);
    });
    return () => { cancelled = true; };
  }, [authUser, profile]);


  // WebView pages: the built-ins from src/data/countries.js with whatever a
  // superadmin has changed on top (settings/webviews). Starts from the
  // built-ins so the grid is right before the first snapshot arrives, and
  // stays right if the document never exists.
  const [webviewPages, setWebviewPages] = useState(() => webviewConfigService.mergePages(null));
  useEffect(() => {
    if (!authUser || !profile) return undefined;
    return webviewConfigService.subscribeWebviewConfig(
      setWebviewPages,
      logListenerError('webviewPages'),
    );
  }, [authUser, profile]);

  // A superadmin's own names and icons for tiles. Empty is the normal state and
  // means every tile keeps what it ships with, so the grids are right before
  // the first snapshot and stay right if the document never exists.
  const [tileLabels, setTileLabels] = useState({});
  useEffect(() => {
    if (!authUser || !profile) return undefined;
    return tileLabelService.subscribeTileLabels(
      setTileLabels,
      logListenerError('tileLabels'),
    );
  }, [authUser, profile]);

  // Central navigation boundary. UI hiding is not a security boundary:
  // every internal setScreen() call (notifications, deep links, callbacks,
  // and manually triggered handlers) must pass role + live grid checks here.
  // Backend/Firebase rules remain the final authority for data mutations.
  const SCREEN_GRID_KEYS = {
    service: null,
    buspicker: 'bus',
    topup: 'topup', history: 'history', support: 'support',
    profile: 'profile', myAccount: 'myAccount', verifyIdentity: 'kyc',
    myDocuments: 'myDocuments', salaryDashboard: 'salary', salarySettings: 'salary',
    salaryCalculator: 'salary', salaryWorkLog: 'salary', salaryReports: 'salary',
    salaryMonthlySummary: 'salary', salaryHistory: 'salary', createPayslip: 'salary',
    payslipHistory: 'salary', payslipDetails: 'salary',
    transferPoints: 'walletTransfer',
    dealerFeatures: 'dealerFeatures', resellerFeatures: 'resellerFeatures',
    adminFeatures: 'adminFeatures', moreFeatures: 'moreFeaturesTile',
    adminAnalytics: 'adminAnalytics', userManagement: 'userManagement',
    verificationManagement: 'verificationManagement', featureAccess: 'featureAccess',
    apiProviderManagement: 'apiManagement', bannerManagement: 'banners',
    gridManagement: null
  };

  // Screens whose UI exposes administrative or role-specific operations.
  // Keep this list centralized so a hidden menu item cannot be bypassed by
  // calling setScreen('...') directly.
  const SCREEN_ROLES = {
    customerHome: ['customer'],
    dealerHome: ['dealer'],
    resellerHome: ['reseller'],
    adminHome: ['admin', 'superadmin'],
    adminFeatures: ['admin', 'superadmin'],
    adminAnalytics: ['admin', 'superadmin'],
    userManagement: ['admin', 'superadmin'],
    verificationManagement: ['admin', 'superadmin'],
    adminSupport: ['admin', 'superadmin'],
    all: ['admin', 'superadmin'],
    pending: ['admin', 'superadmin'],
    inquiries: ['admin', 'superadmin'],
    topups: ['admin', 'superadmin'],
    rates: ['admin', 'superadmin'],
    pricing: ['admin', 'superadmin'],
    payments: ['admin', 'superadmin'],
    featureAccess: ['admin', 'superadmin'],
    apiProviderManagement: ['superadmin'],
    gridManagement: ['superadmin'],
    // Renaming a tile changes what every role sees, so it is superadmin's alone.
    tileLabels: ['superadmin'],
    adFeatureControls: ['superadmin'],
    adAnalytics: ['superadmin'],
    advertiserManagement: ['superadmin'],
    advertiserDetail: ['superadmin'],
    adPackagesManagement: ['superadmin'],
    adPaymentsManagement: ['superadmin'],
    trustedDevices: ['superadmin'],
    tierPromotions: ['superadmin'],
    superAdminTopup: ['superadmin'],
    dealerFeatures: ['dealer'],
    resellerFeatures: ['reseller'],
    // Absent, this screen was simply unguarded: SCREEN_ROLES[undefined] is
    // falsy, so anyone could open it.
    staffHome: STAFF_HOME_ROLES,
    };

  // The route guard calls this. Its own copy omitted support and finance, so
  // every time the guard ran it sent a staff agent to the customer home.
  // Same answer as routeForRole below, from the same function - the route
  // guard having its own copy is what sent support and finance to the customer
  // home. useCallback only to keep the identity stable for the dep array.
  const getHomeForRole = useCallback((role) => homeScreenForRole(role), []);

  const setScreen = useCallback((nextScreen) => {
    const role = profile?.role;
    const allowedRoles = SCREEN_ROLES[nextScreen];

    // Pre-auth routes are intentionally unrestricted; protected routes are
    // denied until a verified profile/role exists.
    if (allowedRoles) {
      // Auth flows call setProfile(p) and setScreen(home) in the same
      // callback, so React may not have committed the new profile role yet.
      // Allow only a role-specific home during that tiny transition; the
      // effect below re-checks it immediately after the profile commits.
      const rolePendingHome =
        !role &&
        !!authUser &&
        ['customerHome', 'dealerHome', 'resellerHome', 'adminHome', 'staffHome'].includes(nextScreen);
      if (!rolePendingHome && (!role || !allowedRoles.includes(role))) {
        if (authUser) showAlert('MySheba', 'You do not have access to this feature.');
        return;
      }
    }

    const gridKey = SCREEN_GRID_KEYS[nextScreen];
    const isSuperadminGridManager = nextScreen === 'gridManagement' && role === 'superadmin';
    if (gridKey && !isSuperadminGridManager && !gridManagementService.isGridActive(gridManagement, gridKey, gridViewer)) {
      showAlert('MySheba', 'This feature is currently unavailable.');
      return;
    }
    setScreenState(nextScreen);
  }, [authUser, gridManagement, gridViewer, profile?.role]);

  useEffect(() => {
    const role = profile?.role;
    const allowedRoles = SCREEN_ROLES[screen];
    const gridKey = SCREEN_GRID_KEYS[screen];
    const roleDenied = allowedRoles && (!role || !allowedRoles.includes(role));
    const gridDenied = gridKey && !(
      screen === 'gridManagement' && role === 'superadmin'
    ) && !gridManagementService.isGridActive(gridManagement, gridKey, gridViewer);

    // No role yet means the profile has not arrived, which is not a denial.
    // Sending someone to Login for it is indistinguishable from being logged
    // out, and it happened on any guarded screen during the window before the
    // profile resolved. Wait instead: the auth listener routes once it knows,
    // and Firebase reporting no user is the only thing that ends a session.
    if (!role) return;
    if (roleDenied || gridDenied) {
      setScreenState(getHomeForRole(role));
    }
  }, [screen, gridManagement, gridViewer, profile?.role, getHomeForRole]);

  // PHASE 4 - Global/per-feature advertisement controls (ad_settings/general,
  // ad_feature_controls/{featureId}), subscribed once here rather than once
  // per SmartAd instance - a screen like Home mounts several SmartAd
  // placements at once, so a shared subscription avoids N redundant
  // Firestore listeners for the same two small config docs. Same
  // "merge with defaults, don't require a write just to read" shape as
  // featureAccess above - see adControlsService.js.
  const [adSettings, setAdSettings] = useState(
    adControlsService.DEFAULT_AD_SETTINGS,
  );
  const [adFeatureControls, setAdFeatureControls] = useState(
    adControlsService.DEFAULT_AD_FEATURE_CONTROLS,
  );
  // Next Update PRD §2 - Country/Region homepage config, read-only here
  // (writes are superadmin-only, direct from AdminHomeScreen's Homepage
  // tab - see homepageConfigService.updateCountryModules). Same
  // fail-quiet-on-listener-error shape as adSettings/adFeatureControls
  // above: a config hiccup just leaves the last-known/default layout in
  // place rather than surfacing as a broken home screen.
  const [homepageConfig, setHomepageConfig] = useState(
    homepageConfigService.DEFAULT_HOMEPAGE_CONFIG,
  );
  // PHASE 9 - see the subscription below for why this is campaigns only
  // (not advertisers too) - keyed by doc id for adTargetingService's
  // getEligibleAds step 13 (campaignId -> AdCampaign).
  const [adCampaignsById, setAdCampaignsById] = useState({});

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
    const access =
      settingsService.priceForRole(pricing, "webviewAccessCost", role) ??
      WEBVIEW_ACCESS_COST;
    const submit =
      settingsService.priceForRole(pricing, "webviewSubmitCost", role) ??
      WEBVIEW_SUBMIT_COST;
    const payment =
      settingsService.priceForRole(pricing, "paymentSuccessCost", role) ??
      PAYMENT_SUCCESS_COST;
    const map = {};
    ACCESS_CLICK_WEBVIEWS.forEach((key) => {
      map[key] = access;
    });
    SUBMIT_CHARGED_WEBVIEWS.forEach((key) => {
      map[key] = submit;
    });
    PAYMENT_CHARGED_WEBVIEWS.forEach((key) => {
      map[key] = payment;
    });
    return map;
  }, [pricing, profile?.role]);

  // How long a FOMEMA/Visa charge stays "unlocked" before the next search
  // charges again - admin-editable from Admin > Pricing > Access Window
  // (see settingsService.js). Falls back to WEBVIEW_ACCESS_WINDOW_HOURS
  // only if the pricing doc hasn't loaded yet.
  const accessWindowHours =
    pricing.webviewAccessWindowHours ?? WEBVIEW_ACCESS_WINDOW_HOURS;

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
      notepad: settingsService.priceForRole(pricing, "notepadCost", role) ?? 0,
      myDocuments:
        settingsService.priceForRole(pricing, "myDocumentsCost", role) ?? 0,
      salaryOt:
        settingsService.priceForRole(pricing, "salaryOtCost", role) ?? 0,
    };
  }, [pricing, profile?.role]);
  const moduleSubscriptionDays = pricing.moduleSubscriptionDays ?? 30;

  const [moduleAccessBusy, setModuleAccessBusy] = useState(false);
  const ensureModuleAccess = useCallback(
    (key, enter) => {
      const cost = moduleSubscriptionCosts[key];
      if (!cost || !authUser?.uid) {
        enter();
        return;
      }
      if (moduleAccessBusy) return;

      const windowMs = moduleSubscriptionDays * 24 * 60 * 60 * 1000;
      const lastCharge = profile?.moduleSubscription?.[key];
      const stillActive = !!lastCharge && Date.now() - lastCharge < windowMs;
      if (stillActive) {
        enter();
        return;
      }

      const balance =
        typeof profile?.walletBalance === "number" ? profile.walletBalance : 0;
      if (balance < cost) {
        showAlert(
          "MySheba",
          `This module needs a ${cost} pt/month subscription. Your current balance is ${balance} pts - top up your wallet first.`,
        );
        return;
      }

      showAlert(
        "Monthly subscription",
        `This module costs ${cost} pts/month. Your current balance is ${balance} pts.\n\nSubscribe and continue?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Subscribe",
            onPress: async () => {
              setModuleAccessBusy(true);
              try {
                await ensureModuleSubscription(authUser.uid, key);
                enter();
              } catch (err) {
                showAlert(
                  "MySheba",
                  err.message ||
                    `You need ${cost} pts for this - top up your wallet first.`,
                );
              } finally {
                setModuleAccessBusy(false);
              }
            },
          },
        ],
      );
    },
    [
      authUser,
      moduleAccessBusy,
      profile,
      moduleSubscriptionCosts,
      moduleSubscriptionDays,
    ],
  );

  const openMyDocuments = useCallback(
    () => ensureModuleAccess("myDocuments", () => setScreen("myDocuments")),
    [ensureModuleAccess],
  );
  const openNotepad = useCallback(
    () => ensureModuleAccess("notepad", () => setScreen("notepad")),
    [ensureModuleAccess],
  );
  const openSalary = useCallback(
    () => ensureModuleAccess("salaryOt", () => setScreen("salaryDashboard")),
    [ensureModuleAccess],
  );
  // Date-range Work Log report (Start/End Work totals + PDF export/share) -
  // see src/screens/SalaryReportsScreen.js. Gated on the same 'salaryOt'
  // key as openSalary so a direct deep-link to Reports can't skip the
  // subscription charge.
  const openSalaryReports = useCallback(
    () => ensureModuleAccess("salaryOt", () => setScreen("salaryReports")),
    [ensureModuleAccess],
  );

  // ---- internet package price overrides, per operator - admin-editable
  // from Admin > Pricing (see internetPricingService.js). ----
  const [internetPricing, setInternetPricing] = useState({});

  // ---- Call/WhatsApp support numbers - admin-editable from Admin >
  // Support (see supportContactService.js). Blank until admin sets them. ----
  const [supportContact, setSupportContact] = useState(
    supportContactService.DEFAULT_SUPPORT_CONTACT,
  );


  // ---- JomPay biller ID/ref + DuitNow QR - superadmin-editable from
  // Admin > Payments (see paymentSettingsService.js). Blank until
  // superadmin sets them; Top-Up screens hide that method's details until
  // it has a value. ----
  const [paymentSettings, setPaymentSettings] = useState(
    paymentSettingsService.DEFAULT_PAYMENT_SETTINGS,
  );

  // ---- home page banner slider (admin-managed) ----
  const [banners, setBanners] = useState([]);

  // ---- admin push announcement history ----
  const [announcements, setAnnouncements] = useState([]);

  // ---- a web sign-in waiting for this phone to approve it ----
  const [webSignInRequest, setWebSignInRequest] = useState(null);
  const clearWebSignInRequest = useCallback(() => setWebSignInRequest(null), []);


  // ---- notification bell: every signed-in user's own view of past
  // announcements addressed to 'all' or their role, plus whether there's
  // anything newer than their last visit to the Notifications screen. ----
  const [rawAnnouncements, setRawAnnouncements] = useState([]);

  // ---- webview ----
  const [webViewKey, setWebViewKey] = useState("fomema");
  const [webViewBusy, setWebViewBusy] = useState(false);

  // ---- rate popup / result modal (mirrors #ratePopup / #resultModal) ----
  const [ratePopupVisible, setRatePopupVisible] = useState(false);
  const [resultModal, setResultModal] = useState({
    visible: false,
    kind: null,
    txId: "",
    service: "",
    details: "",
    amount: 0,
    total: 0,
    createdAt: null,
  });

  const totalSteps = SERVICE_STEPS[currentService] || 3;

  // ---- bootstrap: watch Firebase auth state, then live-subscribe to the
  // signed-in user's profile doc so role/wallet changes made from the
  // Firebase console (or a future admin tool) show up immediately with no
  // re-login needed. Role is never chosen in the UI - it's whatever is on
  // file for this uid. ----
  useEffect(() => {
    let profileUnsub = null;
    let initialRouteDone = false;
    // Set when the effect tears down, so an in-flight cache read or a
    // pending retry cannot write state into an unmounted tree.
    let cancelled = false;
    let retryTimer = null;
    let firstRouteWatchdog = null;

    // Nothing may leave the app holding on the splash. The splash waits on
    // authLoading, and several paths out of the profile listener legitimately
    // return without routing - a document missing from the local cache is
    // ignored so the server can answer, and offline there may be no server
    // answer and no cached profile either. That combination would hold the
    // splash at 92% forever, which is indistinguishable from a hang and is
    // the kind of thing people clear app data to escape.
    const FIRST_ROUTE_TIMEOUT_MS = 8000;
    const armFirstRouteWatchdog = () => {
      if (firstRouteWatchdog) clearTimeout(firstRouteWatchdog);
      firstRouteWatchdog = setTimeout(() => {
        if (cancelled || initialRouteDone) return;
        initialRouteDone = true;
        setAuthLoading(false);
      }, FIRST_ROUTE_TIMEOUT_MS);
    };

    const routeForRole = (p) => setScreen(homeScreenForRole(p && p.role));

    const unsub = authService.subscribeAuth((user) => {
      setAuthUser(user);
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (firstRouteWatchdog) {
        clearTimeout(firstRouteWatchdog);
        firstRouteWatchdog = null;
      }
      if (user && !initialRouteDone) armFirstRouteWatchdog();
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (!user) {
        // Firebase itself says there is no session. This is the one
        // legitimate sign-out, but it is also what a persistence failure
        // looks like, so record which of the two it was.
        noteSignOut("firebase-no-user", initialRouteDone ? "while running" : "at launch", { generic: true });
        setProfile(null);
        setProfileFatal("");
        setAppLocked(false);
        setPendingDeviceVerification(null);
        setPendingGooglePhone(false);
        setSidebarVisible(false);
        screenHistoryRef.current = [];
        isPoppingRef.current = false;
        prevScreenRef.current = "login";
        exitArmedRef.current = false;
        setScreen("login");
        if (!initialRouteDone) {
          initialRouteDone = true;
          setAuthLoading(false);
        }
        return;
      }

      // Open on the last known-good profile straight away. Without this the
      // app has nothing to render until Firestore answers, and every reason
      // it might not answer - no network, a dropped listener, a cold start
      // on a train - ended at the Login screen even though Firebase Auth had
      // a perfectly valid persisted session. That is the "login not saved"
      // report: the session was saved, the profile read was not.
      (async () => {
        const cached = await readCachedProfile(user.uid);
        if (!cached || cancelled || initialRouteDone) return;
        // A cached profile may never be used to walk past a pending device
        // approval: the live listener is what clears that, so opening on a
        // home screen from cache would skip the check for as long as the
        // snapshot takes to arrive. Let the listener route this one.
        if (cached.pendingDeviceApproval) return;
        setProfile(cached);
        initialRouteDone = true;
        routeForRole(cached);
        setAuthLoading(false);
      })();

      const attachProfile = (isRetry) => authService.subscribeProfile(
        user.uid,
        (p, meta) => {
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
            if (cancelled) return;

            const verdict = classifyProfileSnapshot(p, meta);
            // 'ignore' is a document missing from the local cache, which
            // means "not cached yet" rather than "deleted".
            if (verdict === "ignore") return;
            if (verdict === "gone") {
              await clearCachedProfile(user.uid);
              await noteSignOut("profile-gone", "server says users/" + user.uid + " does not exist");
              setProfile(null);
              if (!initialRouteDone) {
                initialRouteDone = true;
                setAuthLoading(false);
              }
              return;
            }

            try {
              const deviceId = await deviceSessionService.getDeviceId();

              if (
                p.pendingDeviceApproval &&
                p.pendingDeviceApproval.deviceId === deviceId
              ) {
                setPendingDeviceVerification({
                  uid: user.uid,
                  role: p.role,
                  email: p.email || "",
                });
                setProfile(p);
                setScreen("deviceVerify");
                if (!initialRouteDone) {
                  initialRouteDone = true;
                  setAuthLoading(false);
                }
                return;
              }

              const localSessionId =
                await deviceSessionService.getLocalSessionId();
              const deviceCheckDeferred = await deviceSessionService
                .isDeviceCheckDeferred()
                .catch(() => false);
              if (
                shouldEndSessionForDevice({
                  localSessionId,
                  activeSessionId: p.activeSessionId,
                  activeDeviceId: p.activeDeviceId,
                  activeSessions: p.activeSessions,
                  deviceId: await deviceSessionService.getDeviceId(),
                  initialRouteDone,
                  deviceCheckDeferred,
                })
              ) {
                // Do not sign the user out merely because the app was closed,
                // backgrounded, or restored after a device-session refresh.
                // Firebase Auth persistence is the source of truth for app
                // restart. A deliberate logout still goes through authService.logout().
                // While the app is actively running, a changed active session
                // is handled on the next profile update rather than destroying
                // the persisted login during bootstrap.
                //
                // Nor when this device never got an authoritative session id:
                // a login that went through while checkDeviceSession was
                // unreachable is recorded as deferred and leaves the local id
                // stale, so the mismatch below says nothing about another
                // device having taken over - it only says we never asked.
                await clearCachedProfile(user.uid);
                await noteSignOut("device-takeover",
                  "local=" + String(localSessionId) + " active=" + String(p.activeSessionId));
                await authService.logout();
                setProfile(null);
                // Clear the lock here rather than waiting for the signed-out
                // branch above to do it. That branch runs when Firebase Auth
                // emits null, which is a moment later, and until then
                // appLocked is still true while the screen is already
                // 'login' - so the PIN modal sits on top of the login form,
                // asking someone who has just been signed out to unlock an
                // app they are no longer signed in to. The only way out of
                // that modal is its own 'Forgot PIN? Log out' link.
                setAppLocked(false);
                screenHistoryRef.current = [];
                setScreen("login");
                showAlert(
                  "Signed Out",
                  "Your account was signed in on another device, so you were signed out here.",
                );
                return;
              }
            } catch (e) {
              // fall through to normal routing below
            }

            setProfile(p);
            setAuthError("");
            setProfileFatal("");
            writeCachedProfile(user.uid, p);
            // Signed in with a profile, so there is a uid to attach last
            // time's breadcrumb to. Fire and forget.
            flushSignOutTrace((entry) => logError(
              "signedOut:" + entry.reason,
              new Error(entry.detail || entry.reason),
              { signedOutAt: entry.at, signedOutReason: entry.reason },
            )).catch(() => {});
            if (!initialRouteDone) {
              initialRouteDone = true;
              // Restoring a persisted session on app launch - jump straight
              // to the right home screen for this account's role instead of
              // showing Login again.
              routeForRole(p);
              setAuthLoading(false);
            } else if (screenRef.current === "login") {
              // Signed in, profile in hand, and still sitting on Login. That
              // is what the first-route watchdog leaves behind when Firestore
              // takes longer than its 8s to answer: it clears authLoading
              // with no profile, the hard auth boundary routes to Login, and
              // this branch used to skip routing because initialRouteDone was
              // already true. The person then saw a login form despite having
              // a perfectly good session - which is exactly "closed the app
              // and it logged me out".
              //
              // Only 'login'. register, deviceVerify and googlePhone are
              // places the app puts people on purpose.
              routeForRole(p);
            }
          })();
        },
        (error) => {
          // The users/{uid} listener failed. A failure to READ the profile is
          // not a decision to sign anyone out, so this no longer discards the
          // profile and drops the person at Login. Only two answers end a
          // session: the person tapping Log Out, or Firebase Auth itself
          // reporting no user.
          //
          // permission-denied is the one answer that means this account may
          // not use the app - firestore.rules:64 requires activeProfile(),
          // which is false when the profile is suspended, inactive, disabled,
          // active:false or mergedInto another account. Even that is retried
          // once, because a listener that attaches a moment before the auth
          // token propagates is denied for reasons that have nothing to do
          // with the account.
          //
          // Everything else - unavailable, deadline-exceeded, a dropped
          // connection - keeps the cached profile and the current screen.
          if (cancelled) return;
          const action = classifyProfileError(error, { isRetry });

          if (action === "retry") {
            if (profileUnsub) profileUnsub();
            retryTimer = setTimeout(() => {
              if (!cancelled) profileUnsub = attachProfile(true);
            }, 1500);
            return;
          }

          if (action === "fatal") {
            clearCachedProfile(user.uid);
            setAuthError(error || "Could not load your profile.");
            noteSignOut("profile-fatal", error || "profile listener gave up");
            setProfile(null);
            // Deliberately NOT a sign-out.
            //
            // 'fatal' is two permission-denied answers 1.5s apart, and while
            // that usually means the account is blocked, it is also what a
            // token still propagating looks like on a slow connection.
            // Destroying a valid session over that is the same mistake this
            // whole file keeps making, one layer down - and the cost is
            // asymmetric: a blocked account stuck on a screen that explains
            // itself is recoverable, a wrongly signed-out one is not.
            //
            // The session stands. The restoring screen shows this error and
            // offers Log Out, so a genuinely blocked account is told why and
            // can leave, and a race resolves itself when the listener's next
            // attempt succeeds.
            setProfileFatal(error || "Your profile could not be loaded.");
            if (!initialRouteDone) {
              initialRouteDone = true;
              setAuthLoading(false);
            }
            return;
          }

          // Transient. Keep whatever profile is on screen; the listener
          // reconnects on its own.
          if (!initialRouteDone) {
            initialRouteDone = true;
            setAuthError(error || "Could not load your profile.");
            setAuthLoading(false);
          }
        },
      );

      profileUnsub = attachProfile(false);
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (firstRouteWatchdog) clearTimeout(firstRouteWatchdog);
      unsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  // Hard auth boundary: a signed-out device may never remain on or return
  // to any protected screen. This also closes the small render/navigation
  // race that can otherwise leave the previous Home screen visible for a
  // moment after Firebase sign-out. There is no guest/anonymous session.
  //
  // It keys on authUser ALONE. It used to read `!authUser || !profile`, and
  // that second half was the "it logs me out when I close the app" report:
  // a missing profile is not a missing session. On a cold start Firebase
  // restores the user immediately and Firestore answers a moment later - or,
  // on a slow or offline start, not for a while. In that window authUser is
  // set, the token is valid, and profile is still null. The first-route
  // watchdog clears authLoading after 8 seconds regardless, `screen` has
  // never moved off its initial "login", and the app renders the login form
  // to somebody who is signed in. Nothing recorded a sign-out because none
  // happened, which is why every trace said the session was healthy.
  //
  // Now a null profile with a live authUser is a RESTORING state (see
  // sessionRestoring below), not a signed-out one, and only Firebase Auth
  // reporting no user sends anyone back to the login form.
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      if (!PRE_AUTH_SCREENS.includes(screen)) {
        screenHistoryRef.current = [];
        isPoppingRef.current = false;
        prevScreenRef.current = "login";
        setScreen("login");
      }
    }
  }, [authLoading, authUser, screen]);

  // The other half of the boundary: signed in must never sit on the login form.
  //
  // The boundary above only pushes people OUT of the app when the session is
  // gone. Nothing pulled them back IN when the session was fine but `screen`
  // was "login" - and "login" is where `screen` starts on every cold launch,
  // so anything that failed to route (a slow profile read, a route that ran
  // and was then overwritten) left a signed-in person looking at the login
  // form. Pressing hardware back from there revealed the home screen, which is
  // what proved the session had been valid the whole time.
  //
  // Only "login" is corrected. register, deviceVerify and googlePhone are
  // places the app puts people deliberately, and pendingDeviceVerification
  // means a code is still outstanding.
  useEffect(() => {
    if (authLoading) return;
    if (!authUser || !profile) return;
    if (pendingDeviceVerification || pendingGooglePhone) return;
    if (screen !== "login") return;
    screenHistoryRef.current = [];
    isPoppingRef.current = false;
    prevScreenRef.current = "login";
    setScreen(homeScreenForRole(profile.role));
  }, [authLoading, authUser, profile, screen, pendingDeviceVerification, pendingGooglePhone]);

  // Signed in, but the profile has not arrived yet. The app must not show the
  // login form in this state - there is a valid session behind it.
  const sessionRestoring = !!authUser && !profile;

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
      logListenerError("rates"),
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    settingsService.ensurePricing().catch(() => {});
    const unsub = settingsService.subscribePricing(
      (p) => setPricing(p),
      logListenerError("pricing"),
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    featureAccessService.ensureFeatureAccess().catch(() => {});
    const unsub = featureAccessService.subscribeFeatureAccess(
      (fa) => setFeatureAccess(fa),
      logListenerError("featureAccess"),
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
      logListenerError("adSettings"),
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = adControlsService.subscribeAdFeatureControls(
      (fc) => setAdFeatureControls(fc),
      logListenerError("adFeatureControls"),
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = homepageConfigService.subscribeHomepageConfig(
      (c) => setHomepageConfig(c),
      logListenerError("homepageConfig"),
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
      (list) =>
        setAdCampaignsById(Object.fromEntries(list.map((c) => [c.id, c]))),
      logListenerError("adCampaigns"),
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    supportContactService.ensureSupportContact().catch(() => {});
    const unsub = supportContactService.subscribeSupportContact(
      (c) => setSupportContact(c),
      logListenerError("supportContact"),
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    paymentSettingsService.ensurePaymentSettings().catch(() => {});
    const unsub = paymentSettingsService.subscribePaymentSettings(
      (s) => setPaymentSettings(s),
      logListenerError("paymentSettings"),
    );
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = internetPricingService.subscribeInternetPricing(
      (map) => setInternetPricing(map),
      logListenerError("internetPricing"),
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
      logListenerError("banners"),
    );    return unsub;
  }, [authUser]);

  // ---- live broadcast transactions. Admin/superadmin see the same full
  // stream; Dealer and Reseller dashboards share the pending/processing/
  // completed broadcast pool. Customer history remains separate below.
  useEffect(() => {
    const needsTx =
      screen === "dealerHome" ||
      screen === "adminHome" ||
      screen === "reports" ||
      screen === "resellerHome";
    const role = profile && profile.role;
    if (!needsTx || !role || !authUser) return undefined;

    // Staff see the full stream only if their access includes orders or
    // finance; operators see their own queue.
    const seesAllOrders = can("orders") || can("finance");
    const isOperator = role === "dealer" || role === "reseller";
    if (!isOperator && !seesAllOrders) return undefined;

    // Phase 10: Dealer and Reseller no longer share one undifferentiated
    // queue - each only ever sees the specific service(s) their tier owns
    // (enforced server-side too, see firestore.rules' canHandleTransaction()
    // - this filter is UX, that's the actual security boundary). Admin/
    // superadmin keep the full unfiltered stream, same as before.
    const unsub = transactionService.subscribeBroadcastTransactions((txs) => {
      if (seesAllOrders && !isOperator) {
        setDealerTxs(txs);
        setResellerTxs(txs);
      } else if (role === "dealer") {
        setDealerTxs(txs.filter((t) => t.service === "Mobile Banking"));
      } else if (role === "reseller") {
        setResellerTxs(
          txs.filter((t) =>
            ["Recharge", "Internet", "Bill Payment", "Remittance"].includes(t.service),
          ),
        );
      }
    }, logListenerError("transactions:broadcast"), { fullStream: seesAllOrders && !isOperator });
    return unsub;
  }, [screen, profile, authUser, can]);

  // ---- admin push announcement history, only needed on the Admin
  // ---- notification bell feed: any signed-in user (not just admin) reads
  // the same announcement log and filters it client-side to what's actually
  // addressed to them ('all' or their own role) - see firestore.rules,
  // which opens read access to any signed-in user for this reason. ----
  useEffect(() => {
    if (!authUser) {
      setRawAnnouncements([]);
      return undefined;
    }
    const unsub = announcementService.subscribeAnnouncements(
      (list) => {
        setRawAnnouncements(list);
        if (profile && (profile.role === "admin" || profile.role === "superadmin") && screen === "adminHome") {
          setAnnouncements(list);
        }
      },
      logListenerError("myAnnouncements"),
    );
    return unsub;
  }, [authUser, profile, screen]);

  const myNotifications = useMemo(() => {
    const role = profile && profile.role;
    if (!role) return [];
    return rawAnnouncements.filter(
      (a) => a.audience === "all" || a.audience === role,
    );
  }, [rawAnnouncements, profile]);

  const hasUnreadNotifications = useMemo(() => {
    if (myNotifications.length === 0) return false;
    const lastSeen = profile && profile.lastSeenAnnouncementAt;
    if (!lastSeen) return true;
    const lastSeenMs = lastSeen.toMillis
      ? lastSeen.toMillis()
      : new Date(lastSeen).getTime();
    return myNotifications.some((a) => {
      const createdMs =
        a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
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
    const isAdminScreen =
      (screen === "adminHome" || screen === "reports") && can("support");
    const isResellerScreen = screen === "resellerHome" && role === "reseller";
    if (!isAdminScreen && !isResellerScreen) return undefined;
    const unsub = inquiryService.subscribeInquiries(
      (list) =>
        setInquiries(
          isResellerScreen ? list.filter((i) => i.type === "flight") : list,
        ),
      logListenerError("inquiries"),
    );
    return unsub;
  }, [screen, profile, can]);

  // ---- live top-up requests, only needed on the Admin dashboard ----
  useEffect(() => {
    // Reviewing top-ups is finance work.
    if ((screen !== "adminHome" && screen !== "reports") || !can("finance"))
      return undefined;
    const unsub = topupService.subscribeTopups(
      (list) => setTopups(list),
      logListenerError("topups"),
    );
    return unsub;
  }, [screen, profile, can]);

  // ---- push notification taps: jump to the right thread when the user
  // taps a notification, whether the app was foregrounded, backgrounded, or
  // fully closed. Re-subscribes whenever authUser changes (login/logout) so
  // the closure below never acts on a stale uid. addNotificationResponseListener
  // alone misses the tap that cold-launched the app, so that case is
  // covered separately via getLastNotificationResponseAsync. ----
  useEffect(() => {
    if (!authUser) return undefined;

    const isWebSignInApproval = (data) =>
      data.type === "web_signin_approval" && !!data.approvalId;

    // Not a screen: the answer is two buttons, and the person is being asked
    // about a sign-in happening right now, wherever they happen to be.
    const showWebSignInApproval = (data) =>
      setWebSignInRequest({
        approvalId: String(data.approvalId),
        label: String(data.label || ""),
        ip: String(data.ip || ""),
      });

    const handleResponse = async (response) => {
      const data = response?.notification?.request?.content?.data || {};
      try {
        if (isWebSignInApproval(data)) {
          showWebSignInApproval(data);
        } else if (data.type === "chat" && data.chatId) {
          openChat(data.chatId, "Support");
        } else if (data.type === "topup") {
          // Admin/superadmin get notified of a new request to review; the
          // requester gets notified once it's approved/rejected. Route each
          // to wherever that status actually lives for them - staff never
          // see their own self-topups in this queue (see topupService).
          if (can("finance")) {
            setAdminTab("topups");
            setScreen("adminHome");
          } else setScreen("history");
        } else if (data.type === "supportTicket") {
          // Every new ticket lands with superadmin first, who decides
          // whether to appoint an admin or dealer to solve it - so only
          // superadmin gets routed to the full queue here. The requester
          // (and any admin who gets appointed) sees status/assignment
          // updates on their own Support screen instead.
          const isSuperadmin = profile && profile.role === "superadmin";
          setScreen(isSuperadmin ? "adminSupport" : "support");
        }
      } catch (e) {
        // Non-fatal - worst case the user lands on their home screen
        // instead of the exact thread and can navigate there manually.
      }
    };

    getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });
    const sub = addNotificationResponseListener(handleResponse);
    // The approval expires in five minutes, so when the app is already open
    // the prompt comes up on arrival rather than waiting for a tap on a
    // banner the person may never look at. Only this one type - every other
    // notification still routes on tap, as before.
    const received = addNotificationReceivedListener((notification) => {
      const data = notification?.request?.content?.data || {};
      if (isWebSignInApproval(data)) showWebSignInApproval(data);
    });
    return () => {
      sub.remove();
      received.remove();
    };
  }, [authUser, profile, openChat, setAdminTab, setScreen, can]);

  const openResult = useCallback((kind, txId, svc, extra) => {
    setResultModal({
      visible: true,
      kind,
      txId,
      service: svc,
      details: (extra && extra.details) || "",
      amount: (extra && extra.amount) || 0,
      total: (extra && extra.total) || 0,
      createdAt: Date.now(),
    });
  }, []);

  const closeResult = useCallback(() => {
    setResultModal({
      visible: false,      kind: null,
      txId: "",
      service: "",
      details: "",
      amount: 0,
      total: 0,
      createdAt: null,
    });
  }, []);

  const openSidebar = useCallback(() => setSidebarVisible(true), []);
  const closeSidebar = useCallback(() => setSidebarVisible(false), []);

  // Home screens where there's nowhere further back to go - hitting back
  // here arms a "press again to exit" confirmation instead of leaving.
  const HOME_SCREENS = [
    "customerHome",
    "dealerHome",
    "resellerHome",
    "adminHome",
  ];

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
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
      if (
        screen === "webview" &&
        webViewBackInterceptorRef.current &&
        webViewBackInterceptorRef.current()
      ) {
        return true;
      }
      // Mid-wizard on the service screen: step back one field-group at a
      // time (same as the on-screen "← Back" button in the nav bar)
      // before ever touching the outer screen history - otherwise
      // hardware back would skip every step and jump straight to
      // whatever screen opened the wizard.
      if (screen === "service" && currentStep > 0) {
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
        if (Platform.OS === "android") {
          ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
        }
        setTimeout(() => {
          exitArmedRef.current = false;
        }, 2000);
        return true;
      }
      if (goBack()) return true;

      // Nothing left inside this feature. Go Home rather than returning
      // false, which hands the press to Android and closes the app - the
      // old behaviour for any feature opened straight from the home grid,
      // since those start with an empty trail.
      if (goHomeRef.current) {
        goHomeRef.current();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [screen, sidebarVisible, goBack, closeSidebar, currentStep]);

  const goHome = useCallback(() => {
    const r = profile ? profile.role : "";
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
    if (r === "dealer") setScreen("dealerHome");
    else if (r === "reseller") setScreen("resellerHome");
    else if (r === "support" || r === "finance") setScreen("staffHome");
    else if (r === "admin" || r === "superadmin") setScreen("adminHome");
    else setScreen("customerHome");
  }, [profile]);
  goHomeRef.current = goHome;

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
        showAlert(
          "MySheba",
          "Could not save that preference. Please try again.",
        );
      });
    },
    [authUser],
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
    setProfile((p) =>
      p
        ? {
            ...p,
            walletBalance: result.walletBalance,
            googleLinked: result.googleLinked,
          }
        : p,
    );
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
    setAuthError("");
    try {
      const p = await authService.login(phone, pin, dialCode);
      // Authenticated by hand just now, so the cold-launch App Lock does not
      // then ask for a PIN on top of the password that was just typed.
      signedInThisSessionRef.current = true;
      if (p.pendingDeviceApproval) {
        // A different device is already active on this account, OR (for
        // admin/superadmin) this login just needs its per-login MFA code -
        // reason distinguishes the two for DeviceVerifyScreen's copy and
        // for confirmDeviceVerification below. Don't land on a dashboard
        // yet either way.
        setPendingDeviceVerification({
          uid: p.uid,
          // The role decides WHICH callable completes verification, and the
          // wrong one cannot be recovered from - see src/utils/devicePolicy.js.
          // It used to be read off `profile`, which every one of these
          // branches returned without ever setting, so it was always
          // undefined: staff accounts took the non-staff path,
          // confirmDeviceSwitch found no pendingDeviceApproval to match, and
          // verification could never complete. Carry it explicitly instead of
          // depending on separate state having been populated first.
          role: p.role,
          email: p.pendingDeviceApproval.email,
          phone: p.pendingDeviceApproval.phone,
          reason: p.pendingDeviceApproval.reason,
          availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods,
          emailChallengeSent: p.pendingDeviceApproval.emailChallengeSent,
        });
        // The sign-in succeeded and this is that account's profile. Withholding
        // it left the verification screen, and everything else reading role,
        // looking at null.
        setProfile(p);
        setScreen("deviceVerify");
        return true;
      }
      setProfile(p);
      if (p.role === "dealer") {
        setDealerTab("pending");
        setScreen("dealerHome");
      } else if (p.role === "reseller") {
        setResellerTab("pending");
        setScreen("resellerHome");
      } else if (p.role === "support" || p.role === "finance") {
        setScreen("staffHome");
      } else if (p.role === "admin" || p.role === "superadmin") {
        setAdminTab("all");
        setScreen("adminHome");
      } else setScreen("customerHome");
      return true;
    } catch (err) {
      // Keep the error object, not just its text: authService tags sign-in
      // failures with a `reason`, and LoginScreen needs it to tell a rate
      // limit from a wrong password. Storing err.message threw that away.
      setAuthError(err || "Sign in failed.");
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
    setAuthError("");
    try {
      const p = await authService.signInWithGoogle();
      signedInThisSessionRef.current = true;
      if (p.pendingDeviceApproval) {
        setPendingDeviceVerification({
          uid: p.uid,
          // The role decides WHICH callable completes verification, and the
          // wrong one cannot be recovered from - see src/utils/devicePolicy.js.
          // It used to be read off `profile`, which every one of these
          // branches returned without ever setting, so it was always
          // undefined: staff accounts took the non-staff path,
          // confirmDeviceSwitch found no pendingDeviceApproval to match, and
          // verification could never complete. Carry it explicitly instead of
          // depending on separate state having been populated first.
          role: p.role,
          email: p.pendingDeviceApproval.email,
          phone: p.pendingDeviceApproval.phone,
          reason: p.pendingDeviceApproval.reason,
          availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods,
          emailChallengeSent: p.pendingDeviceApproval.emailChallengeSent,
        });
        // The sign-in succeeded and this is that account's profile. Withholding
        // it left the verification screen, and everything else reading role,
        // looking at null.
        setProfile(p);
        setScreen("deviceVerify");
        return true;
      }
      setProfile(p);
      if (p.role === "dealer") {
        setDealerTab("pending");
        setScreen("dealerHome");
      } else if (p.role === "reseller") {
        setResellerTab("pending");
        setScreen("resellerHome");
      } else if (p.role === "support" || p.role === "finance") {
        setScreen("staffHome");
      } else if (p.role === "admin" || p.role === "superadmin") {
        setAdminTab("all");
        setScreen("adminHome");
      } else setScreen("customerHome");
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
        setScreen("googlePhone");
        return false;
      }
      setAuthError(err.message || "Google sign-in failed.");
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
    setAuthError("");
    try {
      const p = await authService.completeGoogleSignup(phone);
      if (p.pendingDeviceApproval) {
        setPendingGooglePhone(false);
        setPendingDeviceVerification({
          uid: p.uid,
          // The role decides WHICH callable completes verification, and the
          // wrong one cannot be recovered from - see src/utils/devicePolicy.js.
          // It used to be read off `profile`, which every one of these
          // branches returned without ever setting, so it was always
          // undefined: staff accounts took the non-staff path,
          // confirmDeviceSwitch found no pendingDeviceApproval to match, and
          // verification could never complete. Carry it explicitly instead of
          // depending on separate state having been populated first.
          role: p.role,
          email: p.pendingDeviceApproval.email,
          phone: p.pendingDeviceApproval.phone,
          reason: p.pendingDeviceApproval.reason,
          availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods,
          emailChallengeSent: p.pendingDeviceApproval.emailChallengeSent,
        });
        // The sign-in succeeded and this is that account's profile. Withholding
        // it left the verification screen, and everything else reading role,
        // looking at null.
        setProfile(p);
        setScreen("deviceVerify");
        return true;
      }
      setPendingGooglePhone(false);
      setProfile(p);
      if (p.role === "dealer") {
        setDealerTab("pending");
        setScreen("dealerHome");
      } else if (p.role === "reseller") {
        setResellerTab("pending");
        setScreen("resellerHome");
      } else if (p.role === "support" || p.role === "finance") {
        setScreen("staffHome");
      } else if (p.role === "admin" || p.role === "superadmin") {
        setAdminTab("all");
        setScreen("adminHome");
      } else setScreen("customerHome");
      return true;
    } catch (err) {
      setAuthError(err.message || "Could not complete sign-up.");
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
      setScreen("login");
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
  const confirmDeviceVerification = useCallback(
    async (phoneIdToken, emailIdToken, emailOtp) => {
      if (!pendingDeviceVerification) return false;
      setAuthBusy(true);
      setAuthError("");
      try {
        const p =
          pendingDeviceVerification.reason === "admin_mfa"
            ? await authService.retryDeviceSession(
                pendingDeviceVerification.uid,
                phoneIdToken,
                emailIdToken,
                emailOtp,
              )
            : await authService.confirmDeviceLogin(
                pendingDeviceVerification.uid,
                emailIdToken,
              );

        if (p.pendingDeviceApproval) {
          setPendingDeviceVerification({
            uid: p.uid,
            role: p.role,
            email: p.pendingDeviceApproval.email,
            phone: p.pendingDeviceApproval.phone,
            reason: p.pendingDeviceApproval.reason,
            availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods,
          });
          return false;
        }

        setPendingDeviceVerification(null);
        setProfile(p);
        if (p.role === "dealer") {
          setDealerTab("pending");
          setScreen("dealerHome");
        } else if (p.role === "reseller") {
          setResellerTab("pending");
          setScreen("resellerHome");
        } else if (p.role === "support" || p.role === "finance") {
          setScreen("staffHome");
        } else if (p.role === "admin" || p.role === "superadmin") {
          setAdminTab("all");
          setScreen("adminHome");
        } else setScreen("customerHome");
        return true;
      } catch (err) {
        setAuthError(err.message || "Verification failed.");
        return false;
      } finally {
        setAuthBusy(false);
      }
    },
    [pendingDeviceVerification],
  );

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
      setScreen("login");
    }
  }, []);

  const doRegister = useCallback(
    async ({
      name,
      phone,
      phoneE164,
      dialCode,
      email,
      pin,
      dealerCode,
      resellerCode,
      phoneIdToken,
    }) => {
      setAuthBusy(true);
      setAuthError("");
      try {
        const p = await authService.registerCustomer({
          name,
          phone,
          phoneE164,
          dialCode,
          email,
          pin,
          phoneIdToken,
        });
        setProfile(p);
        setScreen("customerHome");
        return true;
      } catch (err) {
        setAuthError(err.message || "Registration failed.");
        return false;
      } finally {
        setAuthBusy(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    // Captured before sign-out clears it. A deliberate logout is one of the
    // only two things that may discard the cached profile - the other is the
    // server saying the account may no longer use the app - and leaving
    // someone's name, phone and balance on the device afterwards would be
    // wrong regardless.
    const uid = authUser?.uid;
    try {
      await authService.logout();
    } finally {
      await clearCachedProfile(uid);
      // Biometric opt-in resets on every logout - the person's own rule:
      // clicking logout clears it, so the next sign-in (same account or a
      // different one on this device) shows BiometricOptInPrompt again
      // rather than silently staying enabled/disabled from before.
      await clearBiometricEnabledPref();
      // And forget the stored PIN. It exists only so a fingerprint can stand
      // in for the PIN while signed in; once the session is over it is a money
      // credential sitting on a handset for no reason. Logging back in stores
      // it again on the first PIN entry.
      await pinVault.forgetPin(uid);
      setBiometricEnabledState(null);
      biometricPromptedRef.current = false;
      setShowBiometricPrompt(false);
      setAuthUser(null);
      setPendingDeviceVerification(null);
      setPendingGooglePhone(false);
      setSidebarVisible(false);
      setProfile(null);
      screenHistoryRef.current = [];
      isPoppingRef.current = false;
      prevScreenRef.current = "login";
      exitArmedRef.current = false;
      signedInThisSessionRef.current = false;
      launchLockDoneRef.current = false;
      setScreen("login");
    }
    // authUser is read above to clear that account's cached profile, so it
    // has to be a dependency - with an empty array the closure keeps the
    // first render's value (null) and the cache is never cleared.
  }, [authUser]);

  /**
   * `seed` and `startStep` let a tile open a service part-filled.
   *
   * JomPay and the TnG reload are both Bill Payment with the country, and for
   * TnG the category and biller, already chosen - so they are one tile each
   * that lands further down the same flow, rather than a service each with its
   * own charge path to get wrong.
   *
   * The gate is unchanged and still names the SERVICE, so switching Bill
   * Payment off switches its shortcuts off with it. The tile's own key is
   * checked separately by useServiceAction, so either can be turned off alone.
   */
  const startService = useCallback((service, seed = null, startStep = 0) => {
    if (!gridManagementService.isGridActive(gridManagement, service, gridViewer)) {
      showAlert("MySheba", "This feature is currently unavailable.");
      return;
    }
    setCurrentService(service);
    setCurrentStep(Number.isInteger(startStep) && startStep > 0 ? startStep : 0);
    setServiceData(seed && typeof seed === 'object' ? { ...seed } : {});
    setScreen("service");
  }, [gridManagement, gridViewer, showAlert]);

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
      if (!gridManagementService.isGridActive(gridManagement, key, gridViewer)) {
        showAlert('MySheba', 'This feature is currently unavailable.');
        return;
      }
      const cost = pointCosts[key];
      if (!cost || !authUser?.uid) {
        setWebViewKey(key);
        setWebViewPaymentCharged(false);
        setScreen("webview");
        return;
      }
      if (webViewBusy) return;

      const alreadyCovered =
        SUBMIT_CHARGED_WEBVIEWS.includes(key) &&
        !!profile?.webviewSubmitted?.[key];

      const enterWebview = () => {
        setWebViewKey(key);
        setWebViewPaymentCharged(false);
        setScreen("webview");
      };

      if (alreadyCovered) {
        enterWebview();
        return;
      }

      const balance =
        typeof profile?.walletBalance === "number" ? profile.walletBalance : 0;
      if (balance < cost) {
        showAlert(
          "MySheba",
          `You need ${cost} pts to use this feature. Your current balance is ${balance} pts - top up your wallet first.`,
        );
        return;
      }

      showAlert(
        "Your balance will be charged",
        `Using this feature costs ${cost} pts. Your current balance is ${balance} pts.\n\nContinue?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Continue",
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
                showAlert(
                  "MySheba",
                  err.message ||
                    `You need ${cost} pts to use this - top up your wallet first.`,
                );
              } finally {
                setWebViewBusy(false);
              }
            },
          },
        ],
      );
    },
    [authUser, webViewBusy, profile, pointCosts, gridManagement, gridViewer],
  );

  // Shows the Bus screen's 3-option grid (redBus / Bus Online Ticket /  // Easybook) instead of opening a WebView directly - each card then
  // calls openWebView with its own key ('bus-redbus' |
  // 'bus-busonlineticket' | 'bus-easybook'), which re-runs the same
  // insufficient-points gate above.
  const openBusPicker = useCallback(() => {
    setScreen("buspicker");
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
        const result = await chargePaymentSuccess(
          authUser.uid,
          key,
          pointCosts[key],
        );
        if (result.charged) {
          setWebViewPaymentCharged(true);
          showAlert(
            "MySheba",
            `Payment confirmed - ${result.cost} pts deducted.`,
          );
        }
        return result;
      } catch (err) {
        showAlert(
          "MySheba",
          err.message || "Could not confirm this payment right now.",
        );
      } finally {
        setWebViewPaymentBusy(false);
      }
    },
    [authUser, webViewPaymentBusy, webViewPaymentCharged, pointCosts],
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
        const result = await ensureWebviewAccess(
          authUser.uid,
          key,
          pointCosts[key],
          accessWindowHours,
        );
        if (result.charged) {
          showAlert(
            "MySheba",
            `${result.cost} pts deducted for this search. Free for the next ${accessWindowHours} hour(s).`,
          );
        }
        return result;
      } catch (err) {
        showAlert(
          "MySheba",
          err.message || "Could not confirm this check right now.",
        );
      } finally {
        setWebViewBusy(false);
      }
    },
    [authUser, webViewBusy, pointCosts, accessWindowHours],
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
        const result = await chargeWebviewSubmission(
          authUser.uid,
          key,
          pointCosts[key],
        );
        if (result.charged) {
          showAlert(
            "MySheba",
            "Thanks - your submission is confirmed and your balance has been charged.",
          );
        } else {
          showAlert("MySheba", "This application was already confirmed.");
        }
        return result;
      } catch (err) {
        showAlert(
          "MySheba",
          err.message || "Could not confirm your submission right now.",
        );
      } finally {
        setWebViewSubmitBusy(false);
      }
    },
    [authUser, webViewSubmitBusy, pointCosts],
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
          authUser,
        );
        openResult("travel", id, label);
      } else {
        const payload = buildTransactionPayload(
          currentService,
          serviceData,
          pricing,
          rates,
        );
        const id = await transactionService.createTransaction(
          { ...payload, raw: serviceData },
          {
            uid: authUser ? authUser.uid : null,
            phone: profile ? profile.phone : "",
            dealerId: profile ? profile.dealerId : null,
            resellerId: profile ? profile.resellerId : null,
          },
        );
        if (currentService === "remittance" && authUser?.uid) {
          await maybeSaveReceiver(serviceData, authUser.uid);
        }
        openResult("dealer", id, payload.service, {
          details: payload.details,
          amount: payload.amount,
          total: payload.total,
        });
      }
    } catch (err) {
      showAlert(
        "MySheba",
        err.message || "Could not submit your request. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    currentService,
    serviceData,
    authUser,
    profile,
    openResult,
    pricing,
    rates,
  ]);

  const value = {
    // auth
    authUser,
    profile,
    capabilities,
    can,
    authLoading,
    authError,
    authBusy,
    doLogin,
    doGoogleLogin,
    doRegister,
    logout,
    pendingDeviceVerification,
    confirmDeviceVerification,
    cancelDeviceVerification,
    pendingGooglePhone,
    completeGooglePhone,
    cancelGooglePhone,
    // nav
    screen,
    setScreen,
    goBack,
    goBackOrHome,
    setHomeBackInterceptor,
    setWebViewBackInterceptor,
    // sidebar drawer
    sidebarVisible,
    openSidebar,
    closeSidebar,
    // wizard
    currentService,
    currentStep,
    totalSteps,
    serviceData,
    submitting,
    setCurrentStep,
    updateServiceData,
    nextStep,
    prevStep,
    startService,
    submitService,
    // dealer / admin
    dealerTxs,
    dealerTab,
    setDealerTab,
    adminViewingSection,
    setAdminViewingSection,
    dealerViewingSection,
    setDealerViewingSection,
    // reseller
    resellerTxs,
    resellerTab,
    setResellerTab,
    resellerViewingSection,
    setResellerViewingSection,
    inquiries,
    adminTab,
    setAdminTab,
    topups,
    rates,
    pricing,
    internetPricing,
    pointCosts,
    accessWindowHours,
    featureAccess,
    gridManagement,
    dynamicPlatformFeatures,
    // Consumers resolve tiles against this rather than building their own
    // viewer, so a tile cannot be drawn by one rule and gated by another.
    gridViewer,
    webviewPages,
    tileLabels,
    supportContact,

    paymentSettings,
    banners,
    adSettings,
    adFeatureControls,
    adCampaignsById,
    homepageConfig,
    announcements,
    webSignInRequest,
    clearWebSignInRequest,
    myNotifications,
    hasUnreadNotifications,
    markNotificationsSeen,
    // webview
    webViewKey,
    setWebViewKey,
    openWebView,
    webViewBusy,
    submitWebviewApplication,
    webViewSubmitBusy,
    confirmWebviewAccess,
    openBusPicker,
    confirmPaymentSuccess,
    webViewPaymentBusy,
    webViewPaymentCharged,
    // support chat
    activeChatId,
    activeChatName,
    activeChatReturnTo,
    openChat,
    // advertiser management
    activeAdvertiserId,
    openAdvertiserManagement,
    openAdvertiserDetail,
    handleDeepLink,
    // my documents
    activeDocumentId,
    activeDocumentType,
    editDocumentId,
    openMyDocuments,
    openDocumentTypePicker,
    openAddDocument,
    openDocumentDetail,
    openDocumentViewer,
    // notepad
    activeNoteId,
    editNoteId,
    openNotepad,
    openAddNote,
    openNoteDetail,
    // MySheba Help
    helpPrefill,
    setHelpPrefill,
    openHelp,
    openSupportWithPrefill,
    activeContactProfileUid,
    openContactProfile,
    // salary & OT
    openSalary,
    openSalaryReports,
    // create payslip
    payslipSourceRecordId,
    editPayslipId,
    activePayslipId,
    openCreatePayslip,
    openEditPayslip,
    openPayslipHistory,
    openPayslipDetails,
    // private vault unlock (Notepad + My Documents; NOT Transfer Points)
    privateVaultUnlocked,
    setPrivateVaultUnlocked,
    // overlays
    ratePopupVisible,
    setRatePopupVisible,
    resultModal,
    openResult,
    closeResult,
    goHome,
    setNotifPref,
    changePassword,
    linkGoogleAccount,
    startGoogleAccountMerge,
    confirmGoogleAccountMerge,
    // security PIN gate (My Documents view/share, Transfer Points send)
    pinGateRequest,
    requireSecurityPin,
    resolvePinGate,
    cancelPinGate,
    resetSecurityPin,
    appLocked,
    sessionRestoring,
    profileFatal,
    appLockEnabled,
    setAppLockEnabled,
    unlockApp,
    biometricEnabled,
    setBiometricEnabled,
    showBiometricPrompt,
    dismissBiometricPrompt,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}