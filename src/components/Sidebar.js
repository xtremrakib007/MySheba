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

const APP_VERSION = (Constants.expoConfig?.version || '1.0.0').split('.').slice(0, 3).join('.');
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(340, SCREEN_WIDTH * 0.86);
const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

const COMMON_GROUPS = [
  { title: 'Account', color: 'secondary', items: [
    { key: 'profile', icon: '👤', label: 'Profile' },
    { key: 'myAccount', icon: '🧾', label: 'My Account' },
    { key: 'settings', icon: '⚙️', label: 'Settings' },
  ] },
  { title: 'Work & Documents', color: 'primary', items: [
    { key: 'salaryDashboard', icon: '💰', label: 'Salary & OT' },
    { key: 'reports', icon: '📊', label: 'Reports' },
    { key: 'myDocuments', icon: '📁', label: 'My Documents' },
  ] },
];

// Admin navigation uses only screen keys already registered in App.js. The
// drawer is a navigation surface; access remains enforced by the existing
// role/feature-access logic in the destination screens.
const ADMIN_GROUPS = [
  { title: 'Admin Overview', color: 'primary', items: [
    { key: 'adminHome', icon: '🏠', label: 'Control Center' },
    { key: 'adminAnalytics', icon: '📈', label: 'Analytics' },
    { key: 'reports', icon: '📊', label: 'Reports' },
  ] },
  { title: 'Operations', color: 'secondary', items: [
    { key: 'all', icon: '📋', label: 'Transactions' },
    { key: 'pending', icon: '⏳', label: 'Pending' },
    { key: 'inquiries', icon: '📝', label: 'Inquiries' },
    { key: 'topups', icon: '💳', label: 'Top-Ups' },
    { key: 'support', icon: '🎧', label: 'Support' },
    { key: 'chatList', icon: '💬', label: 'Chats' },
  ] },
  { title: 'Finance & Pricing', color: 'primary', items: [
    { key: 'rates', icon: '💱', label: 'Rates' },
    { key: 'pricing', icon: '🏷️', label: 'Pricing' },
    { key: 'payments', icon: '💳', label: 'Payments' },
    { key: 'transferPoints', icon: '↔️', label: 'Transfer Points' },
    { key: 'categories', icon: '🗂️', label: 'Categories' },
  ] },
  { title: 'Users & Verification', color: 'secondary', items: [
    { key: 'userManagement', icon: '👥', label: 'User Management' },
    { key: 'verificationManagement', icon: '🪪', label: 'KYC Verification' },
    { key: 'marketplaceModeration', icon: '🛍️', label: 'Marketplace' },
    { key: 'adminBusinessManagement', icon: '🏢', label: 'Business Profiles' },
  ] },
  { title: 'Platform', color: 'primary', items: [
    { key: 'featureAccess', icon: '🔐', label: 'Feature Access' },
    { key: 'banners', icon: '🖼️', label: 'Banners' },
    { key: 'announcements', icon: '📣', label: 'Announcements' },
    { key: 'adFeatureControls', icon: '📢', label: 'Ad Controls' },
  ] },
];

// Extra tools available to Superadmin. Every destination below is a real
// mobile-app screen key (App.js), avoiding links to admin-web-only routes.
const SUPERADMIN_GROUPS = [
  { title: 'Superadmin Governance', color: 'secondary', items: [
    { key: 'adminFeatures', icon: '🛡️', label: 'System Control' },
    { key: 'trustedDevices', icon: '📱', label: 'Trusted Devices' },
    { key: 'featureAccess', icon: '🔐', label: 'Tool Access' },
    { key: 'apiProviderManagement', icon: '🔌', label: 'API Providers' },
    { key: 'tierPromotions', icon: '🎁', label: 'Tier Promotions' },
  ] },
  { title: 'Risk & Moderation', color: 'primary', items: [
    { key: 'chatReports', icon: '🚨', label: 'Chat Reports' },
    { key: 'investigateChat', icon: '🔎', label: 'Investigate Chat' },
    { key: 'marketplaceModeration', icon: '🛍️', label: 'Marketplace Moderation' },
    { key: 'verificationManagement', icon: '🪪', label: 'Verification Queue' },
  ] },
  { title: 'Advertising', color: 'secondary', items: [
    { key: 'adAnalytics', icon: '📊', label: 'Ad Analytics' },
    { key: 'advertiserManagement', icon: '👤', label: 'Advertisers' },
    { key: 'adPackagesManagement', icon: '📦', label: 'Ad Packages' },
    { key: 'adPaymentsManagement', icon: '💳', label: 'Ad Payments' },
  ] },
  { title: 'Staff & Salary', color: 'primary', items: [
    { key: 'salarySettings', icon: '⚙️', label: 'Salary Settings' },
    { key: 'salaryReports', icon: '📑', label: 'Salary Reports' },
  ] },
];

function roleGroups(role) {
  if (role === 'superadmin') return [...ADMIN_GROUPS, ...SUPERADMIN_GROUPS];
  if (role === 'admin') return ADMIN_GROUPS;
  return COMMON_GROUPS;
}

