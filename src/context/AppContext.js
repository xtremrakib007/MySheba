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
import * as callService from '../firebase/callService';
import { registerForPushNotificationsAsync, addNotificationResponseListener, getLastNotificationResponseAsync, getFcmToken } from '../notifications/pushService';
import { maybeSaveReceiver } from '../firebase/receiverService';
import { ensureWebviewAccess, chargeWebviewSubmission } from '../firebase/webviewAccessService';
import { ensureModuleSubscription } from '../firebase/moduleSubscriptionService';
import { checkPaymentEntryAccess, chargePaymentSuccess } from '../firebase/paymentWebviewService';
import { withCallSettingsDefaults } from '../data/callSettingsConstants';
import { cacheCallSettings, cacheCallerRingtones } from '../notifications/callSettingsCache';
import { setCallerRingtone as saveCallerRingtone, removeCallerRingtone as deleteCallerRingtone, subscribeCallerRingtones } from '../firebase/callerRingtoneService';
import { WEBVIEW_ACCESS_COST, WEBVIEW_SUBMIT_COST, PAYMENT_SUCCESS_COST, WEBVIEW_ACCESS_WINDOW_HOURS, ACCESS_CLICK_WEBVIEWS, SUBMIT_CHARGED_WEBVIEWS, PAYMENT_CHARGED_WEBVIEWS, amountToPoints } from '../data/countries';

const AppContext = createContext(null);

function logListenerError(label) {
  return (err) => {
    console.log(`[listener:${label}] error:`, err?.code || err?.message || err);
  };
}

const SERVICE_STEPS = { recharge: 4, mobilebanking: 3, internet: 4, remittance: 7, bus: 3, train: 3, flight: 3 };
const TRAVEL_SERVICES = ['flight', 'bus', 'train'];
const TRAVEL_LABELS = { flight: 'Flight', bus: 'Bus', train: 'Train' };
const DEALER_LABELS = { recharge: 'Recharge', mobilebanking: 'Mobile Banking', internet: 'Internet', remittance: 'Remittance' };

function buildTransactionPayload(service, serviceData, pricing, rates) {
  if (service === 'recharge') {
    const rawAmount = serviceData.amount || 0;
    const amount = amountToPoints(rawAmount, serviceData.country, rates);
    const costPercent = pricing ? Number(pricing.rechargeCostPercent) || 0 : 0;
    const profitPercent = pricing ? Number(pricing.rechargeProfitPercent) || 0 : 0;
    const cost = Math.round(amount * (costPercent / 100) * 100) / 100;
    const profit = Math.round(amount * (profitPercent / 100) * 100) / 100;
    return { service: DEALER_LABELS.recharge, details: `${serviceData.operator || ''} - ${serviceData.currency || 'MYR'} ${rawAmount}`, amount, total: amount, cost, profit };
  }
  if (service === 'mobilebanking') {
    const myr = serviceData.myr || 0;
    return { service: DEALER_LABELS.mobilebanking, details: `${serviceData.provider || ''} - MYR ${myr.toFixed(2)} (Receiver: ${serviceData.phone || ''})`, amount: myr, total: myr + 5 };
  }
  if (service === 'internet') {
    const rawAmount = serviceData.amount || 0;
    const amount = amountToPoints(rawAmount, serviceData.country, rates);
    return { service: DEALER_LABELS.internet, details: `${serviceData.operator || ''} - ${serviceData.package || ''} (${serviceData.currency || 'MYR'} ${rawAmount})`, amount, total: amount };
  }
  if (service === 'remittance') {
    const sendAmt = serviceData.sendAmt || 0;
    const fee = serviceData.transferFee || 0;
    const METHOD_LABELS = { deposit: 'Bank Account', cash: 'Cash Pickup', ewallet: 'eWallet' };
    const methodLabel = METHOD_LABELS[serviceData.method] || '';
    const receiverName = `${serviceData.receiverFirstName || ''} ${serviceData.receiverLastName || ''}`.trim();
    const senderPart = serviceData.senderName ? ` · Sender: ${serviceData.senderName}` : '';
    return { service: DEALER_LABELS.remittance, details: `${methodLabel} to ${receiverName} (${serviceData.country || ''}) via ${serviceData.paymentMethod || ''}${senderPart}`, amount: sendAmt, total: sendAmt + fee };
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
  const [pendingGooglePhone, setPendingGooglePhone] = useState(false);

  const [screen, setScreen] = useState('login');
  const screenHistoryRef = useRef([]);
  const isPoppingRef = useRef(false);
  const prevScreenRef = useRef(screen);
  const exitArmedRef = useRef(false);
  const homeBackInterceptorRef = useRef(null);
  const setHomeBackInterceptor = useCallback((fn) => { homeBackInterceptorRef.current = fn || null; }, []);
  const webViewBackInterceptorRef = useRef(null);
  const setWebViewBackInterceptor = useCallback((fn) => { webViewBackInterceptorRef.current = fn || null; }, []);
  const PRE_AUTH_SCREENS = ['login', 'register', 'deviceVerify', 'googlePhone'];

  useEffect(() => {
    const prev = prevScreenRef.current;
    if (prev !== screen) {
      if (!isPoppingRef.current && !PRE_AUTH_SCREENS.includes(prev)) screenHistoryRef.current.push(prev);
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

  // ---- support chat (customer <-> Support only) ----
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeChatName, setActiveChatName] = useState('');
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [activeChatReturnTo, setActiveChatReturnTo] = useState('chatList');

  // ---- 1-to-1 calling ----
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeRingtoneContactUid, setActiveRingtoneContactUid] = useState(null);
  const [activeRingtoneContactName, setActiveRingtoneContactName] = useState('');

  // ---- marketplace ----
  const [activeListingId, setActiveListingId] = useState(null);
  const openMarketplace = useCallback(() => setScreen('marketplaceHome'), []);
  const openListingDetail = useCallback((listingId) => { setActiveListingId(listingId); setScreen('marketplaceListingDetail'); }, []);

  // The remainder of the original provider implementation stays below.
