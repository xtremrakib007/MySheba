import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { consentText } from '../utils/consentPolicy';

/**
 * The box somebody ticks before handing over personal data.
 *
 * One component rather than four, so every place that collects a document, an
 * IC number or a passport asks the same way and in the same words - and so the
 * words come from one file that the server validates against.
 *
 * It only reports a tick. The agreement is recorded server-side when the data
 * is submitted, and refused there if it is missing, because a box in one build
 * of one app does not stop the callable behind it being called without one.
 */
export default function ConsentCheckbox({ purpose, value, onChange, style }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const text = consentText(purpose);
  if (!text) return null;
  return (
    <TouchableOpacity
      style={[styles.row, style]}
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!value }}
      accessibilityLabel={text}
activeOpacity={0.7}
    >
      <View style={[styles.box, !!value && styles.boxOn]}>
        {!!value && <Text style={styles.tick}>✓</Text>}
      </View>
      <Text style={styles.text}>{text}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  box: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  text: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17 },
});
