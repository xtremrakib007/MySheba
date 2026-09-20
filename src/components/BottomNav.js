import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import RoyalIcon from './RoyalIcon';

const TABS = [
  { key: 'account', icon: 'account', label: 'Account', colors: ['#1481B5', '#12A9A6'] },
  { key: 'topup', icon: 'topup', label: 'Top-Up', colors: ['#19C39B', '#0E9E8C'] },
  { key: 'home', icon: 'home', label: 'Home', colors: ['#A6F5D2', '#19C39B', '#0E9E8C'] },
  { key: 'history', icon: 'history', label: 'History', colors: ['#0F6FA8', '#0FA0A0'] },
  { key: 'support', icon: 'support', label: 'Support', colors: ['#1481B5', '#25D48F'] },
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
              <LinearGradient colors={tab.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.iconCircle, isHome && styles.iconCircleHome]}>
                <RoyalIcon name={tab.icon === "home" ? "more" : tab.icon} size={isHome ? 40 : 24} color="#FFFFFF" />
              </LinearGradient>
            ) : (
              <View style={[styles.iconCircle, isHome && styles.iconCircleHome]}>
                <RoyalIcon name={tab.icon} size={isHome ? 40 : 24} color={colors.placeholder || colors.textSecondary} />
              </View>
            )}
            <Text style={[styles.label, isActive && { color: colors.primary, fontWeight: '700' }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    nav: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 6, paddingBottom: 18, backgroundColor: colors.card, borderTopWidth: 1.5, borderTopColor: colors.accentLine || colors.border },
    btn: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 6, flex: 1 },
    btnHome: { marginTop: -12 },
    iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.tileBorder || colors.border },
    iconCircleHome: { width: 66, height: 66, borderRadius: 33, borderWidth: 3, borderColor: colors.card, elevation: 5 },
    icon: { fontSize: 18, color: colors.placeholder },
    iconActive: { fontSize: 18 },
    iconHomeText: { fontSize: 30 },
    label: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
  });
}