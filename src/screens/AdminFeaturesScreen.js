import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import FeatureGrid from '../components/FeatureGrid';
import { FEATURE_DEFS, canAccessFeature } from '../firebase/featureAccessService';

// Admin/superadmin-only management tools. Previously an inline "Admin
// Tools" grid on AdminHomeScreen itself - moved to its own page (same
// pattern as MoreFeaturesScreen for customers) so the Home page's Quick
// Services grid can stay identical across every role, with each role's
// extra tools reached through a single "Admin Features" tile instead.
// The tool list itself now lives in featureAccessService.js (FEATURE_DEFS)
// so it's shared with DealerFeaturesScreen/ResellerFeaturesScreen and can
// be overridden per-role by a superadmin from the "Feature Access" tile
// below - see canAccessFeature.
const FEATURE_ACCESS_TILE = { key: 'featureAccess', icon: '🔐', bg: '#EDE7F6', name: 'Feature Access' };

// PHASE 2 - Advertisement -> Feature Ad Controls (AdFeatureControlsScreen).
// Super Admin-only, same "pushed onto its own section, not one of the
// role-toggleable FEATURE_DEFS tools" treatment as Feature Access above -
// a superadmin should always be able to reach the ad controls regardless
// of what Feature Access itself is configured to allow.
const AD_CONTROLS_TILE = { key: 'adFeatureControls', icon: '📢', bg: '#FFF3E0', name: 'Feature Ad Controls' };

// PHASE 3 - Advertisement -> Banner Management (BannerManagementScreen).
// Super Admin-only, same treatment as AD_CONTROLS_TILE above - this is
// the CRUD screen for individual banner Advertisement docs (create,
// preview, schedule, activate/pause/archive), separate from the Global/
// per-feature ON-OFF switches AD_CONTROLS_TILE opens.
const BANNER_MANAGEMENT_TILE = { key: 'bannerManagement', icon: '🖼️', bg: '#E8F5E9', name: 'Banner Management' };

// PHASE 9 - Advertisement -> Advertiser Management (AdvertiserManagementScreen).
// Same tile shape as BANNER_MANAGEMENT_TILE above - the roster screen for
// ad_advertisers docs (create/edit/activate/deactivate), each opening into
// AdvertiserDetailScreen's Campaigns/Analytics/Payment History tabs.
const ADVERTISER_MANAGEMENT_TILE = { key: 'advertiserManagement', icon: '🏢', bg: '#EDE7F6', name: 'Advertiser Management' };

// PHASE 8 - Advertisement -> Ad Analytics (AdAnalyticsScreen). Same
// superadmin-only treatment as AD_CONTROLS_TILE/BANNER_MANAGEMENT_TILE
// above - the dashboard + Campaign/Feature/Placement/Advertiser
// Performance reports (src/firebase/adAnalyticsService.js).
const AD_ANALYTICS_TILE = { key: 'adAnalytics', icon: '📊', bg: '#E1F5FE', name: 'Ad Analytics' };

// PHASE 10 - Advertisement -> Ad Packages (AdPackagesManagementScreen) /
// Ad Payments (AdPaymentsManagementScreen). Same "own tile, own roster
// screen, no id needed to open it" shape as ADVERTISER_MANAGEMENT_TILE
// above.
const AD_PACKAGES_TILE = { key: 'adPackagesManagement', icon: '📦', bg: '#FBE9E7', name: 'Ad Packages' };
const AD_PAYMENTS_TILE = { key: 'adPaymentsManagement', icon: '💳', bg: '#E0F7FA', name: 'Ad Payments' };
const API_PROVIDER_TILE = { key: 'apiProviderManagement', icon: '🔌', bg: '#E8F5E9', name: 'API Management' };

// Tier/Level loyalty system - editing each tier's promotion (fee discount
// %, title, description, active toggle - see progressionService.js and
// TierPromotionsScreen.js). Same superadmin-only treatment as
// FEATURE_ACCESS_TILE above, for the same reason: a plain admin should
// never be able to grant a bigger fee discount to themselves or a
// favored customer with a direct write.
const TIER_PROMOTIONS_TILE = { key: 'tierPromotions', icon: '🏆', bg: '#FFF8E1', name: 'Tier Promotions' };

// The old inline "📊 Dashboard" grid that used to sit on AdminHomeScreen
// itself (All Tx, Pending, Inquiries, Top-Ups, Chats, Rates, Pricing,
// Payments, Categories, Support, Banners, Announce) now lives here too,
// so every admin/superadmin management surface is reached through this
// one Features page. Tapping a tile jumps back to AdminHomeScreen with
// the right section already open - see openDashboardTile below - except
// "Chats" and "All Tx", which go straight to their own screens/tab.
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
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    profile, goBackOrHome, setScreen,
    dealerTxs, inquiries, topups,
    setAdminTab, setAdminViewingSection,
    featureAccess,
  } = useApp();
  const tools = FEATURE_DEFS.filter((t) => profile && canAccessFeature(featureAccess, t.key, profile.role));
  // Feature Access (the checkbox screen that controls the list above) is
  // itself superadmin-only, and not one of the toggleable features - a
  // superadmin should never be able to lock themself out of it.
  if (profile && profile.role === 'superadmin') tools.push(FEATURE_ACCESS_TILE);
  if (profile && profile.role === 'superadmin') tools.push(TIER_PROMOTIONS_TILE);

  const dashboardBadges = {
    pending: dealerTxs.filter((t) => t.status === 'pending').length || undefined,
    inquiries: inquiries.filter((i) => (i.status || 'new') === 'new').length || undefined,
    topups: topups.filter((t) => t.status === 'pending').length || undefined,
  };
  const dashboardTools = DASHBOARD_TOOL_DEFS
    .filter((t) => profile && t.roles.includes(profile.role))
    .map((t) => ({ ...t, badge: dashboardBadges[t.key] }));

  const openDashboardTile = (key) => {
    if (key === 'chats') {
      setScreen('chatList');
      return;
    }
    setAdminTab(key);
    setAdminViewingSection(true);
    setScreen('adminHome');
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🛠️ {profile && profile.role === 'superadmin' ? 'Superadmin Features' : 'Admin Features'}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 30 }}>
        <FeatureGrid title="📊 Dashboard" items={dashboardTools} onPress={openDashboardTile} />
        <FeatureGrid title="🛠️ Tools" items={tools} onPress={(key) => setScreen(key)} />
        {profile && profile.role === 'superadmin' && (
          <><FeatureGrid title="📢 Advertisement" items={[AD_CONTROLS_TILE, BANNER_MANAGEMENT_TILE, ADVERTISER_MANAGEMENT_TILE, AD_PACKAGES_TILE, AD_PAYMENTS_TILE, AD_ANALYTICS_TILE]} onPress={(key) => setScreen(key)} /><FeatureGrid title="🔌 Service APIs" items={[API_PROVIDER_TILE]} onPress={(key) => setScreen(key)} /></>
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
