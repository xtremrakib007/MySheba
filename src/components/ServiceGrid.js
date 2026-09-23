import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';
import * as gridManagementService from '../firebase/gridManagementService';
import RoyalIcon from './RoyalIcon';

const CUSTOMER_SERVICES = [
  // Money & connectivity
  { key: 'recharge', icon: 'recharge', name: 'Mobile Top-Up', kind: 'service' },
  { key: 'internet', icon: 'internet', name: 'Internet (Data & Voice)', kind: 'service' },
  { key: 'rechargePin', icon: 'recharge', name: 'PIN Generate', kind: 'rechargePin' },
  { key: 'billpayment', icon: 'billpayment', name: 'Bill Payment', kind: 'service' },
  { key: 'mobilebanking', icon: 'mobilebanking', name: 'Mobile Banking', kind: 'service' },
  { key: 'remittance', icon: 'remittance', name: 'Remittance', kind: 'service' },

  // Travel
  { key: 'bus', icon: 'bus', name: 'Bus', kind: 'buspicker' },
  { key: 'train', icon: 'train', name: 'Train', kind: 'webview' },
  { key: 'flight', icon: 'flight', name: 'Flight', kind: 'service' },

  // Malaysia worker / immigration services
  { key: 'visa', icon: 'visa', name: 'Visa', kind: 'webview' },
  { key: 'fomema', icon: 'fomema', name: 'FOMEMA', kind: 'webview' },
  { key: 'mydigital', icon: 'mydigital', name: 'Malaysia Arrival Card', kind: 'webview' },
  { key: 'passport', icon: 'passport', name: 'Passport', kind: 'webview' },

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
  const icon = asSafeText(s?.icon, 'more'); const accent = asSafeText(s?.accent, colors.primary || '#1A73E8');
  return <TouchableOpacity style={[styles.item, { borderColor: colors.tileBorder || `${accent}45`, backgroundColor: colors.tileBg || colors.card }, disabled && styles.itemDisabled]} activeOpacity={0.82} disabled={!!disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}><RoyalIcon name={icon} size={52} /></View>
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
    return startService(s.key);
  };
}

export const PRIMARY_SERVICES = CUSTOMER_SERVICES;

export default function ServiceGrid({ extraTiles = [] }) {
  const { colors } = useTheme();
  const { webViewBusy, profile, gridManagement } = useApp();
  const handlePress = useServiceAction();
  const role = profile?.role || 'customer';
  const isStaff = ['dealer', 'reseller', 'admin', 'superadmin'].includes(role);

  const gridKeyFor = (service) => ({
    buspicker: 'bus',
    webview: service.key,
    adminFeatures: 'adminFeatures',
    dealerFeatures: 'dealerFeatures',
    resellerFeatures: 'resellerFeatures',
    adminTopup: 'topup',
  }[service.kind] || service.key);

  // Admin/Superadmin and other staff keep the full MySheba service catalogue.
  // Their role-specific operational tools are displayed in a separate section.
  const serviceItems = CUSTOMER_SERVICES.filter((service) =>
    gridManagementService.isGridActive(gridManagement, gridKeyFor(service))
  );

  const managementItems = isStaff
    ? [
        ...(STAFF_SERVICES[role] || STAFF_SERVICES.admin),
        ...extraTiles.map((tile) => ({ ...tile, kind: tile.kind || 'adminFeatures' })),
      ].filter((service, index, arr) =>
        arr.findIndex((item) => item.key === service.key) === index &&
        gridManagementService.isGridActive(gridManagement, gridKeyFor(service))
      )
    : [];

  const renderGrid = (items) => (
    <View style={[styles.gridCanvas, { backgroundColor: colors.canvasBg || colors.surface }]}>
      <View style={styles.grid}>
        {items.map((service) => (
          <Tile
            key={service.key}
            s={service}
            disabled={service.kind === 'webview' && !!webViewBusy}
            onPress={() => service.onPress ? service.onPress() : handlePress(service)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.navy || colors.text }]}>
          {isStaff ? 'MySheba Services' : 'Quick Services'}
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          {isStaff ? 'Top-up, Internet & Voice, Bill Payment, Remittance and more' : 'Money, remittance and travel'}
        </Text>
      </View>
      {renderGrid(serviceItems)}

      {isStaff && managementItems.length > 0 && (
        <>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.navy || colors.text }]}>Management Dashboard</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Manage transactions, accounts and operations
            </Text>
          </View>
          {renderGrid(managementItems)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ sectionHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }, sectionTitle: { fontFamily: 'serif', fontSize: 22, fontWeight: '700' }, sectionSubtitle: { fontSize: 11, marginTop: 2 }, gridCanvas: { marginHorizontal: 4, padding: 12, borderRadius: 22 }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, item: { width: '31.5%', minHeight: 124, marginBottom: 10, paddingHorizontal: 4, paddingVertical: 12, borderWidth: 1.5, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#0A5C78', shadowOpacity: 0.16, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, itemDisabled: { opacity: 0.45 }, iconWrap: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1.5, borderColor: '#19C39B' }, iconText: { fontSize: 28 }, name: { fontSize: 11.5, lineHeight: 15, fontWeight: '600', textAlign: 'center' } });