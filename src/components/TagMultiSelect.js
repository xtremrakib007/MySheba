import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

// PHASE 5 - MySheba Advertisement System - Ad Targeting Engine.
//
// A free-text "type a value, press Add (or Enter), it becomes a
// removable chip" multi-select, for targeting dimensions this app has no
// fixed dataset for (State/City/Area/Outlet - see
// src/constants/adTargeting.js's GEO TARGETING note for why these are
// free text rather than a picklist like Country/Feature/User Type/
// Language). `value` is a plain string[] (matches Advertisement.
// targetStates/targetCities/targetAreas/targetOutlets in src/types/ads.ts
// exactly) - this component never trims/reshapes it beyond what the
// admin typed, other than de-duplicating and dropping blank entries.
export default function TagMultiSelect({ label, placeholder, value, onChange }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [draft, setDraft] = useState('');
  const tags = Array.isArray(value) ? value : [];

  const addTag = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) onChange([...tags, trimmed]);
    setDraft('');
  };

  const removeTag = (tag) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <View>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={placeholder || 'Type a value and add'}
          placeholderTextColor="#999"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addTag}
          returnKeyType="done"
          autoCapitalize="words"
        />
        <TouchableOpacity style={styles.addBtn} onPress={addTag} disabled={!draft.trim()}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {tags.length === 0 ? (
        <Text style={styles.emptyHint}>No restriction - matches every value.</Text>
      ) : (
        <View style={styles.chipRow}>
          {tags.map((tag) => (
            <TouchableOpacity key={tag} style={styles.chip} onPress={() => removeTag(tag)}>
              <Text style={styles.chipText}>{tag} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 10 },
    inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    input: {
      flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: colors.text,
    },
    addBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.primary },
    addBtnText: { color: 'white', fontWeight: '600', fontSize: 12 },
    emptyHint: { fontSize: 11, color: '#999', marginTop: 6 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    chip: {
      paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill,
      borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary + '15',
    },
    chipText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  });
}
