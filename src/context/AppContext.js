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
    const amount = amountToPoints(rawAmount, serviceData.country, rates);
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
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [pendingDeviceVerification, setPendingDeviceVerification] = useState(null);

  const [screen, setScreen] = useState('login');

  const screenHistoryRef = useRef([]);
  const isPoppingRef = useRef(false);
  const prevScreenRef = useRef(screen);
  const exitArmedRef = useRef(false);

  const homeBackInterceptorRef = useRef(null);
  const setHomeBackInterceptor = useCallback((fn) => {
    homeBackInterceptorRef.current = fn || null;
  }, []);

  const webViewBackInterceptorRef = useRef(null);
  const setWebViewBackInterceptor = useCallback((fn) => {
    webViewBackInterceptorRef.current = fn || null;
  }, []);

  const PRE_AUTH_SCREENS = ['login', 'register', 'deviceVerify'];

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

  const [sidebarVisible, setSidebarVisible] = useState(false);

  // ---- support chat (customer <-> Support only - see SupportScreen.js) ----
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeChatName, setActiveChatName] = useState('');
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [activeChatReturnTo, setActiveChatReturnTo] = useState('chatList');

  // ---- direct chat (general-purpose 1:1 "Chat" tab, any two accounts) ----
  const [activeDirectChatId, setActiveDirectChatId] = useState(null);
  const [activeDirectChatName, setActiveDirectChatName] = useState('');
  const [activeDirectChatUid, setActiveDirectChatUid] = useState(null);
  const [directChatUnreadCount, setDirectChatUnreadCount] = useState(0);
  const [activeRingtoneContactUid, setActiveRingtoneContactUid] = useState(null);
  const [activeRingtoneContactName, setActiveRingtoneContactName] = useState('');
  const [chatDraftText, setChatDraftText] = useState('');

  const [activeInvestigateChatId, setActiveInvestigateChatId] = useState(null);
  const [activeInvestigateReport, setActiveInvestigateReport] = useState(null);

  const openInvestigateChat = useCallback((chatId, report) => {
    setActiveInvestigateChatId(chatId);
    setActiveInvestigateReport(report || null);
    setScreen('investigateChat');
  }, []);

  const [activeListingId, setActiveListingId] = useState(null);
  const openMarketplace = useCallback(() => setScreen('marketplaceHome'), []);
  const openListingDetail = useCallback((listingId) => {
    setActiveListingId(listingId);
    setScreen('marketplaceListingDetail');
  }, []);

  const [activeAdvertiserId, setActiveAdvertiserId] = useState(null);
  const openAdvertiserManagement = useCallback(() => setScreen('advertiserManagement'), []);
  const openAdvertiserDetail = useCallback((advertiserId) => {
    setActiveAdvertiserId(advertiserId);
    setScreen('advertiserDetail');
  }, []);

  const pendingDeepLinkListingIdRef = useRef(null);
  const parseListingIdFromUrl = useCallback((url) => {
    if (!url) return null;
    const match = String(url).match(/(?:mysheba:\/\/listing\/|mysheba\.top\/listing\/)([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }, []);
  const handleDeepLink = useCallback((url) => {
    const listingId = parseListingIdFromUrl(url);
    if (!listingId) return;
    if (authUser && profile && !authLoading) openListingDetail(listingId);
    else pendingDeepLinkListingIdRef.current = listingId;
  }, [authUser, profile, authLoading, openListingDetail, parseListingIdFromUrl]);
  useEffect(() => {
    if (authLoading || !authUser || !profile) return;
    const pendingId = pendingDeepLinkListingIdRef.current;
    if (!pendingId) return;
    pendingDeepLinkListingIdRef.current = null;
    openListingDetail(pendingId);
  }, [authLoading, authUser, profile, openListingDetail]);

  const [activePropertyId, setActivePropertyId] = useState(null);
  const openAccommodation = useCallback(() => setScreen('accommodationHome'), []);
  const openPropertyDetail = useCallback((propertyId) => {
    setActivePropertyId(propertyId);
    setScreen('accommodationPropertyDetail');
  }, []);
  const [activeRoommateRequestId, setActiveRoommateRequestId] = useState(null);
  const openRoomSharing = useCallback(() => setScreen('roomSharingHome'), []);
  const openRoommateRequestDetail = useCallback((requestId) => {
    setActiveRoommateRequestId(requestId);
    setScreen('roomSharingRequestDetail');
  }, []);
  const [activeProviderId, setActiveProviderId] = useState(null);
  const openServiceProvidersHome = useCallback(() => setScreen('servicesHome'), []);
  const openServiceProviderDetail = useCallback((providerId) => {
    setActiveProviderId(providerId);
    setScreen('servicesProviderDetail');
  }, []);
  const [activeCommunityPostId, setActiveCommunityPostId] = useState(null);
  const openCommunity = useCallback(() => setScreen('communityHome'), []);
  const openCommunityPostDetail = useCallback((postId) => {
    setActiveCommunityPostId(postId);
    setScreen('communityPostDetail');
  }, []);
  const [activeSocialPostId, setActiveSocialPostId] = useState(null);
  const openSocialFeed = useCallback(() => setScreen('socialFeed'), []);
  const openCreateSocialPost = useCallback(() => setScreen('createSocialPost'), []);
  const openSocialPostDetail = useCallback((postId) => {
    setActiveSocialPostId(postId);
    setScreen('socialPostDetail');
  }, []);
  const openMarketplaceSearch = useCallback(() => setScreen('marketplaceSearch'), []);

  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [activeDocumentType, setActiveDocumentType] = useState(null);
  const [editDocumentId, setEditDocumentId] = useState(null);
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

  const [activeNoteId, setActiveNoteId] = useState(null);
  const [editNoteId, setEditNoteId] = useState(null);
  const openAddNote = useCallback((existingNoteId = null) => {
    setEditNoteId(existingNoteId);
    setScreen('addNote');
  }, []);
  const openNoteDetail = useCallback((noteId) => {
    setActiveNoteId(noteId);
    setScreen('noteDetail');
  }, []);

  const [helpPrefill, setHelpPrefill] = useState(null);
  const openHelp = useCallback(() => setScreen('help'), []);
  const openSupportWithPrefill = useCallback((subject, message) => {
    setHelpPrefill({ subject, message });
    setScreen('support');
  }, []);

  const [activeBusinessProfileUid, setActiveBusinessProfileUid] = useState(null);
  const openBusinessProfile = useCallback((uid) => {
    setActiveBusinessProfileUid(uid);
    setScreen('businessProfile');
  }, []);
  const [activeContactProfileUid, setActiveContactProfileUid] = useState(null);
  const openContactProfile = useCallback((uid) => {
    if (!uid) return;
    setActiveContactProfileUid(uid);
    setScreen('contactProfile');
  }, []);

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

  const [pinGateRequest, setPinGateRequest] = useState(null);
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

  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeGroupName, setActiveGroupName] = useState('');
  const [myGroups, setMyGroups] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [activeRoomName, setActiveRoomName] = useState('');
  const [myRooms, setMyRooms] = useState([]);
  const [discoverableRooms, setDiscoverableRooms] = useState([]);
  const [chatHubTab, setChatHubTab] = useState('direct');
  const [lockedChatIds, setLockedChatIds] = useState([]);
  const [chatVaultUnlocked, setChatVaultUnlocked] = useState(false);
  const [privateVaultUnlocked, setPrivateVaultUnlocked] = useState(false);

  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [appLocked, setAppLocked] = useState(false);
  const appLockEnabledRef = useRef(false);
  useEffect(() => { appLockEnabledRef.current = appLockEnabled; }, [appLockEnabled]);
  const APP_LOCK_GRACE_MS = 2 * 60 * 1000;
  const backgroundedAtRef = useRef(null);
  useEffect(() => { getAppLockEnabled().then(setAppLockEnabledState); }, []);
  const setAppLockEnabled = useCallback(async (value) => {
    if (value && !profile?.securityPinSet) await requireSecurityPin('App Lock');
    setAppLockEnabledState(value);
    await setAppLockEnabledPref(value);
  }, [requireSecurityPin, profile]);
  const unlockApp = useCallback(() => setAppLocked(false), []);

  const [biometricEnabled, setBiometricEnabledState] = useState(null);
  const biometricPromptedRef = useRef(false);
  const biometricPrefLoadedRef = useRef(false);
  useEffect(() => {
    getBiometricEnabledPref().then((v) => {
      biometricPrefLoadedRef.current = true;
      setBiometricEnabledState(v);
    });
  }, []);
  const setBiometricEnabled = useCallback(async (value) => {
    if (value && !profile?.securityPinSet) await requireSecurityPin('Biometric Unlock');
    if (value) await setAppLockEnabled(true);
    setBiometricEnabledState(value);
    await setBiometricEnabledPref(value);
  }, [profile, requireSecurityPin, setAppLockEnabled]);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  useEffect(() => {
    if (!authUser || !biometricPrefLoadedRef.current || biometricEnabled !== null || biometricPromptedRef.current) return undefined;
    biometricPromptedRef.current = true;
    isBiometricAvailable().then((avail) => { if (avail) setShowBiometricPrompt(true); });
    return undefined;
  }, [authUser, biometricEnabled]);
  const dismissBiometricPrompt = useCallback(async (enable) => {
    setShowBiometricPrompt(false);
    if (enable) await setBiometricEnabled(true);
    else {
      setBiometricEnabledState(false);
      await setBiometricEnabledPref(false);
    }
  }, [setBiometricEnabled]);

  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [incomingGroupCall, setIncomingGroupCall] = useState(null);
  const [currentService, setCurrentService] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [serviceData, setServiceData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [dealerTxs, setDealerTxs] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [topups, setTopups] = useState([]);
  const [dealerTab, setDealerTab] = useState('pending');
  const [adminTab, setAdminTab] = useState('all');
  const [adminViewingSection, setAdminViewingSection] = useState(false);
  const [dealerViewingSection, setDealerViewingSection] = useState(false);
  const [resellerTxs, setResellerTxs] = useState([]);
  const [resellerTab, setResellerTab] = useState('pending');
  const [resellerViewingSection, setResellerViewingSection] = useState(false);
  const [rates, setRates] = useState(ratesService.DEFAULT_RATES);
  const [pricing, setPricing] = useState(settingsService.DEFAULT_PRICING);
  const [featureAccess, setFeatureAccess] = useState(featureAccessService.DEFAULT_FEATURE_ACCESS);
  const [adSettings, setAdSettings] = useState(adControlsService.DEFAULT_AD_SETTINGS);
  const [adFeatureControls, setAdFeatureControls] = useState(adControlsService.DEFAULT_AD_FEATURE_CONTROLS);
  const [homepageConfig, setHomepageConfig] = useState(homepageConfigService.DEFAULT_HOMEPAGE_CONFIG);
  const [adCampaignsById, setAdCampaignsById] = useState({});
  const [marketplaceCategories, setMarketplaceCategories] = useState(categoryService.DEFAULT_CATEGORIES.marketplace);
  const [serviceCategories, setServiceCategories] = useState(categoryService.DEFAULT_CATEGORIES.services);

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
  const accessWindowHours = pricing.webviewAccessWindowHours ?? WEBVIEW_ACCESS_WINDOW_HOURS;

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
  const ensureModuleAccess = useCallback((key, enter) => {
    const cost = moduleSubscriptionCosts[key];
    if (!cost || !authUser?.uid) { enter(); return; }
    if (moduleAccessBusy) return;
    const windowMs = moduleSubscriptionDays * 24 * 60 * 60 * 1000;
    const lastCharge = profile?.moduleSubscription?.[key];
    const stillActive = !!lastCharge && Date.now() - lastCharge < windowMs;
    if (stillActive) { enter(); return; }
    const balance = typeof profile?.walletBalance === 'number' ? profile.walletBalance : 0;
    if (balance < cost) {
      showAlert('MySheba', `This module needs a ${cost} pt/month subscription. Your current balance is ${balance} pts - top up your wallet first.`);
      return;
    }
    showAlert('Monthly subscription', `This module costs ${cost} pts/month. Your current balance is ${balance} pts.\n\nSubscribe and continue?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Subscribe', onPress: async () => {
        setModuleAccessBusy(true);
        try { await ensureModuleSubscription(authUser.uid, key); enter(); }
        catch (err) { showAlert('MySheba', err.message || `You need ${cost} pts for this - top up your wallet first.`); }
        finally { setModuleAccessBusy(false); }
      } },
    ]);
  }, [authUser, moduleAccessBusy, profile, moduleSubscriptionCosts, moduleSubscriptionDays]);
  const openMyDocuments = useCallback(() => ensureModuleAccess('myDocuments', () => setScreen('myDocuments')), [ensureModuleAccess]);
  const openNotepad = useCallback(() => ensureModuleAccess('notepad', () => setScreen('notepad')), [ensureModuleAccess]);
  const openSalary = useCallback(() => ensureModuleAccess('salaryOt', () => setScreen('salaryDashboard')), [ensureModuleAccess]);
  const openSalaryReports = useCallback(() => ensureModuleAccess('salaryOt', () => setScreen('salaryReports')), [ensureModuleAccess]);
  const [internetPricing, setInternetPricing] = useState({});
  const [supportContact, setSupportContact] = useState(supportContactService.DEFAULT_SUPPORT_CONTACT);
  const [socialLinks, setSocialLinks] = useState(socialLinksService.DEFAULT_SOCIAL_LINKS);
  const [paymentSettings, setPaymentSettings] = useState(paymentSettingsService.DEFAULT_PAYMENT_SETTINGS);
  const [banners, setBanners] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [rawAnnouncements, setRawAnnouncements] = useState([]);
  const [webViewKey, setWebViewKey] = useState('fomema');
  const [webViewBusy, setWebViewBusy] = useState(false);
  const [ratePopupVisible, setRatePopupVisible] = useState(false);
  const [resultModal, setResultModal] = useState({ visible: false, kind: null, txId: '', service: '', details: '', amount: 0, total: 0, createdAt: null });
  const totalSteps = SERVICE_STEPS[currentService] || 3;

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
      profileUnsub = authService.subscribeProfile(user.uid, (p) => {
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
              if (initialRouteDone) {
                await authService.logout();
                setProfile(null);
                screenHistoryRef.current = [];
                setScreen('login');
                showAlert('Signed Out', 'Your account was signed in on another device, so you were signed out here.');
                return;
              }
            }
          } catch (e) {}
          setProfile(p);
          if (!initialRouteDone) {
            initialRouteDone = true;
            if (p && p.role === 'dealer') setScreen('dealerHome');
            else if (p && p.role === 'reseller') setScreen('resellerHome');
            else if (p && (p.role === 'admin' || p.role === 'superadmin')) setScreen('adminHome');
            else setScreen('customerHome');
            setAuthLoading(false);
          }
        })();
      }, () => {
        setProfile(null);
        if (!initialRouteDone) { initialRouteDone = true; setAuthLoading(false); }
      });
    });
    return () => { unsub(); if (profileUnsub) profileUnsub(); };
  }, []);

  const pushRegisteredForUid = useRef(null);
  useEffect(() => {
    if (!authUser || !profile) return;
    if (pushRegisteredForUid.current === authUser.uid) return;
    pushRegisteredForUid.current = authUser.uid;
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token && token !== profile.pushToken) {
        try { await authService.updatePushToken(authUser.uid, token, Platform.OS); } catch (e) {}
      }
      const fcmToken = await getFcmToken();
      if (fcmToken && fcmToken !== profile.fcmToken) {
        try { await authService.updateFcmToken(authUser.uid, fcmToken); } catch (e) {}
      }
    })();
  }, [authUser, profile]);

  useEffect(() => {
    if (!authUser) return undefined;
    ratesService.ensureRates().catch(() => {});
    return ratesService.subscribeRates((r) => setRates(r), logListenerError('rates'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    settingsService.ensurePricing().catch(() => {});
    return settingsService.subscribePricing((p) => setPricing(p), logListenerError('pricing'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    featureAccessService.ensureFeatureAccess().catch(() => {});
    return featureAccessService.subscribeFeatureAccess((fa) => setFeatureAccess(fa), logListenerError('featureAccess'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    return adControlsService.subscribeAdSettings((s) => setAdSettings(s), logListenerError('adSettings'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    return adControlsService.subscribeAdFeatureControls((fc) => setAdFeatureControls(fc), logListenerError('adFeatureControls'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    return homepageConfigService.subscribeHomepageConfig((c) => setHomepageConfig(c), logListenerError('homepageConfig'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    return adService.subscribeCampaigns((list) => setAdCampaignsById(Object.fromEntries(list.map((c) => [c.id, c]))), logListenerError('adCampaigns'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    return categoryService.subscribeCategories('marketplace', setMarketplaceCategories, logListenerError('marketplaceCategories'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    return categoryService.subscribeCategories('services', setServiceCategories, logListenerError('serviceCategories'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    supportContactService.ensureSupportContact().catch(() => {});
    return supportContactService.subscribeSupportContact((c) => setSupportContact(c), logListenerError('supportContact'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    socialLinksService.ensureSocialLinks().catch(() => {});
    return socialLinksService.subscribeSocialLinks((s) => setSocialLinks(s), logListenerError('socialLinks'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    paymentSettingsService.ensurePaymentSettings().catch(() => {});
    return paymentSettingsService.subscribePaymentSettings((s) => setPaymentSettings(s), logListenerError('paymentSettings'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    return internetPricingService.subscribeInternetPricing((map) => setInternetPricing(map), logListenerError('internetPricing'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return undefined;
    return bannerService.subscribeBanners((list) => setBanners(list), logListenerError('banners'));
  }, [authUser]);
  useEffect(() => {
    const needsTx = screen === 'dealerHome' || screen === 'adminHome' || screen === 'reports' || screen === 'resellerHome';
    const role = profile && profile.role;
    if (!needsTx || !role || !authUser) return undefined;
    const isStaffQueue = ['dealer', 'reseller', 'admin', 'superadmin'].includes(role);
    if (!isStaffQueue) return undefined;
    return transactionService.subscribeBroadcastTransactions((txs) => {
      if (role === 'admin' || role === 'superadmin') { setDealerTxs(txs); setResellerTxs(txs); }
      else if (role === 'dealer') setDealerTxs(txs.filter((t) => t.service === 'Mobile Banking'));
      else if (role === 'reseller') setResellerTxs(txs.filter((t) => ['Recharge', 'Internet', 'Remittance'].includes(t.service)));
    }, logListenerError('transactions:broadcast'));
  }, [screen, profile, authUser]);
  useEffect(() => {
    const role = profile && profile.role;
    const needsAnnouncements = screen === 'adminHome' && (role === 'admin' || role === 'superadmin');
    if (!needsAnnouncements) return undefined;
    return announcementService.subscribeAnnouncements((list) => setAnnouncements(list), logListenerError('announcements'));
  }, [screen, profile]);
  useEffect(() => {
    if (!authUser) { setRawAnnouncements([]); return undefined; }
    return announcementService.subscribeAnnouncements((list) => setRawAnnouncements(list), logListenerError('myAnnouncements'));
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
  useEffect(() => {
    const role = profile && profile.role;
    const isAdminScreen = (screen === 'adminHome' || screen === 'reports') && ['admin', 'superadmin'].includes(role);
    const isResellerScreen = screen === 'resellerHome' && role === 'reseller';
    if (!isAdminScreen && !isResellerScreen) return undefined;
    return inquiryService.subscribeInquiries((list) => setInquiries(isResellerScreen ? list.filter((i) => i.type === 'flight') : list), logListenerError('inquiries'));
  }, [screen, profile]);
  useEffect(() => {
    const isStaff = profile && ['admin', 'superadmin'].includes(profile.role);
    if ((screen !== 'adminHome' && screen !== 'reports') || !isStaff) return undefined;
    return topupService.subscribeTopups((list) => setTopups(list), logListenerError('topups'));
  }, [screen, profile]);

  useEffect(() => {
    if (!authUser || !profile) { setChatUnreadCount(0); return undefined; }
    const isStaff = ['dealer', 'reseller', 'admin', 'superadmin'].includes(profile.role);
    if (isStaff) return chatService.subscribeAllChats((list) => setChatUnreadCount(list.reduce((sum, c) => sum + (c.unreadForStaff || 0), 0)), logListenerError('chats:staff'));
    return chatService.subscribeChatMeta(authUser.uid, (meta) => setChatUnreadCount(meta ? meta.unreadForCustomer || 0 : 0), logListenerError('chats:customer'));
  }, [authUser, profile]);
  useEffect(() => {
    if (!authUser) { setDirectChatUnreadCount(0); return undefined; }
    return directChatService.subscribeMyChats(authUser.uid, (list) => setDirectChatUnreadCount(list.reduce((sum, c) => sum + ((c.unreadCounts && c.unreadCounts[authUser.uid]) || 0), 0)), logListenerError('directChats'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) { setMyGroups([]); return undefined; }
    return groupChatService.subscribeMyGroups(authUser.uid, (list) => setMyGroups(list), logListenerError('groupChats'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) { setMyRooms([]); return undefined; }
    return roomChatService.subscribeMyRooms(authUser.uid, (list) => setMyRooms(list), logListenerError('roomChats'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) { setDiscoverableRooms([]); return undefined; }
    return roomChatService.subscribeDiscoverableRooms(authUser.uid, (list) => setDiscoverableRooms(list), logListenerError('roomChats'));
  }, [authUser]);
  useEffect(() => {
    if (!authUser) { setLockedChatIds([]); setChatVaultUnlocked(false); setPrivateVaultUnlocked(false); return undefined; }
    return chatLockService.subscribeLockedChats(authUser.uid, (keys) => setLockedChatIds(keys), logListenerError('lockedChats'));
  }, [authUser]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { setChatVaultUnlocked(false); setPrivateVaultUnlocked(false); }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!appLockEnabled || !authUser) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') backgroundedAtRef.current = Date.now();
      else if (backgroundedAtRef.current && Date.now() - backgroundedAtRef.current >= APP_LOCK_GRACE_MS) { setAppLocked(true); backgroundedAtRef.current = null; }
      else backgroundedAtRef.current = null;
    });
    return () => sub.remove();
  }, [appLockEnabled, authUser]);
  useEffect(() => {
    if (appLockEnabled && authUser && profile?.securityPinSet) setAppLocked(true);
  }, [appLockEnabled, authUser?.uid, profile?.securityPinSet]);

  useEffect(() => {
    if (!authUser) { setIncomingCall(null); return undefined; }
    return callService.subscribeIncomingCalls(authUser.uid, (call) => setIncomingCall(call && call.id !== activeCall?.id ? call : null));
  }, [authUser, activeCall]);
  useEffect(() => {
    if (!authUser) { setIncomingGroupCall(null); return undefined; }
    return callService.subscribeIncomingGroupCalls(authUser.uid, (call) => setIncomingGroupCall(call && call.id !== activeCall?.id ? call : null));
  }, [authUser, activeCall]);
  const startCall = useCallback(async (caller, callee, type = 'video') => {
    if (!authUser) return;
    const { callId, channelName } = await callService.startCall(caller, callee, type);
    setActiveCall({ id: callId, channelName, type, callerUid: caller.uid, callerName: caller.name, calleeUid: callee.uid, calleeName: callee.name });
    setScreen('call');
  }, [authUser]);
  const answerIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    await callService.acceptCall(incomingCall.id);
    setActiveCall(incomingCall); setIncomingCall(null); setScreen('call');
  }, [incomingCall]);
  const rejectIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    await callService.declineCall(incomingCall.id); setIncomingCall(null);
  }, [incomingCall]);
  const startGroupCall = useCallback(async (caller, group, type = 'video') => {
    if (!authUser) return;
    const { callId, channelName } = await callService.startGroupCall(caller, group, type);
    const calleeUids = (group.memberUids || []).filter((uid) => uid !== caller.uid);
    setActiveCall({ id: callId, channelName, type, isGroup: true, groupId: group.id, groupName: group.name || 'Group', callerUid: caller.uid, callerName: caller.name, participantUids: [caller.uid, ...calleeUids], participantNames: { ...(group.memberNames || {}), [caller.uid]: caller.name }, ringingUids: calleeUids, activeUids: [caller.uid], status: 'ringing' });
    setScreen('call');
  }, [authUser]);
  const answerIncomingGroupCall = useCallback(async () => {
    if (!incomingGroupCall || !authUser) return;
    await callService.acceptGroupCall(incomingGroupCall.id, authUser.uid);
    setActiveCall(incomingGroupCall); setIncomingGroupCall(null); setScreen('call');
  }, [incomingGroupCall, authUser]);
  const rejectIncomingGroupCall = useCallback(async () => {
    if (!incomingGroupCall || !authUser) return;
    await callService.declineGroupCall(incomingGroupCall.id, authUser.uid); setIncomingGroupCall(null);
  }, [incomingGroupCall, authUser]);
  const groupUnreadCount = myGroups.reduce((sum, g) => sum + ((g.unreadCounts && authUser && g.unreadCounts[authUser.uid]) || 0), 0);
  const roomUnreadCount = myRooms.reduce((sum, r) => sum + ((r.unreadCounts && authUser && r.unreadCounts[authUser.uid]) || 0), 0);
  const chatHubUnreadCount = directChatUnreadCount + groupUnreadCount + roomUnreadCount;
  const isChatLocked = useCallback((kind, id) => (!!kind && !!id && lockedChatIds.includes(chatLockService.lockKey(kind, id))), [lockedChatIds]);
  const ensureChatUnlocked = useCallback(async (kind, id) => {
    if (!isChatLocked(kind, id) || chatVaultUnlocked) return true;
    try { await requireSecurityPin('this locked chat'); setChatVaultUnlocked(true); return true; }
    catch (e) { return false; }
  }, [isChatLocked, chatVaultUnlocked, requireSecurityPin]);
  const lockChatThread = useCallback(async (kind, id) => { if (!authUser || !kind || !id) return; await chatLockService.lockChat(authUser.uid, kind, id); }, [authUser]);
  const unlockChatThread = useCallback(async (kind, id) => { if (!authUser || !kind || !id) return; await chatLockService.unlockChat(authUser.uid, kind, id); }, [authUser]);
  const openLockedChats = useCallback(async () => {
    if (!chatVaultUnlocked) {
      try { await requireSecurityPin('Locked Chats'); setChatVaultUnlocked(true); } catch (e) { return; }
    }
    setScreen('lockedChats');
  }, [chatVaultUnlocked, requireSecurityPin]);
  const openChat = useCallback((chatId, name, returnTo) => {
    setActiveChatId(chatId); setActiveGroupId(null); setActiveDirectChatId(null); setActiveRoomId(null);
    setActiveChatName(name || ''); setActiveChatReturnTo(returnTo || 'chatList'); setScreen('chat');
  }, []);
  const openGroupChat = useCallback(async (groupId, name) => {
    if (!(await ensureChatUnlocked('group', groupId))) return;
    setActiveGroupId(groupId); setActiveChatId(null); setActiveDirectChatId(null); setActiveRoomId(null); setActiveGroupName(name || ''); setScreen('chat');
  }, [ensureChatUnlocked]);
  const openDirectChat = useCallback(async (chatId, name, otherUid, draftText) => {
    if (!(await ensureChatUnlocked('direct', chatId))) return;
    setActiveDirectChatId(chatId); setActiveChatId(null); setActiveGroupId(null); setActiveRoomId(null); setActiveDirectChatName(name || ''); setActiveDirectChatUid(otherUid || null);
    if (draftText) setChatDraftText(draftText);
    setScreen('chat');
  }, [ensureChatUnlocked]);
  const openRoomChat = useCallback(async (roomId, name) => {
    if (!(await ensureChatUnlocked('room', roomId))) return;
    setActiveRoomId(roomId); setActiveChatId(null); setActiveGroupId(null); setActiveDirectChatId(null); setActiveRoomName(name || ''); setScreen('chat');
  }, [ensureChatUnlocked]);
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
  const openChatHub = useCallback((tab) => { if (tab) setChatHubTab(tab); setScreen('chatHub'); }, []);

  useEffect(() => {
    if (!authUser) return undefined;
    const handleResponse = async (response) => {
      const data = response?.notification?.request?.content?.data || {};
      try {
        if (data.type === 'chat' && data.chatId) openChat(data.chatId, 'Support');
        else if (data.type === 'directChat' && data.chatId) {
          const meta = await directChatService.getDirectChatMeta(data.chatId);
          const otherUid = meta?.participants?.find((uid) => uid !== authUser.uid);
          const name = (otherUid && meta?.participantNames?.[otherUid]) || 'Chat';
          openDirectChat(data.chatId, name, otherUid);
        } else if (data.type === 'groupChat' && data.groupId) {
          const meta = await groupChatService.getGroupMeta(data.groupId); openGroupChat(data.groupId, meta?.name || 'Group Chat');
        } else if (data.type === 'roomChat' && data.roomId) {
          const meta = await roomChatService.getRoomMeta(data.roomId); openRoomChat(data.roomId, meta?.name || 'Room Chat');
        } else if (data.type === 'topup') {
          const isStaff = profile && (profile.role === 'admin' || profile.role === 'superadmin');
          if (isStaff) { setAdminTab('topups'); setScreen('adminHome'); } else setScreen('history');
        } else if (data.type === 'supportTicket') {
          const isSuperadmin = profile && profile.role === 'superadmin'; setScreen(isSuperadmin ? 'adminSupport' : 'support');
        }
      } catch (e) {}
    };
    getLastNotificationResponseAsync().then((response) => { if (response) handleResponse(response); });
    const sub = addNotificationResponseListener(handleResponse);
    return () => sub.remove();
  }, [authUser, profile, openChat, openDirectChat, openGroupChat, openRoomChat]);

  const openResult = useCallback((kind, txId, svc, extra) => {
    setResultModal({ visible: true, kind, txId, service: svc, details: (extra && extra.details) || '', amount: (extra && extra.amount) || 0, total: (extra && extra.total) || 0, createdAt: Date.now() });
  }, []);
  const closeResult = useCallback(() => setResultModal({ visible: false, kind: null, txId: '', service: '', details: '', amount: 0, total: 0, createdAt: null }), []);
  const openSidebar = useCallback(() => setSidebarVisible(true), []);
  const closeSidebar = useCallback(() => setSidebarVisible(false), []);
  const HOME_SCREENS = ['customerHome', 'dealerHome', 'resellerHome', 'adminHome'];
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const onBackPress = () => {
      if (sidebarVisible) { closeSidebar(); return true; }
      if (homeBackInterceptorRef.current && homeBackInterceptorRef.current()) return true;
      if (screen === 'webview' && webViewBackInterceptorRef.current && webViewBackInterceptorRef.current()) return true;
      if (screen === 'service' && currentStep > 0) { setCurrentStep((s) => Math.max(0, s - 1)); return true; }
      if (HOME_SCREENS.includes(screen)) {
        if (exitArmedRef.current) { BackHandler.exitApp(); return true; }
        exitArmedRef.current = true;
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        setTimeout(() => { exitArmedRef.current = false; }, 2000);
        return true;
      }
      if (goBack()) return true;
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [screen, sidebarVisible, goBack, closeSidebar, currentStep]);
  const goHome = useCallback(() => {
    const r = profile ? profile.role : '';
    setAdminViewingSection(false); setDealerViewingSection(false); setResellerViewingSection(false);
    screenHistoryRef.current = [];
    if (r === 'dealer') setScreen('dealerHome');
    else if (r === 'reseller') setScreen('resellerHome');
    else if (r === 'admin' || r === 'superadmin') setScreen('adminHome');
    else setScreen('customerHome');
  }, [profile]);
  const goBackOrHome = useCallback(() => { if (!goBack()) goHome(); }, [goBack, goHome]);
  const setNotifPref = useCallback((key, value) => {
    if (!authUser) return;
    authService.updateNotifPrefs(authUser.uid, { [key]: value }).catch(() => showAlert('MySheba', 'Could not save that preference. Please try again.'));
  }, [authUser]);
  const callSettings = useMemo(() => withCallSettingsDefaults(profile?.callSettings), [profile?.callSettings]);
  useEffect(() => { cacheCallSettings(callSettings); }, [callSettings]);
  const updateCallSettings = useCallback((patch) => {
    if (!authUser) return;
    const next = { ...callSettings, ...patch };
    authService.updateCallSettings(authUser.uid, patch).catch(() => showAlert('MySheba', 'Could not save that preference. Please try again.'));
    cacheCallSettings(next);
  }, [authUser, callSettings]);
  const [callerRingtones, setCallerRingtones] = useState({});
  useEffect(() => {
    if (!authUser) { setCallerRingtones({}); return undefined; }
    return subscribeCallerRingtones(authUser.uid, setCallerRingtones);
  }, [authUser]);
  const openRingtonePicker = useCallback((callerUid, callerName) => {
    setActiveRingtoneContactUid(callerUid); setActiveRingtoneContactName(callerName || ''); setScreen('ringtonePicker');
  }, []);
  const updateCallerRingtone = useCallback((callerUid, patch) => {
    if (!authUser || !callerUid) return;
    const next = { ...callerRingtones, [callerUid]: { ...(callerRingtones[callerUid] || {}), ...patch } };
    setCallerRingtones(next); cacheCallerRingtones(next);
    saveCallerRingtone(authUser.uid, callerUid, patch, activeRingtoneContactName).catch(() => showAlert('MySheba', 'Could not save that ringtone. Please try again.'));
  }, [authUser, callerRingtones, activeRingtoneContactName]);
  const clearCallerRingtone = useCallback((callerUid) => {
    if (!authUser || !callerUid) return;
    const next = { ...callerRingtones }; delete next[callerUid]; setCallerRingtones(next); cacheCallerRingtones(next);
    deleteCallerRingtone(authUser.uid, callerUid).catch(() => showAlert('MySheba', 'Could not reset that ringtone. Please try again.'));
  }, [authUser, callerRingtones]);
  const changePassword = useCallback(async (currentPin, newPin) => { await authService.changePassword(currentPin, newPin); }, []);
  const resetSecurityPin = useCallback(async (currentPassword, newPin) => { await authService.reauthenticate(currentPassword); await securityPinService.resetSecurityPin(newPin); }, []);
  const doLogin = useCallback(async (phone, pin, dialCode) => {
    setAuthBusy(true); setAuthError('');
    try {
      const p = await authService.login(phone, pin, dialCode);
      if (p.pendingDeviceApproval) {
        setPendingDeviceVerification({ uid: p.uid, email: p.pendingDeviceApproval.email, phone: p.pendingDeviceApproval.phone, reason: p.pendingDeviceApproval.reason, availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods });
        setScreen('deviceVerify'); return true;
      }
      setProfile(p);
      if (p.role === 'dealer') { setDealerTab('pending'); setScreen('dealerHome'); }
      else if (p.role === 'reseller') { setResellerTab('pending'); setScreen('resellerHome'); }
      else if (p.role === 'admin' || p.role === 'superadmin') { setAdminTab('all'); setScreen('adminHome'); }
      else setScreen('customerHome');
      return true;
    } catch (err) { setAuthError(err.message || 'Sign in failed.'); return false; }
    finally { setAuthBusy(false); }
  }, []);
  const confirmDeviceVerification = useCallback(async (phoneIdToken, emailIdToken, emailOtp) => {
    if (!pendingDeviceVerification) return false;
    setAuthBusy(true); setAuthError('');
    try {
      const p = pendingDeviceVerification.reason === 'admin_mfa'
        ? await authService.retryDeviceSession(pendingDeviceVerification.uid, phoneIdToken, emailIdToken, emailOtp)
        : await authService.confirmDeviceLogin(pendingDeviceVerification.uid, emailIdToken);
      if (p.pendingDeviceApproval) {
        setPendingDeviceVerification({ uid: p.uid, email: p.pendingDeviceApproval.email, phone: p.pendingDeviceApproval.phone, reason: p.pendingDeviceApproval.reason, availableMfaMethods: p.pendingDeviceApproval.availableMfaMethods });
        return false;
      }
      setPendingDeviceVerification(null); setProfile(p);
      if (p.role === 'dealer') { setDealerTab('pending'); setScreen('dealerHome'); }
      else if (p.role === 'reseller') { setResellerTab('pending'); setScreen('resellerHome'); }
      else if (p.role === 'admin' || p.role === 'superadmin') { setAdminTab('all'); setScreen('adminHome'); }
      else setScreen('customerHome');
      return true;
    } catch (err) { setAuthError(err.message || 'Verification failed.'); return false; }
    finally { setAuthBusy(false); }
  }, [pendingDeviceVerification]);
  const cancelDeviceVerification = useCallback(async () => {
    try { await authService.logout(); }
    finally { setPendingDeviceVerification(null); setProfile(null); screenHistoryRef.current = []; setScreen('login'); }
  }, []);
  const doRegister = useCallback(async ({ name, phone, phoneE164, dialCode, email, pin, dealerCode, resellerCode, phoneIdToken }) => {
    setAuthBusy(true); setAuthError('');
    try { const p = await authService.registerCustomer({ name, phone, phoneE164, dialCode, email, pin, phoneIdToken }); setProfile(p); setScreen('customerHome'); return true; }
    catch (err) { setAuthError(err.message || 'Registration failed.'); return false; }
    finally { setAuthBusy(false); }
  }, []);
  const logout = useCallback(async () => {
    try { await authService.logout(); }
    finally {
      await clearBiometricEnabledPref(); setBiometricEnabledState(null); biometricPromptedRef.current = false; setShowBiometricPrompt(false);
      setProfile(null); screenHistoryRef.current = []; setScreen('login');
    }
  }, []);
  const startService = useCallback((service) => { setCurrentService(service); setCurrentStep(0); setServiceData({}); setScreen('service'); }, []);
  const [webViewPaymentCharged, setWebViewPaymentCharged] = useState(false);
  const openWebView = useCallback(async (key) => {
    const cost = pointCosts[key];
    if (!cost || !authUser?.uid) { setWebViewKey(key); setWebViewPaymentCharged(false); setScreen('webview'); return; }
    if (webViewBusy) return;
    const alreadyCovered = SUBMIT_CHARGED_WEBVIEWS.includes(key) && !!profile?.webviewSubmitted?.[key];
    const enterWebview = () => { setWebViewKey(key); setWebViewPaymentCharged(false); setScreen('webview'); };
    if (alreadyCovered) { enterWebview(); return; }
    const balance = typeof profile?.walletBalance === 'number' ? profile.walletBalance : 0;
    if (balance < cost) { showAlert('MySheba', `You need ${cost} pts to use this feature. Your current balance is ${balance} pts - top up your wallet first.`); return; }
    showAlert('Points will be deducted', `Using this feature costs ${cost} pts. Your current balance is ${balance} pts.\n\nContinue?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', onPress: async () => {
        if (!PAYMENT_CHARGED_WEBVIEWS.includes(key)) { enterWebview(); return; }
        setWebViewBusy(true);
        try { await checkPaymentEntryAccess(authUser.uid, cost); enterWebview(); }
        catch (err) { showAlert('MySheba', err.message || `You need ${cost} pts to use this - top up your wallet first.`); }
        finally { setWebViewBusy(false); }
      } },
    ]);
  }, [authUser, webViewBusy, profile, pointCosts]);
  const openBusPicker = useCallback(() => setScreen('buspicker'), []);
  const [webViewPaymentBusy, setWebViewPaymentBusy] = useState(false);
  const confirmPaymentSuccess = useCallback(async (key) => {
    if (!authUser?.uid || webViewPaymentBusy || webViewPaymentCharged) return;
    setWebViewPaymentBusy(true);
    try {
      const result = await chargePaymentSuccess(authUser.uid, key, pointCosts[key]);
      if (result.charged) { setWebViewPaymentCharged(true); showAlert('MySheba', `Payment confirmed - ${result.cost} pts deducted.`); }
      return result;
    } catch (err) { showAlert('MySheba', err.message || 'Could not confirm this payment right now.'); }
    finally { setWebViewPaymentBusy(false); }
  }, [authUser, webViewPaymentBusy, webViewPaymentCharged, pointCosts]);
  const [webViewSubmitBusy, setWebViewSubmitBusy] = useState(false);
  const submitWebviewApplication = useCallback(async (key) => {
    if (!authUser?.uid || webViewSubmitBusy) return;
    setWebViewSubmitBusy(true);
    try {
      const result = await chargeWebviewSubmission(authUser.uid, key, pointCosts[key]);
      if (result.charged) showAlert('MySheba', 'Thanks - your submission is confirmed and points have been deducted.');
      else showAlert('MySheba', 'This application was already confirmed.');
      return result;
    } catch (err) { showAlert('MySheba', err.message || 'Could not confirm your submission right now.'); }
    finally { setWebViewSubmitBusy(false); }
  }, [authUser, webViewSubmitBusy, pointCosts]);
  const confirmWebviewAccess = useCallback(async (key) => {
    if (!authUser?.uid || webViewBusy) return;
    setWebViewBusy(true);
    try {
      const result = await ensureWebviewAccess(authUser.uid, key, pointCosts[key], accessWindowHours);
      if (result.charged) showAlert('MySheba', `${result.cost} pts deducted for this search. Free for the next ${accessWindowHours} hour(s).`);
      return result;
    } catch (err) { showAlert('MySheba', err.message || 'Could not confirm this check right now.'); }
    finally { setWebViewBusy(false); }
  }, [authUser, webViewBusy, pointCosts, accessWindowHours]);
  const nextStep = useCallback(() => { setCurrentStep((s) => (s < totalSteps - 1 ? s + 1 : s)); }, [totalSteps]);
  const prevStep = useCallback(() => setCurrentStep((s) => Math.max(0, s - 1)), []);
  const updateServiceData = useCallback((patch) => setServiceData((d) => ({ ...d, ...patch })), []);
  const submitService = useCallback(async () => {
    setSubmitting(true);
    try {
      if (TRAVEL_SERVICES.includes(currentService)) {
        const label = TRAVEL_LABELS[currentService];
        const id = await inquiryService.createInquiry(currentService, { from: serviceData.from, to: serviceData.to, date: serviceData.date, time: serviceData.time, passengers: serviceData.passengers, name: serviceData.pName, phone: serviceData.pPhone, email: serviceData.pEmail, notes: serviceData.pNotes }, authUser);
        openResult('travel', id, label);
      } else {
        const payload = buildTransactionPayload(currentService, serviceData, pricing, rates);
        const id = await transactionService.createTransaction({ ...payload, raw: serviceData }, { uid: authUser ? authUser.uid : null, phone: profile ? profile.phone : '', dealerId: profile ? profile.dealerId : null, resellerId: profile ? profile.resellerId : null });
        if (currentService === 'remittance' && authUser?.uid) await maybeSaveReceiver(serviceData, authUser.uid);
        openResult('dealer', id, payload.service, { details: payload.details, amount: payload.amount, total: payload.total });
      }
    } catch (err) { showAlert('MySheba', err.message || 'Could not submit your request. Please try again.'); }
    finally { setSubmitting(false); }
  }, [currentService, serviceData, authUser, profile, openResult, pricing, rates]);

  const value = {
    authUser, profile, authLoading, authError, authBusy,
    doLogin, doRegister, logout,
    pendingDeviceVerification, confirmDeviceVerification, cancelDeviceVerification,
    screen, setScreen, goBack, goBackOrHome, setHomeBackInterceptor, setWebViewBackInterceptor,
    sidebarVisible, openSidebar, closeSidebar,
    currentService, currentStep, totalSteps, serviceData, submitting,
    setCurrentStep, updateServiceData, nextStep, prevStep, startService, submitService,
    dealerTxs, dealerTab, setDealerTab, adminViewingSection, setAdminViewingSection,
    dealerViewingSection, setDealerViewingSection, resellerTxs, resellerTab, setResellerTab,
    resellerViewingSection, setResellerViewingSection, inquiries, adminTab, setAdminTab, topups,
    rates, pricing, internetPricing, pointCosts, accessWindowHours, featureAccess,
    marketplaceCategories, serviceCategories, supportContact, socialLinks, paymentSettings,
    banners, adSettings, adFeatureControls, adCampaignsById, homepageConfig,
    announcements, myNotifications, hasUnreadNotifications, markNotificationsSeen,
    webViewKey, setWebViewKey, openWebView, webViewBusy, submitWebviewApplication,
    webViewSubmitBusy, confirmWebviewAccess, openBusPicker, confirmPaymentSuccess,
    webViewPaymentBusy, webViewPaymentCharged,
    activeChatId, activeChatName, chatUnreadCount, activeChatReturnTo, openChat,
    activeDirectChatId, activeDirectChatName, activeDirectChatUid, directChatUnreadCount, openDirectChat,
    activeInvestigateChatId, activeInvestigateReport, openInvestigateChat,
    chatDraftText, setChatDraftText,
    activeListingId, openMarketplace, openListingDetail, handleDeepLink,
    activeAdvertiserId, openAdvertiserManagement, openAdvertiserDetail,
    activePropertyId, openAccommodation, openPropertyDetail,
    activeRoommateRequestId, openRoomSharing, openRoommateRequestDetail,
    activeProviderId, openServiceProvidersHome, openServiceProviderDetail,
    activeCommunityPostId, openCommunity, openCommunityPostDetail,
    activeSocialPostId, openSocialFeed, openCreateSocialPost, openSocialPostDetail,
    openMarketplaceSearch,
    activeDocumentId, activeDocumentType, editDocumentId, openMyDocuments, openDocumentTypePicker,
    openAddDocument, openDocumentDetail, openDocumentViewer,
    activeNoteId, editNoteId, openNotepad, openAddNote, openNoteDetail,
    helpPrefill, setHelpPrefill, openHelp, openSupportWithPrefill,
    activeBusinessProfileUid, openBusinessProfile, activeContactProfileUid, openContactProfile,
    openSalary, openSalaryReports,
    payslipSourceRecordId, editPayslipId, activePayslipId, openCreatePayslip, openEditPayslip,
    openPayslipHistory, openPayslipDetails,
    activeGroupId, activeGroupName, myGroups, groupUnreadCount, openGroupChat,
    activeRoomId, activeRoomName, myRooms, roomUnreadCount, openRoomChat,
    discoverableRooms, joinDiscoverableRoom, chatHubTab, setChatHubTab, chatHubUnreadCount,
    openChatHub, lockedChatIds, chatVaultUnlocked, isChatLocked, lockChatThread, unlockChatThread,
    openLockedChats, privateVaultUnlocked, setPrivateVaultUnlocked,
    activeCall, setActiveCall, incomingCall, startCall, answerIncomingCall, rejectIncomingCall,
    incomingGroupCall, startGroupCall, answerIncomingGroupCall, rejectIncomingGroupCall,
    ratePopupVisible, setRatePopupVisible, resultModal, openResult, closeResult, goHome,
    setNotifPref, callSettings, updateCallSettings, callerRingtones, updateCallerRingtone,
    clearCallerRingtone, openRingtonePicker, activeRingtoneContactUid, activeRingtoneContactName,
    changePassword, pinGateRequest, requireSecurityPin, resolvePinGate, cancelPinGate,
    resetSecurityPin, appLocked, appLockEnabled, setAppLockEnabled, unlockApp,
    biometricEnabled, setBiometricEnabled, showBiometricPrompt, dismissBiometricPrompt,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
