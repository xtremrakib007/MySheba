import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';
import * as gridManagementService from '../firebase/gridManagementService';
import { serviceEmoji } from './serviceEmoji';
import BusOperatorLogo, { hasBusLogo } from './BusOperatorLogo';

// `home: true` marks the tiles the customer home shows. Everything else is
// one tap away on the Services tab, which renders this list in full.
//
// This replaced "the first N tiles", which cut Bus, Train and Flight off the
// home screen purely because travel happens to be declared after money. The
// home set is a decision, so it is written down as one: eight services plus
// More Services, which is exactly three rows of three.
const CUSTOMER_SERVICES = [
  // Money & connectivity
  { key: 'recharge', icon: 'recharge', name: 'Mobile Top-Up', kind: 'service' , home: true },
  { key: 'internet', icon: 'internet', name: 'Internet (Data & Voice)', kind: 'service' , home: true },
  { key: 'rechargePin', icon: 'recharge', name: 'PIN Generate', kind: 'rechargePin' },
  { key: 'billpayment', icon: 'billpayment', name: 'Bill Payment', kind: 'service' },
  { key: 'mobilebanking', icon: 'mobilebanking', name: 'Mobile Banking', kind: 'service' , home: true },
  { key: 'remittance', icon: 'remittance', name: 'Remittance', kind: 'service' , home: true },

  // Travel
  { key: 'bus', icon: 'bus', name: 'Bus', kind: 'buspicker' , home: true },
  { key: 'train', icon: 'train', name: 'Train', kind: 'webview' , home: true },
  { key: 'flight', icon: 'flight', name: 'Flight', kind: 'service' , home: true },

  // Malaysia worker / immigration services
  { key: 'visa', icon: 'visa', name: 'Visa', kind: 'webview' , home: true },
  { key: 'fomema', icon: 'fomema', name: 'FOMEMA', kind: 'webview' , home: true },
  { key: 'mydigital', icon: 'mydigital', name: 'Malaysia Arrival Card', kind: 'webview' , home: true },
  { key: 'passport', icon: 'passport', name: 'Passport', kind: 'webview' , home: true },

  // Other services
  { key: 'entertainment', icon: 'entertainment', name: 'Entertainment', kind: 'service' },
  { key: 'salary', icon: 'salary', name: 'Salary & Payslip', kind: 'salary' },
  { key: 'documents', icon: 'passport', name: 'Documents', kind: 'documents' },
  { key: 'moreFeaturesTile', icon: 'more', name: 'More Services', kind: 'moreFeaturesLink' },
];

