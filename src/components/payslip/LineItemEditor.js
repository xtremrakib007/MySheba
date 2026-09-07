import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../../theme/theme';
import { useTheme } from "../../theme/ThemeContext";
import { FormInput } from '../ui';

/**
 * Shared editor for both the Earnings list (PRD section 8) and the
 * Deductions list (PRD section 10) - same row shape (description +
 * amount), same add/remove behavior, just different suggestion chips and
 * a caller-supplied section title. Kept freeform (no fixed enum) per
 * both sections: "+ Add Earnings" / "+ Add Deduction" plus a description
 * text field, never a locked dropdown.
 */
export default function LineItemEditor({ title, items, onChange, suggestions, addLabel }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const updateItem = (index, field, value) => {
    const next = items.slice();
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const addItem = (description = '') => {
    onChange([...items, { description, amount: '' }]);
  };

  return (
    <View>
      {!!title && <Text style={styles.sectionTitle}>{title}</Text>}

      {items.map((item, index) => (
        <View key={index} style={styles.row}>
          <FormInput
            style={styles.descInput}
            placeholder="Description"
            value={item.description}
            onChangeText={(v) => updateItem(index, 'description', v)}
          />
          <FormInput
            style={styles.amountInput}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={String(item.amount ?? '')}
            onChangeText={(v) => updateItem(index, 'amount', v)}
          />
          <TouchableOpacity style={styles.removeBtn} onPress={() => removeItem(index)}>
            <Text style={styles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.addBtn} onPress={() => addItem()}>
        <Text style={styles.addBtnText}>{addLabel || '+ Add Item'}</Text>
      </TouchableOpacity>

      {!!suggestions?.length && (
        <View style={styles.chipsRow}>
          {suggestions
            .filter((s) => !items.some((it) => it.description === s))
            .map((s) => (
              <TouchableOpacity key={s} style={styles.chip} onPress={() => addItem(s)}>
                <Text style={styles.chipText}>+ {s}</Text>
              </TouchableOpacity>
            ))}
        </View>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.navy, marginTop: 16, marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    descInput: { flex: 1.4, marginBottom: 10 },
    amountInput: { flex: 1, marginBottom: 10, textAlign: 'right' },
    removeBtn: { padding: 8, marginBottom: 10 },
    removeBtnText: { color: colors.error, fontSize: 15, fontWeight: '700' },
    addBtn: { paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, borderStyle: 'dashed', marginBottom: 10 },
    addBtnText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
    chip: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#F0F7FB', borderRadius: radius.pill },
    chipText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  });
}
