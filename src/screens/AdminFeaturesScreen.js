import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import FeatureGrid from '../components/FeatureGrid';
import PromptModal from '../components/PromptModal';
import * as ratesService from '../firebase/ratesService';
import { FEATURE_DEFS, canAccessFeature } from '../firebase/featureAccessService';

const DASHBOARD_TOOL_DEFS = [
  { key: 'all', icon: '📋', bg: '#E3F2FD', name: 'All Transactions', roles: ['admin', 'superadmin'] },
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending', roles: ['admin', 'superadmin'] },
  { key: 'inquiries', icon: '📝', bg: '#E8EAF6', name: 'Inquiries', roles: ['admin', 'superadmin'] },
  { key: 'topups', icon: '💰', bg: '#E8F5E9', name: 'Top-Ups', roles: ['admin', 'superadmin'] },
  { key: 'rates', icon: '💱', bg: '#F3E5F5', name: 'Rates', roles: ['admin', 'superadmin'] },
  { key: 'pricing', icon: '🏷️', bg: '#FFF3E0', name: 'Pricing', roles: ['admin', 'superadmin'] },
  { key: 'payments', icon: '💳', bg: '#E1F5FE', name: 'Payments', roles: ['admin', 'superadmin'] },
  { key: 'categories', icon: '🗂️', bg: '#EDE7F6', name: 'Categories', roles: ['admin', 'superadmin'] },
  { key: 'support', icon: '🎧', bg: '#E0F2F1', name: 'Support', roles: ['admin', 'superadmin'] },
  { key: 'banners', icon: '🖼️', bg: '#FFF0F0', name: 'Banners', roles: ['admin', 'superadmin'] },
  { key: 'announcements', icon: '📣', bg: '#E0F7FA', name: 'Announcements', roles: ['admin', 'superadmin'] },
];

const MOBILE_RATE_FIELDS = [{ key: 'mobileBanking', label: '📱 Mobile Banking — 1 MYR = BDT' }];
const REMITTANCE_RATE_FIELDS = [
  { key: 'remittanceFee', label: '💸 Remittance Transfer Fee — MYR' },
  { key: 'remittanceBD_ACC', label: '🇧🇩 Remittance BDT — Bank Account' },
  { key: 'remittanceBD_CASH', label: '🇧🇩 Remittance BDT — Cash Pickup' },
  { key: 'remittanceNP', label: '🇳🇵 Remittance NPR' },
  { key: 'remittancePK', label: '🇵🇰 Remittance PKR' },
  { key: 'remittancePH', label: '🇵🇭 Remittance PHP' },
  { key: 'remittanceLK', label: '🇱🇰 Remittance LKR' },
  { key: 'remittanceIN', label: '🇮🇳 Remittance INR' },
  { key: 'remittanceID', label: '🇮🇩 Remittance IDR' },
  { key: 'remittanceMM', label: '🇲🇲 Remittance MMK' },
];
const RECHARGE_RATE_FIELDS = [
  { key: 'rechargeBD', label: '🇧🇩 Recharge/Internet — BDT' },
  { key: 'rechargeIN', label: '🇮🇳 Recharge/Internet — INR' },
  { key: 'rechargeNP', label: '🇳🇵 Recharge/Internet — NPR' },
  { key: 'rechargeID', label: '🇮🇩 Recharge/Internet — IDR' },
  { key: 'rechargePK', label: '🇵🇰 Recharge/Internet — PKR' },
  { key: 'rechargeMM', label: '🇲🇲 Recharge/Internet — MMK' },
  { key: 'rechargePH', label: '🇵🇭 Recharge/Internet — PHP' },
  { key: 'rechargeKH', label: '🇰🇭 Recharge/Internet — KHR' },
];

