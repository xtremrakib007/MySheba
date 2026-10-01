import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, Image, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import PromptModal from '../components/PromptModal';
import PackageFormModal from '../components/PackageFormModal';
import BannerFormModal from '../components/BannerFormModal';
import BankAccountFormModal from '../components/BankAccountFormModal';
import AnnouncementFormModal from '../components/AnnouncementFormModal';
import ServiceGrid from '../components/ServiceGrid';
import BannerSlider from '../components/BannerSlider';
import CopyButton from '../components/CopyButton';
import TransactionDetailModal from '../components/TransactionDetailModal';
import AttachFileModal from '../components/AttachFileModal';
import * as mediaUpload from '../firebase/mediaUpload';
import HeaderDecor from '../components/HeaderDecor';
import * as inquiryService from '../firebase/inquiryService';
import * as ratesService from '../firebase/ratesService';
import * as settingsService from '../firebase/settingsService';
import * as supportContactService from '../firebase/supportContactService';
import * as paymentSettingsService from '../firebase/paymentSettingsService';
import * as internetPricingService from '../firebase/internetPricingService';
import ApiPackagePricingCard from '../components/ApiPackagePricingCard';
import * as bannerService from '../firebase/bannerService';
import * as announcementService from '../firebase/announcementService';
import * as topupService from '../firebase/topupService';
import * as transactionService from '../firebase/transactionService';
import { internetPackagesByOperator, countries } from '../data/countries';
import CountryModal from '../components/CountryModal';
import * as homepageConfigService from '../firebase/homepageConfigService';
import { getHomepageModules } from '../firebase/homepageConfigService';
import { getMergedPackages } from '../utils/internetPackages';
import * as gridManagementService from '../firebase/gridManagementService';
import { PIN_MAX, PIN_PROMPT_TITLE, PIN_PROMPT_PLACEHOLDER, PIN_INVALID_MESSAGE, isValidCollectionPin } from '../utils/collectionPin';

const FEATURES = [
  { key: 'all', icon: '📋', bg: '#E3F2FD', name: 'All Tx' },
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending' },
  { key: 'inquiries', icon: '✈️', bg: '#E8EAF6', name: 'Inquiries' },
  { key: 'topups', icon: '💰', bg: '#E8F5E9', name: 'Top-Ups' },
  { key: 'chats', icon: '💬', bg: '#FCE4EC', name: 'Chats' },
  { key: 'rates', icon: '💱', bg: '#F3E5F5', name: 'Rates' },
  { key: 'pricing', icon: '🏷️', bg: '#FFF3E0', name: 'Pricing' },
  { key: 'payments', icon: '💳', bg: '#E1F5FE', name: 'Payments' },
  { key: 'support', icon: '☎️', bg: '#E0F2F1', name: 'Support' },
  { key: 'homepage', icon: '🏠', bg: '#E0F7FA', name: 'Homepage' },
  { key: 'banners', icon: '🖼️', bg: '#FFF0F0', name: 'Banners' },
  { key: 'announcements', icon: '📣', bg: '#E0F7FA', name: 'Announce' },
];

const BADGE_COLORS = {
  pending: { bg: '#FFF8E1', text: '#F57F17' },
  // Verified but not yet released - finance has checked the payment, an
  // admin still has to complete it.
  verified: { bg: '#EDE7F6', text: '#5E35B1' },
  approved: { bg: '#E8F5E9', text: '#2E7D32' },
  processing: { bg: '#E3F2FD', text: '#1565C0' },
  completed: { bg: '#E8F5E9', text: '#2E7D32' },
  new: { bg: '#FFF8E1', text: '#F57F17' },
  contacted: { bg: '#E3F2FD', text: '#1565C0' },
  closed: { bg: '#E8F5E9', text: '#2E7D32' },
};

const RATE_FIELDS = [
  { key: 'mobileBanking', label: '📱 Mobile Banking (1 MYR = BDT)' },
  { key: 'remittanceFee', label: '💸 Remittance Transfer Fee (MYR)' },
  { key: 'BD_ACC', label: '🇧🇩 BDT ACC' },
  { key: 'BD_CASH', label: '🇧🇩 BDT CASH' },
  { key: 'NP', label: '🇳🇵 NPR' },
  { key: 'PK', label: '🇵🇰 PKR' },
  { key: 'PH', label: '🇵🇭 PHP' },
  { key: 'LK', label: '🇱🇰 LKR' },
  { key: 'IN', label: '🇮🇳 INR' },
  { key: 'ID', label: '🇲🇨 IDR' },
  { key: 'MM', label: '🇲🇲 MMK' },
];

// Recharge/Internet Package rate, per non-Malaysia country - deliberately
// separate from RATE_FIELDS above (Mobile Banking + Remittance) since
// recharge margins are set independently. Points shown/charged on a
// Recharge or Internet Package order are the local-currency face value
// divided by this rate - see data/countries.js amountToPoints() and
// AppContext.buildTransactionPayload.
const RECHARGE_RATE_FIELDS = [
  { key: 'rechargeBD', label: '🇧🇩 Recharge/Internet - BDT' },
  { key: 'rechargeIN', label: '🇮🇳 Recharge/Internet - INR' },
  { key: 'rechargeNP', label: '🇳🇵 Recharge/Internet - NPR' },
  { key: 'rechargeID', label: '🇲🇨 Recharge/Internet - IDR' },
  { key: 'rechargePK', label: '🇵🇰 Recharge/Internet - PKR' },
  { key: 'rechargeMM', label: '🇲🇲 Recharge/Internet - MMK' },
  { key: 'rechargePH', label: '🇵🇭 Recharge/Internet - PHP' },
  { key: 'rechargeKH', label: '🇰🇭 Recharge/Internet - KHR' },
];

const PRICING_FIELDS = [
  { key: 'dealerEarningPercent', label: '🤝 Dealer Earning on Customer Transfer (%)' },
  { key: 'rechargeCostPercent', label: '📉 Mobile Recharge Cost (%)' },
  { key: 'rechargeProfitPercent', label: '📈 Mobile Recharge Profit (%)' },
];

// Point cost for each "point deduct" webview feature - locked/warned on in
// AppContext.openWebView, actually charged in webviewAccessService.js /
// paymentWebviewService.js. Editing one of these updates the live price
// for every key that shares it (e.g. FOMEMA + Visa both read
// webviewAccessCost) - see AppContext.pointCosts.
// functions/walletService.js). Min/max reuse the same points-cost editor
// as POINT_COST_FIELDS below (same PromptModal, same unit); the
// enable/disable switch is its own row since it's a boolean, not a
// numeric price - see the direct-toggle row in the Pricing tab below
// rather than a PromptModal entry.

const POINT_COST_FIELDS = [
  { key: 'webviewAccessCost', label: '🏥 FOMEMA / Visa Status Check (pts)' },
  { key: 'webviewSubmitCost', label: '💻 Malaysia Arrival Card / Passport Submission (pts)' },
  { key: 'paymentSuccessCost', label: '🚌 Bus / Train / MY e-SIM Purchase (pts)' },
];

// Notepad / My Documents / Salary & OT - a monthly subscription, not a
// per-use charge: chargeWallet's 'module_subscription' kind charges this
// price once, then the module stays free until MODULE_SUBSCRIPTION_FIELDS'
// day count elapses (see settingsService's notepadCost/myDocumentsCost/
// salaryOtCost/moduleSubscriptionDays comments and
// AppContext.ensureModuleAccess, the real enforcement point). Kept in its
// own card below rather than folded into POINT_COST_FIELDS so the
// "per-month" framing is clear in the UI too.
const MODULE_SUBSCRIPTION_COST_FIELDS = [
  { key: 'notepadCost', label: '📝 Notepad (pts/month)' },
  { key: 'myDocumentsCost', label: '📁 My Documents (pts/month)' },
  { key: 'salaryOtCost', label: '💰 Salary & OT (pts/month)' },
];
const MODULE_SUBSCRIPTION_DAYS_FIELDS = [
  { key: 'moduleSubscriptionDays', label: '📅 Subscription Cycle Length (days)' },
];

