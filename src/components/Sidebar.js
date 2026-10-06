import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, Dimensions, Easing, Image, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import * as gridService from '../firebase/gridManagementService';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from './HeaderDecor';
import VerifiedBadge from './VerifiedBadge';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { showAlert } from '../utils/appAlert';
import { useAppSync } from './useAppSync';
import ServiceIcon from './ServiceIcon';
// Rows draw from the same set the grids use, so the menu and the grid agree
// and there are enough icons to give each row its own. Group headers and the
// role pill stay on ServiceIcon: those sit on a filled colour and want a flat
// white glyph, not a colour illustration.
import ServiceArt from './ServiceArt';

const APP_VERSION = (Constants.expoConfig?.version || '1.0.0').split('.').slice(0, 3).join('.');

/**
 * Which bundle this app is actually running.
 *
 * The version number cannot answer that: an OTA changes the JavaScript and
 * leaves the version alone, so a phone on last week's bundle and a phone on
 * today's both read v5.4.1. The only way to tell them apart was to look for a
 * change and guess - which is how "that fix did not arrive" and "that fix was
 * never published" became the same sentence.
 *
 * Updates.createdAt is when the running bundle was published; it is null on a
 * build running its own bundled JavaScript, which is itself worth saying.
 */
function bundleLabel() {
  try {
    const published = Updates.createdAt;
    if (!published) return 'built in';
    const d = new Date(published);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (v) => String(v).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    // expo-updates is not available in every environment. A missing line is
    // better than a sidebar that will not open.
    return '';
  }
}
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(360, SCREEN_WIDTH * 0.9);
const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

// `tab: true` means the key is an AdminHomeScreen tab, not a screen App.js
// renders. goTo() has to open those through setAdminTab, because passing a
// tab key straight to setScreen matches no branch in App.js and renders a
// blank white page - which is what all nine did. audit:nav checks both halves:
// an unflagged key must be a real screen, a flagged one a real adminTab.
const COMMON_GROUPS = [
  { title: 'Account', icon: 'profile', color: 'secondary', items: [
    { key: 'profile', icon: 'profile', label: 'Profile' },
    { key: 'myAccount', icon: 'myAccount', label: 'My Account' },
    { key: 'settings', icon: 'settings', label: 'Settings' },
  ] },
  { title: 'Work & Documents', icon: 'profile', color: 'primary', items: [
    { key: 'salaryDashboard', icon: 'salary', label: 'Salary & OT' },
    { key: 'reports', icon: 'reports', label: 'Reports' },
    { key: 'myDocuments', icon: 'myDocuments', label: 'My Documents' },
  ] },
];

const ADMIN_GROUPS = [
  { title: 'Admin Overview', icon: 'home', color: 'primary', items: [
    { key: 'adminHome', icon: 'adminHome', label: 'Control Center', featured: true },
    { key: 'adminAnalytics', icon: 'adminAnalytics', label: 'Analytics' },
  ] },
  { title: 'Operations', icon: 'settings', color: 'secondary', items: [
    { key: 'all', icon: 'history', label: 'Transactions', tab: true },
    { key: 'pending', icon: 'pending', label: 'Pending', tab: true },
    { key: 'inquiries', icon: 'inquiries', label: 'Inquiries', tab: true },
    { key: 'topups', icon: 'topup', label: 'Top-Ups', tab: true },
    { key: 'support', icon: 'support', label: 'Support' },
    { key: 'reconcileTransactions', icon: 'reports', label: 'Uncertain Transactions' },
  ] },
  { title: 'Finance & Pricing', icon: 'topup', color: 'primary', items: [
    { key: 'rates', icon: 'rates', label: 'Rates', tab: true },
    { key: 'pricing', icon: 'pricing', label: 'Pricing', tab: true },
    { key: 'payments', icon: 'payments', label: 'Payments', tab: true },
    { key: 'transferPoints', icon: 'walletTransfer', label: 'Wallet Transfer' },
      ] },
  { title: 'Users & Verification', icon: 'profile', color: 'secondary', items: [
    { key: 'userManagement', icon: 'userManagement', label: 'User Management' },
    { key: 'verificationManagement', icon: 'verificationManagement', label: 'KYC Verification' },
  ] },
  { title: 'Platform', icon: 'more', color: 'primary', items: [
    { key: 'featureAccess', icon: 'featureAccess', label: 'Feature Access' },
    { key: 'banners', icon: 'banners', label: 'Banners', tab: true },
    { key: 'announcements', icon: 'announcements', label: 'Announcements', tab: true },
    { key: 'adFeatureControls', icon: 'adFeatureControls', label: 'Ad Controls' },
  ] },
];

