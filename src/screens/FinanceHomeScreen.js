import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';
import { DEFAULT_RATES, subscribeRates } from '../firebase/ratesService';

const QUICK_SERVICES = [
  { key: 'recharge', icon: '📱', title: 'Recharge', action: 'recharge' },
  { key: 'mobilebanking', icon: '🏦', title: 'Mobile Banking', action: 'mobilebanking' },
  { key: 'internet', icon: '📡', title: 'Internet', action: 'internet' },
  { key: 'remittance', icon: '💸', title: 'Remittance', action: 'remittance' },
  { key: 'bus', icon: '🚌', title: 'Bus', action: 'bus' },
  { key: 'train', icon: '🚆', title: 'Train', action: 'train' },
  { key: 'flight', icon: '✈️', title: 'Flight', action: 'flight' },
  { key: 'fomema', icon: '🏥', title: 'FOMEMA', action: 'fomema' },
  { key: 'visa', icon: '🛂', title: 'Visa', action: 'visa' },
  { key: 'arrival', icon: '🪪', title: 'Malaysia Arrival Card', action: 'mydigital' },
  { key: 'passport', icon: '📕', title: 'Passport', action: 'passport' },
  { key: 'more', icon: '✨', title: 'More Features', action: 'moreFeatures' },
];

export default function FinanceHomeScreen() {
  const { colors, brandGradient } = useTheme();
  const { openSidebar, setScreen, startService, openWebView, openBusPicker, hasUnreadNotifications, logout } = useApp();
  const [rates, setRates] = useState(DEFAULT_RATES);
  const styles = createStyles(colors);

  useEffect(() => {
    const unsubscribe = subscribeRates((nextRates) => setRates(nextRates), () => setRates(DEFAULT_RATES));
    return unsubscribe;
  }, []);

  const go = (item) => {
    if (item.action === 'moreFeatures') return setScreen('moreFeatures');
    if (item.action === 'bus') return openBusPicker();
    if (item.action === 'fomema' || item.action === 'train' || item.action === 'visa' || item.action === 'mydigital' || item.action === 'passport') {
      return openWebView(item.action);
    }
    return startService(item.action);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <TouchableOpacity onPress={openSidebar} style={styles.menu} accessibilityLabel="Open menu">
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.brand}>MySheba</Text>
          <Text style={styles.headerSub}>Welcome Back!</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setScreen('notifications')} style={styles.headerButton} accessibilityLabel="Notifications">
            <Text style={styles.bell}>🔔</Text>
            {hasUnreadNotifications && <View style={styles.dot} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} style={styles.logout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.rateCard}>
          <View style={styles.balanceSummary}>
            <Text style={styles.moneyIcon}>💰</Text>
            <Text style={styles.balanceValue}>0</Text>
          </View>
          <View style={styles.rateDivider} />
          <View style={styles.rateContent}>
            <View style={styles.rateHeadingRow}>
              <Text style={styles.rateHeadingIcon}>💸</Text>
              <Text style={styles.rateHeading}>Remit Rates</Text>
            </View>
            <View style={styles.ratePills}>
              <View style={styles.ratePill}><Text style={styles.flag}>🇧🇩</Text><Text style={styles.rateLabel}>ACC </Text><Text style={styles.rateValue}>{Number(rates.BD_ACC || 0).toFixed(2)}</Text></View>
              <View style={styles.ratePill}><Text style={styles.flag}>🇧🇩</Text><Text style={styles.rateLabel}>CASH </Text><Text style={styles.rateValue}>{Number(rates.BD_CASH || 0).toFixed(2)}</Text></View>
              <View style={styles.ratePill}><Text style={styles.flag}>🇳🇵</Text><Text style={styles.rateLabel}>NPR </Text><Text style={styles.rateValue}>{Number(rates.NP || 0).toFixed(2)}</Text></View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionIcon}>🎯</Text>
          <Text style={styles.sectionTitle}>Quick Services</Text>
        </View>

        <View style={styles.grid}>
          {QUICK_SERVICES.map((item) => (
            <TouchableOpacity key={item.key} style={styles.tile} activeOpacity={0.82} onPress={() => go(item)}>
              <View style={styles.tileIcon}>
                <Text style={styles.tileIconText}>{item.icon}</Text>
              </View>
              <Text style={styles.tileTitle}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.security}>
          <Text style={styles.securityIcon}>🔒</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.securityTitle}>Your money, protected</Text>
            <Text style={styles.securityText}>Use your PIN or biometric security for sensitive account and transaction actions.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { minHeight: 78, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
    menu: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 7 },
    menuIcon: { color: '#FFFFFF', fontSize: 30, lineHeight: 32 },
    headerTitle: { flex: 1 },
    brand: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
    headerSub: { color: '#FFFFFF', fontSize: 12, opacity: 0.9, marginTop: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    bell: { fontSize: 22 },
    dot: { position: 'absolute', right: 2, top: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252', borderWidth: 1, borderColor: colors.primary },
    logout: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)' },
    logoutText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
    content: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 28 },
    rateCard: { minHeight: 88, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: colors.card || '#FFFFFF', borderWidth: 1, borderColor: '#D9DDE3', flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    balanceSummary: { width: 91, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    moneyIcon: { fontSize: 25 },
    balanceValue: { color: colors.primary, fontSize: 25, fontWeight: '800' },
    rateDivider: { width: 1, height: 54, backgroundColor: '#E1E4E8', marginHorizontal: 7 },
    rateContent: { flex: 1 },
    rateHeadingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
    rateHeadingIcon: { fontSize: 15, marginRight: 4 },
    rateHeading: { color: colors.text, opacity: 0.55, fontSize: 11, fontWeight: '600' },
    ratePills: { flexDirection: 'row', gap: 5 },
    ratePill: { flex: 1, minHeight: 29, paddingHorizontal: 5, borderRadius: 15, backgroundColor: '#EEF7F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    flag: { fontSize: 13, marginRight: 2 },
    rateLabel: { color: colors.text, opacity: 0.65, fontSize: 10 },
    rateValue: { color: '#3D7048', fontSize: 13, fontWeight: '800' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
    sectionIcon: { fontSize: 22, marginRight: 6 },
    sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    tile: { width: '23.7%', minHeight: 142, borderRadius: 17, backgroundColor: colors.card || '#FFFFFF', borderWidth: 2, borderColor: colors.primary, paddingHorizontal: 5, paddingVertical: 12, marginBottom: 12, alignItems: 'center', justifyContent: 'center' },
    tileIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
    tileIconText: { fontSize: 38 },
    tileTitle: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
    security: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 13, backgroundColor: colors.card || colors.bg, borderWidth: 1, borderColor: colors.border || '#D9E1E8', marginTop: 4 },
    securityIcon: { fontSize: 20 },
    securityTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
    securityText: { color: colors.text, opacity: 0.7, fontSize: 10, lineHeight: 14, marginTop: 2 },
  });
}
