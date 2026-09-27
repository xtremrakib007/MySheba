import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, Dimensions, Easing, Image, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from './HeaderDecor';
import VerifiedBadge from './VerifiedBadge';
import Constants from 'expo-constants';
import { showAlert } from '../utils/appAlert';
import ServiceIcon from './ServiceIcon';

const APP_VERSION = (Constants.expoConfig?.version || '1.0.0').split('.').slice(0, 3).join('.');
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(360, SCREEN_WIDTH * 0.9);
const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

const COMMON_GROUPS = [
  { title: 'Account', icon: 'profile', color: 'secondary', items: [
    { key: 'profile', icon: 'profile', label: 'Profile' },
    { key: 'myAccount', icon: 'profile', label: 'My Account' },
    { key: 'settings', icon: 'settings', label: 'Settings' },
  ] },
  { title: 'Work & Documents', icon: 'profile', color: 'primary', items: [
    { key: 'salaryDashboard', icon: 'topup', label: 'Salary & OT' },
    { key: 'reports', icon: 'history', label: 'Reports' },
    { key: 'myDocuments', icon: 'profile', label: 'My Documents' },
  ] },
];

const ADMIN_GROUPS = [
  { title: 'Admin Overview', icon: 'home', color: 'primary', items: [
    { key: 'adminHome', icon: 'home', label: 'Control Center', featured: true },
    { key: 'adminAnalytics', icon: 'history', label: 'Analytics' },
    { key: 'reports', icon: 'history', label: 'Reports' },
  ] },
  { title: 'Operations', icon: 'settings', color: 'secondary', items: [
    { key: 'all', icon: 'history', label: 'Transactions' },
    { key: 'pending', icon: 'history', label: 'Pending' },
    { key: 'inquiries', icon: 'profile', label: 'Inquiries' },
    { key: 'topups', icon: 'topup', label: 'Top-Ups' },
    { key: 'support', icon: 'support', label: 'Support' },
  ] },
  { title: 'Finance & Pricing', icon: 'topup', color: 'primary', items: [
    { key: 'rates', icon: 'remittance', label: 'Rates' },
    { key: 'pricing', icon: 'billpayment', label: 'Pricing' },
    { key: 'payments', icon: 'topup', label: 'Payments' },
    { key: 'transferPoints', icon: 'remittance', label: 'Transfer Points' },
      ] },
  { title: 'Users & Verification', icon: 'profile', color: 'secondary', items: [
    { key: 'userManagement', icon: 'profile', label: 'User Management' },
    { key: 'verificationManagement', icon: 'kyc', label: 'KYC Verification' },
  ] },
  { title: 'Platform', icon: 'more', color: 'primary', items: [
    { key: 'banners', icon: 'more', label: 'Banners' },
    { key: 'announcements', icon: 'support', label: 'Announcements' },
    { key: 'adFeatureControls', icon: 'more', label: 'Ad Controls' },
  ] },
];

