import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { iconFor, iconRenderFor } from '../theme/iconSets';
import { radius, shadows, fonts } from '../theme/theme';
import { useLanguage } from '../i18n/LanguageContext';

const CUSTOMER_SERVICES = [
  { key: 'recharge', icon: '📱', name: 'Recharge', kind: 'service' },
  { key: 'mobilebanking', icon: '🏦', name: 'Mobile Banking', kind: 'service' },
  { key: 'internet', icon: '📡', name: 'Internet', kind: 'service' },
  { key: 'remittance', icon: '💸', name: 'Remittance', kind: 'service' },
  { key: 'billpayment', icon: '🧾', name: 'Bill Payment', kind: 'service' },
  { key: 'bus', icon: '🚌', name: 'Bus', kind: 'buspicker' },
  { key: 'train', icon: '🚆', name: 'Train', kind: 'webview' },
  { key: 'flight', icon: '✈️', name: 'Flight', kind: 'service' },
  { key: 'fomema', icon: '🏥', name: 'FOMEMA', kind: 'webview' },
  { key: 'visa', icon: '🛂', name: 'Visa Malaysia', kind: 'webview' },
  { key: 'mydigital', icon: '🛬', name: 'Malaysia Arrival Card', kind: 'webview' },
  { key: 'passport', icon: '📔', name: 'Passport', kind: 'webview' },
  { key: 'moreFeaturesTile', icon: '✨', name: 'More Features', kind: 'moreFeaturesLink' },
];

const STAFF_SERVICES = {
  dealer: [
    { key: 'dealerFeatures', icon: '🛠️', name: 'Dealer Features', kind: 'dealerFeatures' },
    { key: 'topup', icon: '💰', name: 'Top-Up', kind: 'topup' },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
  ],
  reseller: [
    { key: 'resellerFeatures', icon: '🛠️', name: 'Reseller Features', kind: 'resellerFeatures' },
    { key: 'topup', icon: '💰', name: 'Top-Up', kind: 'topup' },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
  ],
  admin: [
    { key: 'adminFeatures', icon: '🛠️', name: 'Admin Features', kind: 'adminFeatures' },
    { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup' },
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
  ],
  // Support Agent: support queues only - no orders, money or configuration.
  support: [
    { key: 'adminSupport', icon: '🎧', name: 'Support Inbox', kind: 'staffSupport' },
    { key: 'inquiries', icon: '🗺️', name: 'Inquiries', kind: 'staffInquiries' },
    { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
    { key: 'profile', icon: '🪪', name: 'Profile', kind: 'profile' },
  ],
  // Finance: payments, reconciliation and reporting. Order handling belongs
  // to the operators, so there is no queue tile here.
  finance: [
    { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
    { key: 'topup', icon: '💰', name: 'Top-Ups', kind: 'adminTopup' },
    { key: 'reports', icon: '📊', name: 'Reports', kind: 'staffReports' },
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
  const { colors, iconStyle } = useTheme();
  const { t } = useLanguage();
  const safeKey = asSafeText(s?.key, 'service');
  const translated = typeof t === 'function' ? t(`service.${safeKey}`, s?.name) : null;
  const label = asSafeText(translated, asSafeText(s?.name, safeKey));
  const iconRender = iconRenderFor(iconStyle);
  const icon = asSafeText(iconFor(safeKey, iconStyle, s?.icon), '•');
  const accent = asSafeText(s?.accent, colors.primary || '#1A73E8');
  return <TouchableOpacity style={[styles.item, { backgroundColor: colors.tileBg, borderColor: `${accent}45` }, disabled && styles.itemDisabled]} activeOpacity={0.82} disabled={!!disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}><Text style={[styles.iconText, { color: accent, fontSize: 25 * iconRender.scale, fontWeight: iconRender.weight }]}>{icon}</Text></View>
    <Text style={[styles.name, { color: colors.text || '#222' }]} numberOfLines={2}>{label}</Text>
  </TouchableOpacity>;
}

export function useServiceAction() {
  const { startService, openWebView, openBusPicker, openSalary, openMyDocuments, setScreen } = useApp();
  return (s) => {
    if (!s) return;
    if (s.kind === 'webview') return openWebView(s.key);
    if (s.kind === 'buspicker') return openBusPicker();
    if (s.kind === 'salary') return openSalary();
    if (s.kind === 'documents') return openMyDocuments();
    if (s.kind === 'moreFeaturesLink') return setScreen('moreFeatures');
    if (s.kind === 'walletTransfer') return setScreen('transferPoints');
    if (s.kind === 'kyc') return setScreen('verifyIdentity');
    if (s.kind === 'support') return setScreen('support');
    if (s.kind === 'history') return setScreen('history');
    if (s.kind === 'myaccount') return setScreen('myAccount');
    if (s.kind === 'profile') return setScreen('profile');
    if (s.kind === 'topup') return setScreen('topup');
    if (s.kind === 'adminTopup') return setScreen('superAdminTopup');
    if (s.kind === 'dealerFeatures') return setScreen('dealerFeatures');
    if (s.kind === 'resellerFeatures') return setScreen('resellerFeatures');
    if (s.kind === 'adminFeatures') return setScreen('adminFeatures');
    if (s.kind === 'staffSupport') return setScreen('adminSupport');
    if (s.kind === 'staffInquiries') return setScreen('adminHome');
    if (s.kind === 'staffReports') return setScreen('reports');
    return startService(s.key);
  };
}

export const PRIMARY_SERVICES = CUSTOMER_SERVICES;

export default function ServiceGrid() {
  const { colors } = useTheme();
  const { webViewBusy, profile } = useApp();
  const handlePress = useServiceAction();
  const role = profile?.role || 'customer';
  const isStaff = ['dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin'].includes(role);
  const services = isStaff ? (STAFF_SERVICES[role] || STAFF_SERVICES.admin) : CUSTOMER_SERVICES;
  return <View>
    <View style={styles.sectionHead}><Text style={[styles.sectionTitle, { color: colors.text || '#222' }]}>{isStaff ? 'Management Dashboard' : 'Services'}</Text><Text style={[styles.sectionSubtitle, { color: colors.muted || '#6B7280' }]}>{isStaff ? 'Manage transactions, accounts and operations' : 'Banking • Remittance • Payments • Travel'}</Text></View>
    <View style={[styles.gridCanvas, { backgroundColor: colors.canvasBg }]}><View style={styles.grid}>{services.map((service) => <Tile key={service.key} s={service} disabled={service.kind === 'webview' && !!webViewBusy} onPress={() => handlePress(service)} />)}</View></View>
  </View>;
}

const styles = StyleSheet.create({
  sectionHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  sectionTitle: { fontSize: 19, fontWeight: '700', fontFamily: fonts.serif, letterSpacing: 0.2 }, sectionSubtitle: { fontSize: 11, marginTop: 2 },
  gridCanvas: { marginHorizontal: 10, padding: 10, borderRadius: radius.card },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  item: { width: '23.5%', minHeight: 92, marginBottom: 8, paddingHorizontal: 4, paddingVertical: 9, borderWidth: 1.5, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  itemDisabled: { opacity: 0.45 }, iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }, iconText: { fontSize: 25 }, name: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
});