const SUPERADMIN_GROUPS = [
  { title: 'Superadmin Governance', icon: 'kyc', color: 'secondary', items: [
    { key: 'adminFeatures', icon: 'adminFeatures', label: 'System Control', featured: true },
    { key: 'trustedDevices', icon: 'trustedDevices', label: 'Trusted Devices' },
    { key: 'apiProviderManagement', icon: 'apiProviderManagement', label: 'API Providers' },
    { key: 'tierPromotions', icon: 'tierPromotions', label: 'Tier Promotions' },
    { key: 'superAdminTopup', icon: 'superAdminTopup', label: 'Wallet Top-Up' },
  ] },
  // Who sees what. These were reachable only through System Control > System,
  // two taps in, so the grid scoping and the WebView editor read as missing
  // features.
  //
  // Three rows have been removed from this drawer for the same reason, and the
  // reason is worth keeping: a superadmin sees COMMON + ADMIN + SUPERADMIN
  // groups at once, so a key listed in two of them is one screen offered twice.
  // "Tool Access" and "Feature Access" were both featureAccess. "Verification
  // Queue" and "KYC Verification" were both verificationManagement - one screen
  // under two names, which reads as two features rather than as a duplicate.
  // "Reports" sat in Admin Overview while COMMON_GROUPS already gave it to
  // every role. audit:nav fails on a repeat now, so this stops being a thing
  // somebody has to notice.
  { title: 'Access Control', icon: 'featureAccess', color: 'secondary', items: [
    { key: 'gridManagement', icon: 'gridManagement', label: 'Grid Access' },
    { key: 'webviewManagement', icon: 'apiManagement', label: 'WebView Pages' },
    { key: 'tileLabels', icon: 'gridManagement', label: 'Tile Names & Icons' },
    { key: 'tilePlacement', icon: 'gridManagement', label: 'Home Screen Tiles' },
    { key: 'catalogue', icon: 'apiManagement', label: 'Service Catalogue' },
  ] },
  { title: 'Advertising', icon: 'more', color: 'secondary', items: [
    { key: 'adAnalytics', icon: 'adAnalytics', label: 'Ad Analytics' },
    { key: 'advertiserManagement', icon: 'advertiserManagement', label: 'Advertisers' },
    { key: 'adPackagesManagement', icon: 'adPackagesManagement', label: 'Ad Packages' },
    { key: 'adPaymentsManagement', icon: 'adPaymentsManagement', label: 'Ad Payments' },
  ] },
  { title: 'Staff & Salary', icon: 'profile', color: 'primary', items: [
    { key: 'salarySettings', icon: 'salarySettings', label: 'Salary Settings' },
    { key: 'salaryReports', icon: 'salaryReports', label: 'Salary Reports' },
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
  const { sidebarVisible, closeSidebar, setScreen, screen, profile, logout, gridManagement, gridViewer, adminTab, adminViewingSection, setAdminTab, setAdminViewingSection } = useApp();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Collapsed by default, so opening the sidebar shows the groups rather than
  // a wall of every destination at once. Tracked as `expanded` rather than
  // `collapsed` so the empty state means "all shut" without seeding it with
  // every group title - the groups depend on the role, so there is no one
  // list to seed from. The reset on open below then starts each visit shut.
  const [expanded, setExpanded] = useState({});
  // App.js wraps the whole app in <SafeAreaView edges={['top','bottom']}>, but a
  // React Native Modal renders in its own native window OUTSIDE that hierarchy,
  // so this drawer was the one piece of UI with no safe-area inset at all. At
  // 100% height it ran under the status bar at the top - which the hardcoded
  // paddingTop: 48 was compensating for by guesswork - and under the system
  // navigation bar at the bottom, where the scroll list ends and Logout sits.
  // That is the "scroll problem": the last rows and the logout button were
  // behind the nav bar, so the list looked like it would not scroll far enough.
  const insets = useSafeAreaInsets();
  // Every role reaches the sidebar; only two screens use AppHeader. So this is
  // the row that puts refresh in front of a dealer, a reseller and support,
  // who would otherwise have no way to ask for one.
  //
  // Up here with the other hooks, NOT down beside onLogout where it reads
  // better: `if (!sidebarVisible) return null` sits between the two, so a hook
  // below it runs only when the drawer is open. React counts the hooks each
  // render, and going from closed to open is then "more hooks than the previous
  // render" - which crashed the whole app the first time anybody opened the
  // sidebar.
  const { sync, busy: syncing } = useAppSync();

  const isSuperadmin = profile?.role === 'superadmin';
  const isAdmin = profile?.role === 'admin' || isSuperadmin;
  const groups = roleGroups(profile?.role);

  useEffect(() => {
    if (!sidebarVisible) return;
    translateX.stopAnimation();
    backdropOpacity.stopAnimation();
    translateX.setValue(-DRAWER_WIDTH);
    backdropOpacity.setValue(0);
    setExpanded({});
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [sidebarVisible]);

  if (!sidebarVisible) return null;

  const goTo = (key, asTab) => {
    const always = ['adminHome','adminFeatures','gridManagement','webviewManagement','featureAccess','tileLabels','tilePlacement','catalogue'];
    // Resolved for this person, not globally: a tile hidden from them in the
    // grid must not still be reachable from the sidebar.
    if (!always.includes(key) && !gridService.isGridActive(gridManagement, key, gridViewer)) { showAlert('MySheba', 'This feature is currently unavailable.'); return; }
    closeSidebar();
    // Same three steps AdminFeaturesScreen's openItem uses for a section:
    // pick the tab, tell AdminHomeScreen it is showing one, then go there.
    if (asTab) { setAdminTab(key); setAdminViewingSection(true); setScreen('adminHome'); return; }
    setScreen(key);
  };
  const toggleGroup = (title) => setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  const onSync = () => { closeSidebar(); sync(); };
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
          <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 16 }]}>
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
              {!!isSuperadmin && <View style={styles.securePill}><Text style={styles.secureText}>SECURE CONSOLE</Text></View>}
            </View>
          </LinearGradient>

          {!!isAdmin && (
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
              const isCollapsed = !expanded[group.title];
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
                        const active = item.tab
                          ? screen === 'adminHome' && adminViewingSection && adminTab === item.key
                          : screen === item.key;
                        return (
                          <TouchableOpacity key={`${group.title}-${item.key}`} style={[styles.gridItem, item.featured && styles.featuredItem, active && styles.gridItemActive]} onPress={() => goTo(item.key, item.tab)} activeOpacity={0.78}>
                            <View style={[styles.itemIconBox, active && styles.itemIconBoxActive]}><ServiceArt name={item.icon} size={22} color={active ? colors.primary : colors.textSecondary} /></View>
                            <Text style={[styles.gridLabel, active && styles.gridLabelActive]} numberOfLines={2}>{item.label}</Text>
                            {!!active && <View style={styles.activeMark} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {groupIndex < groups.length - 1 && <View style={styles.groupDivider} />}
                </View>
              );
            })}

            {!!isAdmin && (
              <View style={styles.protectedCard}>
                <View style={styles.protectedIcon}><ServiceIcon name="kyc" size={17} color={colors.primary} /></View>
                <View style={styles.protectedCopy}><Text style={styles.protectedTitle}>Protected access</Text><Text style={styles.protectedText}>Role and feature permissions remain enforced by the destination screens and backend rules.</Text></View>
              </View>
            )}
          </ScrollView>

          <View style={styles.brandFooter}>
            <View style={styles.brandIdentity}>
              <Image source={require('../../assets/icon-transparent.png')} style={styles.brandLogo} resizeMode="contain" />
              <View><View style={styles.brandRow}><Text style={styles.brandDark}>My</Text><Text style={styles.brandTeal}>Sheba</Text></View><Text style={styles.brandCompany}>SatuLink Solutions Sdn Bhd</Text></View>
            </View>
            <Text style={styles.brandVersion}>
              v{APP_VERSION}{bundleLabel() ? `  ·  ${bundleLabel()}` : ''}
            </Text>
          </View>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 17 }]}><TouchableOpacity style={styles.syncRow} onPress={onSync} activeOpacity={0.8} disabled={syncing} accessibilityRole="button" accessibilityLabel="Refresh and check for updates"><View style={styles.logoutIcon}><Text style={[styles.syncIcon, { color: colors.primary }]}>↻</Text></View><Text style={[styles.syncLabel, { color: colors.text }]}>{syncing ? 'Refreshing…' : 'Refresh & check for updates'}</Text></TouchableOpacity><TouchableOpacity style={styles.logoutRow} onPress={onLogout} activeOpacity={0.8}><View style={styles.logoutIcon}><ServiceIcon name="profile" size={18} color={colors.danger || '#B00020'} /></View><Text style={styles.logoutLabel}>Logout</Text><Text style={styles.logoutArrow}>→</Text></TouchableOpacity></View>
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
    // paddingTop comes from the safe-area inset at the call site.
    header: { paddingBottom: 16, paddingHorizontal: 16, overflow: 'hidden' },
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
    // Packed left with a fixed gap: `space-between` pushed a two-item group's
    // rows against opposite margins with a gap between them, which reads as a
    // layout fault rather than a short row.
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: 8, paddingTop: 9 },
    gridItem: { width: '47%', minHeight: 57, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingVertical: 9, paddingHorizontal: 8, marginBottom: 8 },
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
    // paddingBottom comes from the safe-area inset at the call site.
    footer: { borderTopWidth: 1, borderTopColor: colors.border },
    syncRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    syncIcon: { fontSize: 17, fontWeight: '800' },
    syncLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
    logoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16 }, logoutIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', marginRight: 9 }, logoutLabel: { flex: 1, color: colors.error, fontSize: 13, fontWeight: '800' }, logoutArrow: { color: colors.error, fontSize: 18, fontWeight: '700' },
  });
}
