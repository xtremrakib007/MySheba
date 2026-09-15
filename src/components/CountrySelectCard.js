import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

// Bright, logo-forward country selector used by Recharge and Internet.
// Keep the country name dark even when selected so it never disappears on the
// selected tile; flags remain full-color emoji and are intentionally larger.
export default function CountrySelectCard({ flag, name, selected, onPress }) {
  const { colors, isDark } = useTheme();
  const styles = createStyles(colors, isDark);
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.flagWrap}>
        <Text style={styles.flag} allowFontScaling={false}>{flag}</Text>
      </View>
      <Text style={styles.name} numberOfLines={2}>{String(name || '')}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    card: {
      width: '30%',
      height: 104,
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 9,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    cardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: isDark ? '#061B1A' : '#FFFFFF',
    },
    flagWrap: {
      width: 58,
      height: 58,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 5,
      backgroundColor: isDark ? '#111111' : '#F3F7FB',
    },
    flag: {
      fontSize: 40,
      lineHeight: 46,
      textAlign: 'center',
    },
    name: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      marginTop: 1,
      textAlign: 'center',
      color: isDark ? '#FFFFFF' : '#111111',
    },
  });
}
