import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import FeatureGrid from '../components/FeatureGrid';
import { FEATURE_DEFS, canAccessFeature } from '../firebase/featureAccessService';

const DASHBOARD_TOOL_DEFS = [
  { key: 'pending', icon: 'time-outline', bg: '#FFF8E1', name: 'Pending', roles: ['dealer'] },
  { key: 'processing', icon: 'sync-outline', bg: '#E3F2FD', name: 'Processing', roles: ['dealer'] },
  { key: 'completed', icon: 'checkmark-circle-outline', bg: '#E8F5E9', name: 'Completed', roles: ['dealer'] },
  { key: 'topup', icon: 'cash-outline', bg: '#F3E5F5', name: 'Top-Up', roles: ['dealer'] },
];

export default function DealerFeaturesScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome, setScreen, dealerTxs, setDealerTab, setDealerViewingSection, featureAccess } = useApp();
  const tools = FEATURE_DEFS.filter((t) => profile && canAccessFeature(featureAccess, t.key, profile.role));
  const dashboardBadges = {
    pending: dealerTxs.filter((t) => t.status === 'pending').length || undefined,
    processing: dealerTxs.filter((t) => t.status === 'processing').length || undefined,
  };
  const dashboardTools = DASHBOARD_TOOL_DEFS.filter((t) => profile && t.roles.includes(profile.role)).map((t) => ({ ...t, badge: dashboardBadges[t.key] }));
  const openDashboardTile = (key) => {
    if (key === 'topup') { setScreen('topup'); return; }
    setDealerTab(key);
    setDealerViewingSection(true);
    setScreen('dealerHome');
  };
  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Dealer Features</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 30 }}>
        <FeatureGrid title="Dashboard" items={dashboardTools} onPress={openDashboardTile} />
        <FeatureGrid title="Tools" items={tools} onPress={(key) => setScreen(key)} />
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