const SUPERADMIN_GROUPS = [
  { title: 'Superadmin Governance', icon: 'kyc', color: 'secondary', items: [
    { key: 'adminFeatures', icon: 'kyc', label: 'System Control', featured: true },
    { key: 'trustedDevices', icon: 'recharge', label: 'Trusted Devices' },
    { key: 'featureAccess', icon: 'kyc', label: 'Tool Access' },
    { key: 'apiProviderManagement', icon: 'internet', label: 'API Providers' },
    { key: 'tierPromotions', icon: 'more', label: 'Tier Promotions' },
    { key: 'superAdminTopup', icon: 'topup', label: 'Point Top-Up' },
  ] },
  { title: 'Risk & Moderation', icon: 'kyc', color: 'primary', items: [
    { key: 'verificationManagement', icon: 'kyc', label: 'Verification Queue' },
  ] },
  { title: 'Advertising', icon: 'more', color: 'secondary', items: [
    { key: 'adAnalytics', icon: 'history', label: 'Ad Analytics' },
    { key: 'advertiserManagement', icon: 'profile', label: 'Advertisers' },
    { key: 'adPackagesManagement', icon: 'more', label: 'Ad Packages' },
    { key: 'adPaymentsManagement', icon: 'topup', label: 'Ad Payments' },
  ] },
  { title: 'Staff & Salary', icon: 'profile', color: 'primary', items: [
    { key: 'salarySettings', icon: 'settings', label: 'Salary Settings' },
    { key: 'salaryReports', icon: 'history', label: 'Salary Reports' },
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
  const { sidebarVisible, closeSidebar, setScreen, screen, profile, logout, gridManagement, setAdminTab, setAdminViewingSection } = useApp();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [collapsed, setCollapsed] = useState({});

  const isSuperadmin = profile?.role === 'superadmin';
  const isAdmin = profile?.role === 'admin' || isSuperadmin;
  const groups = roleGroups(profile?.role);

  useEffect(() => {
    if (!sidebarVisible) return;
    translateX.stopAnimation();
    backdropOpacity.stopAnimation();
    translateX.setValue(-DRAWER_WIDTH);
    backdropOpacity.setValue(0);
    setCollapsed({});
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [sidebarVisible]);

  if (!sidebarVisible) return null;

  const goTo = (key) => {
    const always = ['adminHome','adminFeatures','gridManagement'];
    if (!always.includes(key) && gridManagement?.[key] === false) { showAlert('MySheba', 'This feature is currently unavailable.'); return; }

    // These entries are tabs inside AdminHomeScreen, not standalone screens.
    // Sending them to setScreen(key) rendered no screen for keys such as
    // "pending", "all", "rates" and "announcements".
    const adminTabs = ['all', 'pending', 'inquiries', 'topups', 'rates', 'pricing', 'support', 'payments', 'banners', 'announcements', 'homepage'];
    if (isAdmin && adminTabs.includes(key)) {
      setAdminTab(key);
      setAdminViewingSection(true);
      setScreen('adminHome');
    } else {
      setScreen(key);
    }
    closeSidebar();
  };
  const toggleGroup = (title) => setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  const onLogout = () => {
    closeSidebar();
    showAlert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const initial = profile?.name ? profile.name.trim().charAt(0).toUpperCase() : '?';
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
            <TouchableOpacity style={styles.closeBtn} onPress={closeSidebar} accessibilityLabel="Close menu">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.headerTopRow}>
              <View style={styles.avatarRing}><View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View></View>
              <View style={styles.headerIdentity}>
                <View style={styles.nameRow}><Text style={styles.name} numberOfLines={1}>{profile?.name || 'MySheba'}</Text><VerifiedBadge verified={profile?.verified} size="sm" light /></View>
                {!!profile?.phone && <Text style={styles.phone} numberOfLines={1}>{profile.phone}</Text>}
              </View>
            </View>
            <View style={styles.roleRow}>
              <View style={styles.rolePill}><ServiceIcon name={isSuperadmin ? 'kyc' : isAdmin ? 'topup' : 'profile'} size={16} color="#FFFFFF" /><Text style={styles.rolePillText}>{roleLabel}</Text></View>
              {isSuperadmin && <View style={styles.securePill}><Text style={styles.secureText}>SECURE CONSOLE</Text></View>}
            </View>
          </LinearGradient>

          {isAdmin && (
            <View style={styles.consoleBar}>
              <View style={styles.consoleDot} />
              <View style={styles.consoleCopy}>
                <Text style={styles.consoleTitle}>{isSuperadmin ? 'Superadmin Console' : 'Admin Console'}</Text>
                <Text style={styles.consoleSub}>{isSuperadmin ? 'Full platform control & governance' : 'Operations & management'}</Text>
              </View>
              <TouchableOpacity style={styles.homeShortcut} onPress={() => goTo('adminHome')}>
                <ServiceIcon name="home" size={21} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent} showsVerticalScrollIndicator={false}>
            {groups.map((group, groupIndex) => {
              const isCollapsed = !!collapsed[group.title];
              return (
                <View key={group.title} style={styles.groupBlock}>
                  <TouchableOpacity style={[styles.groupHeader, { borderColor: colors[group.color] }]} onPress={() => toggleGroup(group.title)} activeOpacity={0.8}>
                    <View style={[styles.groupIconBox, { backgroundColor: colors[group.color] }]}><ServiceIcon name={group.icon} size={18} color={colors.onPrimary} /></View>
                    <Text style={styles.groupHeaderText}>{group.title}</Text>
                    <View style={styles.groupLine} />
                    <Text style={styles.chevron}>{isCollapsed ? '›' : '⌄'}</Text>
                  </TouchableOpacity>

                  {!isCollapsed && (
                    <View style={styles.grid}>
                      {group.items.map((item) => {
                        const active = screen === item.key;
                        return (
                          <TouchableOpacity key={`${group.title}-${item.key}`} style={[styles.gridItem, item.featured && styles.featuredItem, active && styles.gridItemActive]} onPress={() => goTo(item.key)} activeOpacity={0.78}>
                            <View style={[styles.itemIconBox, active && styles.itemIconBoxActive]}><ServiceIcon name={item.icon} size={20} color={active ? colors.primary : colors.textSecondary} /></View>
                            <Text style={[styles.gridLabel, active && styles.gridLabelActive]} numberOfLines={2}>{item.label}</Text>
                            {active && <View style={styles.activeMark} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {groupIndex < groups.length - 1 && <View style={styles.groupDivider} />}
                </View>
              );
            })}

            {isAdmin && (
              <View style={styles.protectedCard}>
                <View style={styles.protectedIcon}><Text>kyc</Text></View>
                <View style={styles.protectedCopy}><Text style={styles.protectedTitle}>Protected access</Text><Text style={styles.protectedText}>Role and feature permissions remain enforced by the destination screens and backend rules.</Text></View>
              </View>
            )}
          </ScrollView>

          <View style={styles.brandFooter}>
            <View style={styles.brandIdentity}>
              <Image source={require('../../assets/icon-transparent.png')} style={styles.brandLogo} resizeMode="contain" />
              <View><View style={styles.brandRow}><Text style={styles.brandDark}>My</Text><Text style={styles.brandTeal}>Sheba</Text></View><Text style={styles.brandCompany}>SatuLink Solutions Sdn Bhd</Text></View>
            </View>
            <Text style={styles.brandVersion}>v{APP_VERSION}</Text>
          </View>
          <View style={styles.footer}><TouchableOpacity style={styles.logoutRow} onPress={onLogout} activeOpacity={0.8}><View style={styles.logoutIcon}><Text>profile</Text></View><Text style={styles.logoutLabel}>Logout</Text><Text style={styles.logoutArrow}>→</Text></TouchableOpacity></View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, flexDirection: 'row' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,15,30,0.62)' },
    drawer: { height: '100%', backgroundColor: colors.card, elevation: 14, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 6, height: 0 } },
    header: { paddingTop: 48, paddingBottom: 16, paddingHorizontal: 16, overflow: 'hidden' },
    closeBtn: { position: 'absolute', top: 42, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
    closeText: { color: 'white', fontSize: 15, fontWeight: '700' },
    headerTopRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 34 },
    avatarRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: 'rgba(255,255,255,0.42)', alignItems: 'center', justifyContent: 'center' },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: 'white', fontSize: 20, fontWeight: '800' },
    headerIdentity: { flex: 1, marginLeft: 12 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    name: { color: 'white', fontSize: 15, fontWeight: '800', flexShrink: 1 },
    phone: { color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 3 },
    roleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 13 },
    rolePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.17)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
    rolePillIcon: { fontSize: 12 }, rolePillText: { color: 'white', fontSize: 10.5, fontWeight: '800' },
    securePill: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
    secureText: { color: 'rgba(255,255,255,0.8)', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.7 },
    consoleBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 12, marginBottom: 2, padding: 11, borderRadius: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
    consoleDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginRight: 10 },
    consoleCopy: { flex: 1 }, consoleTitle: { color: colors.text, fontSize: 13, fontWeight: '800' }, consoleSub: { color: colors.textSecondary, fontSize: 9.5, marginTop: 2 },
    homeShortcut: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, homeShortcutText: { color: colors.primary, fontSize: 19, fontWeight: '800' },
    menuScroll: { flex: 1 }, menuContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
    groupBlock: { marginBottom: 2 },
    groupHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 42, paddingHorizontal: 2, borderBottomWidth: 1 },
    groupIconBox: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
    groupIcon: { fontSize: 15 }, groupHeaderText: { color: colors.text, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    groupLine: { flex: 1 }, chevron: { color: colors.textSecondary, fontSize: 21, lineHeight: 21, paddingHorizontal: 7 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: 9 },
    gridItem: { width: '48.2%', minHeight: 57, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingVertical: 9, paddingHorizontal: 8, marginBottom: 8 },
    featuredItem: { borderColor: colors.primary, backgroundColor: colors.card },
    gridItemActive: { borderColor: colors.primary, backgroundColor: colors.card, elevation: 2, shadowColor: colors.primary, shadowOpacity: 0.12, shadowRadius: 4 },
    itemIconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
    itemIconBoxActive: { backgroundColor: colors.bg, borderColor: colors.primary }, gridIcon: { fontSize: 17 },
    gridLabel: { flex: 1, color: colors.text, fontSize: 11.5, fontWeight: '650' }, gridLabelActive: { color: colors.primary, fontWeight: '800' },
    activeMark: { position: 'absolute', left: -1, top: 11, bottom: 11, width: 3, borderRadius: 2, backgroundColor: colors.primary },
    groupDivider: { height: 8 },
    protectedCard: { flexDirection: 'row', marginTop: 5, marginBottom: 2, padding: 11, borderRadius: 13, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
    protectedIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
    protectedCopy: { flex: 1 }, protectedTitle: { color: colors.text, fontSize: 10.5, fontWeight: '800' }, protectedText: { color: colors.textSecondary, fontSize: 9.5, lineHeight: 14, marginTop: 2 },
    brandFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border },
    brandIdentity: { flexDirection: 'row', alignItems: 'center' }, brandLogo: { width: 30, height: 30, marginRight: 8, opacity: 0.9 }, brandRow: { flexDirection: 'row' }, brandDark: { fontSize: 14, fontWeight: '900', color: colors.navy }, brandTeal: { fontSize: 14, fontWeight: '900', color: colors.primary }, brandCompany: { color: colors.textSecondary, fontSize: 8.5, marginTop: 1 }, brandVersion: { color: colors.textSecondary, fontSize: 9, fontWeight: '700' },
    footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: 17 },
    logoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16 }, logoutIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', marginRight: 9 }, logoutLabel: { flex: 1, color: colors.error, fontSize: 13, fontWeight: '800' }, logoutArrow: { color: colors.error, fontSize: 18, fontWeight: '700' },
  });
}
