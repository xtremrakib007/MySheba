import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';

// Account - Services - Home - History - Support, with Home raised in the
// middle.
//
// The previous order put Home first and a scanner button in the centre. The
// app has no scanner, so that button opened Top-Up - a raised, branded
// circle whose meaning nobody could guess. Home in the centre is the one
// destination that always makes sense there, and it frees the corner the
// scanner was occupying for Account.
//
// Staff get a second tab in place of Services, since a dealer or admin has no
// customer service grid to open.
//
// For an admin that tab used to be Management, which opened AdminFeaturesScreen
// - a grid of categories. Home opens AdminHomeScreen, which lands on its own
// grid. Two tabs, two grids, nothing in the labels to tell them apart. It now
// opens Operations: the pending queue, which is what an admin actually comes
// here to work through. Dealers and resellers keep Management, because theirs
// is the only management screen they have.
const STAFF_ROLES = ['admin', 'superadmin', 'dealer', 'reseller'];
const ADMIN_TIER = ['admin', 'superadmin'];
// The AdminHomeScreen tab Operations opens: the queue needing action.
const OPERATIONS_TAB = 'pending';
const HOME_SCREENS = ['customerHome', 'dealerHome', 'resellerHome', 'adminHome'];

function tabsFor(role) {
  const staff = STAFF_ROLES.includes(role);
  return [
    { key: 'account', icon: '👤', label: 'Account' },
    !staff
      ? { key: 'services', icon: '🧩', label: 'Services' }
      : ADMIN_TIER.includes(role)
        ? { key: 'operations', icon: '📋', label: 'Operations' }
        : { key: 'management', icon: '⚙️', label: 'Management' },
    { key: 'home', icon: '🏠', label: 'Home', centre: true },
    { key: 'history', icon: '🧾', label: 'History' },
    { key: 'support', icon: '🎧', label: 'Support' },
  ];
}

function screenFor(key, role) {
  const isAdminTier = ADMIN_TIER.includes(role);
  if (key === 'account') return 'myAccount';
  if (key === 'services') return 'moreFeatures';
  if (key === 'history') return 'history';
  if (key === 'support') return isAdminTier ? 'adminSupport' : 'support';
  if (key === 'management') {
    if (isAdminTier) return 'adminFeatures';
    if (role === 'dealer') return 'dealerFeatures';
    if (role === 'reseller') return 'resellerFeatures';
    return null;
  }
  return null;
}

export default function BottomNav() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goHome, screen, setScreen, profile, setAdminTab, setAdminViewingSection, adminTab, adminViewingSection } = useApp();
  const role = profile?.role;
  const tabs = tabsFor(role);

  const onPressTab = (key) => {
    if (key === 'home') return goHome();
    // Operations is an AdminHomeScreen TAB, not a screen App.js renders.
    // Passing a tab key to setScreen matches no branch there and renders a
    // blank white page - the same way nine sidebar items used to. It takes the
    // three steps goTo() uses: pick the tab, say we are showing one, then go.
    if (key === 'operations') {
      setAdminTab(OPERATIONS_TAB);
      setAdminViewingSection(true);
      setScreen('adminHome');
      return;
    }
    const target = screenFor(key, role);
    if (target) setScreen(target);
  };

  return (
    <View style={styles.nav}>
      {tabs.map((tab) => {
        const target = screenFor(tab.key, role);
        // Home and Operations are both AdminHomeScreen, so `screen` alone
        // cannot tell them apart: without the section flag, Home stayed lit
        // while you were working in Operations.
        const onOperations = screen === 'adminHome' && adminViewingSection && adminTab === OPERATIONS_TAB;
        const isActive = tab.key === 'home'
          ? HOME_SCREENS.includes(screen) && !onOperations
          : tab.key === 'operations'
            ? onOperations
            : screen === target;
        if (tab.centre) {
          return (
            <TouchableOpacity key={tab.key} style={styles.centreBtn} onPress={() => onPressTab(tab.key)} accessibilityRole="button" accessibilityLabel={tab.label} accessibilityState={{ selected: isActive }}>
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.centreCircle}>
                <Text style={styles.centreIcon}>{tab.icon}</Text>
              </LinearGradient>
              <Text style={[styles.label, styles.centreLabel, isActive && { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>{tab.label}</Text>
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity key={tab.key} style={styles.btn} onPress={() => onPressTab(tab.key)} accessibilityRole="button" accessibilityLabel={tab.label} accessibilityState={{ selected: isActive }}>
            <Text style={[styles.icon, !isActive && styles.iconIdle]}>{tab.icon}</Text>
            <Text style={[styles.label, isActive && { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>{tab.label}</Text>
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
    icon: { fontSize: 19, marginBottom: 3 },
    // An emoji cannot be tinted, so an inactive tab is dimmed instead of
    // recoloured. Tinting the label alone left the icons looking equally
    // selected whichever tab you were on.
    iconIdle: { opacity: 0.45 },
    label: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
    centreBtn: { flex: 1, alignItems: 'center', marginTop: -24 },
    centreCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.card, elevation: 6 },
    centreIcon: { fontSize: 23 },
    centreLabel: { marginTop: 2 },
  });
}
