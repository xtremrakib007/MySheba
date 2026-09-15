import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

// Country selector: flags stay large, full-color and bright in both themes.
export default function CountrySelectCard({ flag, name, selected, onPress }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
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

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      width: '30%',
      height: 104,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 9,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    cardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    // Deliberately white in both themes so emoji flags remain bright and vivid.
    flagWrap: {
      width: 58,
      height: 58,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 5,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    flag: {
      fontSize: 40,
      lineHeight: 46,
      textAlign: 'center',
      opacity: 1,
    },
    name: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      marginTop: 1,
      textAlign: 'center',
      color: colors.text,
    },
  });
}
