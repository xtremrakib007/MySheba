import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { useServiceAction, Tile } from '../components/ServiceGrid';
import { overflowTiles } from '../components/serviceTiles';
import * as gridManagementService from '../firebase/gridManagementService';


// 'My Business' is deliberately absent: it routed to a 'businessProfile'
// screen that no longer exists (see AppContext's "retired listing routes are
// no longer exposed"), so the tile survived the feature and gave customers a
// blank page. A tile with nowhere to go is worse than no tile.
const PERSONAL_FEATURES = [
  { key: 'walletTransfer', icon: '💸', name: 'Wallet Transfer', kind: 'walletTransfer' },
  { key: 'myDocuments', icon: '📄', name: 'My Documents', kind: 'documents' },
  { key: 'salary', icon: '💼', name: 'Salary & OT', kind: 'salary' },
  { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
  { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
  { key: 'kyc', icon: '🪪', name: 'Profile & KYC', kind: 'kyc' },
  { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
];

// Every customer tile that the home screen does NOT show, so a finished
// feature cannot go unreachable just because nobody flagged it `home: true`.
//
// This used to be a hand-written list of FOMEMA / Visa / Arrival Card /
// Passport - all four of which are already ON the home screen, so this
// screen duplicated four tiles while PIN Generate, Bill Payment and
// Entertainment appeared in neither place and could not be opened at all.
// Deriving it means adding a tile to PRIMARY_SERVICES is enough: it shows
// up on the home screen or here, never nowhere.
//
// Anything the Personal section already covers is left out rather than
// listed twice; it matches on `kind`, because the same feature is keyed
// 'documents' in the service list and 'myDocuments' here.
const PERSONAL_KINDS = new Set(PERSONAL_FEATURES.map((f) => f.kind));
// Built per render by overflowTiles, because what counts as "not on the home
// screen" now depends on the live WebView settings as well as the declaration.

const STAFF_FEATURES = [
  { key: 'myDocuments', icon: '📄', name: 'My Documents', kind: 'documents' },
  { key: 'salary', icon: '💼', name: 'Salary & OT', kind: 'salary' },
  { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
  { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
  { key: 'profile', icon: '🪪', name: 'Profile & KYC', kind: 'profile' },
  { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
];

function Section({ title, subtitle, items, onPress }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {!!subtitle && <Text style={[styles.sectionSubtitle, { color: colors.muted || '#6B7280' }]}>{subtitle}</Text>}
      <View style={styles.grid}>
        {items.map((item) => <Tile key={item.key} s={item} onPress={() => onPress(item)} />)}
      </View>
    </View>
  );
}

export default function MoreFeaturesScreen() {
  const { colors } = useTheme();
  const { goBackOrHome, profile, gridManagement, gridViewer, webviewPages } = useApp();
  // One source for both halves of this file's rule - a finished tile lands on
  // the home screen or here, never nowhere - whether "not on the home screen"
  // is how the tile was declared or how a superadmin has since set it. The
  // Grid Management gate is applied here, so `visible()` is not needed again.
  const overflow = overflowTiles({
    webviewPages,
    isActive: (key) => gridManagementService.isGridActive(gridManagement, key, gridViewer),
    excludeKinds: PERSONAL_KINDS,
  });
  const handlePress = useServiceAction();
  const visible = (items) => items.filter((item) => gridManagementService.isGridActive(gridManagement, item.key, gridViewer));
  const isCustomer = !profile?.role || profile.role === 'customer';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More Services & Features</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={goBackOrHome} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {isCustomer ? (
          <>
            {/* Hidden when empty - every service tile being on the home
                screen is the good case, not a reason for a bare heading. */}
            {overflow.length > 0 && (
              <Section title="More Services" subtitle="Not shown on your home screen" items={overflow} onPress={handlePress} />
            )}
            <Section title="Personal" subtitle="Your account, documents and activity" items={visible(PERSONAL_FEATURES)} onPress={handlePress} />
          </>
        ) : (
          <Section title="Account & Operations" subtitle="Manage your account and operational features" items={visible(STAFF_FEATURES)} onPress={handlePress} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle: { color: '#111827', fontWeight: '800', fontSize: 19 },
  closeBtn: { position: 'absolute', right: 16, top: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: '#1A73E8', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  content: { padding: 14, paddingBottom: 40 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  sectionSubtitle: { fontSize: 11, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
