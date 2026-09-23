import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { roleThemes } from '../theme/theme';
import HeaderDecor from './HeaderDecor';

// The mockup's header, shared by every role: wordmark and tagline on the
// left, then the notification bell with its unread count, then the avatar
// and the role name. The gradient comes from the role palette, so this one
// component is green, blue or purple without knowing which.
export default function AppHeader({ unreadCount = 0, onPressRole }) {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, setScreen } = useApp();
  const roleLabel = roleThemes[profile?.role]?.label || 'Customer';
  const avatar = profile?.avatarUrl || profile?.photoURL || null;
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
      <HeaderDecor />
      <View style={styles.brandWrap}>
        <View style={styles.mark}><Text style={styles.markText}>M</Text></View>
        <View style={styles.brandCopy}>
          <Text style={styles.brand} numberOfLines={1}>MySheba</Text>
          <Text style={styles.tagline} numberOfLines={1}>Wherever you are, we're here</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.bellWrap} onPress={() => setScreen('notifications')} accessibilityRole="button" accessibilityLabel={`Notifications, ${unreadCount} unread`}>
        <Text style={styles.bell}>◔</Text>
        {unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.roleWrap} onPress={onPressRole} accessibilityRole="button" accessibilityLabel={`${roleLabel} menu`}>
        {avatar
          ? <Image source={{ uri: avatar }} style={styles.avatar} />
          : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>{roleLabel.slice(0, 1)}</Text></View>}
        <Text style={styles.roleText} numberOfLines={1}>{roleLabel}</Text>
        <Text style={styles.chevron}>⌄</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10, overflow: 'hidden' },
    brandWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 9, minWidth: 128 },
    mark: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FFFFFF22', alignItems: 'center', justifyContent: 'center' },
    markText: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
    brandCopy: { flex: 1 },
    brand: { color: '#FFFFFF', fontWeight: '800', fontSize: 18, letterSpacing: 0.2 },
    tagline: { color: '#FFFFFFD9', fontSize: 9.5, marginTop: 1 },
    bellWrap: { padding: 6 },
    bell: { color: '#FFFFFF', fontSize: 20 },
    badge: { position: 'absolute', top: 0, right: 0, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' },
    roleWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 122, flexShrink: 1 },
    avatar: { width: 27, height: 27, borderRadius: 14, borderWidth: 1.5, borderColor: '#FFFFFF66' },
    avatarFallback: { backgroundColor: '#FFFFFF2E', alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
    roleText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, flexShrink: 1 },
    chevron: { color: '#FFFFFFCC', fontSize: 13 },
  });
}
