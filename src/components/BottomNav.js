import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";

// Finance-focused bottom navigation. Customer Chat has been removed from the
// customer experience; Support remains available for help with the account
// and financial services.
const TABS = [
  { key: 'topup', icon: '💰', label: 'Top-Up', colors: ['#FBBC04', '#FF9F43'] },
  { key: 'home', icon: '🏠', label: 'Home', colors: ['#00A99D', '#00C9B7'] },
  { key: 'history', icon: '📋', label: 'History', colors: ['#667eea', '#764ba2'] },
  { key: 'support', icon: '🎧', label: 'Support', colors: ['#f093fb', '#f5576c'] },
];

// Top-Up and Support mean something different depending on who's tapping:
// customer/dealer/admin use their normal request/support screens; superadmin
// uses the corresponding administration screens.
function screenForRole(key, role) {
  const isSuperadmin = role === 'superadmin';
  const isAdminTier = role === 'admin' || isSuperadmin;
  if (key === 'topup') return isAdminTier ? 'superAdminTopup' : 'topup';
  if (key === 'support') return isSuperadmin ? 'adminSupport' : 'support';
  return null;
}

export default function BottomNav() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { goHome, screen, setScreen, profile, chatUnreadCount } = useApp();
  const role = profile && profile.role;

  const onPressTab = (key) => {
    if (key === 'home') { goHome(); return; }
    if (key === 'history') { setScreen('history'); return; }
    const target = screenForRole(key, role);
    if (target) setScreen(target);
    else goHome();
  };

  return (
    <View style={styles.nav}>
      {TABS.map((t) => {
        const target = t.key === 'topup' || t.key === 'support' ? screenForRole(t.key, role) : t.key;
        const isActive = t.key === 'home'
          ? (screen === 'customerHome' || screen === 'dealerHome' || screen === 'resellerHome' || screen === 'adminHome')
          : screen === target;
        const badgeCount = t.key === 'support' ? (chatUnreadCount || 0) : 0;
        const activeColor = t.colors[0];
        const isHome = t.key === 'home';
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.btn, isHome && styles.btnHome]}
            onPress={() => onPressTab(t.key)}
          >
            <View>
              {isActive ? (
                <LinearGradient
                  colors={t.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.iconCircle, isHome && styles.iconCircleHome]}
                >
                  <Text style={[styles.iconActive, isHome && styles.iconHomeText]}>{t.icon}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.iconCircle, isHome && styles.iconCircleHome]}>
                  <Text style={[styles.icon, isHome && styles.iconHomeText]}>{t.icon}</Text>
                </View>
              )}
              {badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, isActive && { color: activeColor, fontWeight: '700' }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    nav: {
      flexDirection: 'row', justifyContent: 'space-around',
      paddingVertical: 6, backgroundColor: colors.card,
      borderTopWidth: 1, borderTopColor: '#EEE',
    },
    btn: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8 },
    btnHome: { marginTop: -14 },
    iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 2, backgroundColor: '#F1F3F4' },
    iconCircleHome: {
      width: 50, height: 50, borderRadius: 25,
      borderWidth: 3, borderColor: colors.card,
      shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 5,
    },
    icon: { fontSize: 18, color: '#9AA0A6' },
    iconActive: { fontSize: 18 },
    iconHomeText: { fontSize: 24 },
    label: { fontSize: 10, color: '#9AA0A6', fontWeight: '500' },
    badge: {
      position: 'absolute', top: -2, right: -6, backgroundColor: colors.error,
      borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    badgeText: { color: 'white', fontSize: 9, fontWeight: '700' },
  });
}
