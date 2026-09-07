import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

// PHASE 5 - MySheba Advertisement System - Ad Targeting Engine.
//
// A toggle-on/toggle-off chip picker for a targeting dimension with a
// known, fixed set of options (Feature/Country/User Type/Language) -
// contrast with TagMultiSelect.js, which is for dimensions with no fixed
// dataset (State/City/Area/Outlet). `value` is a plain string[]
// (matches the Advertisement.target* field shape exactly) - an empty
// array means "no restriction", surfaced here as an explicit hint rather
// than every chip looking selected or unselected ambiguously.
export default function ChipMultiSelect({ label, hint, items, value, onChange }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const selected = Array.isArray(value) ? value : [];

  const toggle = (key) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <View>
      {!!label && <Text style={styles.label}>{label}</Text>}
      {!!hint && <Text style={styles.hintText}>{hint}</Text>}
      <View style={styles.chipRow}>
        {items.map((it) => {
          const active = selected.includes(it.key);
          return (
            <TouchableOpacity
              key={it.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => toggle(it.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {it.flag ? `${it.flag} ` : ''}{it.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {selected.length === 0 && (
        <Text style={styles.emptyHint}>No restriction - matches every {label ? label.toLowerCase() : 'value'}.</Text>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 10 },
    hintText: { fontSize: 11, color: '#999', marginBottom: 6, marginTop: -2 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 11, color: colors.text },
    chipTextActive: { color: 'white', fontWeight: '600' },
    emptyHint: { fontSize: 11, color: '#999', marginTop: 6 },
  });
}
