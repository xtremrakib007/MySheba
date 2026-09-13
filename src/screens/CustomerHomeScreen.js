import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from '../i18n/LanguageContext';
import InfoBar from '../components/InfoBar';
import BannerSlider from '../components/BannerSlider';
import ServiceGrid from '../components/ServiceGrid';
import HeaderDecor from '../components/HeaderDecor';
import SmartAd from '../components/SmartAd';
import AdMobBanner from '../components/AdMobBanner';

// Finance-first customer home. Social/community screens remain available through
// legacy/admin routes, but normal customers always land on the finance services.
export default function CustomerHomeScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { t } = useLanguage();
  const { logout, openSidebar, setScreen, hasUnreadNotifications } = useApp();

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <View style={styles.logoArea}>
          <TouchableOpacity style={styles.menuBtn} onPress={openSidebar}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.logoBox}>
            <Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="cover" />
          </View>
          <View>
            <Text style={styles.brand}>MySheba</Text>
            <Text style={styles.tagline}>Finance & Services</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.bellBtn} onPress={() => setScreen('notifications')}>
            <Text style={styles.bell}>🔔</Text>
            {hasUnreadNotifications && <View style={styles.bellDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <InfoBar />
        <AdMobBanner feature="home" />
        <SmartAd placement="HOME_TOP" feature="home" height={140} />
        <BannerSlider />
        <SmartAd placement="HOME_MIDDLE" feature="home" height={140} />
        <ServiceGrid />
        <SmartAd placement="HOME_BOTTOM" feature="home" height={140} />
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
    logoArea: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuBtn: { padding: 4, marginRight: 2 },
    menuIcon: { color: 'white', fontSize: 20 },
    logoBox: { width: 34, height: 34, backgroundColor: 'white', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 10, overflow: 'hidden' },
    logoImage: { width: '100%', height: '100%' },
    brand: { color: 'white', fontWeight: '600' },
    tagline: { color: 'white', fontSize: 10, opacity: 0.8 },
    headerRight: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    bellBtn: { padding: 4, marginRight: 2 },
    bell: { color: 'white', fontSize: 16 },
    bellDot: { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252', borderWidth: 1, borderColor: colors.primary },
    logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.md },
    logoutText: { color: 'white', fontSize: 11 },
  });
}
