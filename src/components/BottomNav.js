import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';

const TABS = [
  { key: 'account', icon: '👤', label: 'Account', gradient: (c) => [c.secondary, c.primary] },
  { key: 'topup', icon: '💰', label: 'Top-Up', gradient: (c) => [c.primary, c.gold] },
  { key: 'home', icon: '⌂', label: 'Home', gradient: (c) => [c.secondary, c.primary, c.gold] },
  { key: 'history', icon: '📋', label: 'History', gradient: (c) => [c.primaryDark, c.secondary] },
  { key: 'support', icon: '🎧', label: 'Support', gradient: (c) => [c.goldDeep, c.primary] },
];

function screenForRole(key, role) {
  const isSuperadmin = role === 'superadmin';
  const isAdminTier = role === 'admin' || isSuperadmin;
  if (key === 'account') return 'myAccount';
  if (key === 'topup') return isAdminTier ? 'superAdminTopup' : 'topup';
  if (key === 'history') return 'history';
  if (key === 'support') return isSuperadmin ? 'adminSupport' : 'support';
  return null;
}

export default function BottomNav() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { goHome, screen, setScreen, profile } = useApp();
  const role = profile?.role;

  const onPressTab = (key) => {
    if (key === 'home') return goHome();
    const target = screenForRole(key, role);
    if (target) setScreen(target);
  };

  return (
    <View style={styles.nav}>
      {TABS.map((tab) => {
        const target = screenForRole(tab.key, role);
        const isActive = tab.key === 'home'
          ? ['customerHome', 'dealerHome', 'resellerHome', 'adminHome'].includes(screen)
          : screen === target;
        const isHome = tab.key === 'home';
        return (
          <TouchableOpacity key={tab.key} style={[styles.btn, isHome && styles.btnHome]} onPress={() => onPressTab(tab.key)}>
            {isActive ? (
              <LinearGradient colors={tab.gradient(colors)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.iconCircle, isHome && styles.iconCircleHome]}>
                <Text style={[styles.iconActive, isHome && styles.iconHomeText]}>{tab.icon}</Text>
              </LinearGradient>
            ) : (
              <View style={[styles.iconCircle, isHome && styles.iconCircleHome]}>
                <Text style={[styles.icon, isHome && styles.iconHomeText]}>{tab.icon}</Text>
              </View>
            )}
            <Text style={[styles.label, isActive && { color: colors.primary, fontWeight: '700' }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// The divider uses colors.border, not colors.accentLine. accentLine is a
// highlight token: #D9FFF0 on a near-white card in light and #A6F5D2 on
// #0B2226 in dark, which measures 1.07:1 one way and 13.07:1 the other. As
// the nav's top edge that reads as invisible in light and as a glowing
// hairline in dark. border is defined per mode and lands at 1.34:1 and
// 3.07:1 - present in both, loud in neither.
function createStyles(colors) {
  return StyleSheet.create({
    nav: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingTop: 6, paddingBottom: 10, paddingHorizontal: 4, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
    btn: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 6, flex: 1 },
    btnHome: { marginTop: -12 },
    iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 2, backgroundColor: colors.surface },
    iconCircleHome: { width: 50, height: 50, borderRadius: 25, borderWidth: 3, borderColor: colors.card, elevation: 5 },
    icon: { fontSize: 18, color: colors.placeholder },
    iconActive: { fontSize: 18 },
    iconHomeText: { fontSize: 25 },
    label: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
  });
}