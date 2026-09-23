import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, shadows } from '../theme/theme';

// The Admin / Superadmin banner from the mockup - the single entry point
// into the management side, sitting directly under the header.
export default function ControlCenterBanner({ title, subtitle, icon = '◆', onPress }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={title}>
      <View style={styles.iconWrap}><Text style={styles.icon}>{icon}</Text></View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.sub} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primary, marginHorizontal: 14, marginTop: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.card, ...shadows.card },
    iconWrap: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#FFFFFF2E', alignItems: 'center', justifyContent: 'center' },
    icon: { fontSize: 21, color: '#FFFFFF' },
    copy: { flex: 1 },
    title: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    sub: { color: '#FFFFFFD1', fontSize: 11.5, marginTop: 2 },
    chevron: { color: '#FFFFFF', fontSize: 22, fontWeight: '300' },
  });
}
