import React from 'react';
import { View, Text, TouchableOpacity, Image, ImageBackground, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { countryCodeOf } from '../utils/phoneCountry';
import { heroFor, greetingForHour } from '../data/countryHero';
import CountryFlag from './CountryFlag';
import HeaderDecor from './HeaderDecor';

// Menu - logo - MySheba - bell - username.
//
// Two things changed from the previous header. There was no way to open the
// sidebar from it: the only control was the avatar, which opened the
// sidebar while looking like a profile link, so the hamburger the sidebar
// expects had nowhere to live. And the right-hand side showed the account's
// ROLE - "Customer", "Admin" - where a person expects their own name.
// roleThemes is no longer read here at all.
/**
 * `hero` turns the bar into the country header: the same row, over that
 * country's colours, with a greeting and a flag beneath it.
 *
 * Off by default, so the screens that just want a bar keep one. Only the home
 * screen asks for the hero - it is where somebody lands, and the one place
 * worth saying which country they are from.
 */
export default function AppHeader({ unreadCount = 0, onPressMenu, hero = false }) {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, setScreen } = useApp();
  const country = countryCodeOf(profile);
  const look = heroFor(country);
  // A country of its own, or the brand's colours when we do not know one.
  // Keep the header aligned to MySheba's logo palette across every country.
  const palette = brandGradient;

  // First name only: the bar is narrow, and "Mohammad Rakibul Islam" would
  // either wrap or be clipped mid-word. Falls back through the fields a
  // profile might actually have rather than showing an empty pill.
  const fullName = profile?.displayName || profile?.name || profile?.firstName || '';
  const shortName = String(fullName).trim().split(/\s+/)[0] || 'Account';
  const avatar = profile?.avatarUrl || profile?.photoURL || null;
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);

  const bar = (
    <>
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
    </>
  );

  if (!hero) {
    return <LinearGradient colors={palette} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>{bar}</LinearGradient>;
  }

  // The greeting uses the full name: "Good morning, MD Rakibul Islam" is the
  // line, and clipping it to a first name would make it a different one.
  const greeting = `${greetingForHour(new Date().getHours())}, ${String(fullName).trim() || shortName}`;

  const body = (
    <LinearGradient colors={[`${palette[0]}E6`, `${palette[1]}F2`]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.heroFill}>
      <View style={styles.header}>{bar}</View>
      <View style={styles.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting} numberOfLines={2}>{greeting}</Text>
          {!!look.name && <Text style={[styles.heroCountry, { color: look.accent }]} numberOfLines={1}>{look.name}</Text>}
        </View>
        {!!country && <View style={styles.flagWrap}><CountryFlag code={country} size={34} /></View>}
      </View>
    </LinearGradient>
  );

  // A photo when the country has one, with the gradient above it as the scrim
  // that keeps the text readable; the gradient alone when it does not.
  return look.photo
    ? <ImageBackground source={look.photo} style={styles.heroPhoto} resizeMode="cover">{body}</ImageBackground>
    : body;
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 11, gap: 8, overflow: 'hidden' },
    heroPhoto: { width: '100%' },
    heroFill: { width: '100%' },
    greetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 16, paddingTop: 2 },
    greeting: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', lineHeight: 25 },
    heroCountry: { fontSize: 11.5, fontWeight: '700', marginTop: 3, letterSpacing: 0.3 },
    flagWrap: { borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF55' },
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
