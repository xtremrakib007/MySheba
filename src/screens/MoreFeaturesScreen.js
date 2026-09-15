import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { useServiceAction, Tile } from '../components/ServiceGrid';

const CUSTOMER_FEATURES = [
  { key: 'walletTransfer', icon: '💸', name: 'Wallet Transfer', kind: 'walletTransfer' },
  { key: 'myDocuments', icon: '📄', name: 'My Documents', kind: 'documents' },
  { key: 'salary', icon: '💼', name: 'Salary', kind: 'salary' },
  { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
  { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
  { key: 'kyc', icon: '🪪', name: 'Profile & KYC', kind: 'kyc' },
  { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
];

const STAFF_FEATURES = [
  { key: 'myDocuments', icon: '📄', name: 'My Documents', kind: 'documents' },
  { key: 'salary', icon: '💼', name: 'Salary', kind: 'salary' },
  { key: 'history', icon: '📋', name: 'Transactions', kind: 'history' },
  { key: 'myAccount', icon: '👤', name: 'My Account', kind: 'myaccount' },
  { key: 'profile', icon: '🪪', name: 'Profile & KYC', kind: 'profile' },
  { key: 'support', icon: '🎧', name: 'Support', kind: 'support' },
];

export default function MoreFeaturesScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, profile } = useApp();
  const handlePress = useServiceAction();
  const isCustomer = !profile?.role || profile.role === 'customer';
  const features = isCustomer ? CUSTOMER_FEATURES : STAFF_FEATURES;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More Features</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={goBackOrHome}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>{isCustomer ? 'Manage your wallet, documents, account and financial activity.' : 'Manage your account and operational features.'}</Text>
        <View style={styles.grid}>
          {features.map((item) => <Tile key={item.key} s={item} onPress={() => handlePress(item)} />)}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: colors.card },
    headerTitle: { color: colors.text, fontWeight: '800', fontSize: 20 },
    closeBtn: { position: 'absolute', right: 16, top: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    closeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    content: { padding: 14, paddingBottom: 40 },
    subtitle: { color: colors.muted || '#6B7280', fontSize: 12, marginBottom: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  });
}