const STAFF_SERVICES = {
  dealer: [
    { key: 'dealerFeatures', icon: 'more', name: 'Dealer Features', kind: 'dealerFeatures' },
    { key: 'topup', icon: 'topup', name: 'Top-Up', kind: 'topup' },
    { key: 'history', icon: 'history', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: 'support', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: 'account', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: 'profile', name: 'Profile', kind: 'profile' },
  ],
  reseller: [
    { key: 'resellerFeatures', icon: 'more', name: 'Reseller Features', kind: 'resellerFeatures' },
    { key: 'topup', icon: '💰', name: 'Top-Up', kind: 'topup' },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
  ],
  admin: [
    { key: 'adminFeatures', icon: 'more', name: 'Admin Features', kind: 'adminFeatures' },
    { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup' },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
  ],
  superadmin: [
    { key: 'adminFeatures', icon: '⚙️', name: 'Superadmin Features', kind: 'adminFeatures' },
    { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup' },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
  ],
};

function asSafeText(value, fallback = '') { return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback; }

export function Tile({ s, onPress, disabled }) {
  const { colors } = useTheme(); const { t } = useLanguage();
  const safeKey = asSafeText(s?.key, 'service');
  const translated = typeof t === 'function' ? t(`service.${safeKey}`, s?.name) : null;
  const label = asSafeText(translated, asSafeText(s?.name, safeKey));
  const icon = asSafeText(s?.icon, 'more');
  // Fixed colour per service. ServiceIcon actually strokes in this colour,
  // which RoyalIcon did not - its paths hardcoded gold and green, so the
  // accent only ever tinted the wash behind an identical illustration.
  // The reference outlines every card in the one brand colour rather than
  // per service, so nothing here reads serviceColor any more - the emoji
  // carries the colour, and the outline carries the brand.
  // A bus partner gets its own mark; everything else gets its emoji.
  const artKey = asSafeText(s?.key, icon);
  return <TouchableOpacity style={[styles.item, { borderColor: `${colors.primary}66`, backgroundColor: colors.card }, disabled && styles.itemDisabled]} activeOpacity={0.82} disabled={!!disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    {hasBusLogo(artKey)
      ? <View style={styles.logoWrap}><BusOperatorLogo operatorKey={artKey} size={32} /></View>
      : <Text style={styles.emoji} numberOfLines={1}>{serviceEmoji(artKey)}</Text>}
    <Text style={[styles.name, { color: colors.text || '#222' }]} numberOfLines={2}>{label}</Text>
  </TouchableOpacity>;
}

export function useServiceAction() {
  const { startService, openWebView, openBusPicker, openSalary, openMyDocuments, setScreen, gridManagement, setAdminTab, setAdminViewingSection } = useApp();
  return (s) => {
    if (!s || !gridManagementService.isGridActive(gridManagement, s.key)) return;
    if (s.kind === 'webview') return openWebView(s.key);
    if (s.kind === 'buspicker') return openBusPicker();
    if (s.kind === 'salary') return openSalary();
    if (s.kind === 'documents') return openMyDocuments();
    if (s.kind === 'rechargePin') return setScreen('rechargePin');
    if (s.kind === 'moreFeaturesLink') return setScreen('moreFeatures');
    if (s.kind === 'walletTransfer') return setScreen('transferPoints');
    if (s.kind === 'kyc') return setScreen('verifyIdentity');
    if (s.kind === 'support') return setScreen('support');
    if (s.kind === 'businessProfile') return setScreen('businessProfile');
    if (s.kind === 'billPayment') return setScreen('billPayment');
    if (s.kind === 'billpayment') return setScreen('billPayment');
    if (s.kind === 'history') return setScreen('history');
    if (s.kind === 'myaccount') return setScreen('myAccount');
    if (s.kind === 'profile') return setScreen('profile');
    if (s.kind === 'topup') return setScreen('topup');
    if (s.kind === 'adminTopup') return setScreen('superAdminTopup');
    if (s.kind === 'dealerFeatures') return setScreen('dealerFeatures');
    if (s.kind === 'resellerFeatures') return setScreen('resellerFeatures');
    if (s.kind === 'adminFeatures') return setScreen('adminFeatures');
    if (s.kind === 'staffSupport') return setScreen('adminSupport');
    if (s.kind === 'staffInquiries') { setAdminTab('inquiries'); setAdminViewingSection(true); return setScreen('adminHome'); }
    if (s.kind === 'staffReports') return setScreen('reports');
    return startService(s.key);
  };
}

// Support Agent and Finance tiles come from what the person can actually do
// - their role defaults plus any overrides - so a finance user granted
// support gets the Support Inbox too. `needs` is any-of.
const STAFF_CAPABILITY_TILES = [
  { key: 'adminSupport', icon: '🎧', name: 'Support Inbox', kind: 'staffSupport', needs: ['support'] },
  { key: 'inquiries', icon: '🗺️', name: 'Inquiries', kind: 'staffInquiries', needs: ['support'] },
  { key: 'history', icon: '📋', name: 'Transactions', kind: 'history', needs: ['orders', 'finance'] },
  { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup', needs: ['finance'] },
  { key: 'reports', icon: '📊', name: 'Reports', kind: 'staffReports', needs: ['reports'] },
  { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
  { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
];

// Admin keeps its hub; the money tiles appear only with finance/orders.
const ADMIN_TILE_NEEDS = { topup: ['finance'], history: ['orders', 'finance'] };

export const PRIMARY_SERVICES = CUSTOMER_SERVICES;

// `homeOnly` draws just the tiles flagged `home: true`, for the home screen.
// The customer list is 17 tiles - the whole catalogue, every time, before
// anything else on the page gets a look in. The Services tab renders the full
// grid (BottomNav maps 'services' to the moreFeatures screen), so home shows
// the flagged set and hands off, always ending on More Services.
export default function ServiceGrid({ homeOnly }) {
  const { colors } = useTheme(); const { webViewBusy, profile, gridManagement, can } = useApp();
  const handlePress = useServiceAction(); const role = profile?.role || 'customer';
  const isStaff = ['dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin'].includes(role);
  const allServices = !isStaff ? CUSTOMER_SERVICES
    : role === 'support' || role === 'finance'
      ? STAFF_CAPABILITY_TILES.filter((t) => !t.needs || t.needs.some((cap) => can(cap)))
      : role === 'admin'
        ? STAFF_SERVICES.admin.filter((t) => !ADMIN_TILE_NEEDS[t.key] || ADMIN_TILE_NEEDS[t.key].some((cap) => can(cap)))
        : (STAFF_SERVICES[role] || STAFF_SERVICES.admin);
  const gridKeyFor = (service) => ({ buspicker: 'bus', webview: service.key, adminFeatures: 'adminFeatures', dealerFeatures: 'dealerFeatures', resellerFeatures: 'resellerFeatures', adminTopup: 'topup' }[service.kind] || service.key);
  const active = allServices.filter((service) => gridManagementService.isGridActive(gridManagement, gridKeyFor(service)));
  const moreTile = active.find((service) => service.kind === 'moreFeaturesLink');
  // homeOnly keeps the tiles flagged for the home screen, in declaration
  // order, and always ends on More Services so nothing dropped is stranded.
  // A staff list carries no home flags, so it falls back to the full set
  // rather than rendering an empty grid.
  const flagged = active.filter((service) => service.home);
  const services = !homeOnly || flagged.length === 0
    ? active
    : [...flagged, ...(moreTile ? [moreTile] : [])];
  return <View><View style={styles.sectionHead}><Text style={[styles.sectionTitle, { color: colors.navy || colors.text }]}>{isStaff ? 'Management Dashboard' : 'Quick Services'}</Text><Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{isStaff ? 'Manage transactions, accounts and operations' : 'Money, remittance and travel'}</Text></View><View style={[styles.gridCanvas, { backgroundColor: colors.canvasBg || colors.surface }]}><View style={styles.grid}>{services.map((service) => <Tile key={service.key} s={service} disabled={service.kind === 'webview' && !!webViewBusy} onPress={() => handlePress(service)} />)}</View></View></View>;
}

const styles = StyleSheet.create({ sectionHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }, sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: 0.2 }, sectionSubtitle: { fontSize: 11, marginTop: 2 }, gridCanvas: { marginHorizontal: 4, padding: 10, borderRadius: 18 }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, item: { width: '23%', minHeight: 88, marginBottom: 10, paddingHorizontal: 2, paddingVertical: 10, borderWidth: 1.5, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 }, itemDisabled: { opacity: 0.45 }, emoji: { fontSize: 30, lineHeight: 36, marginBottom: 6, textAlign: 'center' }, logoWrap: { height: 36, marginBottom: 6, alignItems: 'center', justifyContent: 'center' }, iconText: { fontSize: 28 }, name: { fontSize: 10.5, lineHeight: 13, fontWeight: '700', textAlign: 'center' } });