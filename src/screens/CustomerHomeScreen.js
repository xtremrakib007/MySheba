import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import BannerSlider from '../components/BannerSlider';
import ServiceGrid from '../components/ServiceGrid';
import AppHeader from '../components/AppHeader';
import WalletCard from '../components/WalletCard';
import InfoBar from '../components/InfoBar';
import RoyalIcon from '../components/RoyalIcon';
import { formatWalletAmount } from '../firebase/walletExchangeRateService';

export default function CustomerHomeScreen() {
  const { colors } = useTheme();
  const { openSidebar, setScreen, hasUnreadNotifications, profile } = useApp();
  const styles = createStyles(colors);
  const balance = profile?.balance ?? profile?.walletBalance ?? profile?.wallet?.balance ?? 0;
  const name = profile?.displayName || profile?.name || 'Welcome back';
  const walletCurrency = profile?.walletCurrency || profile?.walletBalanceCurrency || 'MYR';
  const formattedBalance = formatWalletAmount(balance, walletCurrency);
  const kycVerified = profile?.verified === true || profile?.verificationStatus === 'approved';

  return (
    <View style={styles.screen}>
      <AppHeader unreadCount={hasUnreadNotifications ? 1 : 0} onPressRole={openSidebar} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <WalletCard
          balance={balance}
          variant="solid"
          onAddMoney={() => setScreen('topup')}
          onTransfer={() => setScreen('transferPoints')}
        />

        {!kycVerified && (
          <View style={styles.kycCard}>
            <View style={styles.kycIcon}><RoyalIcon name="kyc" size={28} /></View>
            <View style={styles.kycCopy}><Text style={styles.kycTitle}>Complete your KYC</Text><Text style={styles.kycText}>Verify your identity to unlock all finance services.</Text></View>
            <TouchableOpacity onPress={() => setScreen('verifyIdentity')} accessibilityRole="button"><Text style={styles.kycAction}>Verify</Text></TouchableOpacity>
          </View>
        )}

        {kycVerified && (
          <View style={styles.verifiedCard}>
            <View style={styles.verifiedIcon}><RoyalIcon name="kyc" size={28} /></View>
            <View style={styles.kycCopy}><Text style={styles.kycTitle}>Identity verified</Text><Text style={styles.kycText}>Your account is ready for finance services.</Text></View>
          </View>
        )}

        <View style={styles.quickActions}>
          <QuickAction colors={colors} icon="topup" label="Top Up" onPress={() => setScreen('topup')} />
          <QuickAction colors={colors} icon="history" label="Activity" onPress={() => setScreen('history')} />
          <QuickAction colors={colors} icon="support" label="Support" onPress={() => setScreen('support')} />
          <QuickAction colors={colors} icon="more" label="More" onPress={() => setScreen('moreFeatures')} />
        </View>

        <InfoBar />
        <BannerSlider />
        <ServiceGrid />

        <TouchableOpacity style={styles.activityCard} onPress={() => setScreen('history')} accessibilityRole="button" accessibilityLabel="Open transaction history">
          <View>
            <Text style={styles.activityTitle}>Recent activity</Text>
            <Text style={styles.activityText}>View your complete payment and service history</Text>
          </View>
          <RoyalIcon name="more" size={22} color="#0E9E8C" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function QuickAction({ colors, icon, label, onPress }) {
  return (
    <TouchableOpacity style={[stylesQuick.action, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onPress} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel={label}>
      <RoyalIcon name={icon} size={30} />
      <Text style={stylesQuick.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const stylesQuick = StyleSheet.create({
  action: { flex: 1, minHeight: 58, marginHorizontal: 3, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 19, marginBottom: 3 },
  label: { fontSize: 10, fontWeight: '700', color: '#374151' },
});

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { paddingTop: 18, paddingBottom: 15, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden', borderBottomWidth: 2, borderBottomColor: '#A6F5D2' },
    logoArea: { flexDirection: 'row', alignItems: 'center' },
    menuBtn: { padding: 4, marginRight: 10 },
    menuIcon: { color: 'white', fontSize: 21 },
    logoBox: { width: 42, height: 42, backgroundColor: 'white', borderRadius: 13, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 10, overflow: 'hidden' },
    logoImage: { width: '100%', height: '100%' },
    brand: { color: 'white', fontFamily: 'serif', fontWeight: '700', fontSize: 21, letterSpacing: 0.3 },
    tagline: { color: '#F2FFFA', fontSize: 11, opacity: 0.92, marginTop: 1, letterSpacing: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    bellBtn: { padding: 6 },
    bell: { fontSize: 19 },
    bellDot: { position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252', borderWidth: 1, borderColor: colors.primary },
    content: { padding: 14, paddingBottom: 32 },
    walletCard: { borderRadius: 26, padding: 24, marginBottom: 12, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: '#A6F5D2', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 4, shadowColor: '#0A5C78', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
    walletCaption: { color: '#F2FFFA', opacity: 0.95, fontSize: 14, marginBottom: 2 },
    walletBalance: { color: 'white', fontFamily: 'serif', fontSize: 34, fontWeight: '700', lineHeight: 39 },
    topUpButton: { backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, borderWidth: 1.5, borderColor: '#A6F5D2', elevation: 2 },
    topUpText: { color: '#0A5C78', fontWeight: '800', fontSize: 13 },
    kycCard: { backgroundColor: '#D9F6EA', borderRadius: 22, padding: 13, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#A6F5D2', elevation: 2 },
    verifiedCard: { backgroundColor: '#D9F6EA', borderRadius: 22, padding: 13, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#A6F5D2', elevation: 2 },
    kycIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FCFFFE', borderWidth: 1.5, borderColor: '#19C39B', marginRight: 11 },
    verifiedIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FCFFFE', borderWidth: 1.5, borderColor: '#19C39B', marginRight: 11 },
    kycCopy: { flex: 1 },
    kycTitle: { color: '#0F2E33', fontWeight: '800', fontSize: 14 },
    kycText: { color: '#476A6B', fontSize: 10.5, marginTop: 2 },
    kycAction: { color: '#0A5C78', fontWeight: '800', fontSize: 13, paddingVertical: 7, paddingHorizontal: 18, backgroundColor: '#19C39B', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
    activityCard: { backgroundColor: colors.card, borderRadius: 22, padding: 15, marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: colors.tileBorder || colors.border, elevation: 2 },
    activityTitle: { color: colors.text, fontFamily: 'serif', fontWeight: '700', fontSize: 16 },
    activityText: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
    activityArrow: { color: '#0E9E8C', fontSize: 28, lineHeight: 28 },
  });
}
