import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from '../i18n/LanguageContext';

// Home page tiles show icon + name only - no step count or points price.
// The live, admin-editable point cost (AppContext.pointCosts) is still
// shown to the user, but only in the confirm dialog right before a
// webview opens (see openWebView in AppContext.js), not here.
const SERVICES = [
  { key: 'recharge', icon: '📱', bg: '#E8F5E9', accent: '#43A047', name: 'Recharge', steps: '4 Steps', kind: 'service' },
  { key: 'mobilebanking', icon: '🏦', bg: '#E3F2FD', accent: '#1E88E5', name: 'Mobile Banking', steps: '3 Steps', kind: 'service' },
  { key: 'internet', icon: '📡', bg: '#FFF3E0', accent: '#FB8C00', name: 'Internet', steps: '4 Steps', kind: 'service' },
  { key: 'remittance', icon: '💸', bg: '#F3E5F5', accent: '#8E24AA', name: 'Remittance', steps: '6 Steps', kind: 'service' },
  // Bus isn't a single webview - tapping opens BusPickerScreen's 3-option
  // grid (redBus / Bus Online Ticket / Easybook), each of which is its
  // own webview key. See 'buspicker' kind below + AppContext.openBusPicker.
  // pointsKey just needs to be any key in PAYMENT_CHARGED_WEBVIEWS that
  // shares the bus partners' price, since all of them cost the same
  // (pointCosts maps every PAYMENT_CHARGED_WEBVIEWS key to the same
  // paymentSuccessCost - see AppContext.pointCosts).
  { key: 'bus', icon: '🚌', bg: '#FCE4EC', accent: '#D81B60', name: 'Bus', pointsKey: 'bus-redbus', pointsLabel: 'pts on payment', kind: 'buspicker' },
  { key: 'train', icon: '🚂', bg: '#E0F7FA', accent: '#00ACC1', name: 'Train', pointsKey: 'train', pointsLabel: 'pts on payment', kind: 'webview' },
  { key: 'flight', icon: '✈️', bg: '#E8EAF6', accent: '#3949AB', name: 'Flight', steps: '7 Steps', kind: 'service' },
  { key: 'fomema', icon: '🏥', bg: '#E8F5E9', accent: '#43A047', name: 'FOMEMA', pointsKey: 'fomema', pointsLabel: 'pts on search', kind: 'webview' },
  { key: 'visa', icon: '🛂', bg: '#F3E5F5', accent: '#8E24AA', name: 'Visa', pointsKey: 'visa', pointsLabel: 'pts on search', kind: 'webview' },
  { key: 'mydigital', icon: '💻', bg: '#E1F5FE', accent: '#0288D1', name: 'Malaysia Arrival Card', pointsKey: 'mydigital', pointsLabel: 'pts on submit', kind: 'webview' },
  { key: 'passport', icon: '📔', bg: '#FFF8E1', accent: '#F9A825', name: 'Passport', pointsKey: 'passport', pointsLabel: 'pts on submit', kind: 'webview' },
  // Marketplace (Buy & Sell) - Phase 1 of the Marketplace PRD. No points
  // cost, no step wizard - just opens the browse/search home screen. See
  // AppContext.openMarketplace + src/screens/MarketplaceHomeScreen.js.
  { key: 'marketplace', icon: '🛒', bg: '#FFF3E0', accent: '#F4511E', name: 'Marketplace', kind: 'marketplace' },
  // Private per-user document vault - passport, visa, work permit, etc.
  // No points cost, no webview - just opens MyDocumentsScreen. See
  // AppContext.openMyDocuments + src/screens/MyDocumentsScreen.js.
  { key: 'myDocuments', icon: '📁', bg: '#E1F5FE', accent: '#0288D1', name: 'My Documents', kind: 'documents' },
  // Salary & OT calculator/tracker (Salary & OT PRD section 2). No points
  // cost, no webview - just opens SalaryDashboardScreen. See
  // AppContext.openSalary + src/screens/SalaryDashboardScreen.js.
  { key: 'salary', icon: '💰', bg: '#FFF8E1', accent: '#F9A825', name: 'Salary & OT', kind: 'salary' },
];