// How long a FOMEMA/Visa charge stays "unlocked" before the next search
// charges again - see webviewAccessService.ensureWebviewAccess.
const ACCESS_WINDOW_FIELDS = [
  { key: 'webviewAccessWindowHours', label: '⏱️ FOMEMA / Visa Free Access Window (hours)' },
];

const BOOST_COST_FIELDS = [];

// Recharge / Internet Package points multiplier - unlike every other
// entry above, this isn't a flat pts price; it's what a role's own
// per-point rate multiplies onto the face-value points already computed
// via amountToPoints (see rechargePointCostPerUnit/internetPointCostPerUnit
// in settingsService.js). 1 = pay face value (today's behavior, and every
// role's default), 0.95 = 5% cheaper, 1.1 = 10% costlier. Actually charged
// in chargeRecharge/chargeInternetPackage (functions/walletService.js).
const RECHARGE_PRICING_FIELDS = [
  { key: 'rechargePointCostPerUnit', label: '📶 Mobile Recharge (× face value)' },
  { key: 'internetPointCostPerUnit', label: '🌐 Internet Package (× face value)' },
];

// Role-Based Pricing (superadmin only) - lets a superadmin give any of
// these roles their own price for any of the point-cost features above
// instead of everyone paying the same flat price. Reuses the same fields
// POINT_COST_FIELDS/BOOST_COST_FIELDS/RECHARGE_PRICING_FIELDS already
// define labels for - settingsService.ROLE_PRICE_ROLES/ROLE_PRICE_KEYS are
// the source of truth for which roles/keys are actually storable; this
// just picks short labels for the role chips.
const ROLE_PRICE_FIELDS = [...POINT_COST_FIELDS, ...BOOST_COST_FIELDS, ...MODULE_SUBSCRIPTION_COST_FIELDS, ...RECHARGE_PRICING_FIELDS];
// Unit suffix for the Role-Based Pricing card's value display (line ~956
// below) - everything defaults to 'pts' except the two Recharge/Internet
// multiplier fields, which show as e.g. "0.95×" since they aren't a flat
// points price the way every other ROLE_PRICE_FIELDS entry is. Keyed
// separately from ROLE_PRICE_FIELDS itself (rather than adding a `unit`
// property to every field object) so POINT_COST_FIELDS/BOOST_COST_FIELDS/
// MODULE_SUBSCRIPTION_COST_FIELDS - each also rendered elsewhere with
// their own already-correct hardcoded "pts" - don't need touching.
const ROLE_PRICE_UNIT_OVERRIDES = { rechargePointCostPerUnit: '×', internetPointCostPerUnit: '×' };
function rolePriceUnitFor(key) {
  return ROLE_PRICE_UNIT_OVERRIDES[key] || 'pts';
}

const ROLE_LABELS = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin' };

// JomPay biller details shown to a customer on the Top-Up screen when they
// pick JomPay as their payment method (see paymentSettingsService.js).
// Superadmin-only to edit - see the role gate on the Payments tab below and
// firestore.rules' settings/paymentMethods write rule.
const PAYMENT_FIELDS = [
  { key: 'jompayBillerId', label: '🏢 JomPay Biller ID', placeholder: 'e.g. 12345' },
  { key: 'jompayRefNo', label: '🔢 JomPay Reference No.', placeholder: "e.g. company's registered ref/account no." },
];

// Customer Support screen's Call/WhatsApp options read these live - they
// show "Coming soon" and stay disabled until a value is set here.
const SUPPORT_FIELDS = [
  { key: 'phone', label: '📞 Call Support Number', placeholder: 'e.g. +60312345678' },
  { key: 'whatsapp', label: '💬 WhatsApp Support Number', placeholder: 'e.g. 601123083556 (no + or leading 0)' },
];

// row (hidden per-platform until set) and used by ShareListingSheet.js's
// "share to official page" targets. facebookAppId isn't a link - it's the
// Meta developer App ID (free to create, no App Review needed) that
// Instagram/Facebook Story sharing requires for attribution; kept in this
// same doc purely to avoid a second settings read.
// Every operator that has an editable internet package list (see
// data/countries.js) - flattened + deduped across all countries, so the
// Pricing tab's operator picker doesn't need to know about countries at all.
const PRICING_OPERATORS = Object.keys(internetPackagesByOperator);

const TYPE_ICON = { flight: '✈️', bus: '🚌', train: '🚂' };

/** Plain-text block for the Copy button on a Recharge/Internet/Mobile
 * Banking/Remittance order card - everything an admin would otherwise
 * have to retype into WhatsApp or a note. */
function formatTxCopy(tx) {
  return [
    `Service: ${tx.service || ''}`,
    `Customer: ${tx.customerPhone || 'Unknown'}`,
    `Details: ${tx.details || ''}`,
    `Amount: MYR ${Number(tx.total || 0).toFixed(2)}`,
    `Status: ${(tx.status || '').toUpperCase()}`,
  ].join('\n');
}

/** Same idea as formatTxCopy() but for a Bus/Train/Flight travel inquiry. */
function formatInquiryCopy(inq) {
  const lines = [
    `Type: ${inq.type || ''}`,
    `Route: ${inq.from || ''} → ${inq.to || ''}`,
    `Date: ${inq.date || ''}${inq.time ? ` · ${inq.time}` : ''}`,
    `Passengers: ${inq.passengers || ''}`,
    `Name: ${inq.name || ''}`,
    `Phone: ${inq.phone || ''}`,
  ];
  if (inq.email) lines.push(`Email: ${inq.email}`);
  if (inq.notes) lines.push(`Notes: ${inq.notes}`);
  lines.push(`Status: ${(inq.status || 'new').toUpperCase()}`);
  return lines.join('\n');
}

// NOTE: the old admin-only BUY_SERVICES (just Mobile Banking) and
// ADMIN_TOOL_DEFS (User Mgmt / Transfer Pts / Moderation / Verify
// Requests / Business Profiles / Analytics) grids used to live here.
// Mobile Banking is now covered by the shared <ServiceGrid> (same Quick
// Services every role sees - see "All features available for all roles"),
// and the management tools moved to their own page - see
// AdminFeaturesScreen.js - reached via the "Admin Features" tile appended
// onto that same ServiceGrid below, instead of a separate inline grid.

