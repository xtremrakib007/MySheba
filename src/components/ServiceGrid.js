import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';
import * as gridManagementService from '../firebase/gridManagementService';

const CUSTOMER_SERVICES = [
  { key: 'recharge', icon: '📱', name: 'Recharge', kind: 'service' },
  { key: 'mobilebanking', icon: '🏦', name: 'Mobile Banking', kind: 'service' },
  { key: 'internet', icon: '📡', name: 'Internet', kind: 'service' },
  { key: 'billpayment', icon: '🧾', name: 'Bill Payment', kind: 'service' },
  { key: 'remittance', icon: '💸', name: 'Remittance', kind: 'service' },
  { key: 'bus', icon: '🚌', name: 'Bus', kind: 'buspicker' },
  { key: 'train', icon: '🚆', name: 'Train', kind: 'webview' },
  { key: 'flight', icon: '✈️', name: 'Flight', kind: 'service' },
  { key: 'entertainment', icon: '🎮', name: 'Entertainment', kind: 'service' },
  { key: 'moreFeaturesTile', icon: '✨', name: 'More Services', kind: 'moreFeaturesLink' },
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
  const icon = asSafeText(s?.icon, '•'); const accent = asSafeText(s?.accent, colors.primary || '#1A73E8');
  return <TouchableOpacity style={[styles.item, { borderColor: colors.tileBorder || `${accent}45`, backgroundColor: colors.tileBg || colors.card }, disabled && styles.itemDisabled]} activeOpacity={0.82} disabled={!!disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}><Text style={[styles.iconText, { color: accent }]}>{icon}</Text></View>
    <Text style={[styles.name, { color: colors.text || '#222' }]} numberOfLines={2}>{label}</Text>
  </TouchableOpacity>;
}

export function useServiceAction() {
  const { startService, openWebView, openBusPicker, openSalary, openMyDocuments, setScreen, gridManagement } = useApp();
  return (s) => {
    if (!s || !gridManagementService.isGridActive(gridManagement, s.key)) return;
    if (s.kind === 'webview') return openWebView(s.key);
    if (s.kind === 'buspicker') return openBusPicker();
    if (s.kind === 'salary') return openSalary();
    if (s.kind === 'documents') return openMyDocuments();
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
    return startService(s.key);
  };
}

export const PRIMARY_SERVICES = CUSTOMER_SERVICES;

export default function ServiceGrid() {
  const { colors } = useTheme(); const { webViewBusy, profile, gridManagement } = useApp();
  const handlePress = useServiceAction(); const role = profile?.role || 'customer';
  const isStaff = ['dealer', 'reseller', 'admin', 'superadmin'].includes(role);
  const allServices = isStaff ? (STAFF_SERVICES[role] || STAFF_SERVICES.admin) : CUSTOMER_SERVICES;
  const gridKeyFor = (service) => ({ buspicker: 'bus', webview: service.key, adminFeatures: 'adminFeatures', dealerFeatures: 'dealerFeatures', resellerFeatures: 'resellerFeatures', adminTopup: 'topup' }[service.kind] || service.key);
  const services = allServices.filter((service) => gridManagementService.isGridActive(gridManagement, gridKeyFor(service)));
  return <View><View style={styles.sectionHead}><Text style={[styles.sectionTitle, { color: colors.navy || colors.text }]}>{isStaff ? 'Management Dashboard' : 'Quick Services'}</Text><Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{isStaff ? 'Manage transactions, accounts and operations' : 'Money, remittance and travel'}</Text></View><View style={[styles.gridCanvas, { backgroundColor: colors.canvasBg || colors.surface }]}><View style={styles.grid}>{services.map((service) => <Tile key={service.key} s={service} disabled={service.kind === 'webview' && !!webViewBusy} onPress={() => handlePress(service)} />)}</View></View></View>;
}

const styles = StyleSheet.create({ sectionHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }, sectionTitle: { fontFamily: 'serif', fontSize: 22, fontWeight: '700' }, sectionSubtitle: { fontSize: 11, marginTop: 2 }, gridCanvas: { marginHorizontal: 4, padding: 12, borderRadius: 22 }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, item: { width: '31.5%', minHeight: 124, marginBottom: 10, paddingHorizontal: 4, paddingVertical: 12, borderWidth: 1.5, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#0A5C78', shadowOpacity: 0.16, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, itemDisabled: { opacity: 0.45 }, iconWrap: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1.5, borderColor: '#19C39B' }, iconText: { fontSize: 28 }, name: { fontSize: 11.5, lineHeight: 15, fontWeight: '600', textAlign: 'center' } });