// "More Features" grid - fills out to the same 3x4 (12) shape as the
// primary grid. These route to existing screens/hubs that already exist
// elsewhere in the app (bottom-nav destinations, account screens) - just
// exposed here as direct tiles too.
//
// NOTE: Accommodation / Room Sharing / Community / Local Services are
// deliberately NOT repeated here - they're already the Marketplace tile's
// own sub-modules (see MarketplaceHubScreen.js's MODULES list), so listing
// them again here just duplicated the same destination under two
// different tiles. Tapping Marketplace (in SERVICES above) already gets
// you to Buy & Sell / Accommodation / Room Sharing / Services / Community
// in one hub with a sub-nav - that's the single source of truth for those
// five, not this list.
const MORE_FEATURES = [
  // Pay-on-success like Bus: opening is gated by a wallet check + a
  // deduct-warning dialog (see AppContext.openWebView), and the points are
  // only actually deducted once a purchase completes on CelcomDigi.
  { key: 'esim', icon: '📶', bg: '#E0F2F1', accent: '#00897B', name: 'MY e-SIM', pointsKey: 'esim', pointsLabel: 'pts on payment', kind: 'webview' },
  // Next Update PRD §3 - Social Feed (general Facebook-style posts). A
  // direct top-level tile, unlike Community above - Social Feed isn't a
  // marketplace/classifieds sub-module (Jobs/Events/Lost&Found/etc.), it's
  // a general feed, so it doesn't belong inside MarketplaceHubScreen's
  // module switcher the way Community does. Also reachable from the
  // Social Feed section on SocialHomeScreen when that country's homepage
  // layout is social-first.
  { key: 'social', icon: '📣', bg: '#FCE4EC', accent: '#AD1457', name: 'Social Feed', kind: 'social' },
  { key: 'support', icon: '🎧', bg: '#E0F7FA', accent: '#00838F', name: 'Support', kind: 'support' },
  { key: 'history', icon: '🕒', bg: '#EDE7F6', accent: '#5E35B1', name: 'History', kind: 'history' },
  { key: 'chat', icon: '💬', bg: '#E8F5E9', accent: '#2E7D32', name: 'Chat', kind: 'chathub' },
  { key: 'myAccount', icon: '🧾', bg: '#FFF8E1', accent: '#F9A825', name: 'My Account', kind: 'myaccount' },
  { key: 'profile', icon: '👤', bg: '#E1F5FE', accent: '#0288D1', name: 'Profile', kind: 'profile' },
  // Private per-user notepad - general notes plus Credit/Debit/Loan
  // "money notes" for tracking who owes what. No points cost, no
  // webview - just opens NotepadScreen. See AppContext.openNotepad +
  // src/screens/NotepadScreen.js.
  { key: 'notepad', icon: '🗒️', bg: '#FFFDE7', accent: '#F9A825', name: 'Notepad', kind: 'notepad' },
];

// Home grid holds the first 11 entries in SERVICES (Recharge...Passport -
// e-SIM was moved out into MORE_FEATURES below). Anything beyond that count
// automatically falls into the "More Features" page instead of growing the
// main grid - so new features can just be appended to SERVICES without ever
// breaking the home layout.
const PRIMARY_COUNT = 11;

