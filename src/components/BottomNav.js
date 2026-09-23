import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';

// Five slots, as the mockup draws them: Home, Services, a raised centre
// action, a role-dependent fourth, and More. Staff see Management where a
// customer sees History, which is the only difference between the roles.
const STAFF_ROLES = ['admin', 'superadmin', 'dealer', 'reseller'];
const HOME_SCREENS = ['customerHome', 'dealerHome', 'resellerHome', 'adminHome'];

function tabsFor(role) {
  const staff = STAFF_ROLES.includes(role);
  return [
    { key: 'home', icon: '⌂', label: 'Home' },
    { key: 'services', icon: '▦', label: 'Services' },
    { key: 'centre', icon: '⛶', label: '' },
    staff
      ? { key: 'management', icon: '⚙', label: 'Management' }
      : { key: 'history', icon: '◷', label: 'History' },
    { key: 'more', icon: '⋯', label: 'More' },
  ];
}

function screenFor(key, role) {
  const isSuperadmin = role === 'superadmin';
  const isAdminTier = role === 'admin' || isSuperadmin;
  if (key === 'services') return 'moreFeatures';
  if (key === 'history') return 'history';
  // The mockup's centre button is a scanner. The app has no scanner screen,
  // so it opens Top-Up - the action the button sits closest to in intent -
  // rather than pointing at a route that does not exist.
  if (key === 'centre') return isAdminTier ? 'superAdminTopup' : 'topup';
  if (key === 'management') {
    if (isAdminTier) return 'adminFeatures';
    if (role === 'dealer') return 'dealerFeatures';
    if (role === 'reseller') return 'resellerFeatures';
    return null;
  }
  if (key === 'more') return 'myAccount';
  return null;
}

export default function BottomNav() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goHome, screen, setScreen, profile } = useApp();
  const role = profile?.role;
  const tabs = tabsFor(role);

  const onPressTab = (key) => {
    if (key === 'home') return goHome();
    const target = screenFor(key, role);
    if (target) setScreen(target);
  };

  return (
    <View style={styles.nav}>
      {tabs.map((tab) => {
        const target = screenFor(tab.key, role);
        const isActive = tab.key === 'home' ? HOME_SCREENS.includes(screen) : screen === target;
        if (tab.key === 'centre') {
          return (
            <TouchableOpacity key={tab.key} style={styles.centreBtn} onPress={() => onPressTab(tab.key)} accessibilityRole="button" accessibilityLabel="Top up">
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.centreCircle}>
                <Text style={styles.centreIcon}>{tab.icon}</Text>
              </LinearGradient>
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity key={tab.key} style={styles.btn} onPress={() => onPressTab(tab.key)} accessibilityRole="button" accessibilityLabel={tab.label}>
            <Text style={[styles.icon, isActive && { color: colors.primary }]}>{tab.icon}</Text>
            <Text style={[styles.label, isActive && { color: colors.primary, fontWeight: '700' }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// The divider uses colors.border, not colors.accentLine. accentLine is a
// highlight token and lands on opposite sides of the card in the two modes -
// invisible in light, a glowing hairline in dark. border is defined per mode
// for exactly this.
function createStyles(colors) {
  return StyleSheet.create({
    nav: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingTop: 8, paddingBottom: 10, paddingHorizontal: 4, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
    btn: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 6, flex: 1 },
    icon: { fontSize: 20, color: colors.placeholder, marginBottom: 3 },
    label: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
    centreBtn: { flex: 1, alignItems: 'center', marginTop: -26 },
    centreCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.card, elevation: 6 },
    centreIcon: { fontSize: 24, color: '#FFFFFF' },
  });
}
