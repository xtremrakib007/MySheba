import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import VerifiedBadge from '../components/VerifiedBadge';
import { formatWalletAmount } from '../firebase/walletExchangeRateService';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

function formatMemberSince(ts) {
  if (!ts || !ts.seconds) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function Row({ label, value, verified }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueGroup}>
        <Text style={styles.rowValue}>{value}</Text>
        {!!verified && <VerifiedBadge verified size="sm" />}
      </View>
    </View>
  );
}

export default function MyAccountScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, setScreen, profile } = useApp();

  const walletCurrency = profile?.walletCurrency || profile?.walletBalanceCurrency || 'MYR';
  const walletBalance = profile && typeof profile.walletBalance === 'number' ? profile.walletBalance : 0;
  const isCustomer = !profile || profile.role === 'customer';

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Account</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {!!isCustomer && (
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Wallet Balance</Text>
            <Text style={styles.balanceValue}>{formatWalletAmount(walletBalance, walletCurrency)}</Text>
            <TouchableOpacity style={styles.topupBtn} onPress={() => setScreen('topup')}>
              <Text style={styles.topupBtnText}>+ Top Up</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>Account Details</Text>
        <View style={styles.card}>
          <Row label="Name" value={profile ? profile.name : '—'} verified={!!profile?.verified} />
          <View style={styles.divider} />
          <Row label="Phone Number" value={profile ? profile.phone : '—'} />
          <View style={styles.divider} />
          <Row label="Account Type" value={profile ? (ROLE_LABEL[profile.role] || profile.role) : '—'} />
          <View style={styles.divider} />
          <Row label="Member Since" value={formatMemberSince(profile ? profile.createdAt : null)} />
        </View>

        <Text style={styles.sectionTitle}>Quick Links</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.linkRow} onPress={() => setScreen('history')}>
            <Text style={styles.linkIcon}>📋</Text>
            <Text style={styles.linkLabel}>Order & Transaction History</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.linkRow} onPress={() => setScreen('reports')}>
            <Text style={styles.linkIcon}>📊</Text>
            <Text style={styles.linkLabel}>Reports</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.linkRow} onPress={() => setScreen('verifyIdentity')}>
            <Text style={styles.linkIcon}>🪪</Text>
            <Text style={styles.linkLabel}>{profile?.verified ? 'Verified ✓' : 'Get Verified'}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    balanceCard: { backgroundColor: colors.primary, margin: 16, borderRadius: radius.lg, padding: 20, alignItems: 'center' },
    balanceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
    balanceValue: { color: 'white', fontSize: 26, fontWeight: '700', marginTop: 6 },
    topupBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 8, paddingHorizontal: 20, borderRadius: radius.md, marginTop: 14 },
    topupBtnText: { color: 'white', fontWeight: '700', fontSize: 12 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 20, marginBottom: 8, marginHorizontal: 16 },
    card: { backgroundColor: colors.card, marginHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14 },
    rowLabel: { fontSize: 13, color: '#999' },
    rowValueGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowValue: { fontSize: 13, color: colors.text, fontWeight: '600' },
    divider: { height: 1, backgroundColor: '#F0F0F0' },
    linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
    linkIcon: { fontSize: 18, width: 22, textAlign: 'center' },
    linkLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text },
    chevron: { fontSize: 16, color: '#CCC' },
  });
}
