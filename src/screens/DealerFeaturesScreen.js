import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import FeatureGrid from '../components/FeatureGrid';
import { FEATURE_DEFS, canAccessFeature } from '../firebase/featureAccessService';

// Dealer/dealer-only management tools. Previously an inline "Tools"
// grid on DealerHomeScreen itself - moved to its own page (same pattern
// as MoreFeaturesScreen for customers) so the Home page's Quick Services
// grid can stay identical across every role, with Dealer's extra tools
// reached through a single "Dealer Features" tile instead. The tool list
// now lives in featureAccessService.js (FEATURE_DEFS), shared with
// AdminFeaturesScreen/ResellerFeaturesScreen, and can be overridden
// per-role by a superadmin from Admin Features > Feature Access.

// The old inline "📊 Dashboard" grid that used to sit on DealerHomeScreen
// itself (Pending, Processing, Completed, Top-Up) now lives here too, same
// as the admin/superadmin side - see AdminFeaturesScreen.js. The stat
// cards on DealerHomeScreen still jump straight into a section as well.
const DASHBOARD_TOOL_DEFS = [
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending', roles: ['dealer'] },
  { key: 'processing', icon: '🔄', bg: '#E3F2FD', name: 'Processing', roles: ['dealer'] },
  { key: 'completed', icon: '✅', bg: '#E8F5E9', name: 'Completed', roles: ['dealer'] },
  { key: 'topup', icon: '💰', bg: '#F3E5F5', name: 'Top-Up', roles: ['dealer'] },
];

export default function DealerFeaturesScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    profile, goBackOrHome, setScreen,
    dealerTxs,
    setDealerTab, setDealerViewingSection,
    featureAccess,
  } = useApp();
  const tools = FEATURE_DEFS.filter((t) => profile && canAccessFeature(featureAccess, t.key, profile.role, profile.uid));

  const dashboardBadges = {
    pending: dealerTxs.filter((t) => t.status === 'pending').length || undefined,
    processing: dealerTxs.filter((t) => t.status === 'processing').length || undefined,
  };
  const dashboardTools = DASHBOARD_TOOL_DEFS
    .filter((t) => profile && t.roles.includes(profile.role))
    .map((t) => ({ ...t, badge: dashboardBadges[t.key] }));

  const openDashboardTile = (key) => {
    if (key === 'topup') {
      setScreen('topup');
      return;
    }
    setDealerTab(key);
    setDealerViewingSection(true);
    setScreen('dealerHome');
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🛠️ Dealer Features</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 30 }}>
        <FeatureGrid title="📊 Dashboard" items={dashboardTools} onPress={openDashboardTile} />
        <FeatureGrid title="🛠️ Tools" items={tools} onPress={(key) => setScreen(key)} />
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
