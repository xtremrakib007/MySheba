import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import FeatureGrid from '../components/FeatureGrid';
import { FEATURE_DEFS, canAccessFeature } from '../firebase/featureAccessService';

const FEATURE_ACCESS_TILE = { key: 'featureAccess', icon: '🔐', bg: '#EDE7F6', name: 'Feature Access' };
const USER_MANAGEMENT_TILE = { key: 'userManagement', icon: '🧑‍💼', bg: '#E3F2FD', name: 'User Management' };
const KYC_MANAGEMENT_TILE = { key: 'verificationManagement', icon: '🪪', bg: '#E8F5E9', name: 'KYC Verification' };
const AD_CONTROLS_TILE = { key: 'adFeatureControls', icon: '📢', bg: '#FFF3E0', name: 'Feature Ad Controls' };
const BANNER_MANAGEMENT_TILE = { key: 'bannerManagement', icon: '🖼️', bg: '#E8F5E9', name: 'Banner Management' };
const ADVERTISER_MANAGEMENT_TILE = { key: 'advertiserManagement', icon: '🏢', bg: '#EDE7F6', name: 'Advertiser Management' };
const AD_ANALYTICS_TILE = { key: 'adAnalytics', icon: '📊', bg: '#E1F5FE', name: 'Ad Analytics' };
const AD_PACKAGES_TILE = { key: 'adPackagesManagement', icon: '📦', bg: '#FBE9E7', name: 'Ad Packages' };
const AD_PAYMENTS_TILE = { key: 'adPaymentsManagement', icon: '💳', bg: '#E0F7FA', name: 'Ad Payments' };
const API_PROVIDER_TILE = { key: 'apiProviderManagement', icon: '🔌', bg: '#E8F5E9', name: 'API Management' };
const TIER_PROMOTIONS_TILE = { key: 'tierPromotions', icon: '🏆', bg: '#FFF8E1', name: 'Tier Promotions' };

const DASHBOARD_TOOL_DEFS = [
  { key: 'all', icon: '📋', bg: '#E3F2FD', name: 'All Tx', roles: ['admin', 'superadmin'] },
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending', roles: ['admin', 'superadmin'] },
  { key: 'inquiries', icon: '✈️', bg: '#E8EAF6', name: 'Inquiries', roles: ['admin', 'superadmin'] },
  { key: 'topups', icon: '💰', bg: '#E8F5E9', name: 'Top-Ups', roles: ['admin', 'superadmin'] },
  { key: 'chats', icon: '💬', bg: '#FCE4EC', name: 'Chats', roles: ['admin', 'superadmin'] },
  { key: 'rates', icon: '💱', bg: '#F3E5F5', name: 'Rates', roles: ['admin', 'superadmin'] },
  { key: 'pricing', icon: '🏷️', bg: '#FFF3E0', name: 'Pricing', roles: ['admin', 'superadmin'] },
  { key: 'payments', icon: '💳', bg: '#E1F5FE', name: 'Payments', roles: ['admin', 'superadmin'] },
  { key: 'categories', icon: '🗂️', bg: '#EDE7F6', name: 'Categories', roles: ['admin', 'superadmin'] },
  { key: 'support', icon: '☎️', bg: '#E0F2F1', name: 'Support', roles: ['admin', 'superadmin'] },
  { key: 'banners', icon: '🖼️', bg: '#FFF0F0', name: 'Banners', roles: ['admin', 'superadmin'] },
  { key: 'announcements', icon: '📣', bg: '#E0F7FA', name: 'Announce', roles: ['admin', 'superadmin'] },
];

