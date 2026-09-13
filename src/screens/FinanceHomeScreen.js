import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';

const FINANCE_SERVICES = [
  { key: 'send', icon: '↗', title: 'Send Money', action: 'remittance' },
  { key: 'receive', icon: '↓', title: 'Receive Money', action: 'myAccount' },
  { key: 'remittance', icon: '🌍', title: 'Remittance', action: 'remittance' },
  { key: 'recharge', icon: '⚡', title: 'Recharge', action: 'recharge' },
  { key: 'mobilebanking', icon: '💳', title: 'Mobile Banking', action: 'mobilebanking' },
  { key: 'internet', icon: '🌐', title: 'Internet', action: 'internet' },
  { key: 'history', icon: '↔', title: 'Transactions', action: 'history' },
  { key: 'account', icon: '▣', title: 'My Account', action: 'myAccount' },
  { key: 'support', icon: '?', title: 'Support', action: 'support' },
];

const TRAVEL_SERVICES = [
  { key: 'bus', icon: '🚌', title: 'Bus', action: 'bus' },
  { key: 'train', icon: '🚆', title: 'Train', action: 'train' },
  { key: 'flight', icon: '✈️', title: 'Flight', action: 'flight' },
  { key: 'visa', icon: '🛂', title: 'Visa', action: 'visa' },
  { key: 'arrival', icon: '🛬', title: 'Arrival Card', action: 'mydigital' },
  { key: 'passport', icon: '📕', title: 'Passport', action: 'passport' },
];

export default function FinanceHomeScreen() {
  const { colors, brandGradient } = useTheme();
  const { openSidebar, setScreen, startService, openWebView, openBusPicker, hasUnreadNotifications, logout, profile } = useApp();
  const styles = createStyles(colors);

  const go = (item) => {
    if (item.action === 'history' || item.action === 'myAccount' || item.action === 'support') return setScreen(item.action);
    if (item.action === 'bus') return openBusPicker();
    if (item.action === 'train' || item.action === 'visa' || item.action === 'mydigital' || item.action === 'passport') return openWebView(item.action);
    return startService(item.action);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <TouchableOpacity onPress={openSidebar} style={styles.menu}><Text style={styles.headerIcon}>☰</Text></TouchableOpacity>
        <View style={styles.headerTitle}><Text style={styles.brand}>MySheba</Text><Text style={styles.headerSub}>Finance & Payments</Text></View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setScreen('notifications')} style={styles.headerButton}><Text style={styles.headerIcon}>🔔</Text>{hasUnreadNotifications && <View style={styles.dot} />}</TouchableOpacity>
          <TouchableOpacity onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Logout</Text></TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.walletCard}>
          <View><Text style={styles.walletLabel}>AVAILABLE BALANCE</Text><Text style={styles.balance}>••••••</Text><Text style={styles.balanceHint}>Your secure wallet balance</Text></View>
          <Text style={styles.walletIcon}>▣</Text>
          <View style={styles.walletActions}>
            <TouchableOpacity style={styles.walletButton} onPress={() => setScreen('myAccount')}><Text style={styles.walletButtonText}>+ Add Money</Text></TouchableOpacity>
            <TouchableOpacity style={styles.walletButton} onPress={() => setScreen('myAccount')}><Text style={styles.walletButtonText}>Withdraw</Text></TouchableOpacity>
          </View>
        </View>

        {!profile?.verified && (
          <TouchableOpacity style={styles.kycCard} activeOpacity={0.85} onPress={() => setScreen('verifyIdentity')}>
            <View style={styles.kycIcon}><Text style={styles.kycIconText}>✓</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.kycTitle}>Verify your identity</Text><Text style={styles.kycText}>Complete KYC to prepare your account for secure financial services.</Text></View>
            <Text style={styles.kycArrow}>›</Text>
          </TouchableOpacity>
        )}

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Money & Payments</Text><Text style={styles.sectionCaption}>Secure financial services</Text></View>
        <View style={styles.grid}>{FINANCE_SERVICES.map((item) => <TouchableOpacity key={item.key} style={styles.tile} activeOpacity={0.82} onPress={() => go(item)}><View style={styles.tileIcon}><Text style={styles.tileIconText}>{item.icon}</Text></View><Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text></TouchableOpacity>)}</View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Travel Services</Text><Text style={styles.sectionCaption}>Travel from one place</Text></View>
        <View style={styles.grid}>{TRAVEL_SERVICES.map((item) => <TouchableOpacity key={item.key} style={styles.tile} activeOpacity={0.82} onPress={() => go(item)}><View style={styles.tileIcon}><Text style={styles.tileIconText}>{item.icon}</Text></View><Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text></TouchableOpacity>)}</View>

        <View style={styles.security}><Text style={styles.securityIcon}>🔒</Text><View style={{ flex: 1 }}><Text style={styles.securityTitle}>Your money, protected</Text><Text style={styles.securityText}>Use your PIN or biometric security for sensitive account and transaction actions.</Text></View></View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { minHeight: 70, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
    menu: { padding: 5, marginRight: 10 },
    headerIcon: { color: '#FFFFFF', fontSize: 19 },
    headerTitle: { flex: 1 },
    brand: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
    headerSub: { color: '#FFFFFF', fontSize: 10, opacity: 0.9, marginTop: 2 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerButton: { padding: 5, position: 'relative' },
    dot: { position: 'absolute', right: 2, top: 2, width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF5252', borderWidth: 1, borderColor: colors.primary },
    logout: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)' },
    logoutText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
    content: { padding: 14, paddingBottom: 28 },
    walletCard: { borderRadius: 18, padding: 18, marginBottom: 14, backgroundColor: colors.primary, overflow: 'hidden', minHeight: 150 },
    walletLabel: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    balance: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: 4, marginTop: 7 },
    balanceHint: { color: '#FFFFFF', opacity: 0.82, fontSize: 11, marginTop: 2 },
    walletIcon: { position: 'absolute', right: 20, top: 18, color: '#FFFFFF', opacity: 0.35, fontSize: 40 },
    walletActions: { flexDirection: 'row', gap: 9, marginTop: 17 },
    walletButton: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    walletButtonText: { color: colors.primary, fontWeight: '800', fontSize: 11 },
    kycCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 18 },
    kycIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    kycIconText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
    kycTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
    kycText: { color: colors.text, fontSize: 10, lineHeight: 14, marginTop: 2 },
    kycArrow: { color: colors.primary, fontSize: 26, fontWeight: '800' },
    sectionHeader: { marginBottom: 9, marginTop: 2 },
    sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
    sectionCaption: { color: colors.text, fontSize: 10, marginTop: 2, opacity: 0.7 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
    tile: { width: '31.7%', minHeight: 108, borderRadius: 14, backgroundColor: colors.card || colors.bg, borderWidth: 1, borderColor: colors.border || '#D9E1E8', padding: 10, marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
    tileIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    tileIconText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
    tileTitle: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
    security: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 13, backgroundColor: colors.card || colors.bg, borderWidth: 1, borderColor: colors.border || '#D9E1E8' },
    securityIcon: { fontSize: 20 },
    securityTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
    securityText: { color: colors.text, opacity: 0.7, fontSize: 10, lineHeight: 14, marginTop: 2 },
  });
}