// Fixed 4-per-row grid (matches the bordered/gradient tile redesign),
// computed in pixels so it can never wrap to a different column count
// regardless of screen width (percentage width + gap was doing that before -
// the two combined pushed tiles past the container edge on some phones).
// GRID_PADDING must match `grid.paddingHorizontal` below and COLUMN_GAP must
// match `grid.gap` below - keep them in sync if you tweak the styles.
const NUM_COLUMNS = 4;
const GRID_PADDING = 10;
const COLUMN_GAP = 8;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CONTAINER_WIDTH = Math.min(SCREEN_WIDTH, 480) - GRID_PADDING * 2;
const ITEM_WIDTH = (CONTAINER_WIDTH - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

const PRIMARY_SERVICES = SERVICES.slice(0, PRIMARY_COUNT);
// The 3 leftover primary services (Marketplace, My Documents, Salary & OT)
// plus MORE_FEATURES fill the "More Features" grid out to 12 tiles too.
const MORE_SERVICES = [...SERVICES.slice(PRIMARY_COUNT), ...MORE_FEATURES];

// The 12th tile on the homepage itself (filling out PRIMARY_SERVICES' 11
// to a full 3x4 grid) - taps straight through to MoreFeaturesScreen
// instead of the whole MORE_SERVICES list being rendered a second time
// inline on the homepage. Kept as its own tile object (not part of
// SERVICES/MORE_SERVICES) so it never shows up a second time on the
// More Features page itself.
const MORE_FEATURES_TILE = {
  key: 'moreFeaturesTile', icon: '✨', bg: '#EDE7F6', accent: '#5E35B1', name: 'More Features', kind: 'moreFeaturesLink',
};

// Exported so MoreFeaturesScreen (a standalone page, not an inline
// expand/collapse anymore) can render the exact same tile look without
// duplicating the styling.
export function Tile({ s, onPress, disabled }) {
  const {
    colors, isDark, gridStyle
  } = useTheme();
  const { t } = useLanguage();

  const styles = createStyles(colors);
  // Falls back to s.name for tiles with no service.* dictionary entry
  // (e.g. AdminHomeScreen/DealerHomeScreen's role-specific "extraTiles" -
  // see ServiceGrid's extraTiles prop below), so those keep working
  // untranslated rather than showing a raw key.
  const label = t(`service.${s.key}`, s.name);

  if (gridStyle === 'classic') {
    return (
      <TouchableOpacity
        style={[styles.itemClassic, { width: ITEM_WIDTH, backgroundColor: s.bg }]}
        activeOpacity={0.7}
        disabled={disabled}
        onPress={onPress}
      >
        <View style={[styles.accentBar, { backgroundColor: s.accent }]} />
        <View style={[styles.iconWrap, { backgroundColor: colors.card }]}>
          <Text style={styles.iconTextClassic}>{s.icon}</Text>
        </View>
        <Text style={styles.name} numberOfLines={2}>{label}</Text>
      </TouchableOpacity>
    );
  }

  if (gridStyle === 'soft') {
    return (
      <TouchableOpacity
        style={[styles.itemSoft, { width: ITEM_WIDTH, backgroundColor: colors.card }]}
        activeOpacity={0.7}
        disabled={disabled}
        onPress={onPress}
      >
        <View style={[styles.badgeWrapSoft, { backgroundColor: s.bg }]}>
          <Text style={styles.iconTextSoft}>{s.icon}</Text>
        </View>
        <Text style={styles.name} numberOfLines={2}>{label}</Text>
      </TouchableOpacity>
    );
  }

  if (gridStyle === 'minimal') {
    return (
      <TouchableOpacity
        style={[styles.itemMinimal, { width: ITEM_WIDTH }]}
        activeOpacity={0.6}
        disabled={disabled}
        onPress={onPress}
      >
        <View style={[styles.badgeWrapMinimal, { backgroundColor: s.bg }]}>
          <Text style={styles.iconTextSoft}>{s.icon}</Text>
        </View>
        <Text style={styles.name} numberOfLines={2}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.item, { width: ITEM_WIDTH }]}
      activeOpacity={0.7}
      disabled={disabled}
      onPress={onPress}
    >
      <LinearGradient
        colors={isDark ? [colors.card, colors.card] : ['#FFFFFF', '#EAF3FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.itemGradient}
      >
        <Text style={styles.iconText}>{s.icon}</Text>
        <Text style={styles.name} numberOfLines={2}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// Every tile kind (webview / service / marketplace / salary / documents /
// the Marketplace-hub sub-modules / the account & nav shortcuts) routes
// through this same resolver. Exported as a hook so MoreFeaturesScreen can
// reuse the exact same tap behaviour instead of re-implementing it.
export function useServiceAction() {
  const {
    startService, openWebView, openBusPicker, openMarketplace, openSalary, openMyDocuments, openNotepad,
    openAccommodation, openRoomSharing, openCommunity, openServiceProvidersHome,
    openChatHub, openSocialFeed, setScreen,
  } = useApp();

  return (s) => {
    if (s.kind === 'webview') return openWebView(s.key);
    if (s.kind === 'buspicker') return openBusPicker();
    if (s.kind === 'marketplace') return openMarketplace();
    if (s.kind === 'salary') return openSalary();
    if (s.kind === 'documents') return openMyDocuments();
    if (s.kind === 'notepad') return openNotepad();
    if (s.kind === 'accommodation') return openAccommodation();
    if (s.kind === 'roomsharing') return openRoomSharing();
    if (s.kind === 'community') return openCommunity();
    // Next Update PRD §3 - Social Feed tile. Not yet added to any tile
    // config list (MORE_SERVICES / homepageConfigService) - see PRD
    // question about SocialHomeScreen's preview before placing it.
    if (s.kind === 'social') return openSocialFeed();
    if (s.kind === 'localservices') return openServiceProvidersHome();
    if (s.kind === 'chathub') return openChatHub();
    if (s.kind === 'moreFeaturesLink') return setScreen('moreFeatures');
    if (s.kind === 'support') return setScreen('support');
    if (s.kind === 'history') return setScreen('history');
    if (s.kind === 'myaccount') return setScreen('myAccount');
    if (s.kind === 'profile') return setScreen('profile');
    return startService(s.key);
  };
}

export { MORE_SERVICES };

// extraTiles: optional array of extra tiles appended after the standard
// 12 (e.g. AdminHomeScreen/DealerHomeScreen add a single "Admin Features" /
// "Dealer Features" tile here so their role-specific tools get one link
// off the *same* Quick Services grid customers see, instead of a
// separate grid). Each entry needs { key, icon, bg, accent, name, onPress }.
// Customers pass nothing, so their grid is completely unchanged.
export default function ServiceGrid({ extraTiles = [] }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { webViewBusy } = useApp();
  const handlePress = useServiceAction();

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>🎯 Quick Services</Text>
      </View>
      <View style={styles.grid}>
        {PRIMARY_SERVICES.map((s) => (
          <Tile
            key={s.key}
            s={s}
            disabled={s.kind === 'webview' && webViewBusy}
            onPress={() => handlePress(s)}
          />
        ))}
        {/* Fills the empty 12th slot in the 4x3 primary grid. Tapping
            navigates to MoreFeaturesScreen (a normal back-stack page,
            see ServiceGrid's MORE_SERVICES) instead of rendering the
            whole "More Features" grid inline on the homepage. */}
        <Tile s={MORE_FEATURES_TILE} onPress={() => handlePress(MORE_FEATURES_TILE)} />
        {extraTiles.map((t) => (
          <Tile key={t.key} s={t} onPress={t.onPress} />
        ))}
      </View>
    </View>
  );
}

// Exported so MoreFeaturesScreen's grid lines up exactly with this one.
export { GRID_PADDING, COLUMN_GAP };

function createStyles(colors) {
  return StyleSheet.create({
    sectionHead: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 8 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.navy },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GRID_PADDING, gap: COLUMN_GAP },
    item: {
      borderRadius: radius.lg, marginBottom: 8, overflow: 'hidden',
      borderWidth: 1.5, borderColor: colors.secondary,
    },
    itemGradient: {
      paddingVertical: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
    },
    iconText: { fontSize: 30, marginBottom: 8 },
    name: { fontSize: 11, fontWeight: '600', textAlign: 'center', color: colors.text },
    // Classic style (previous design) - colored tile background, top
    // accent bar, white icon circle. Selectable via Settings > Grid Style.
    itemClassic: {
      borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 4,
      alignItems: 'center', marginBottom: 8, overflow: 'hidden',
      shadowColor: '#0B2447', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
    iconWrap: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 6, marginTop: 2 },
    iconTextClassic: { fontSize: 20 },
    // Soft style - flat colored icon badge on a plain shadowed card, no
    // border and no accent bar (distinct from both bordered and classic).
    itemSoft: {
      borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 4,
      alignItems: 'center', marginBottom: 8,
      shadowColor: '#0B2447', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    badgeWrapSoft: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    iconTextSoft: { fontSize: 21 },
    // Minimal style - no card at all, just a tinted icon badge and label
    // floating directly on the screen background.
    itemMinimal: { alignItems: 'center', marginBottom: 8, paddingVertical: 4 },
    badgeWrapMinimal: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  });
}