export default function AdminFeaturesScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome, setScreen, dealerTxs, inquiries, topups, setAdminTab, setAdminViewingSection, featureAccess, rates } = useApp();
  const [rateView, setRateView] = useState(false);
  const [editRateKey, setEditRateKey] = useState(null);

  const tools = FEATURE_DEFS.filter((t) => profile && canAccessFeature(featureAccess, t.key, profile.role));
  const dashboardBadges = {
    pending: dealerTxs.filter((t) => t.status === 'pending').length || undefined,
    inquiries: inquiries.filter((i) => (i.status || 'new') === 'new').length || undefined,
    topups: topups.filter((t) => t.status === 'pending').length || undefined,
  };
  const dashboardTools = DASHBOARD_TOOL_DEFS
    .filter((t) => profile && t.roles.includes(profile.role))
    .map((t) => ({ ...t, badge: dashboardBadges[t.key] }));

  const openDashboardTile = (key) => {
    if (key === 'rates') { setRateView(true); return; }
    setAdminTab(key);
    setAdminViewingSection(true);
    setScreen('adminHome');
  };

  const saveRate = async (value) => {
    const key = editRateKey;
    setEditRateKey(null);
    const num = Number(value);
    if (!key || !Number.isFinite(num) || num <= 0) return;
    try { await ratesService.updateRate(key, num); } catch (e) { /* permission is enforced by service/rules */ }
  };

  const renderRateRows = (fields) => fields.map((field) => (
    <View key={field.key} style={styles.rateRow}>
      <Text style={styles.rateLabel}>{field.label}</Text>
      <Text style={styles.rateValue}>{rates[field.key] ?? '—'}</Text>
      <TouchableOpacity style={styles.editBtn} onPress={() => setEditRateKey(field.key)}><Text style={styles.editBtnText}>Edit</Text></TouchableOpacity>
    </View>
  ));

  if (rateView) {
    const isSuperadmin = profile?.role === 'superadmin';
    return (
      <View style={styles.screen}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <HeaderDecor />
          <TouchableOpacity style={styles.backBtn} onPress={() => setRateView(false)}><Text style={styles.backText}>←</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>💱 {isSuperadmin ? 'Superadmin Rate Management' : 'Admin Rate Management'}</Text>
        </LinearGradient>
        <ScrollView contentContainerStyle={styles.rateContent}>
          <View style={styles.infoCard}><Text style={styles.infoTitle}>Service-specific rates</Text><Text style={styles.infoText}>Mobile Banking, Remittance, and Recharge/Internet use separate rate tables.</Text></View>
          <View style={styles.card}><Text style={styles.cardTitle}>📱 Mobile Banking</Text>{renderRateRows(MOBILE_RATE_FIELDS)}</View>
          <View style={styles.card}><Text style={styles.cardTitle}>💸 Remittance</Text>{renderRateRows(REMITTANCE_RATE_FIELDS)}</View>
          {isSuperadmin && <View style={styles.card}><Text style={styles.cardTitle}>🔄 Recharge / Internet</Text>{renderRateRows(RECHARGE_RATE_FIELDS)}</View>}
          {!isSuperadmin && <View style={styles.lockedCard}><Text style={styles.lockedTitle}>🔒 Recharge / Internet rates</Text><Text style={styles.hintText}>Superadmin controls these rates.</Text></View>}
        </ScrollView>
        <PromptModal visible={!!editRateKey} title="New rate value:" placeholder="e.g. 30.50" onSubmit={saveRate} onCancel={() => setEditRateKey(null)} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>🛠️ {profile?.role === 'superadmin' ? 'Superadmin Features' : 'Admin Features'}</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 30 }}>
        <FeatureGrid title="📊 Operations & Finance" items={dashboardTools} onPress={openDashboardTile} />
        <FeatureGrid title="🛠️ Management" items={tools} onPress={(key) => setScreen(key)} />
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 }, backText: { color: 'white', fontSize: 20 }, headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    rateContent: { padding: 14, paddingBottom: 30 }, infoCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
    infoTitle: { color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 6 }, infoText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border }, cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 4 },
    rateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, rateLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '600' }, rateValue: { color: colors.primary, fontWeight: '800', marginHorizontal: 8 },
    editBtn: { backgroundColor: colors.primary, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 8 }, editBtnText: { color: 'white', fontSize: 11, fontWeight: '700' }, hintText: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 8 },
    lockedCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }, lockedTitle: { color: colors.text, fontWeight: '800', fontSize: 14 },
  });
}
