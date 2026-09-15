import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, Dimensions, Easing, Image, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from './HeaderDecor';
import VerifiedBadge from './VerifiedBadge';
import Constants from 'expo-constants';
import { showAlert } from '../utils/appAlert';

const APP_VERSION = (Constants.expoConfig?.version || '1.0.0')
  .split('.')
  .slice(0, 3)
  .join('.');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.8);

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

// Menu items are grouped into labeled, colored sections and laid out as a
// two-column grid of chip buttons (mirrors a reference "app-store style"
// sidebar: solid color section headers with a grid of rounded buttons
// beneath each). Group `color` is a theme token name (resolved against
// `colors` at render time) so each header bar stays readable in both light
// and dark mode instead of a hardcoded hex.
//
// Role-gated management tools (User Management, Transfer Points,
// Marketplace Moderation, Verification Requests, Business Profiles,
// Analytics, Activity Logs) stay out of the drawer entirely - they live in
// the home-page "Admin Tools" / "Tools" grid instead (see ADMIN_TOOL_DEFS
// in AdminHomeScreen.js and TOOL_DEFS in DealerHomeScreen.js).
const MENU_GROUPS = [
  {
    title: 'Account',
    color: 'secondary',
    items: [
      { key: 'profile', icon: '👤', label: 'Profile' },
      { key: 'myAccount', icon: '🧾', label: 'My Account' },
      { key: 'settings', icon: '⚙️', label: 'Settings' },
    ],
  },
  {
    title: 'Work & Documents',
    color: 'primary',
    items: [
      // Screen key is 'salaryDashboard' (not 'salary') to match the string
      // actually registered in App.js's render switch - see
      // AppContext.openSalary for the same target used by ServiceGrid's tile.
      { key: 'salaryDashboard', icon: '💰', label: 'Salary & OT' },
      { key: 'reports', icon: '📊', label: 'Reports' },
      { key: 'myDocuments', icon: '📁', label: 'My Documents' },
    ],
  },
];

// Global slide-in drawer, mirrors RatePopup/ResultModal - lives once at the
// App root and is opened from any screen's header via openSidebar().
export default function Sidebar() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { sidebarVisible, closeSidebar, setScreen, screen, profile, logout } = useApp();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!sidebarVisible) return;
    // Stop any in-flight animation on these nodes first (e.g. the user
    // closed and reopened the sidebar before the close/open animation
    // finished) - calling setValue() on a node that a native-driven
    // animation still owns is what throws the "moved to native earlier"
    // JS-driven-animation error.
    translateX.stopAnimation();
    backdropOpacity.stopAnimation();
    translateX.setValue(-DRAWER_WIDTH);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [sidebarVisible]);

  if (!sidebarVisible) return null;

  const goTo = (key) => {
    setScreen(key);
    closeSidebar();
  };

  const onLogout = () => {
    closeSidebar();
    showAlert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const initial = profile && profile.name ? profile.name.trim().charAt(0).toUpperCase() : '?';
  const roleLabel = profile ? (ROLE_LABEL[profile.role] || profile.role) : '';

  return (
    <Modal visible={sidebarVisible} transparent animationType="none" onRequestClose={closeSidebar}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSidebar} />
        </Animated.View>

        <Animated.View style={[styles.drawer, { width: DRAWER_WIDTH, transform: [{ translateX }] }]}>
          <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <HeaderDecor corner="left" />
            <TouchableOpacity style={styles.closeBtn} onPress={closeSidebar}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{profile?.name || 'MySheba'}</Text>
              <VerifiedBadge verified={profile?.verified} size="sm" light />
            </View>
            {!!profile?.phone && <Text style={styles.phone}>{profile.phone}</Text>}
            {!!roleLabel && (
              <View style={styles.rolePill}><Text style={styles.rolePillText}>{roleLabel}</Text></View>
            )}
          </LinearGradient>

          <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent} showsVerticalScrollIndicator={false}>
            {MENU_GROUPS.map((group) => (
              <View key={group.title} style={styles.groupBlock}>
                <View style={[styles.groupHeader, { backgroundColor: colors[group.color] }]}>
                  <Text style={styles.groupHeaderText}>{group.title}</Text>
                </View>
                <View style={styles.grid}>
                  {group.items.map((item) => {
                    const active = screen === item.key;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={[styles.gridItem, active && styles.gridItemActive]}
                        onPress={() => goTo(item.key)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.gridIcon}>{item.icon}</Text>
                        <Text style={[styles.gridLabel, active && styles.gridLabelActive]} numberOfLines={2}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.brandFooter}>
            <Image source={require('../../assets/icon-transparent.png')} style={styles.brandLogo} resizeMode="contain" />
            <View style={styles.brandRow}>
              <Text style={styles.brandDark}>My</Text>
              <Text style={styles.brandTeal}>Sheba</Text>
            </View>
            <Text style={styles.brandVersion}>Version {APP_VERSION}</Text>
            <Text style={styles.brandCompany}>SatuLink Solutions Sdn Bhd</Text>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.logoutRow} onPress={onLogout}>
              <Text style={styles.menuIcon}>🚪</Text>
              <Text style={styles.logoutLabel}>Logout</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, flexDirection: 'row' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    drawer: { height: '100%', backgroundColor: colors.card, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 2, height: 0 } },
    header: { paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20, alignItems: 'center', overflow: 'hidden' },
    closeBtn: { position: 'absolute', top: 46, right: 14, padding: 6 },
    closeText: { color: 'white', fontSize: 16 },
    avatarRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: 'white', fontSize: 22, fontWeight: '700' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
    name: { color: 'white', fontSize: 15, fontWeight: '700', maxWidth: '100%', flexShrink: 1 },
    phone: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
    rolePill: { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.pill },
    rolePillText: { color: 'white', fontSize: 10, fontWeight: '600' },

    // Grouped grid menu - a colored header bar per section, then a
    // two-column wrap grid of chip buttons underneath it.
    menuScroll: { flex: 1 },
    menuContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
    groupBlock: { marginBottom: 6 },
    groupHeader: {
      borderRadius: radius.sm,
      paddingVertical: 7,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    groupHeaderText: {
      color: 'white',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    gridItem: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 10,
      marginBottom: 10,
    },
    gridItemActive: {
      backgroundColor: colors.card,
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    gridIcon: { fontSize: 18 },
    gridLabel: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.text },
    gridLabelActive: { color: colors.primary },

    menuIcon: { fontSize: 19, width: 24, textAlign: 'center' },
    brandFooter: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: colors.border },
    brandLogo: { width: 36, height: 36, marginBottom: 6, opacity: 0.9 },
    brandRow: { flexDirection: 'row' },
    brandDark: { fontSize: 15, fontWeight: '800', color: colors.navy },
    brandTeal: { fontSize: 15, fontWeight: '800', color: colors.primary },
    brandVersion: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
    brandCompany: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
    footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 6, paddingBottom: 24 },
    logoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, gap: 14 },
    logoutLabel: { fontSize: 14, fontWeight: '600', color: colors.error },
  });
}
