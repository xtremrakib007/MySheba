import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';
import BannerSlider from '../components/BannerSlider';
import ServiceGrid from '../components/ServiceGrid';

// Finance-first customer home. Social/community screens remain legacy-only.
export default function CustomerHomeScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { t } = useLanguage();
  const { logout, openSidebar, setScreen, hasUnreadNotifications, profile } = useApp();
  const name = profile?.name || 'Customer';
  const firstName = String(name).trim().split(/\s+/)[0] || 'Customer';
  const verified = !!profile?.verified;
  const balance = Number(profile?.walletBalance || 0);

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <LinearGradient colors={[colors.primary, colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <TouchableOpacity style={styles.iconButton} onPress={openSidebar} accessibilityLabel="Menu">
              <Text style={styles.iconButtonText}>☰</Text>
            </TouchableOpacity>
            <View style={styles.brandRow}>
              <View style={styles.logoBox}><Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="cover" /></View>
              <View><Text style={styles.brand}>MySheba</Text><Text style={styles.brandSub}>Finance & Services</Text></View>
            </View>
            <View style={styles.topActions}>
              <TouchableOpacity style={styles.iconButton} onPress={() => setScreen('notifications')} accessibilityLabel="Notifications">
                <Text style={styles.iconButtonText}>🔔</Text>{hasUnreadNotifications && <View style={styles.notificationDot} />}
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutButton} onPress={logout}><Text style={styles.logoutText}>{t('settings.logout')}</Text></TouchableOpacity>
            </View>
          </View>
          <Text style={styles.eyebrow}>GOOD MORNING</Text>
          <Text style={styles.welcome}>Welcome, {firstName}</Text>
          <View style={styles.balanceCard}>
            <View><Text style={styles.balanceLabel}>Available Balance</Text><Text style={styles.balanceAmount}>RM {balance.toFixed(2)}</Text></View>
            <View style={styles.balanceIcon}><Text>💳</Text></View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.bannerSection}><BannerSlider /></View>

          {!verified ? (
            <View style={styles.kycCard}>
              <View style={styles.kycIcon}><Text>🛡️</Text></View>
              <View style={styles.kycCopy}><Text style={styles.kycTitle}>KYC verification required</Text><Text style={styles.kycText}>Required for Mobile Banking and Remittance.</Text></View>
              <TouchableOpacity style={styles.verifyButton} onPress={() => setScreen('verifyIdentity')}><Text style={styles.verifyText}>Verify</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.verifiedCard}>
              <View style={styles.verifiedIcon}><Text>✓</Text></View>
              <View><Text style={styles.verifiedTitle}>KYC Verified</Text><Text style={styles.verifiedText}>{profile?.kycId ? `KYC ID: ${profile.kycId}` : 'Identity verification approved'}</Text></View>
            </View>
          )}

          <ServiceGrid />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 24 },
    hero: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    brandRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 8 },
    logoBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFFFFF', overflow: 'hidden', marginRight: 9 },
    logoImage: { width: '100%', height: '100%' },
    brand: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    brandSub: { color: '#FFFFFF', fontSize: 9, opacity: 0.82, marginTop: 1 },
    topActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    iconButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#FFFFFF20', alignItems: 'center', justifyContent: 'center' },
    iconButtonText: { color: '#FFFFFF', fontSize: 17 },
    notificationDot: { position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF5252', borderWidth: 1, borderColor: colors.primary },
    logoutButton: { backgroundColor: '#FFFFFF20', paddingHorizontal: 9, paddingVertical: 8, borderRadius: 10 },
    logoutText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
    eyebrow: { color: '#FFFFFF', opacity: 0.72, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 19 },
    welcome: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginTop: 3 },
    balanceCard: { marginTop: 15, backgroundColor: '#FFFFFF1A', borderColor: '#FFFFFF30', borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    balanceLabel: { color: '#FFFFFF', opacity: 0.78, fontSize: 10 },
    balanceAmount: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginTop: 3 },
    balanceIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#FFFFFF20', alignItems: 'center', justifyContent: 'center' },
    body: { paddingTop: 12 },
    bannerSection: { marginHorizontal: 8, borderRadius: 18, overflow: 'hidden' },
    kycCard: { marginHorizontal: 14, marginTop: 10, backgroundColor: '#FFF7DF', borderWidth: 1, borderColor: '#F0D68B', borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center' },
    kycIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFE9A8', alignItems: 'center', justifyContent: 'center', marginRight: 9 },
    kycCopy: { flex: 1 }, kycTitle: { color: '#5F4300', fontSize: 12, fontWeight: '800' }, kycText: { color: '#735B25', fontSize: 9, marginTop: 3 },
    verifyButton: { backgroundColor: colors.primary, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9 }, verifyText: { color: colors.onPrimary, fontSize: 10, fontWeight: '800' },
    verifiedCard: { marginHorizontal: 14, marginTop: 10, backgroundColor: '#EAF8F0', borderWidth: 1, borderColor: '#A9D9BB', borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center' },
    verifiedIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#D2F0DE', alignItems: 'center', justifyContent: 'center', marginRight: 9 }, verifiedTitle: { color: '#17653A', fontSize: 12, fontWeight: '800' }, verifiedText: { color: '#397653', fontSize: 9, marginTop: 3 },
  });
}
