import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from './HeaderDecor';

// Menu - logo - MySheba - bell - username.
//
// Two things changed from the previous header. There was no way to open the
// sidebar from it: the only control was the avatar, which opened the
// sidebar while looking like a profile link, so the hamburger the sidebar
// expects had nowhere to live. And the right-hand side showed the account's
// ROLE - "Customer", "Admin" - where a person expects their own name.
// roleThemes is no longer read here at all.
export default function AppHeader({ unreadCount = 0, onPressMenu }) {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, setScreen } = useApp();

  // First name only: the bar is narrow, and "Mohammad Rakibul Islam" would
  // either wrap or be clipped mid-word. Falls back through the fields a
  // profile might actually have rather than showing an empty pill.
  const fullName = profile?.displayName || profile?.name || profile?.firstName || '';
  const shortName = String(fullName).trim().split(/\s+/)[0] || 'Account';
  const avatar = profile?.avatarUrl || profile?.photoURL || null;
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
      <HeaderDecor />

      <TouchableOpacity style={styles.menuBtn} onPress={onPressMenu} accessibilityRole="button" accessibilityLabel="Open menu">
        <Text style={styles.menuIcon}>☰</Text>
      </TouchableOpacity>

      <View style={styles.brandWrap}>
        <Image source={require('../../assets/icon-transparent.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand} numberOfLines={1}>MySheba</Text>
      </View>

      <TouchableOpacity style={styles.bellWrap} onPress={() => setScreen('notifications')} accessibilityRole="button" accessibilityLabel={`Notifications, ${unreadCount} unread`}>
        <Text style={styles.bell}>🔔</Text>
        {unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.userWrap} onPress={() => setScreen('profile')} accessibilityRole="button" accessibilityLabel={`${shortName}, open profile`}>
        {avatar
          ? <Image source={{ uri: avatar }} style={styles.avatar} />
          : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>{shortName.slice(0, 1).toUpperCase()}</Text></View>}
        <Text style={styles.userText} numberOfLines={1}>{shortName}</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 11, gap: 8, overflow: 'hidden' },
    menuBtn: { padding: 5 },
    menuIcon: { color: '#FFFFFF', fontSize: 21, lineHeight: 24 },
    brandWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8, minWidth: 0 },
    logo: { width: 30, height: 30, borderRadius: 8 },
    brand: { color: '#FFFFFF', fontWeight: '800', fontSize: 18, letterSpacing: 0.2, flexShrink: 1 },
    bellWrap: { padding: 5 },
    bell: { fontSize: 19 },
    badge: { position: 'absolute', top: 0, right: 0, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },
    userWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 108, flexShrink: 1 },
    avatar: { width: 27, height: 27, borderRadius: 14, borderWidth: 1.5, borderColor: '#FFFFFF66' },
    avatarFallback: { backgroundColor: '#FFFFFF2E', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
    userText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, flexShrink: 1 },
  });
}
