import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import AppModalHeader from './AppModalHeader';

// Multi-field form modal for Admin > Pricing's Internet Package Prices
// card - used both to add a brand new package for an operator and to edit
// every field (name/data/validity/price) of an existing one. `initial`
// pre-fills the fields when editing; leave it unset/null to add a new
// package. `onDelete` is optional - pass it to show a Delete button
// (edit mode only).
export default function PackageFormModal({ visible, title, initial, onSubmit, onCancel, onDelete }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [name, setName] = useState('');
  const [data, setData] = useState('');
  const [valid, setValid] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(initial?.name || '');
    setData(initial?.data || '');
    setValid(initial?.valid || '');
    setPrice(initial?.price != null ? String(initial.price) : '');
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>

            <Text style={styles.label}>Package name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 5GB Weekly"
              value={name}
              onChangeText={setName}
              autoFocus
            />

            <Text style={styles.label}>Data amount</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 5 GB"
              value={data}
              onChangeText={setData}
            />

            <Text style={styles.label}>Validity</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 7 Days"
              value={valid}
              onChangeText={setValid}
            />

            <Text style={styles.label}>Price (MYR)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 25"
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
            />

            {!!onDelete && (
              <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
                <Text style={styles.deleteText}>Delete Package</Text>
              </TouchableOpacity>
            )}

            <View style={styles.row}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.okBtn}
                onPress={() => onSubmit({ name, data, valid, price })}
              >
                <Text style={styles.okText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.lg, width: '85%', maxWidth: 360, overflow: 'hidden' },
    content: { padding: 20 },
    title: { fontWeight: '600', fontSize: 15, marginBottom: 12 },
    label: { fontSize: 12, color: '#666', marginBottom: 4, fontWeight: '600' },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, marginBottom: 12 },
    row: { flexDirection: 'row', gap: 10, marginTop: 4 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    okText: { color: 'white', fontWeight: '600' },
    deleteBtn: { paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: '#E53935', alignItems: 'center', marginBottom: 4 },
    deleteText: { color: '#E53935', fontWeight: '600' },
  });
}