export default function AdminFeaturesScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome, setScreen, dealerTxs, inquiries, topups, setAdminTab, setAdminViewingSection, featureAccess } = useApp();
  const isSuperadmin = profile?.role === 'superadmin';
  const canManageUsers = !!profile && canAccessFeature(featureAccess, 'userManagement', profile.role);
  const canManageKyc = !!profile && ['admin', 'superadmin'].includes(profile.role);
  const tools = FEATURE_DEFS.filter((t) => t.key !== 'userManagement' && profile && canAccessFeature(featureAccess, t.key, profile.role));
  if (profile && profile.role === 'superadmin') tools.push(FEATURE_ACCESS_TILE);
  if (profile && profile.role === 'superadmin') tools.push(TIER_PROMOTIONS_TILE);

  const pendingCount = dealerTxs.filter((t) => t.status === 'pending').length;
  const inquiryCount = inquiries.filter((i) => (i.status || 'new') === 'new').length;
  const topupCount = topups.filter((t) => t.status === 'pending').length;
  const dashboardBadges = { pending: pendingCount || undefined, inquiries: inquiryCount || undefined, topups: topupCount || undefined };
  const dashboardTools = DASHBOARD_TOOL_DEFS.filter((t) => profile && t.roles.includes(profile.role)).map((t) => ({ ...t, badge: dashboardBadges[t.key] }));
  if (canManageUsers) dashboardTools.unshift(USER_MANAGEMENT_TILE);
  if (canManageKyc) dashboardTools.splice(1, 0, KYC_MANAGEMENT_TILE);

  const openDashboardTile = (key) => {
    if (key === 'chats') { setScreen('chatList'); return; }
    if (key === 'userManagement' || key === 'verificationManagement') { setScreen(key); return; }
    setAdminTab(key);
    setAdminViewingSection(true);
    setScreen('adminHome');
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isSuperadmin ? 'SuperAdmin Control Center' : 'Admin Control Center'}</Text>
          <Text style={styles.headerSubtitle}>{isSuperadmin ? 'Full platform management' : 'Operational management'}</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 30 }}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>📊 Live Operations</Text>
          <View style={styles.summaryGrid}>
            <SummaryItem colors={colors} label="Pending" value={pendingCount} />
            <SummaryItem colors={colors} label="New Inquiries" value={inquiryCount} />
            <SummaryItem colors={colors} label="Pending Top-Ups" value={topupCount} />
            <SummaryItem colors={colors} label="Access" value={isSuperadmin ? 'SUPER' : 'ADMIN'} />
          </View>
        </View>

        <FeatureGrid title="⚡ Quick Operations" items={dashboardTools} onPress={openDashboardTile} />
        <FeatureGrid title="💰 Financial Management" items={dashboardTools.filter((t) => ['all', 'pending', 'topups', 'rates', 'pricing', 'payments'].includes(t.key))} onPress={openDashboardTile} />
        <FeatureGrid title="🛠️ Management Tools" items={tools} onPress={(key) => setScreen(key)} />
        {isSuperadmin && (
          <>
            <FeatureGrid title="📢 Advertisement" items={[AD_CONTROLS_TILE, BANNER_MANAGEMENT_TILE, ADVERTISER_MANAGEMENT_TILE, AD_PACKAGES_TILE, AD_PAYMENTS_TILE, AD_ANALYTICS_TILE]} onPress={(key) => setScreen(key)} />
            <FeatureGrid title="🔌 Service APIs" items={[API_PROVIDER_TILE]} onPress={(key) => setScreen(key)} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryItem({ colors, label, value }) {
  return (
    <View style={[summaryItemStyles.item, { backgroundColor: colors.bg }]}>
      <Text style={[summaryItemStyles.value, { color: colors.text }]}>{value}</Text>
      <Text style={[summaryItemStyles.label, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const summaryItemStyles = StyleSheet.create({
  item: { width: '48%', paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8, borderRadius: 12 },
  value: { fontWeight: '800', fontSize: 20 },
  label: { fontSize: 12, marginTop: 3 },
});

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '700', fontSize: 17, marginLeft: 10 },
    headerSubtitle: { color: 'white', opacity: 0.9, fontSize: 12, marginLeft: 10, marginTop: 2 },
    summaryCard: { marginHorizontal: 14, marginBottom: 8, padding: 14, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    summaryTitle: { color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 12 },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  });
}
