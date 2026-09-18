import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { useServiceAction, Tile } from '../components/ServiceGrid';

const SECONDARY_SERVICES = [
  { key: 'fomema', icon: '🏥', name: 'FOMEMA', kind: 'webview' },
  { key: 'visa', icon: '🛂', name: 'Visa Malaysia', kind: 'webview' },
  { key: 'mydigital', icon: '🛬', name: 'Malaysia Arrival Card', kind: 'webview' },
  { key: 'passport', icon: '📔', name: 'Passport', kind: 'webview' },
];

const PERSONAL_FEATURES = [
  { key: 'walletTransfer', icon: '💸', name: 'Wallet Transfer', kind: 'walletTransfer' },
  { key: 'myDocuments', icon: '📄', name: 'My Documents', kind: 'documents' },
  { key: 'salary', icon: '💼', name: 'Salary & OT', kind: 'salary' },
  { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
  { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
  { key: 'kyc', icon: '🪪', name: 'Profile & KYC', kind: 'kyc' },
  { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
  { key: 'businessProfile', icon: '🏢', name: 'My Business', kind: 'businessProfile' },
];

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
  const { goBackOrHome, profile } = useApp();
  const handlePress = useServiceAction();
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
            <Section title="More Services" subtitle="Government and Malaysia services" items={SECONDARY_SERVICES} onPress={handlePress} />
            <Section title="Personal" subtitle="Your account, documents and activity" items={PERSONAL_FEATURES} onPress={handlePress} />
          </>
        ) : (
          <Section title="Account & Operations" subtitle="Manage your account and operational features" items={STAFF_FEATURES} onPress={handlePress} />
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