// Admin dashboard: all dealer transactions, the flight/bus/train inquiry
// queue (admin calls the customer back to confirm), and live exchange
// rates. Everything reads/writes Firestore directly - no mock data.
export default function AdminHomeScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  // Restored. dce7a84 ("remove retired Marketplace and Social modules") deleted
  // this whole line instead of just marketplaceCategories, socialLinks and
  // openDirectChat from it, so every context value this screen reads has been
  // undefined since 2026-09-16 and the screen threw
  // "Property 'viewingSection' doesn't exist" on render. Nobody hit it because
  // App Check enforcement was blocking sign-in, so no admin ever reached the
  // dashboard. The three retired names are not reinstated - the context no
  // longer provides them.
  const {
    authUser, profile, dealerTxs, inquiries, topups, banners, announcements,
    adminTab, rates, pricing, internetPricing, supportContact, paymentSettings,
    logout, setScreen, openSidebar, setHomeBackInterceptor, homepageConfig,
    adminViewingSection: viewingSection, setAdminViewingSection: setViewingSection,
    // Missed when the line above was restored, so the FEATURES filter threw
    // "Property 'gridManagement' doesn't exist" and took the admin and
    // superadmin dashboard down on render - the same regression as
    // viewingSection, from the same deleted line.
    gridManagement,
    can,
  } = useApp();
  // Verifying a top-up is finance's step; releasing the money is an admin's.
  // A superadmin has both - can('finance') is true for them and no override
  // can take it away, and superadmin is in the completer list.
  const canVerifyTopups = typeof can === 'function' ? can('finance') : false;
  const canCompleteTopups = profile?.role === 'admin' || profile?.role === 'superadmin';
  const [editRateKey, setEditRateKey] = useState(null);
  const [editPricingKey, setEditPricingKey] = useState(null);
  const [editPointCostKey, setEditPointCostKey] = useState(null);
  // Role-Based Pricing (superadmin only): { role, key } for the field
  // currently being edited, or null when the modal's closed.
  const [editRolePrice, setEditRolePrice] = useState(null);
  const [editSupportKey, setEditSupportKey] = useState(null);
  const [editPaymentKey, setEditPaymentKey] = useState(null); // 'jompayBillerId' | 'jompayRefNo' | null
  const [qrModalVisible, setQrModalVisible] = useState(false); // DuitNow QR upload modal
  // Next Update PRD §2 - Homepage tab (superadmin-only, see firestore.rules
  // settings/homepageConfig). addCountryModalVisible reuses CountryModal
  // (the same Profile > Country/Region picker) to pick which country gets
  // its first override row.
  const [addCountryModalVisible, setAddCountryModalVisible] = useState(false);
  const updateHomepageModule = async (code, key, value) => {
    try {
      await homepageConfigService.updateCountryModules(code, { [key]: value });
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save that. Please try again.');
    }
  };
  const addHomepageCountry = (code) => {
    const current = getHomepageModules(homepageConfig, code);
    updateHomepageModule(code, 'layout', current.layout);
  };
  const [bankAccountModal, setBankAccountModal] = useState({ visible: false, account: null });
  const [pricingOperator, setPricingOperator] = useState(PRICING_OPERATORS[0]);
  // Internet Package Prices card: null when the add/edit modal is closed,
  // otherwise { mode: 'add' } or { mode: 'edit', pkg } where pkg is one of
  // the entries getMergedPackages() returns (carries id/baseIndex/isCustom
  // so save/delete know whether to touch a built-in or admin-added package).
  const [packageModal, setPackageModal] = useState(null);
  const [rejectTopupId, setRejectTopupId] = useState(null);
  const [busyTopupId, setBusyTopupId] = useState(null);
  const [rejectTxId, setRejectTxId] = useState(null);
  const [pinTxId, setPinTxId] = useState(null); // { id, service }
  const [busyTxId, setBusyTxId] = useState(null);
  const [receiptTxId, setReceiptTxId] = useState(null);
  const [ticketInquiryId, setTicketInquiryId] = useState(null);
  const [bannerModal, setBannerModal] = useState({ visible: false, banner: null });
  const [busyBannerId, setBusyBannerId] = useState(null);
  const [announcementModalVisible, setAnnouncementModalVisible] = useState(false);
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [detailItem, setDetailItem] = useState(null); // { type: 'tx'|'inquiry'|'topup', data }

  // Let the hardware back button close this sub-section instead of
  // navigating away from the Admin dashboard or arming app-exit.
  useEffect(() => {
    setHomeBackInterceptor(() => {
      if (viewingSection) {
        setViewingSection(false);
        return true;
      }
      return false;
    });
    return () => setHomeBackInterceptor(null);
  }, [viewingSection, setHomeBackInterceptor]);

  const sortedBanners = [...banners].sort((a, b) => (a.order || 0) - (b.order || 0));

  const saveBanner = async (form) => {
    const editing = bannerModal.banner;
    setBannerModal({ visible: false, banner: null });
    try {
      if (editing) {
        await bannerService.updateBanner(editing.id, form);
      } else {
        const nextOrder = sortedBanners.length
          ? Math.max(...sortedBanners.map((b) => b.order || 0)) + 1
          : 0;
        await bannerService.createBanner({ ...form, order: nextOrder });
      }
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not save this banner.');
    }
  };

  const deleteBannerConfirm = (banner) => {
    showAlert('Delete banner?', `"${banner.title}" will be removed from the home page slider.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await bannerService.deleteBanner(banner.id);
          } catch (e) {
            showAlert('MySheba', e.message || 'Could not delete this banner.');
          }
        },
      },
    ]);
  };

  const toggleBannerActive = async (banner) => {
    setBusyBannerId(banner.id);
    try {
      await bannerService.setBannerActive(banner.id, !(banner.active !== false));
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this banner.');
    } finally {
      setBusyBannerId(null);
    }
  };

  const moveBanner = async (banner, direction) => {
    const idx = sortedBanners.findIndex((b) => b.id === banner.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sortedBanners.length) return;
    try {
      await bannerService.reorderBanners(banner, sortedBanners[swapIdx]);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not reorder banners.');
    }
  };

  const runTopupStep = async (topup, step, failure) => {
    setBusyTopupId(topup.id);
    try {
      await step(topup);
    } catch (e) {
      showAlert('MySheba', e.message || failure);
    } finally {
      setBusyTopupId(null);
    }
  };
  const verifyTopupReq = (topup) => runTopupStep(topup, topupService.verifyTopup, 'Could not verify this top-up.');
  const completeTopupReq = (topup) => runTopupStep(topup, topupService.completeTopup, 'Could not complete this top-up.');

  const confirmRejectTopup = async (reason) => {
    const id = rejectTopupId;
    setRejectTopupId(null);
    if (!reason) return;
    try {
      await topupService.rejectTopup(id, reason);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not reject this top-up.');
    }
  };

  // Admin can process orders directly - same actions the Dealer dashboard
  // has, needed here too since some orders (customer has no dealerId
  // assigned yet) never reach any dealer's queue and would otherwise be
  // stuck pending forever.
  const acceptTx = async (id) => {
    setBusyTxId(id);
    try {
      await transactionService.acceptTransaction(id);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not accept this order.');
    } finally {
      setBusyTxId(null);
    }
  };

  const confirmRejectTx = async (reason) => {
    const target = rejectTxId;
    setRejectTxId(null);
    if (!reason || !target) return;
    try {
      await transactionService.rejectTransaction(target.id, reason, target.service);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not reject this order.');
    }
  };

  const confirmTxPin = async (pin) => {
    if (!isValidCollectionPin(pin)) {
      showAlert('MySheba', PIN_INVALID_MESSAGE);
      return;
    }
    const tx = pinTxId;
    setPinTxId(null);
    if (!tx) return;
    setReceiptTxId({ id: tx.id, pin });
  };

  const onCompleteTx = (tx) => {
    if (tx.claimedBy !== authUser?.uid) {
      showAlert('MySheba', 'This order was accepted by another staff member.');
      return;
    }
    if (tx.service === 'Mobile Banking' || tx.service === 'Remittance') {
      setPinTxId({ id: tx.id, service: tx.service });
      return;
    }
    setReceiptTxId({ id: tx.id, pin: '' });
  };

  const confirmReceiptComplete = async (url) => {
    const target = receiptTxId;
    setReceiptTxId(null);
    if (!target) return;
    setBusyTxId(target.id);
    try {
      await transactionService.completeTransaction(target.id, target.pin, url);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not complete this order.');
    } finally {
      setBusyTxId(null);
    }
  };

  const filteredTxs = dealerTxs.filter((t) => !(t.status === 'pending' && t.rejectedBy?.[authUser?.uid])).filter((t) => adminTab === 'all' || t.status === adminTab);

  const featureBadges = {
    pending: dealerTxs.filter((t) => t.status === 'pending' && !t.rejectedBy?.[authUser?.uid]).length || undefined,
    inquiries: inquiries.filter((i) => (i.status || 'new') === 'new').length || undefined,
    topups: topups.filter((t) => t.status === 'pending').length || undefined,
  };
  const features = FEATURES.filter((f) => gridManagementService.isGridActive(gridManagement, f.key === 'all' ? 'history' : f.key)).map((f) => ({ ...f, badge: featureBadges[f.key] }));
  // Section header (icon + name) for whichever Dashboard tile the user
  // opened from AdminFeaturesScreen - the grid itself now lives there.
  const activeFeature = features.find((f) => f.key === adminTab);

  /** "Contact" now opens an in-app chat thread with the customer who submitted
   * the inquiry, prefilled with the order reference so the admin doesn't have
   * to retype the route/date. Falls back to an alert if the inquiry has no
   * linked customer account (e.g. a guest submission). */
;

  /** Plain phone call - marks the inquiry contacted too, since a call is just as much "contact" as a chat message. */
  const callInquiry = async (inq) => {
    try {
      await inquiryService.updateInquiryStatus(inq.id, 'contacted');
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update status.');
    }
    if (inq.phone) {
      Linking.openURL(`tel:${inq.phone}`).catch(() => {});
    } else {
      showAlert('MySheba', 'No phone number on this inquiry.');
    }
  };

  /** Opens WhatsApp with the customer's number, prefilled with the order reference. */
  const whatsappInquiry = async (inq) => {
    if (!inq.phone) {
      showAlert('MySheba', 'No phone number on this inquiry.');
      return;
    }
    try {
      await inquiryService.updateInquiryStatus(inq.id, 'contacted');
    } catch (e) {
      // non-fatal - still open WhatsApp even if the status update fails
    }
    const digits = inq.phone.replace(/[^\d]/g, '');
    const msg = encodeURIComponent(
      `Hi ${inq.name || ''}, this is MySheba regarding your ${inq.type} inquiry (${inq.from} → ${inq.to} · ${inq.date}${inq.time ? ` · ${inq.time}` : ''}).`
    );
    Linking.openURL(`https://wa.me/${digits}?text=${msg}`).catch(() => {
      showAlert('MySheba', 'Could not open WhatsApp.');
    });
  };

  const closeInquiry = async (inq) => {
    if (inq.type === 'flight') {
      setTicketInquiryId(inq.id);
      return;
    }
    try {
      await inquiryService.updateInquiryStatus(inq.id, 'closed');
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update status.');
    }
  };

  const confirmTicketClose = async (url) => {
    const id = ticketInquiryId;
    setTicketInquiryId(null);
    try {
      await inquiryService.closeInquiryWithTicket(id, url);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update status.');
    }
  };

  const saveRate = async (value) => {
    const key = editRateKey;
    setEditRateKey(null);
    const num = parseFloat(value);
    if (!key || Number.isNaN(num)) return;
    try {
      await ratesService.updateRate(key, num);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update rate.');
    }
  };

  const savePricing = async (value) => {
    const key = editPricingKey;
    setEditPricingKey(null);
    const num = parseFloat(value);
    if (!key || Number.isNaN(num)) return;
    try {
      await settingsService.updatePricing(key, num);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this setting.');
    }
  };

  const savePointCost = async (value) => {
    const key = editPointCostKey;
    setEditPointCostKey(null);
    const num = parseFloat(value);
    if (!key || Number.isNaN(num) || num < 0) return;
    try {
      await settingsService.updatePricing(key, num);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this price.');
    }
  };

  const saveRolePrice = async (value) => {
    const target = editRolePrice;
    setEditRolePrice(null);
    const num = parseFloat(value);
    if (!target || Number.isNaN(num) || num < 0) return;
    try {
      await settingsService.updateRolePrice(target.role, target.key, num);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this price.');
    }
  };

  const resetRolePrice = async (role, key) => {
    try {
      await settingsService.updateRolePrice(role, key, null);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not reset this price.');
    }
  };

  const saveSupportContact = async (value) => {
    const key = editSupportKey;
    setEditSupportKey(null);
    if (!key) return;
    try {
      await supportContactService.updateSupportContact(key, value.trim());
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this setting.');
    }
  };

  const savePaymentField = async (value) => {
    const key = editPaymentKey;
    setEditPaymentKey(null);
    if (!key) return;
    try {
      await paymentSettingsService.updatePaymentSettings(key, value.trim());
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this setting.');
    }
  };

  const saveDuitnowQr = async (url) => {
    setQrModalVisible(false);
    try {
      await paymentSettingsService.updatePaymentSettings('duitnowQrUrl', url);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not save the DuitNow QR code.');
    }
  };

  const saveBankAccount = async (form) => {
    const editing = bankAccountModal.account;
    setBankAccountModal({ visible: false, account: null });
    try {
      if (editing) {
        await paymentSettingsService.updateBankAccount(editing.id, form);
      } else {
        await paymentSettingsService.addBankAccount(form);
      }
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not save this bank account.');
    }
  };

  const deleteBankAccountConfirm = (account) => {
    showAlert('Delete bank account?', `${account.bankName} - ${account.accountNumber} will no longer be shown to customers.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await paymentSettingsService.removeBankAccount(account.id);
          } catch (e) {
            showAlert('MySheba', e.message || 'Could not delete this bank account.');
          }
        },
      },
    ]);
  };

  const savePackage = async (fields) => {
    const modal = packageModal;
    setPackageModal(null);
    if (!modal) return;
    try {
      if (modal.mode === 'add') {
        await internetPricingService.addCustomPackage(pricingOperator, fields);
      } else if (modal.pkg.isCustom) {
        await internetPricingService.updateCustomPackage(pricingOperator, modal.pkg.id, fields);
      } else {
        await internetPricingService.updateBasePackage(pricingOperator, modal.pkg.baseIndex, fields);
      }
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not save this package.');
    }
  };

  const deletePackage = () => {
    const modal = packageModal;
    if (!modal || modal.mode !== 'edit') return;
    setPackageModal(null);
    const { pkg } = modal;
    showAlert(`Remove "${pkg.name}"?`, 'Customers will no longer see this package for this operator.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            if (pkg.isCustom) {
              await internetPricingService.removeCustomPackage(pricingOperator, pkg.id);
            } else {
              await internetPricingService.removeBasePackage(pricingOperator, pkg.baseIndex);
            }
          } catch (e) {
            showAlert('MySheba', e.message || 'Could not remove this package.');
          }
        },
      },
    ]);
  };

  const sendAnnouncementNow = async (form) => {
    setSendingAnnouncement(true);
    try {
      const result = await announcementService.sendAnnouncement(form);
      setAnnouncementModalVisible(false);
      showAlert('MySheba', `Sent to ${result.sentCount} of ${result.matchedCount} matching user(s).`);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not send this announcement.');
    } finally {
      setSendingAnnouncement(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <View style={styles.logoArea}>
          <TouchableOpacity style={styles.menuBtn} onPress={openSidebar}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.logoBox}>
            <Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="cover" />
          </View>
          <View>
            <Text style={styles.brand}>Admin Panel</Text>
            <Text style={styles.tagline}>Platform Management</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {!viewingSection && (
          <>
            {/* The old inline "📊 Dashboard" grid (All Tx, Pending, Inquiries,
                Top-Ups, Chats, Rates, Pricing, Payments, Categories, Support,
                Banners, Announce) has moved into AdminFeaturesScreen - see
                that file. Home now just shows the same banner slider +
                Quick Services grid every role sees, plus one tile linking
                to Admin/Superadmin Features for everything else. */}
            <BannerSlider />
            <ServiceGrid
              extraTiles={[
                { key: 'adminFeaturesTile', icon: '🛠️', bg: '#EDE7F6', accent: '#5E35B1', name: profile && profile.role === 'superadmin' ? 'Superadmin Features' : 'Admin Features', onPress: () => setScreen('adminFeatures') },
              ]}
            />
          </>
        )}

        {!!viewingSection && (
        <>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setViewingSection(false)}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.sectionHeaderTitle}>{activeFeature ? `${activeFeature.icon} ${activeFeature.name}` : ''}</Text>
        </View>

        <View style={styles.sectionContent}>
        {adminTab === 'rates' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💱 Rate Management</Text>
              {RATE_FIELDS.map((r) => (
                <View key={r.key} style={styles.rateRow}>
                  <Text style={{ flex: 1 }}>{r.label}</Text>
                  <Text style={styles.rateValue}>{rates[r.key]}</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setEditRateKey(r.key)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>🔄 Recharge / Internet Package Rates</Text>
              {RECHARGE_RATE_FIELDS.map((r) => (
                <View key={r.key} style={styles.rateRow}>
                  <Text style={{ flex: 1 }}>{r.label}</Text>
                  <Text style={styles.rateValue}>{rates[r.key]}</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setEditRateKey(r.key)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={styles.hintText}>
                Used only for Recharge and Internet Package orders outside Malaysia - the points/MYR shown and
                recorded for those orders is the local-currency amount divided by this rate. Kept separate from
                Mobile Banking's rate above, since recharge margins are set independently.
              </Text>
            </View>
          </View>
        )}

        {adminTab === 'pricing' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🏷️ Earning &amp; Margin Settings</Text>
              {PRICING_FIELDS.map((r) => (
                <View key={r.key} style={styles.rateRow}>
                  <Text style={{ flex: 1 }}>{r.label}</Text>
                  <Text style={styles.rateValue}>{pricing[r.key]}%</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setEditPricingKey(r.key)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={styles.hintText}>
                Dealer earning is credited automatically whenever a dealer/dealer sends points to one of their own customers.
                Recharge cost/profit is shown on recharge orders for reporting - it doesn't change what the customer pays.
                it's never credited anywhere, just kept out of the payout. Draw refunds (29) are unaffected - players get their full entry fee back.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>🔒 Feature Costs</Text>
              {POINT_COST_FIELDS.map((r) => (
                <View key={r.key} style={styles.rateRow}>
                  <Text style={{ flex: 1 }}>{r.label}</Text>
                  <Text style={styles.rateValue}>{pricing[r.key]} pts</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setEditPointCostKey(r.key)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {ACCESS_WINDOW_FIELDS.map((r) => (
                <View key={r.key} style={styles.rateRow}>
                  <Text style={{ flex: 1 }}>{r.label}</Text>
                  <Text style={styles.rateValue}>{pricing[r.key]} hrs</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setEditPointCostKey(r.key)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={styles.hintText}>
                These are the point-deduct features (FOMEMA/Visa checks, Malaysia Arrival Card/Passport submissions, Bus/Train/e-SIM purchases).
                A customer is locked out of a feature if their wallet balance can't cover its price, and sees the exact price
                in a confirmation prompt before it opens. Changing a value here updates it everywhere immediately.
                FOMEMA/Visa charge once, then stay free for the Access Window above before the next search charges again.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>📝 Notepad / Documents / Salary &amp; OT</Text>
              {MODULE_SUBSCRIPTION_COST_FIELDS.map((r) => (
                <View key={r.key} style={styles.rateRow}>
                  <Text style={{ flex: 1 }}>{r.label}</Text>
                  <Text style={styles.rateValue}>{pricing[r.key]} pts</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setEditPointCostKey(r.key)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {MODULE_SUBSCRIPTION_DAYS_FIELDS.map((r) => (
                <View key={r.key} style={styles.rateRow}>
                  <Text style={{ flex: 1 }}>{r.label}</Text>
                  <Text style={styles.rateValue}>{pricing[r.key]} days</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setEditPointCostKey(r.key)}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={styles.hintText}>
                Each is a monthly subscription, not a per-use charge: opening the module charges the price above
                once, then it's free again for the Subscription Cycle Length shown before the next charge. Set a
                price to 0 to keep that module free.
              </Text>
            </View>
            {!!(profile && profile.role === 'superadmin') && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🎭 Role-Based Pricing</Text>
                <Text style={styles.hintText}>
                  Give any role its own price for a feature above instead of everyone paying the same
                  flat price - a role with no override here just pays the flat price. Superadmin-only.
                </Text>
                {ROLE_PRICE_FIELDS.map((field) => (
                  <View key={field.key} style={styles.rolePriceGroup}>
                    <Text style={styles.rolePriceFeatureLabel}>{field.label}</Text>
                    {settingsService.ROLE_PRICE_ROLES.map((role) => {
                      const override = pricing.rolePricing?.[role]?.[field.key];
                      const hasOverride = override != null;
                      return (
                        <View key={role} style={styles.rateRow}>
                          <Text style={{ flex: 1, color: '#666' }}>{ROLE_LABELS[role]}</Text>
                          <Text style={[styles.rateValue, hasOverride && styles.rateValueOverridden]}>
                            {hasOverride ? override : pricing[field.key]}{rolePriceUnitFor(field.key) === '×' ? '×' : ' pts'}{hasOverride ? '' : ' (default)'}
                          </Text>
                          {!!hasOverride && (
                            <TouchableOpacity onPress={() => resetRolePrice(role, field.key)}>
                              <Text style={styles.resetLink}>Reset</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.editBtn}
                            onPress={() => setEditRolePrice({ role, key: field.key })}
                          >
                            <Text style={styles.editBtnText}>Edit</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>📶 Internet Package Prices</Text>
              <View style={styles.chipRow}>
                {PRICING_OPERATORS.map((op) => (
                  <TouchableOpacity
                    key={op}
                    style={[styles.opChip, pricingOperator === op && styles.opChipActive]}
                    onPress={() => setPricingOperator(op)}
                  >
                    <Text style={[styles.opChipText, pricingOperator === op && styles.opChipTextActive]}>{op}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {getMergedPackages(pricingOperator, internetPricing[pricingOperator]).map((p) => (
                <View key={p.id} style={styles.rateRow}>
                  <View style={{ flex: 1 }}>
                    <Text>{p.name}{p.isCustom ? '  •  added' : ''}</Text>
                    <Text style={styles.txDetail}>{p.data} • {p.valid}</Text>
                  </View>
                  <Text style={styles.rateValue}>MYR {p.price}</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setPackageModal({ mode: 'edit', pkg: p })}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addPackageBtn} onPress={() => setPackageModal({ mode: 'add' })}>
                <Text style={styles.addPackageBtnText}>+ Add Package for {pricingOperator}</Text>
              </TouchableOpacity>
            </View>

            <ApiPackagePricingCard service="Internet" title="📦 Success TopUp Internet Prices (BD)" />
            <ApiPackagePricingCard service="Entertainment" title="🎬 Success TopUp Entertainment Prices (BD)" />
          </View>
        )}

        {adminTab === 'support' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>☎️ Support Contact Numbers</Text>
            {SUPPORT_FIELDS.map((r) => (
              <View key={r.key} style={styles.rateRow}>
                <Text style={{ flex: 1 }}>{r.label}</Text>
                <Text style={styles.rateValue}>{supportContact[r.key] || 'Not set'}</Text>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditSupportKey(r.key)}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.hintText}>
              The customer Support screen shows Call and WhatsApp as "Coming soon" until each number is set here. Email support isn't affected - it's fixed.
            </Text>
          </View>
        )}

        {adminTab === 'payments' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🏦 Bank Accounts</Text>
              {(paymentSettings.bankAccounts || []).length === 0 ? (
                <Text style={styles.hintText}>No bank accounts added yet.</Text>
              ) : (
                (paymentSettings.bankAccounts || []).map((acc) => (
                  <View key={acc.id} style={styles.rateRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rateValue}>{acc.bankName}</Text>
                      <Text>{acc.accountNumber}</Text>
                      <Text style={{ fontSize: 11, color: '#999' }}>{acc.accountHolder}</Text>
                    </View>
                    {!!(profile && profile.role === 'superadmin') && (
                      <View style={{ gap: 6 }}>
                        <TouchableOpacity style={styles.editBtn} onPress={() => setBankAccountModal({ visible: true, account: acc })}>
                          <Text style={styles.editBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editBtn} onPress={() => deleteBankAccountConfirm(acc)}>
                          <Text style={styles.editBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
              {!!(profile && profile.role === 'superadmin') && (
                <TouchableOpacity style={styles.addBannerBtn} onPress={() => setBankAccountModal({ visible: true, account: null })}>
                  <Text style={styles.addBannerBtnText}>+ Add Bank Account</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.hintText}>
                Shown to customers on the Top-Up screen when they pick Bank Transfer or Bank Deposit, so they know
                which account to send money to. Add more than one to give customers a choice of bank.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>🏢 JomPay</Text>
              {PAYMENT_FIELDS.map((r) => (
                <View key={r.key} style={styles.rateRow}>
                  <View style={{ flex: 1 }}>
                    <Text>{r.label}</Text>
                    {!!paymentSettings[r.key] && (
                      <CopyButton value={paymentSettings[r.key]} label="Copy" />
                    )}
                  </View>
                  <Text style={styles.rateValue}>{paymentSettings[r.key] || 'Not set'}</Text>
                  {!!(profile && profile.role === 'superadmin') && (
                    <TouchableOpacity style={styles.editBtn} onPress={() => setEditPaymentKey(r.key)}>
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <Text style={styles.hintText}>
                Shown to customers on the Top-Up screen when they pick JomPay - Biller ID and Reference Number
                are what they'll need to enter in their own bank's JomPay screen to pay in.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>📱 DuitNow QR</Text>
              {paymentSettings.duitnowQrUrl ? (
                <Image source={{ uri: paymentSettings.duitnowQrUrl }} style={styles.duitnowQrPreview} resizeMode="contain" />
              ) : (
                <Text style={styles.hintText}>No QR code uploaded yet.</Text>
              )}
              {!!(profile && profile.role === 'superadmin') && (
                <TouchableOpacity style={styles.addBannerBtn} onPress={() => setQrModalVisible(true)}>
                  <Text style={styles.addBannerBtnText}>{paymentSettings.duitnowQrUrl ? 'Change QR Code' : '+ Upload QR Code'}</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.hintText}>
                Shown to customers on the Top-Up screen when they pick DuitNow - they scan this to pay in from any bank/e-wallet app.
              </Text>
            </View>

            {!(profile && profile.role === 'superadmin') && (
              <Text style={styles.hintText}>Only superadmin can edit JomPay/DuitNow details.</Text>
            )}
          </View>
        )}

        {adminTab === 'homepage' && (
          <View>
            {!(profile && profile.role === 'superadmin') ? (
              <View style={styles.card}>
                <Text style={styles.hintText}>Only Super Admin can configure the country/region homepage.</Text>
              </View>
            ) : (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>🏠 Country / Region Homepage</Text>
                  <Text style={styles.hintText}>
                    Malaysia keeps the standard service-first homepage by default. Any other country
                    override below only if a specific country needs different modules than that default.
                  </Text>
                </View>

                {Object.keys(homepageConfig || {}).filter((k) => k !== 'updatedAt').map((code) => {
                  const c = countries.find((x) => x.code === code);
                  const mod = getHomepageModules(homepageConfig, code);
                  return (
                    <View key={code} style={styles.card}>
                      <Text style={styles.cardTitle}>{c ? `${c.flag} ${c.name}` : code}</Text>
                      <View style={styles.rateRow}>
                        <Text style={{ flex: 1 }}>Layout</Text>
                        <TouchableOpacity
                          style={styles.editBtn}
                        >
                          <Text style={styles.editBtnText}>Switch</Text>
                        </TouchableOpacity>
                      </View>
                      {[
                        { key: 'showServices', label: 'Services module' },
                        { key: 'showBanners', label: 'Banners module' },
                      ].map((row) => (
                        <View key={row.key} style={styles.rateRow}>
                          <Text style={{ flex: 1 }}>{row.label}</Text>
                          <Text style={styles.rateValue}>{mod[row.key] !== false ? 'ON' : 'OFF'}</Text>
                          <TouchableOpacity
                            style={styles.editBtn}
                            onPress={() => updateHomepageModule(code, row.key, mod[row.key] === false)}
                          >
                            <Text style={styles.editBtnText}>{mod[row.key] !== false ? 'Turn Off' : 'Turn On'}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  );
                })}

                <TouchableOpacity style={styles.addBannerBtn} onPress={() => setAddCountryModalVisible(true)}>
                  <Text style={styles.addBannerBtnText}>+ Add Country Override</Text>
                </TouchableOpacity>

                <CountryModal
                  visible={addCountryModalVisible}
                  onClose={() => setAddCountryModalVisible(false)}
                  value={null}
                  onSelect={addHomepageCountry}
                />
              </>
            )}
          </View>
        )}

        {adminTab === 'banners' && (
          <View>
            <TouchableOpacity style={styles.addBannerBtn} onPress={() => setBannerModal({ visible: true, banner: null })}>
              <Text style={styles.addBannerBtnText}>+ Add Banner</Text>
            </TouchableOpacity>
            {sortedBanners.length === 0 ? (
              <Text style={styles.empty}>No banners yet - add one to show it on the home page.</Text>
            ) : (
              sortedBanners.map((b, i) => {
                const isActive = b.active !== false;
                return (
                  <View key={b.id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: b.colorStart || colors.primary }]}>
                    <View style={styles.bannerCardHeader}>
                      <Text style={styles.bannerIcon}>{b.icon || '📣'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{b.title}</Text>
                        {!!b.body && <Text style={styles.txDetail}>{b.body}</Text>}
                      </View>
                      <View style={[styles.badge, { backgroundColor: isActive ? '#E8F5E9' : '#F0F0F0' }]}>
                        <Text style={[styles.badgeText, { color: isActive ? '#2E7D32' : '#888' }]}>{isActive ? 'ACTIVE' : 'HIDDEN'}</Text>
                      </View>
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.reorderBtn} onPress={() => moveBanner(b, -1)} disabled={i === 0}>
                        <Text style={styles.reorderBtnText}>↑</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.reorderBtn} onPress={() => moveBanner(b, 1)} disabled={i === sortedBanners.length - 1}>
                        <Text style={styles.reorderBtnText}>↓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.primaryBtn} onPress={() => setBannerModal({ visible: true, banner: b })}>
                        <Text style={styles.actionBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={isActive ? styles.errorBtn : styles.successBtn}
                        onPress={() => toggleBannerActive(b)}
                        disabled={busyBannerId === b.id}
                      >
                        <Text style={styles.actionBtnText}>{isActive ? 'Hide' : 'Show'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.errorBtn} onPress={() => deleteBannerConfirm(b)}>
                        <Text style={styles.actionBtnText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {adminTab === 'announcements' && (
          <View>
            <TouchableOpacity style={styles.addBannerBtn} onPress={() => setAnnouncementModalVisible(true)}>
              <Text style={styles.addBannerBtnText}>+ New Announcement</Text>
            </TouchableOpacity>
            {announcements.length === 0 ? (
              <Text style={styles.empty}>No announcements sent yet.</Text>
            ) : (
              announcements.map((a) => (
                <View key={a.id} style={styles.card}>
                  <View style={styles.txHeader}>
                    <Text style={styles.cardTitle}>{a.title}</Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{(a.audience || 'all').toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.txDetail}>{a.body}</Text>
                  <Text style={styles.txDetail}>Delivered to {a.sentCount ?? 0} of {a.matchedCount ?? 0} user(s){a.sentByName ? ` · by ${a.sentByName}` : ''}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {adminTab === 'inquiries' && (
          inquiries.length === 0 ? (
            <Text style={styles.empty}>No travel inquiries yet</Text>
          ) : (
            inquiries.map((inq) => {
              const badge = BADGE_COLORS[inq.status] || BADGE_COLORS.new;
              return (
                <TouchableOpacity key={inq.id} style={styles.txCard} activeOpacity={0.7} onPress={() => setDetailItem({ type: 'inquiry', data: inq })}>
                  <View style={styles.txHeader}>
                    <Text style={styles.txService}>{TYPE_ICON[inq.type] || ''} {inq.type}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{(inq.status || 'new').toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.txDetail}>🗺️ {inq.from} → {inq.to} · {inq.date}{inq.time ? ` · ${inq.time}` : ''}</Text>
                  <Text style={styles.txDetail}>👥 {inq.passengers} passenger(s)</Text>
                  <Text style={styles.txDetail}>👤 {inq.name} · 📞 {inq.phone}</Text>
                  {!!inq.email && <Text style={styles.txDetail}>✉️ {inq.email}</Text>}
                  {!!inq.notes && <Text style={styles.txDetail}>📝 {inq.notes}</Text>}
                  <View style={styles.copyRow}>
                    <CopyButton value={formatInquiryCopy(inq)} label="Copy Details" />
                  </View>
                  {inq.status !== 'closed' && (
                    <>
                      <View style={styles.actions}>
                        
                        <TouchableOpacity style={styles.callBtn} onPress={() => callInquiry(inq)}>
                          <Text style={styles.actionBtnText}>📞 Call</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.whatsappBtn} onPress={() => whatsappInquiry(inq)}>
                          <Text style={styles.actionBtnText}>💬 WhatsApp</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.actions}>
                        <TouchableOpacity style={styles.successBtn} onPress={() => closeInquiry(inq)}>
                          <Text style={styles.actionBtnText}>✓ Close</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              );
            })
          )
        )}

        {adminTab === 'topups' && (
          topups.length === 0 ? (
            <Text style={styles.empty}>No top-up requests yet</Text>
          ) : (
            topups.map((tp) => {
              const badge = BADGE_COLORS[tp.status] || BADGE_COLORS.pending;
              return (
                <TouchableOpacity key={tp.id} style={styles.txCard} activeOpacity={0.7} onPress={() => setDetailItem({ type: 'topup', data: tp })}>
                  <View style={styles.txHeader}>
                    <Text style={styles.txService}>💰 {topupService.METHODS[tp.method] || tp.method}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{(tp.status || 'pending').toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.txDetail}>👤 {tp.userName || 'Unknown'} ({tp.userRole}) · 📞 {tp.userPhone}</Text>
                  {!!tp.bankName && <Text style={styles.txDetail}>🏦 {tp.bankName}{tp.refNo ? ` · Ref: ${tp.refNo}` : ''}</Text>}
                  <Text style={styles.txAmount}>MYR {Number(tp.amount || 0).toFixed(2)} → MYR {Number(tp.points || 0).toFixed(2)}</Text>
                  {!!tp.receiptUrl && (
                    <TouchableOpacity onPress={() => Linking.openURL(tp.receiptUrl).catch(() => {})}>
                      <Image source={{ uri: tp.receiptUrl }} style={styles.receiptThumb} resizeMode="cover" />
                    </TouchableOpacity>
                  )}
                  {tp.status === 'rejected' && !!tp.rejectReason && (
                    <Text style={[styles.txDetail, { color: colors.error }]}>Reason: {tp.rejectReason}</Text>
                  )}
                  {/* Who did what, kept on the card so the trail is visible
                      without opening the request. */}
                  {!!tp.verifiedByName && (
                    <Text style={styles.txDetail}>{'✓ Verified by ' + tp.verifiedByName + (tp.verifiedByRole ? ' (' + tp.verifiedByRole + ')' : '')}</Text>
                  )}
                  {!!tp.completedByName && (
                    <Text style={styles.txDetail}>{'✓ Completed by ' + tp.completedByName + (tp.completedByRole ? ' (' + tp.completedByRole + ')' : '')}</Text>
                  )}
                  {(tp.status === 'pending' || tp.status === 'verified') && (
                    <View style={styles.actions}>
                      {/* Verify is finance's step; complete releases the money
                          and is an admin's. A superadmin sees whichever step
                          the request is actually waiting on. */}
                      {tp.status === 'pending' && !!canVerifyTopups && (
                        <TouchableOpacity style={styles.primaryBtn} onPress={() => verifyTopupReq(tp)} disabled={busyTopupId === tp.id}>
                          <Text style={styles.actionBtnText}>✓ Verify</Text>
                        </TouchableOpacity>
                      )}
                      {tp.status === 'verified' && !!canCompleteTopups && (
                        <TouchableOpacity style={styles.successBtn} onPress={() => completeTopupReq(tp)} disabled={busyTopupId === tp.id}>
                          <Text style={styles.actionBtnText}>✓ Complete</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.errorBtn} onPress={() => setRejectTopupId(tp.id)} disabled={busyTopupId === tp.id}>
                        <Text style={styles.actionBtnText}>✕ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {tp.status === 'verified' && !canCompleteTopups && (
                    <Text style={styles.txDetail}>Waiting for an admin to complete it.</Text>
                  )}
                </TouchableOpacity>
              );
            })
          )
        )}

        {(adminTab === 'all' || adminTab === 'pending') && filteredTxs.map((tx) => {
          const badge = BADGE_COLORS[tx.status];
          return (
            <TouchableOpacity key={tx.id} style={styles.txCard} activeOpacity={0.7} onPress={() => setDetailItem({ type: 'tx', data: tx })}>
              <View style={styles.txHeader}>
                <Text style={styles.txService}>{tx.service}</Text>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.text }]}>{tx.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.txDetail}>👤 {tx.customerPhone || 'Unknown'}</Text>
              <Text style={styles.txDetail}>📝 {tx.details}</Text>
              <Text style={styles.txAmount}>MYR {Number(tx.total || 0).toFixed(2)}</Text>
              <View style={styles.copyRow}>
                <CopyButton value={formatTxCopy(tx)} label="Copy Details" />
              </View>
              {tx.status === 'pending' && (
                <View style={styles.copyRow}>
                  <TouchableOpacity style={styles.successBtn} onPress={() => acceptTx(tx.id)} disabled={busyTxId === tx.id}>
                    <Text style={styles.actionBtnText}>✓ Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.errorBtn} onPress={() => setRejectTxId({ id: tx.id, service: tx.service })} disabled={busyTxId === tx.id}>
                    <Text style={styles.actionBtnText}>✕ Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
              {tx.status === 'processing' && (
                <View style={styles.copyRow}>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => onCompleteTx(tx)} disabled={busyTxId === tx.id}>
                    <Text style={styles.actionBtnText}>✓ Complete</Text>
                  </TouchableOpacity>
                </View>
              )}
              {tx.status === 'completed' && !!tx.pin && (
                <Text style={styles.txDetail}>🔐 Collection PIN: {tx.pin}</Text>
              )}
              {!!(tx.status === 'completed' && tx.rejected) && (
                <Text style={[styles.txDetail, { color: colors.error }]}>Rejected: {tx.rejectReason}</Text>
              )}
            </TouchableOpacity>
          );
        })}
        </View>
        </>
        )}
      </ScrollView>

      <PromptModal
        visible={!!editRateKey}
        title="New rate value:"
        placeholder="e.g. 30.50"
        onSubmit={saveRate}
        onCancel={() => setEditRateKey(null)}
      />
      <PromptModal
        visible={!!editPricingKey}
        title="New value (%):"
        placeholder="e.g. 1.5"
        onSubmit={savePricing}
        onCancel={() => setEditPricingKey(null)}
      />
      <PromptModal
        visible={!!editPointCostKey}
        title={
          ACCESS_WINDOW_FIELDS.some((f) => f.key === editPointCostKey) ? 'New value (hours):'
          : MODULE_SUBSCRIPTION_DAYS_FIELDS.some((f) => f.key === editPointCostKey) ? 'New value (days):'
          : 'New cost:'
        }
        placeholder={
          ACCESS_WINDOW_FIELDS.some((f) => f.key === editPointCostKey) ? 'e.g. 1'
          : MODULE_SUBSCRIPTION_DAYS_FIELDS.some((f) => f.key === editPointCostKey) ? 'e.g. 30'
          : 'e.g. 2'
        }
        onSubmit={savePointCost}
        onCancel={() => setEditPointCostKey(null)}
      />
      <PromptModal
        visible={!!editRolePrice}
        title={
          editRolePrice
            ? `${ROLE_LABELS[editRolePrice.role]} price - ${ROLE_PRICE_FIELDS.find((f) => f.key === editRolePrice.key)?.label || ''}:`
            : ''
        }
        placeholder={editRolePrice && rolePriceUnitFor(editRolePrice.key) === '×' ? 'e.g. 0.95 (95% of face value)' : 'e.g. 2'}
        onSubmit={saveRolePrice}
        onCancel={() => setEditRolePrice(null)}
      />
      <PackageFormModal
        visible={!!packageModal}
        title={packageModal?.mode === 'add' ? `Add Package - ${pricingOperator}` : `Edit Package - ${pricingOperator}`}
        initial={packageModal?.mode === 'edit' ? packageModal.pkg : null}
        onSubmit={savePackage}
        onCancel={() => setPackageModal(null)}
        onDelete={packageModal?.mode === 'edit' ? deletePackage : null}
      />
      <PromptModal
        visible={!!editSupportKey}
        title="New number:"
        placeholder={SUPPORT_FIELDS.find((f) => f.key === editSupportKey)?.placeholder}
        onSubmit={saveSupportContact}
        onCancel={() => setEditSupportKey(null)}
      />
      <PromptModal
        visible={!!editPaymentKey}
        title={editPaymentKey === 'jompayBillerId' ? 'New JomPay Biller ID:' : editPaymentKey === 'jompayRefNo' ? 'New JomPay Reference No.:' : ''}
        placeholder={PAYMENT_FIELDS.find((f) => f.key === editPaymentKey)?.placeholder}
        onSubmit={savePaymentField}
        onCancel={() => setEditPaymentKey(null)}
      />
      <AttachFileModal
        visible={qrModalVisible}
        title="Upload the DuitNow QR code"
        uploadFn={(uri, mimeType) => mediaUpload.uploadPaymentQr(uri, mimeType)}
        onDone={saveDuitnowQr}
        onCancel={() => setQrModalVisible(false)}
      />
      <PromptModal
        visible={!!rejectTopupId}
        title="Rejection reason:"
        placeholder="Enter reason"
        onSubmit={confirmRejectTopup}
        onCancel={() => setRejectTopupId(null)}
      />
      <PromptModal
        visible={!!rejectTxId}
        title="Rejection reason:"
        placeholder="Enter reason"
        onSubmit={confirmRejectTx}
        onCancel={() => setRejectTxId(null)}
      />
      <PromptModal
        visible={!!pinTxId}
        title={PIN_PROMPT_TITLE}
        placeholder={PIN_PROMPT_PLACEHOLDER}
        secure
        maxLength={PIN_MAX}
        onSubmit={confirmTxPin}
        onCancel={() => setPinTxId(null)}
      />
      <AttachFileModal
        visible={!!receiptTxId}
        title="Attach the transfer receipt"
        uploadFn={(uri, mimeType) => mediaUpload.uploadOrderReceipt(receiptTxId?.id, uri, mimeType)}
        onDone={confirmReceiptComplete}
        onCancel={() => setReceiptTxId(null)}
      />
      <AttachFileModal
        visible={!!ticketInquiryId}
        title="Attach the flight ticket"
        allowPdf
        uploadFn={(uri, mimeType) => mediaUpload.uploadFlightTicket(ticketInquiryId, uri, mimeType)}
        onDone={confirmTicketClose}
        onCancel={() => setTicketInquiryId(null)}
      />
      <BannerFormModal
        visible={bannerModal.visible}
        banner={bannerModal.banner}
        onSubmit={saveBanner}
        onCancel={() => setBannerModal({ visible: false, banner: null })}
      />
      <BankAccountFormModal
        visible={bankAccountModal.visible}
        account={bankAccountModal.account}
        onSubmit={saveBankAccount}
        onCancel={() => setBankAccountModal({ visible: false, account: null })}
      />
      <AnnouncementFormModal
        visible={announcementModalVisible}
        busy={sendingAnnouncement}
        onSubmit={sendAnnouncementNow}
        onCancel={() => setAnnouncementModalVisible(false)}
      />
      <TransactionDetailModal
        visible={!!detailItem}
        type={detailItem?.type}
        item={detailItem?.data}
        onClose={() => setDetailItem(null)}
        showCost
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { backgroundColor: colors.primary, paddingVertical: 16, paddingHorizontal: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
    logoArea: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuBtn: { padding: 4, marginRight: 2 },
    menuIcon: { color: 'white', fontSize: 20 },
    logoBox: { width: 34, height: 34, backgroundColor: 'white', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 10, overflow: 'hidden' },
    logoImage: { width: '100%', height: '100%' },
    brand: { color: 'white', fontWeight: '700', fontSize: 15 },
    tagline: { color: 'white', fontSize: 10, opacity: 0.85, marginTop: 1 },
    logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill },
    logoutText: { color: 'white', fontSize: 11, fontWeight: '600' },
    content: { paddingTop: spacing.xs, paddingBottom: spacing.xl },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: 10 },
    backBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: '#EAF2FE' },
    backBtnText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    sectionHeaderTitle: { fontSize: 17, fontWeight: '700', flex: 1, color: colors.text },
    sectionContent: { paddingHorizontal: spacing.lg },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 2,
    },
    cardTitle: { fontWeight: '700', fontSize: 14, marginBottom: 10, color: colors.text },
    rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rateValue: { fontWeight: '700', marginHorizontal: 8, color: colors.text },
    editBtn: { backgroundColor: colors.primary, paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.md },
    editBtnText: { color: 'white', fontSize: 11, fontWeight: '600' },
    rolePriceGroup: { marginBottom: 12 },
    rolePriceFeatureLabel: { fontWeight: '700', fontSize: 12, marginTop: 10, marginBottom: 4, color: colors.text },
    rateValueOverridden: { color: colors.primary },
    resetLink: { color: colors.textSecondary, fontSize: 11, fontWeight: '600', marginHorizontal: 8, textDecorationLine: 'underline' },
    removeCategoryBtn: { backgroundColor: '#FDECEA' },
    removeCategoryBtnText: { color: colors.error },
    addCategoryBtn: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary, paddingVertical: 9, paddingHorizontal: 16, borderRadius: radius.md },
    addCategoryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
    hintText: { fontSize: 11, color: colors.textSecondary, marginTop: 8, lineHeight: 16 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    opChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    opChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    opChipText: { fontSize: 11, color: colors.text },
    opChipTextActive: { color: 'white', fontWeight: '700' },
    addPackageBtn: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary, paddingVertical: 9, paddingHorizontal: 16, borderRadius: radius.md },
    addPackageBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
    empty: { textAlign: 'center', color: colors.textSecondary, paddingVertical: 30 },
    txCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 5,
      elevation: 1,
    },
    txHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    txService: { fontWeight: '700', fontSize: 14, color: colors.text, textTransform: 'capitalize' },
    txDetail: { fontSize: 12, color: colors.textSecondary, marginVertical: 2 },
    txAmount: { fontWeight: '700', fontSize: 17, color: colors.primary, marginTop: 4 },
    copyRow: { flexDirection: 'row', marginTop: 8 },
    assignDealerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
    assignDealerBtn: { backgroundColor: '#EAF2FE', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.md },
    assignDealerBtnText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
    badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
    badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
    primaryBtn: { backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md },
    successBtn: { backgroundColor: colors.success, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md },
    errorBtn: { backgroundColor: colors.error, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md },
    callBtn: { backgroundColor: colors.primaryDark, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md },
    whatsappBtn: { backgroundColor: '#25D366', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md },
    actionBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
    receiptThumb: { width: '100%', height: 140, borderRadius: radius.md, marginTop: 8, backgroundColor: '#F0F0F0' },
    addBannerBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 12,
      shadowColor: colors.primary,
      shadowOpacity: 0.25,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 6,
      elevation: 2,
    },
    addBannerBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    duitnowQrPreview: { width: '100%', height: 220, backgroundColor: '#F7F8FA', borderRadius: radius.md, marginBottom: 10 },
    bannerCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
    bannerIcon: { fontSize: 24 },
    reorderBtn: { backgroundColor: colors.bg, width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    reorderBtnText: { fontWeight: '700', color: colors.text },
  });
}