export default function Sidebar() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { sidebarVisible, closeSidebar, setScreen, screen, profile, logout } = useApp();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!sidebarVisible) return;
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

  const goTo = (key) => { setScreen(key); closeSidebar(); };
  const onLogout = () => {
    closeSidebar();
    showAlert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const initial = profile?.name ? profile.name.trim().charAt(0).toUpperCase() : '?';
  const roleLabel = profile ? (ROLE_LABEL[profile.role] || profile.role) : '';
  const groups = roleGroups(profile?.role);
  const isStaff = profile?.role === 'admin' || profile?.role === 'superadmin';

  return (
    <Modal visible={sidebarVisible} transparent animationType="none" onRequestClose={closeSidebar}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSidebar} />
        </Animated.View>
        <Animated.View style={[styles.drawer, { width: DRAWER_WIDTH, transform: [{ translateX }] }]}>
          <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <HeaderDecor corner="left" />
            <TouchableOpacity style={styles.closeBtn} onPress={closeSidebar}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
            <View style={styles.avatarRing}><View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View></View>
            <View style={styles.nameRow}><Text style={styles.name} numberOfLines={1}>{profile?.name || 'MySheba'}</Text><VerifiedBadge verified={profile?.verified} size="sm" light /></View>
            {!!profile?.phone && <Text style={styles.phone}>{profile.phone}</Text>}
            {!!roleLabel && <View style={styles.rolePill}><Text style={styles.rolePillText}>{roleLabel}</Text></View>}
          </LinearGradient>
          <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent} showsVerticalScrollIndicator={false}>
            {groups.map((group) => (
              <View key={group.title} style={styles.groupBlock}>
                <View style={[styles.groupHeader, { backgroundColor: colors[group.color] }]}><Text style={styles.groupHeaderText}>{group.title}</Text></View>
                <View style={styles.grid}>
                  {group.items.map((item) => {
                    const active = screen === item.key;
                    return <TouchableOpacity key={`${group.title}-${item.key}`} style={[styles.gridItem, active && styles.gridItemActive]} onPress={() => goTo(item.key)} activeOpacity={0.75}>
                      <Text style={styles.gridIcon}>{item.icon}</Text><Text style={[styles.gridLabel, active && styles.gridLabelActive]} numberOfLines={2}>{item.label}</Text>
                    </TouchableOpacity>;
                  })}
                </View>
              </View>
            ))}
            {isStaff && <View style={styles.boundaryCard}><Text style={styles.boundaryTitle}>🔐 Role protected</Text><Text style={styles.boundaryText}>This drawer only navigates. Existing role and feature-access checks still control protected operations.</Text></View>}
          </ScrollView>
          <View style={styles.brandFooter}>
            <Image source={require('../../assets/icon-transparent.png')} style={styles.brandLogo} resizeMode="contain" />
            <View style={styles.brandRow}><Text style={styles.brandDark}>My</Text><Text style={styles.brandTeal}>Sheba</Text></View>
            <Text style={styles.brandVersion}>Version {APP_VERSION}</Text>
            <Text style={styles.brandCompany}>SatuLink Solutions Sdn Bhd</Text>
          </View>
          <View style={styles.footer}><TouchableOpacity style={styles.logoutRow} onPress={onLogout}><Text style={styles.menuIcon}>🚪</Text><Text style={styles.logoutLabel}>Logout</Text></TouchableOpacity></View>
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
    closeBtn: { position: 'absolute', top: 46, right: 14, padding: 6 }, closeText: { color: 'white', fontSize: 16 },
    avatarRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: 'white', fontSize: 22, fontWeight: '700' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }, name: { color: 'white', fontSize: 15, fontWeight: '700', maxWidth: '100%', flexShrink: 1 }, phone: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
    rolePill: { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.pill }, rolePillText: { color: 'white', fontSize: 10, fontWeight: '600' },
    menuScroll: { flex: 1 }, menuContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 }, groupBlock: { marginBottom: 6 },
    groupHeader: { borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 10 }, groupHeaderText: { color: 'white', fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
    gridItem: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 10, marginBottom: 10, minHeight: 52 },
    gridItemActive: { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 1.5 }, gridIcon: { fontSize: 18 }, gridLabel: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.text }, gridLabelActive: { color: colors.primary },
    boundaryCard: { marginTop: 2, marginBottom: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }, boundaryTitle: { fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 4 }, boundaryText: { fontSize: 10.5, lineHeight: 16, color: colors.textSecondary },
    menuIcon: { fontSize: 19, width: 24, textAlign: 'center' }, brandFooter: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: colors.border }, brandLogo: { width: 36, height: 36, marginBottom: 6, opacity: 0.9 }, brandRow: { flexDirection: 'row' }, brandDark: { fontSize: 15, fontWeight: '800', color: colors.navy }, brandTeal: { fontSize: 15, fontWeight: '800', color: colors.primary }, brandVersion: { fontSize: 11, color: colors.textSecondary, marginTop: 4 }, brandCompany: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
    footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 6, paddingBottom: 24 }, logoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, gap: 14 }, logoutLabel: { fontSize: 14, fontWeight: '600', color: colors.error },
  });
}
