import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import FeatureGrid from '../components/FeatureGrid';
import { FEATURE_DEFS, canAccessFeature } from '../firebase/featureAccessService';

const FEATURE_ACCESS_TILE = { key: 'featureAccess', icon: '🔐', bg: '#EDE7F6', name: 'Feature Access' };
const TIER_PROMOTIONS_TILE = { key: 'tierPromotions', icon: '🏆', bg: '#FFF8E1', name: 'Tier Promotions' };
const AD_CONTROLS_TILE = { key: 'adFeatureControls', icon: '📢', bg: '#FFF3E0', name: 'Feature Ad Controls' };
const BANNER_MANAGEMENT_TILE = { key: 'bannerManagement', icon: '🖼️', bg: '#E8F5E9', name: 'Banner Management' };
const ADVERTISER_MANAGEMENT_TILE = { key: 'advertiserManagement', icon: '🏢', bg: '#EDE7F6', name: 'Advertiser Management' };
const AD_ANALYTICS_TILE = { key: 'adAnalytics', icon: '📊', bg: '#E1F5FE', name: 'Ad Analytics' };
const AD_PACKAGES_TILE = { key: 'adPackagesManagement', icon: '📦', bg: '#FBE9E7', name: 'Ad Packages' };
const AD_PAYMENTS_TILE = { key: 'adPaymentsManagement', icon: '💳', bg: '#E0F7FA', name: 'Ad Payments' };
const API_PROVIDER_TILE = { key: 'apiProviderManagement', icon: '🔌', bg: '#E8F5E9', name: 'API Management' };

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
  const tools = FEATURE_DEFS.filter((t) => profile && canAccessFeature(featureAccess, t.key, profile.role));
  if (profile && profile.role === 'superadmin') tools.push(FEATURE_ACCESS_TILE, TIER_PROMOTIONS_TILE);
  const dashboardBadges = {
    pending: dealerTxs.filter((t) => t.status === 'pending').length || undefined,
    inquiries: inquiries.filter((i) => (i.status || 'new') === 'new').length || undefined,
    topups: topups.filter((t) => t.status === 'pending').length || undefined,
  };
  const dashboardTools = DASHBOARD_TOOL_DEFS.filter((t) => profile && t.roles.includes(profile.role)).map((t) => ({ ...t, badge: dashboardBadges[t.key] }));
  const openDashboardTile = (key) => {
    if (key === 'chats') { setScreen('chatList'); return; }
    setAdminTab(key);
    setAdminViewingSection(true);
    setScreen('adminHome');
  };
  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{profile && profile.role === 'superadmin' ? 'Superadmin Features' : 'Admin Features'}</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 30 }}>
        <FeatureGrid title="Dashboard" items={dashboardTools} onPress={openDashboardTile} />
        <FeatureGrid title="Tools" items={tools} onPress={(key) => setScreen(key)} />
        {profile && profile.role === 'superadmin' && (
          <>
            <FeatureGrid title="Advertisement" items={[AD_CONTROLS_TILE, BANNER_MANAGEMENT_TILE, ADVERTISER_MANAGEMENT_TILE, AD_PACKAGES_TILE, AD_PAYMENTS_TILE, AD_ANALYTICS_TILE]} onPress={(key) => setScreen(key)} />
            <FeatureGrid title="Service APIs" items={[API_PROVIDER_TILE]} onPress={(key) => setScreen(key)} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
  });
}
