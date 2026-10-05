import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, shadows } from '../theme/theme';
import BannerSlider from '../components/BannerSlider';
import ServiceGrid from '../components/ServiceGrid';
import WalletCard from '../components/WalletCard';
import HeaderDecor from '../components/HeaderDecor';

// Home for the staff roles that work a queue rather than a wallet: Support
// Agents and Finance. Both see only the tiles their role owns - ServiceGrid
// picks the set from STAFF_SERVICES - which is the app-side half of the same
// boundary firestore.rules enforces on the data.
const ROLE_COPY = {
  support: {
    title: 'Support Agent',
    blurb: 'Customer support queues assigned to you.',
    hint: 'Answer tickets and queries, and keep their status up to date.',
  },
  finance: {
    title: 'Finance',
    blurb: 'Payments, reconciliation and financial reporting.',
    hint: 'Review transactions and top-ups. Order handling stays with operators.',
  },
};

export default function StaffHomeScreen() {
  const { colors, brandGradient } = useTheme();
  const { openSidebar, setScreen, hasUnreadNotifications, profile, can } = useApp();
  const styles = createStyles(colors);
  const role = profile?.role || 'support';
  const copy = ROLE_COPY[role] || ROLE_COPY.support;
  const name = profile?.displayName || profile?.name || copy.title;
  // Same expression AdminFeaturesScreen uses. The field has three spellings
  // across the roles and reading only one of them showed finance a zero
  // balance on an account that had money in it.
  const balance = profile?.balance ?? profile?.walletBalance ?? profile?.wallet?.balance ?? 0;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <View style={styles.logoArea}>
          <TouchableOpacity style={styles.menuBtn} onPress={openSidebar}><Text style={styles.menuIcon}>☰</Text></TouchableOpacity>
          <View style={styles.logoBox}><Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="cover" /></View>
          <View><Text style={styles.brand}>MySheba</Text><Text style={styles.tagline}>{name}</Text></View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.bellBtn} onPress={() => setScreen('notifications')}>
            <Text style={styles.bell}>🔔</Text>{!!hasUnreadNotifications && <View style={styles.bellDot} />}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.roleCard}>
          <Text style={styles.roleTitle}>{copy.title}</Text>
          <Text style={styles.roleBlurb}>{copy.blurb}</Text>
          <Text style={styles.roleHint}>{copy.hint}</Text>
        </View>

        {/* Finance moves money and had no way to see or send it from here -
            the card was only on the Control Center, which is an admin screen.
            Gated on the capability, not the role: both roles that land here
            are staff, and only the one holding 'finance' may transfer. The two
            actions go to the same routes as this role's own grid tiles
            (walletFunding needs:['finance'], transferPoints -> walletTransfer),
            so the card is a shortcut and not a second way in. */}
        {!!can('finance') && (
          <WalletCard
            balance={balance}
            variant="surface"
            onAddMoney={() => setScreen('walletFunding')}
            onTransfer={() => setScreen('transferPoints')}
          />
        )}
        <BannerSlider />
        <ServiceGrid />
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
    logoArea: { flexDirection: 'row', alignItems: 'center' },
    menuBtn: { padding: 4, marginRight: 10 },
    menuIcon: { color: 'white', fontSize: 21 },
    logoBox: { width: 38, height: 38, borderRadius: radius.md, overflow: 'hidden', marginRight: 10, backgroundColor: 'rgba(255,255,255,0.18)' },
    logoImage: { width: '100%', height: '100%' },
    brand: { color: 'white', fontWeight: '800', fontSize: 16 },
    tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    bellBtn: { padding: 6 },
    bell: { fontSize: 18 },
    bellDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252' },
    content: { padding: 16, paddingBottom: 40 },
    roleCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 14, ...shadows.card },
    roleTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    roleBlurb: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    roleHint: { fontSize: 11, color: colors.textSecondary, marginTop: 10, lineHeight: 16 },
  });
}
