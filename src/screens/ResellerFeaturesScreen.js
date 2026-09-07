import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import FeatureGrid from '../components/FeatureGrid';
import { FEATURE_DEFS, canAccessFeature } from '../firebase/featureAccessService';

// Reseller-only dashboard tiles, same pattern as DealerFeaturesScreen -
// reached through the "Reseller Features" tile on ResellerHomeScreen.
const DASHBOARD_TOOL_DEFS = [
  { key: 'pending', icon: '⏳', bg: '#FFF8E1', name: 'Pending' },
  { key: 'sent', icon: '➡️', bg: '#E3F2FD', name: 'Sent to Dealer' },
];

export default function ResellerFeaturesScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const {
    profile, goBackOrHome, setScreen,
    resellerTxs,
    setResellerTab, setResellerViewingSection,
    featureAccess,
  } = useApp();

  // Reseller gets none of these tools by default (unchanged behavior) -
  // but a superadmin can grant a reseller access to any of them from
  // Admin Features > Feature Access, same shared list as
  // AdminFeaturesScreen/DealerFeaturesScreen (see featureAccessService.js).
  const tools = FEATURE_DEFS.filter((t) => profile && canAccessFeature(featureAccess, t.key, profile.role));

  const dashboardBadges = {
    pending: resellerTxs.filter((t) => !t.dealerId).length || undefined,
  };
  const dashboardTools = DASHBOARD_TOOL_DEFS.map((t) => ({ ...t, badge: dashboardBadges[t.key] }));

  const openDashboardTile = (key) => {
    setResellerTab(key);
    setResellerViewingSection(true);
    setScreen('resellerHome');
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🛠️ Reseller Features</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 30 }}>
        <FeatureGrid title="📊 Dashboard" items={dashboardTools} onPress={openDashboardTile} />
        {tools.length > 0 && (
          <FeatureGrid title="🛠️ Tools" items={tools} onPress={(key) => setScreen(key)} />
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
