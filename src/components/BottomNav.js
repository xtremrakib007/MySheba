import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';

const TABS = [
  { key: 'account', icon: '👤', label: 'Account', colors: ['#4facfe', '#00A99D'] },
  { key: 'topup', icon: '💰', label: 'Top-Up', colors: ['#00A99D', '#00C9B7'] },
  { key: 'home', icon: '⌂', label: 'Home', colors: ['#00A99D', '#1A73E8'] },
  { key: 'history', icon: '📋', label: 'History', colors: ['#667eea', '#764ba2'] },
  { key: 'support', icon: '🎧', label: 'Support', colors: ['#1A73E8', '#4facfe'] },
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

function createStyles(colors) {
  return StyleSheet.create({
    nav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    btn: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 6, flex: 1 },
    btnHome: { marginTop: -12 },
    iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 2, backgroundColor: '#F1F3F4' },
    iconCircleHome: { width: 50, height: 50, borderRadius: 25, borderWidth: 3, borderColor: colors.card, elevation: 5 },
    icon: { fontSize: 18, color: '#9AA0A6' },
    iconActive: { fontSize: 18 },
    iconHomeText: { fontSize: 25 },
    label: { fontSize: 10, color: '#6B7280', fontWeight: '500' },
  });
}